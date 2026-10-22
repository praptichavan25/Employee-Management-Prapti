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
        # Find CORS configuration from app middleware or test a preflight OPTIONS request
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


if __name__ == '__main__':
    unittest.main()
