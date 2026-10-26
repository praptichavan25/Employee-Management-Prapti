import unittest
from unittest.mock import patch
from tests.test_base import BaseTestCase


class TestSecurityHardeningAndAuthorization(BaseTestCase):
    """
    Tests security controls introduced in Phase 1 remediation:
    - Server-side session authentication enforcement
    - Manager and Admin role authorization
    - Prevention of manager impersonation via request bodies
    - Cross-user task and meeting isolation for employees
    - Security headers and CORS origins verification
    """

    def test_cors_does_not_contain_null_origin(self):
        """Verifies that 'null' (sandboxed iframe / file:// bypass) is NOT permitted in CORS."""
        response = self.client.open(
            '/employees',
            method='OPTIONS',
            headers={'Origin': 'null', 'Access-Control-Request-Method': 'GET'}
        )
        allow_origin = response.headers.get('Access-Control-Allow-Origin', '')
        self.assertNotEqual(
            allow_origin,
            'null',
            "SECURITY FLAW: CORS allowed origin must NOT accept 'null' as a trusted origin."
        )

    def test_cors_approved_local_origins_and_credentials(self):
        """Verifies that approved local origins receive credentials and correct allow origin."""
        approved_origins = ['http://127.0.0.1:8090', 'http://localhost:8090']
        for origin in approved_origins:
            response = self.client.open(
                '/health',
                method='GET',
                headers={'Origin': origin}
            )
            self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), origin)
            self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')

    def test_cors_preflight_options_response(self):
        """Verifies that preflight OPTIONS requests return 200 with credentials and allowed methods/headers."""
        response = self.client.open(
            '/login',
            method='OPTIONS',
            headers={
                'Origin': 'http://127.0.0.1:8090',
                'Access-Control-Request-Method': 'POST',
                'Access-Control-Request-Headers': 'Content-Type'
            }
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get('Access-Control-Allow-Origin'), 'http://127.0.0.1:8090')
        self.assertEqual(response.headers.get('Access-Control-Allow-Credentials'), 'true')
        self.assertIn('POST', response.headers.get('Access-Control-Allow-Methods', ''))
        self.assertIn('Content-Type', response.headers.get('Access-Control-Allow-Headers', ''))

    def test_cors_untrusted_origin_rejected(self):
        """Verifies that untrusted origins do not receive an Access-Control-Allow-Origin header."""
        response = self.client.open(
            '/health',
            method='GET',
            headers={'Origin': 'http://untrusted-external-site.com'}
        )
        self.assertIsNone(response.headers.get('Access-Control-Allow-Origin'))

    def test_cors_origin_sanitizer_rules(self):
        """Tests the backend get_allowed_origins helper against wildcards and trailing slashes."""
        from app import get_allowed_origins
        import os
        from unittest.mock import patch

        with patch.dict(os.environ, {'ALLOWED_ORIGINS': 'https://my-app.onrender.com/, *, null, http://custom.test'}, clear=False):
            origins = get_allowed_origins()
            self.assertIn('https://my-app.onrender.com', origins, "Trailing slashes should be stripped.")
            self.assertNotIn('*', origins, "Wildcards must be rejected from credentialed CORS.")
            self.assertNotIn('null', origins, "'null' must be rejected.")
            self.assertIn('http://custom.test', origins)

    def test_security_headers_present_on_responses(self):
        """All responses must include standard security headers: nosniff, DENY, Referrer-Policy."""
        response = self.client.get('/login')
        self.assertEqual(response.headers.get('X-Content-Type-Options'), 'nosniff')
        self.assertEqual(response.headers.get('X-Frame-Options'), 'DENY')
        self.assertEqual(response.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')

    @patch('app.send_task_email')
    def test_assign_task_enforces_session_manager_and_ignores_impersonation(self, mock_email):
        """
        SECURITY TEST:
        When a manager is logged into the session, the backend MUST use the session identity
        as `assigned_by`, ignoring any client-supplied `assigned_by` value.
        """
        mock_email.return_value = True

        # Log in as Test Manager
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager',
                'department': 'Project Management'
            }

        # Client attempts to spoof assigning manager as someone else
        payload = {
            'employee_name': 'Alice Developer',
            'task': 'Deploy zero-trust network policy',
            'deadline_date': '2026-11-20',
            'deadline_time': '17:00',
            'assigned_by': 'Fictitious Manager'  # Spoofed parameter
        }
        response = self.client.post('/assign-task', json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))

        # Stored task must reflect the verified session user, NOT the spoofed name
        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (data['task_id'],)).fetchone()
        conn.close()
        self.assertEqual(row['assigned_by'], 'Test Manager')

    def test_employee_cannot_assign_task(self):
        """An authenticated Employee must be rejected with HTTP 403 when trying to assign a task."""
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Alice Developer',
                'email': 'alice@gmail.com',
                'role': 'employee',
                'department': 'Engineering'
            }

        payload = {
            'employee_name': 'Bob Designer',
            'task': 'Unauthorized Task Assignment',
            'deadline_date': '2026-11-20',
            'deadline_time': '17:00'
        }
        response = self.client.post('/assign-task', json=payload)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_employee_cannot_add_employee(self):
        """An authenticated Employee must be rejected with HTTP 403 when trying to register new users."""
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Alice Developer',
                'email': 'alice@gmail.com',
                'role': 'employee',
                'department': 'Engineering'
            }

        response = self.client.post('/add-employee', json={
            'name': 'Rogue User',
            'email': 'rogue@gmail.com',
            'department': 'Engineering'
        })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_employee_cannot_assign_meeting(self):
        """An authenticated Employee must be rejected with HTTP 403 when trying to assign meetings."""
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Alice Developer',
                'email': 'alice@gmail.com',
                'role': 'employee',
                'department': 'Engineering'
            }

        response = self.client.post('/assign-meeting', json={
            'employee_name': 'Bob Designer',
            'title': 'Rogue Sync',
            'start_time': '10:00',
            'end_time': '11:00',
            'host': 'Alice Developer'
        })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_employee_cannot_view_recent_team_activity(self):
        """GET /activity/recent must reject Employees with HTTP 403 Forbidden."""
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Alice Developer',
                'email': 'alice@gmail.com',
                'role': 'employee',
                'department': 'Engineering'
            }

        response = self.client.get('/activity/recent')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

        # Managers can view recent activity
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager',
                'department': 'Project Management'
            }
        res_manager = self.client.get('/activity/recent')
        self.assertEqual(res_manager.status_code, 200)
        self.assertTrue(res_manager.get_json().get('success'))

    def test_cross_employee_tasks_by_name_forbidden(self):
        """
        SECURITY BOUNDARY:
        An authenticated employee cannot inspect another employee's tasks via GET /tasks/<name>.
        """
        self.insert_test_task(employee_name='Alice Developer', task='Confidential Alice Task')

        # Logged in as Bob
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        # Bob attempts to read Alice's tasks
        response = self.client.get('/tasks/Alice Developer')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

        # Alice reading her own tasks succeeds
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Alice Developer',
                'email': 'alice@gmail.com',
                'role': 'employee',
                'department': 'Engineering'
            }
        res_alice = self.client.get('/tasks/Alice Developer')
        self.assertEqual(res_alice.status_code, 200)
        self.assertTrue(res_alice.get_json().get('success'))

    def test_cross_employee_meetings_forbidden(self):
        """
        SECURITY BOUNDARY:
        An authenticated employee cannot inspect another employee's meetings via GET /meetings/<name>.
        """
        # Logged in as Bob
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        # Bob attempts to read Alice's meetings
        response = self.client.get('/meetings/Alice Developer')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_unauthenticated_assign_task_rejected_even_with_spoofed_manager(self):
        """SECURITY: POST /assign-task without a valid session must return 401, ignoring client-supplied assigned_by."""
        self.app.config['TESTING'] = False
        try:
            payload = {
                'employee_name': 'Alice Developer',
                'task': 'Spoofed task without login',
                'deadline_date': '2026-11-20',
                'deadline_time': '17:00',
                'assigned_by': 'Test Manager'
            }
            response = self.client.post('/assign-task', json=payload)
            self.assertEqual(response.status_code, 401)
            self.assertFalse(response.get_json().get('success'))
        finally:
            self.app.config['TESTING'] = True

    def test_unauthenticated_generate_ai_email_rejected_even_with_spoofed_manager(self):
        """SECURITY: POST /generate-ai-email without a session must return 401, ignoring client-supplied assigned_by."""
        self.app.config['TESTING'] = False
        try:
            payload = {
                'employee_name': 'Alice Developer',
                'task': 'Spoofed draft without login',
                'assigned_by': 'Test Manager'
            }
            response = self.client.post('/generate-ai-email', json=payload)
            self.assertEqual(response.status_code, 401)
            self.assertFalse(response.get_json().get('success'))
        finally:
            self.app.config['TESTING'] = True

    def test_unauthenticated_task_details_by_id_rejected_even_with_user_email(self):
        """SECURITY: GET /tasks/id/<id> without session must return 401, ignoring query param user_email."""
        self.app.config['TESTING'] = False
        try:
            response = self.client.get('/tasks/id/1?user_email=manager@phoenix.test')
            self.assertEqual(response.status_code, 401)
            self.assertFalse(response.get_json().get('success'))
        finally:
            self.app.config['TESTING'] = True

    def test_unauthenticated_task_comments_rejected_even_with_user_email(self):
        """SECURITY: GET /tasks/<id>/comments without session must return 401, ignoring query param user_email."""
        self.app.config['TESTING'] = False
        try:
            response = self.client.get('/tasks/1/comments?user_email=manager@phoenix.test')
            self.assertEqual(response.status_code, 401)
            self.assertFalse(response.get_json().get('success'))
        finally:
            self.app.config['TESTING'] = True

    def test_login_rejected_when_password_hash_missing(self):
        """
        SECURITY AUDIT:
        An account without a password_hash (or empty hash) must NEVER be permitted
        to log in with an arbitrary password or empty password. Must return 401.
        """
        import json
        with open(self.json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)

        # Inject an account with no password_hash
        data['employees'].append({
            'name': 'Unconfigured User',
            'email': 'unconfigured@gmail.com',
            'role': 'employee',
            'department': 'Operations'
        })
        with open(self.json_path, 'w', encoding='utf-8') as f:
            json.dump(data, f)

        response = self.client.post('/login', json={
            'email': 'unconfigured@gmail.com',
            'password': 'any_password_attempt'
        })
        self.assertEqual(
            response.status_code,
            401,
            "CRITICAL SECURITY: Account without password_hash must reject login with 401."
        )
        self.assertFalse(response.get_json().get('success'))

    def test_cross_employee_task_details_by_id_forbidden(self):
        """SECURITY: Authenticated employee Bob cannot view Alice's task details via /tasks/id/<id>."""
        t_id = self.insert_test_task(employee_name='Alice Developer', task='Alice Secret Project')

        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        response = self.client.get(f'/tasks/id/{t_id}')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_cross_employee_comments_view_and_post_forbidden(self):
        """SECURITY: Authenticated employee Bob cannot view or post comments on Alice's task."""
        t_id = self.insert_test_task(employee_name='Alice Developer', task='Alice Secret Project')

        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        # Attempt to read comments
        res_get = self.client.get(f'/tasks/{t_id}/comments')
        self.assertEqual(res_get.status_code, 403)

        # Attempt to post a comment
        res_post = self.client.post(f'/tasks/{t_id}/comments', json={'comment': 'Intruder comment'})
        self.assertEqual(res_post.status_code, 403)

    def test_cross_employee_status_and_progress_update_forbidden(self):
        """SECURITY: Authenticated employee Bob cannot modify Alice's task status or progress."""
        t_id = self.insert_test_task(employee_name='Alice Developer', task='Alice Secret Project', status='Assigned', progress=0)

        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        # Attempt to modify status
        res_status = self.client.patch(f'/tasks/{t_id}/status', json={'status': 'Completed'})
        self.assertEqual(res_status.status_code, 403)

        # Attempt to modify progress
        res_prog = self.client.patch(f'/tasks/{t_id}/progress', json={'progress': 100})
        self.assertEqual(res_prog.status_code, 403)

    def test_comment_edit_and_delete_forbidden_for_non_author(self):
        """SECURITY: User Bob cannot edit or delete a comment authored by Alice."""
        t_id = self.insert_test_task(employee_name='Alice Developer', task='Alice Task')

        # Insert Alice's comment
        conn = self.get_db_connection()
        cur = conn.cursor()
        cur.execute(
            'INSERT INTO task_comments (task_id, user_name, user_email, user_role, comment, created_at) VALUES (?, ?, ?, ?, ?, ?)',
            (t_id, 'Alice Developer', 'alice@gmail.com', 'employee', 'Original comment by Alice', '2026-10-26 10:00:00')
        )
        conn.commit()
        comment_id = cur.lastrowid
        conn.close()

        # Log in as Bob
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Bob Designer',
                'email': 'bob@gmail.com',
                'role': 'employee',
                'department': 'Design'
            }

        # Attempt edit
        res_edit = self.client.patch(f'/tasks/{t_id}/comments/{comment_id}', json={'comment': 'Tampered comment'})
        self.assertEqual(res_edit.status_code, 403)

        # Attempt delete
        res_del = self.client.delete(f'/tasks/{t_id}/comments/{comment_id}')
        self.assertEqual(res_del.status_code, 403)

    def test_add_employee_response_sanitizes_credentials(self):
        """SECURITY: When a manager adds an employee, the returned payload must not leak sensitive fields."""
        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager',
                'department': 'Project Management'
            }

        response = self.client.post('/add-employee', json={
            'name': 'New Hire',
            'email': 'newhire@gmail.com',
            'department': 'QA'
        })
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        emp = data.get('employee', {})
        self.assertNotIn('password_hash', emp)
        self.assertNotIn('password', emp)
        self.assertNotIn('secret', emp)
        self.assertNotIn('token', emp)


if __name__ == '__main__':
    unittest.main()
