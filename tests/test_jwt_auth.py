import time
import json
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
import jwt as pyjwt
from tests.test_base import BaseTestCase
import app


class TestJWTAuthenticationAndSecurity(BaseTestCase):
    """
    Tests JWT Bearer token authentication and authorization:
    - Token generation upon successful login
    - Token signature and algorithm enforcement (HS256)
    - Token expiration validation
    - Role-based authorization via Bearer token
    - Rejection of malformed, tampered, expired, and unauthenticated requests
    - Prevention of manager privilege escalation by employee tokens
    """

    def test_login_returns_valid_signed_jwt(self):
        """Login with valid credentials returns a signed JWT in the response."""
        response = self.client.post('/login', json={
            'email': 'manager@phoenix.test',
            'password': 'manager_pass_123'
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        token = data.get('token')
        self.assertIsNotNone(token, "JWT token must be included in successful login response.")
        self.assertIsInstance(token, str)

        # Verify signature with backend secret
        secret = app._get_jwt_secret()
        payload = pyjwt.decode(token, secret, algorithms=['HS256'])
        self.assertIn('user', payload)
        self.assertEqual(payload['user']['email'], 'manager@phoenix.test')
        self.assertEqual(payload['user']['role'], 'project_manager')

    def test_auth_me_with_bearer_token(self):
        """GET /auth/me returns 200 when authenticated via Authorization: Bearer <token>."""
        # 1. Log in to get token
        login_res = self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'alice_pass_123'
        })
        token = login_res.get_json().get('token')

        # 2. Call /auth/me using a brand-new test client without session cookies
        fresh_client = self.app.test_client()
        res = fresh_client.get('/auth/me', headers={
            'Authorization': f'Bearer {token}'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['user']['email'], 'alice@gmail.com')
        self.assertEqual(data['user']['role'], 'employee')

    def test_manager_endpoint_allowed_with_manager_jwt(self):
        """Manager-only operations succeed when authorized with a Project Manager JWT."""
        login_res = self.client.post('/login', json={
            'email': 'manager@phoenix.test',
            'password': 'manager_pass_123'
        })
        token = login_res.get_json().get('token')

        fresh_client = self.app.test_client()
        res = fresh_client.get('/employees', headers={
            'Authorization': f'Bearer {token}'
        })
        self.assertEqual(res.status_code, 200)
        data = res.get_json()
        self.assertTrue(data.get('success'))
        self.assertIn('employees', data)

    def test_manager_endpoint_rejected_with_employee_jwt(self):
        """Manager-only endpoints reject an Employee JWT with HTTP 403."""
        login_res = self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'alice_pass_123'
        })
        token = login_res.get_json().get('token')

        fresh_client = self.app.test_client()
        # Attempt to add employee
        res = fresh_client.post('/add-employee', json={
            'name': 'Malicious Hire',
            'email': 'malicious@gmail.com',
            'department': 'Engineering'
        }, headers={
            'Authorization': f'Bearer {token}'
        })
        self.assertEqual(res.status_code, 403)
        self.assertFalse(res.get_json().get('success'))

    def test_expired_jwt_rejected(self):
        """An expired JWT is rejected with HTTP 401."""
        secret = app._get_jwt_secret()
        expired_payload = {
            'user': {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager'
            },
            'exp': datetime.now(timezone.utc) - timedelta(hours=1),
            'iat': datetime.now(timezone.utc) - timedelta(hours=2)
        }
        expired_token = pyjwt.encode(expired_payload, secret, algorithm='HS256')

        fresh_client = self.app.test_client()
        res = fresh_client.get('/auth/me', headers={
            'Authorization': f'Bearer {expired_token}'
        })
        self.assertEqual(res.status_code, 401)
        self.assertFalse(res.get_json().get('success'))

    def test_tampered_jwt_signature_rejected(self):
        """A JWT signed with an incorrect secret key is rejected with HTTP 401."""
        tampered_token = pyjwt.encode({
            'user': {
                'name': 'Attacker',
                'email': 'attacker@evil.com',
                'role': 'project_manager'
            },
            'exp': datetime.now(timezone.utc) + timedelta(hours=1)
        }, 'wrong-secret-key-123456789012345', algorithm='HS256')

        fresh_client = self.app.test_client()
        res = fresh_client.get('/auth/me', headers={
            'Authorization': f'Bearer {tampered_token}'
        })
        self.assertEqual(res.status_code, 401)

    def test_malformed_jwt_rejected(self):
        """A completely malformed JWT string is rejected with HTTP 401."""
        fresh_client = self.app.test_client()
        res = fresh_client.get('/auth/me', headers={
            'Authorization': 'Bearer not-a-valid-jwt-token-structure'
        })
        self.assertEqual(res.status_code, 401)

    def test_unauthenticated_request_rejected(self):
        """A request with no Authorization header or session is rejected with HTTP 401 outside testing mode."""
        self.app.config['TESTING'] = False
        try:
            fresh_client = self.app.test_client()
            res = fresh_client.get('/auth/me')
            self.assertEqual(res.status_code, 401)
        finally:
            self.app.config['TESTING'] = True

    def test_jwt_missing_required_user_claims_rejected(self):
        """A JWT with empty or missing user payload claims is rejected."""
        secret = app._get_jwt_secret()
        # Missing 'role' in user object
        token = pyjwt.encode({
            'user': {'name': 'No Role User', 'email': 'norole@test.com'},
            'exp': datetime.now(timezone.utc) + timedelta(hours=1)
        }, secret, algorithm='HS256')

        user = app.decode_jwt(token)
        self.assertIsNone(user, "decode_jwt must reject tokens missing required claims.")

    @patch('app.send_task_email')
    def test_assign_task_enforces_jwt_identity_not_spoofed_body(self, mock_email):
        """Assigning task via JWT uses the authenticated identity as assigned_by."""
        mock_email.return_value = True

        login_res = self.client.post('/login', json={
            'email': 'manager@phoenix.test',
            'password': 'manager_pass_123'
        })
        token = login_res.get_json().get('token')

        fresh_client = self.app.test_client()
        payload = {
            'employee_name': 'Alice Developer',
            'task': 'Deploy zero-trust network policy',
            'deadline_date': '2026-11-20',
            'deadline_time': '17:00',
            'assigned_by': 'Fictitious Impostor'
        }
        res = fresh_client.post('/assign-task', json=payload, headers={
            'Authorization': f'Bearer {token}'
        })
        self.assertEqual(res.status_code, 200)

        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (res.get_json()['task_id'],)).fetchone()
        conn.close()
        self.assertEqual(row['assigned_by'], 'Test Manager', "Backend must use JWT identity, not spoofed request body.")


if __name__ == '__main__':
    unittest.main()

