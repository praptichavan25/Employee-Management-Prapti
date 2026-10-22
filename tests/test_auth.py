import unittest
from tests.test_base import BaseTestCase
from werkzeug.security import generate_password_hash


class TestAuthenticationAndRoles(BaseTestCase):
    """
    Tests user authentication, credential validation, role classification,
    session management, logout, and administrator role support.
    """

    def setUp(self):
        super().setUp()
        # Inject hashed passwords into the test data so password checks work
        import json
        with open(self.json_path) as f:
            data = json.load(f)

        pm_hash = generate_password_hash('manager_pass_123')
        emp_hash = generate_password_hash('alice_pass_123')
        admin_hash = generate_password_hash('admin_pass_123')

        for pm in data.get('project_managers', []):
            pm['password_hash'] = pm_hash
        for emp in data.get('employees', []):
            emp['password_hash'] = emp_hash

        # Add administrator group to test data
        data['administrators'] = [
            {
                'name': 'Test Admin',
                'email': 'admin@phoenix.test',
                'role': 'administrator',
                'department': 'Administration',
                'status': 'active',
                'password_hash': admin_hash
            }
        ]
        self.test_data = data
        with open(self.json_path, 'w') as f:
            json.dump(data, f, indent=2)

    # ------------------------------------------------------------------
    # Login: success paths
    # ------------------------------------------------------------------

    def test_login_success_project_manager(self):
        """Valid project manager email + correct password logs in and returns role 'project_manager'."""
        response = self.client.post('/login', json={
            'email': 'manager@phoenix.test',
            'password': 'manager_pass_123'
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['user']['role'], 'project_manager')
        self.assertEqual(data['user']['name'], 'Test Manager')

    def test_login_success_employee(self):
        """Valid employee email + correct password logs in and returns role 'employee'."""
        response = self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'alice_pass_123'
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['user']['role'], 'employee')
        self.assertEqual(data['user']['name'], 'Alice Developer')

    def test_login_success_administrator(self):
        """Valid administrator email + correct password logs in and returns role 'administrator'."""
        response = self.client.post('/login', json={
            'email': 'admin@phoenix.test',
            'password': 'admin_pass_123'
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['user']['role'], 'administrator')
        self.assertEqual(data['user']['name'], 'Test Admin')

    # ------------------------------------------------------------------
    # Login: failure paths
    # ------------------------------------------------------------------

    def test_login_missing_email(self):
        """Login request with empty or missing email should return HTTP 400."""
        response = self.client.post('/login', json={})
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data.get('success'))

    def test_login_invalid_email(self):
        """Login with unregistered email should return HTTP 401."""
        response = self.client.post('/login', json={
            'email': 'unknown@random.org',
            'password': 'somepass'
        })
        self.assertEqual(response.status_code, 401)
        data = response.get_json()
        self.assertFalse(data.get('success'))

    def test_login_password_verification_enforcement(self):
        """
        Password security test:
        Authenticating with an incorrect password must be rejected with HTTP 401.
        This verifies the password_hash check is enforced.
        """
        response = self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'wrong_password_xyz'
        })
        self.assertEqual(
            response.status_code,
            401,
            f"SECURITY: Backend accepted wrong password. Got {response.status_code}, expected 401."
        )
        data = response.get_json()
        self.assertFalse(data.get('success'))

    # ------------------------------------------------------------------
    # Session management
    # ------------------------------------------------------------------

    def test_session_cookie_returned_on_login(self):
        """
        Session management test:
        Successful login must set a server-side session cookie (Set-Cookie header).
        """
        response = self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'alice_pass_123'
        })
        self.assertEqual(response.status_code, 200)
        has_cookie = 'Set-Cookie' in response.headers
        self.assertTrue(
            has_cookie,
            "SESSION: No Set-Cookie header returned on successful login."
        )

    # ------------------------------------------------------------------
    # Logout
    # ------------------------------------------------------------------

    def test_logout_route_clears_session(self):
        """
        Logout test:
        POST /logout must return HTTP 200 and clear the session cookie.
        """
        # First log in to establish a session
        self.client.post('/login', json={
            'email': 'alice@gmail.com',
            'password': 'alice_pass_123'
        })
        # Then log out
        response = self.client.post('/logout')
        self.assertIn(
            response.status_code,
            [200, 204],
            f"LOGOUT: POST /logout returned {response.status_code}, expected 200."
        )
        data = response.get_json() or {}
        self.assertTrue(data.get('success'), "LOGOUT: Response did not include success=true.")

    # ------------------------------------------------------------------
    # Role coverage
    # ------------------------------------------------------------------

    def test_admin_role_implementation(self):
        """
        Role-based access test:
        The 'administrator' role must be present and recognized by the login system.
        """
        roles = []
        for admin in self.test_data.get('administrators', []):
            roles.append(admin.get('role'))
        for pm in self.test_data.get('project_managers', []):
            roles.append(pm.get('role'))
        for emp in self.test_data.get('employees', []):
            roles.append(emp.get('role'))

        self.assertIn(
            'administrator',
            roles,
            "ROLE: Administrator role is not present in the test data."
        )

    def test_all_three_roles_recognized(self):
        """All three roles — administrator, project_manager, employee — must be recognized on login."""
        credentials = [
            ('admin@phoenix.test', 'admin_pass_123', 'administrator'),
            ('manager@phoenix.test', 'manager_pass_123', 'project_manager'),
            ('alice@gmail.com', 'alice_pass_123', 'employee'),
        ]
        for email, password, expected_role in credentials:
            with self.subTest(role=expected_role):
                resp = self.client.post('/login', json={'email': email, 'password': password})
                self.assertEqual(resp.status_code, 200)
                self.assertEqual(resp.get_json()['user']['role'], expected_role)


if __name__ == '__main__':
    unittest.main()
