import unittest
from tests.test_base import BaseTestCase


class TestCommentsAndActivity(BaseTestCase):
    """
    Tests task comments CRUD, author permissions, activity timeline recording,
    and cross-employee access controls.
    """

    def setUp(self):
        super().setUp()
        self.task_id = self.insert_test_task(employee_name='Alice Developer')

    def test_add_comment_success(self):
        """Author can add a comment; creates comment row and logs activity."""
        response = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Drafted the initial schema.',
            'user_email': 'alice@gmail.com'
        })
        self.assertEqual(response.status_code, 201)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertIn('comment', data)
        self.assertEqual(data['comment']['comment'], 'Drafted the initial schema.')

        # Verify comment in DB
        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM task_comments WHERE task_id = ?', (self.task_id,)).fetchone()
        self.assertIsNotNone(row)
        self.assertEqual(row['user_email'], 'alice@gmail.com')

        # Verify activity was logged
        act = conn.execute('SELECT * FROM task_activity WHERE task_id = ? AND activity_type = ?', (self.task_id, 'COMMENT_ADDED')).fetchone()
        self.assertIsNotNone(act)
        conn.close()

    def test_add_comment_empty_text_rejected(self):
        """Posting empty comment should return HTTP 400."""
        response = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': '   ',
            'user_email': 'alice@gmail.com'
        })
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json().get('success'))

    def test_add_comment_cross_employee_forbidden(self):
        """Bob should not be able to comment on Alice's assigned task."""
        response = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Trying to comment on another person task.',
            'user_email': 'bob@gmail.com'
        })
        self.assertEqual(response.status_code, 403)
        self.assertFalse(response.get_json().get('success'))

    def test_manager_can_comment_on_any_task(self):
        """Project Manager can add comments to any task."""
        response = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Please prioritize this deliverable.',
            'user_email': 'manager@phoenix.test'
        })
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.get_json().get('success'))

    def test_edit_comment_by_author_success(self):
        """Comment author can update their own comment text."""
        # Add comment
        res_add = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Initial thought',
            'user_email': 'alice@gmail.com'
        })
        comment_id = res_add.get_json()['comment']['id']

        # Edit comment
        res_edit = self.client.patch(f'/tasks/{self.task_id}/comments/{comment_id}', json={
            'comment': 'Revised text with updated requirements',
            'user_email': 'alice@gmail.com'
        })
        self.assertEqual(res_edit.status_code, 200)
        self.assertTrue(res_edit.get_json().get('success'))

        # Verify updated text in DB
        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM task_comments WHERE id = ?', (comment_id,)).fetchone()
        conn.close()
        self.assertEqual(row['comment'], 'Revised text with updated requirements')
        self.assertIsNotNone(row['updated_at'])

    def test_edit_comment_by_non_author_forbidden(self):
        """Users cannot edit comments authored by someone else."""
        # Alice writes a comment
        res_add = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Alice comment',
            'user_email': 'alice@gmail.com'
        })
        comment_id = res_add.get_json()['comment']['id']

        # Bob attempts to edit Alice's comment
        res_edit = self.client.patch(f'/tasks/{self.task_id}/comments/{comment_id}', json={
            'comment': 'Bob malicious overwrite',
            'user_email': 'bob@gmail.com'
        })
        self.assertEqual(res_edit.status_code, 403)

    def test_delete_comment_by_author_success(self):
        """Author can permanently delete their own comment."""
        res_add = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'To be deleted',
            'user_email': 'alice@gmail.com'
        })
        comment_id = res_add.get_json()['comment']['id']

        # Delete comment
        res_del = self.client.delete(f'/tasks/{self.task_id}/comments/{comment_id}', json={
            'user_email': 'alice@gmail.com'
        })
        self.assertEqual(res_del.status_code, 200)

        # Confirm deleted from DB
        conn = self.get_db_connection()
        row = conn.execute('SELECT * FROM task_comments WHERE id = ?', (comment_id,)).fetchone()
        conn.close()
        self.assertIsNone(row)

    def test_delete_comment_by_non_author_forbidden(self):
        """Non-author cannot delete comments."""
        res_add = self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Protected comment',
            'user_email': 'alice@gmail.com'
        })
        comment_id = res_add.get_json()['comment']['id']

        res_del = self.client.delete(f'/tasks/{self.task_id}/comments/{comment_id}', json={
            'user_email': 'bob@gmail.com'
        })
        self.assertEqual(res_del.status_code, 403)

    def test_get_task_activity_history(self):
        """GET /tasks/<task_id>/activity returns chronologically recorded activity."""
        # Create comment to generate activity
        self.client.post(f'/tasks/{self.task_id}/comments', json={
            'comment': 'Activity test comment',
            'user_email': 'alice@gmail.com'
        })

        response = self.client.get(f'/tasks/{self.task_id}/activity?user_email=alice@gmail.com')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        activities = data.get('activity', [])
        self.assertGreaterEqual(len(activities), 1)
        self.assertEqual(activities[0]['activity_type'], 'COMMENT_ADDED')


if __name__ == '__main__':
    unittest.main()
