import unittest
from unittest.mock import patch
from tests.test_base import BaseTestCase


class TestTasksLifecycleAndPermissions(BaseTestCase):
    """
    Tests task assignment, validation, lifecycle transitions,
    progress tracking, and cross-employee authorization controls.
    """

    @patch('app.send_task_email')
    def test_assign_task_success(self, mock_email):
        """Valid task assignment stores record in DB, logs activity, and calls email dispatch."""
        mock_email.return_value = True

        payload = {
            'employee_name': 'Alice Developer',
            'task': 'Implement OAuth 2.0 Backend Flow',
            'deadline_date': '2026-11-15',
            'deadline_time': '18:00',
            'assigned_by': 'Test Manager'
        }
        response = self.client.post('/assign-task', json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertIn('task_id', data)

        # Verify mock email was called with correct arguments
        mock_email.assert_called_once()
        args, kwargs = mock_email.call_args
        self.assertEqual(args[0], 'Alice Developer')
        self.assertEqual(args[1], 'alice@gmail.com')
        self.assertEqual(args[2], 'Implement OAuth 2.0 Backend Flow')

        # Verify task is in SQLite
        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM tasks WHERE id = ?', (data['task_id'],)).fetchone()
        conn.close()
        self.assertIsNotNone(row)
        self.assertEqual(row['status'], 'Assigned')
        self.assertEqual(row['assigned_by'], 'Test Manager')

    def test_assign_task_missing_required_fields(self):
        """Task assignment fails when employee name or task description is missing."""
        cases = [
            {'employee_name': '', 'task': 'Some task', 'deadline_date': '2026-11-15', 'deadline_time': '18:00'},
            {'employee_name': 'Alice Developer', 'task': '', 'deadline_date': '2026-11-15', 'deadline_time': '18:00'},
            {'employee_name': 'Alice Developer', 'task': 'Task', 'deadline_date': '', 'deadline_time': ''},
        ]
        for case in cases:
            response = self.client.post('/assign-task', json=case)
            self.assertEqual(response.status_code, 400)
            data = response.get_json()
            self.assertFalse(data.get('success'))

    def test_assign_task_invalid_employee(self):
        """Task assignment to non-existent employee should return HTTP 404."""
        response = self.client.post('/assign-task', json={
            'employee_name': 'Nonexistent Person',
            'task': 'Impossible task',
            'deadline_date': '2026-11-15',
            'deadline_time': '18:00',
            'assigned_by': 'Test Manager'
        })
        self.assertEqual(response.status_code, 404)

    def test_assign_task_unauthorized_manager(self):
        """Task assignment by an unauthorized person should return HTTP 403."""
        response = self.client.post('/assign-task', json={
            'employee_name': 'Alice Developer',
            'task': 'Task',
            'deadline_date': '2026-11-15',
            'deadline_time': '18:00',
            'assigned_by': 'Impostor Manager'
        })
        self.assertEqual(response.status_code, 403)

    def test_assign_task_invalid_datetime_format(self):
        """Task assignment with malformed deadline date/time should return HTTP 400."""
        response = self.client.post('/assign-task', json={
            'employee_name': 'Alice Developer',
            'task': 'Task',
            'deadline_date': 'invalid-date',
            'deadline_time': 'invalid-time',
            'assigned_by': 'Test Manager'
        })
        self.assertEqual(response.status_code, 400)

    def test_task_status_lifecycle_and_progress_auto_sync(self):
        """Valid status transitions update the database and auto-sync progress values."""
        task_id = self.insert_test_task(employee_name='Alice Developer', status='Assigned', progress=0)

        # 1. Update status to 'In Progress' -> progress auto-syncs to 25%
        res1 = self.client.patch(f'/tasks/{task_id}/status', json={
            'status': 'In Progress',
            'employee_name': 'Alice Developer'
        })
        self.assertEqual(res1.status_code, 200)
        data1 = res1.get_json()
        self.assertEqual(data1['task']['status'], 'In Progress')
        self.assertEqual(data1['task']['progress'], 25)

        # 2. Update status to 'Completed' -> progress auto-syncs to 100%
        res2 = self.client.patch(f'/tasks/{task_id}/status', json={
            'status': 'Completed',
            'employee_name': 'Alice Developer'
        })
        self.assertEqual(res2.status_code, 200)
        data2 = res2.get_json()
        self.assertEqual(data2['task']['status'], 'Completed')
        self.assertEqual(data2['task']['progress'], 100)

    def test_task_status_invalid_value_rejected(self):
        """Status updates with disallowed values (e.g. 'Cancelled') should return HTTP 400."""
        task_id = self.insert_test_task(employee_name='Alice Developer')
        response = self.client.patch(f'/tasks/{task_id}/status', json={
            'status': 'Cancelled',
            'employee_name': 'Alice Developer'
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json().get('success'))

    def test_task_progress_discrete_values_and_auto_status(self):
        """Progress updates must match [0, 25, 50, 75, 100] and sync status automatically."""
        task_id = self.insert_test_task(employee_name='Alice Developer', status='Assigned', progress=0)

        # Valid progress step
        res_valid = self.client.patch(f'/tasks/{task_id}/progress', json={
            'progress': 50,
            'employee_name': 'Alice Developer'
        })
        self.assertEqual(res_valid.status_code, 200)
        self.assertEqual(res_valid.get_json()['task']['progress'], 50)
        self.assertEqual(res_valid.get_json()['task']['status'], 'In Progress')

        # 100% progress auto-transitions status to 'Completed'
        res_100 = self.client.patch(f'/tasks/{task_id}/progress', json={
            'progress': 100,
            'employee_name': 'Alice Developer'
        })
        self.assertEqual(res_100.status_code, 200)
        self.assertEqual(res_100.get_json()['task']['status'], 'Completed')

        # Invalid progress values should return 400
        for bad_val in [33, -5, 120, 'fifty']:
            res_bad = self.client.patch(f'/tasks/{task_id}/progress', json={
                'progress': bad_val,
                'employee_name': 'Alice Developer'
            })
            self.assertEqual(res_bad.status_code, 400)

    def test_cross_employee_status_update_forbidden(self):
        """An employee attempting to modify another employee's task should be rejected with HTTP 403."""
        # Alice's task
        task_id = self.insert_test_task(employee_name='Alice Developer')

        # Bob attempts to change status of Alice's task
        response = self.client.patch(f'/tasks/{task_id}/status', json={
            'status': 'Completed',
            'employee_name': 'Bob Designer'
        })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_cross_employee_task_details_access_forbidden(self):
        """GET /tasks/id/<task_id> must reject unauthorized employees with HTTP 403."""
        task_id = self.insert_test_task(employee_name='Alice Developer')

        # Bob queries Alice's task details
        response = self.client.get(f'/tasks/id/{task_id}?user_email=bob@gmail.com')
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

        # Manager querying Alice's task details is authorized (HTTP 200)
        response_pm = self.client.get(f'/tasks/id/{task_id}?user_email=manager@phoenix.test')
        self.assertEqual(response_pm.status_code, 200)
        self.assertTrue(response_pm.get_json().get('success'))

    def test_unauthenticated_tasks_by_name_endpoint_gap(self):
        """
        SECURITY AUDIT TEST:
        GET /tasks/<employee_name> currently has NO authentication or authorization checks.
        Any caller can fetch any employee's tasks without passing credentials.
        """
        self.insert_test_task(employee_name='Alice Developer', task='Confidential Task')
        response = self.client.get('/tasks/Alice Developer')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(len(data.get('tasks', [])), 1)


if __name__ == '__main__':
    unittest.main()
