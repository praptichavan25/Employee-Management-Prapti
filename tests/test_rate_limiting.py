import unittest
from unittest.mock import patch
from tests.test_base import BaseTestCase


class TestRateLimitingAndAbusePrevention(BaseTestCase):
    """
    Tests rate limiting on sensitive and resource-heavy endpoints:
    - /login: Brute-force & credential stuffing prevention (10/min)
    - /generate-ai-email: OpenAI API token exhaustion defense (15/min)
    - /assign-task: Gmail SMTP quota protection (30/min)
    - 429 responses, Retry-After headers, and recovery after reset
    """

    def setUp(self):
        super().setUp()
        # Explicitly enable limiter for these security tests
        self.limiter.enabled = True
        self.limiter.reset()

    def tearDown(self):
        self.limiter.reset()
        self.limiter.enabled = False
        super().tearDown()

    def test_login_rate_limit_exceeded(self):
        """Exceeding 10 login attempts within a minute triggers HTTP 429 Too Many Requests."""
        for i in range(10):
            res = self.client.post('/login', json={'email': 'wrong@test.com', 'password': 'wrong'})
            self.assertEqual(res.status_code, 401, f"Attempt {i+1} should return 401")

        # 11th request must be blocked by rate limiter
        res_blocked = self.client.post('/login', json={'email': 'wrong@test.com', 'password': 'wrong'})
        self.assertEqual(res_blocked.status_code, 429, "11th request must be throttled with HTTP 429")
        data = res_blocked.get_json()
        self.assertFalse(data.get('success'))
        self.assertIn('Too many requests', data.get('message', ''))

        # Standard rate-limiting headers must be provided
        self.assertIn('Retry-After', res_blocked.headers)

    def test_rate_limit_recovery_after_reset(self):
        """After resetting or window expiry, requests must succeed normally."""
        # Exhaust login limit
        for _ in range(10):
            self.client.post('/login', json={'email': 'wrong@test.com', 'password': 'wrong'})
        self.assertEqual(self.client.post('/login', json={'email': 'wrong@test.com', 'password': 'wrong'}).status_code, 429)

        # Reset limiter (simulating time window elapsed)
        self.limiter.reset()

        # Legitimate login succeeds immediately
        res_recovery = self.client.post('/login', json={
            'email': 'manager@phoenix.test',
            'password': 'manager_pass_123'
        })
        self.assertEqual(res_recovery.status_code, 200)
        self.assertTrue(res_recovery.get_json().get('success'))

    @patch('app.generate_task_email')
    def test_generate_ai_email_rate_limit_exceeded(self, mock_ai):
        """Generating more than 15 AI emails per minute triggers HTTP 429."""
        mock_ai.return_value = {
            'success': True,
            'subject': 'Task',
            'greeting': 'Hi',
            'intro': 'Intro',
            'details': 'Details',
            'action': 'Action',
            'closing': 'Thanks',
            'signature': 'Manager'
        }

        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager'
            }

        payload = {
            'employee_name': 'Alice Developer',
            'task': 'Implement OAuth Rate Limiting',
            'deadline_date': '2026-11-20',
            'deadline_time': '18:00'
        }

        # First 15 requests should succeed
        for i in range(15):
            res = self.client.post('/generate-ai-email', json=payload)
            self.assertEqual(res.status_code, 200, f"Request {i+1} should succeed")

        # 16th request must trigger HTTP 429
        res_blocked = self.client.post('/generate-ai-email', json=payload)
        self.assertEqual(res_blocked.status_code, 429)
        self.assertFalse(res_blocked.get_json().get('success'))

    @patch('app.send_task_email')
    def test_assign_task_rate_limit_exceeded(self, mock_email):
        """Assigning more than 30 tasks per minute triggers HTTP 429 to protect SMTP quotas."""
        mock_email.return_value = True

        with self.client.session_transaction() as sess:
            sess['user'] = {
                'name': 'Test Manager',
                'email': 'manager@phoenix.test',
                'role': 'project_manager'
            }

        payload = {
            'employee_name': 'Alice Developer',
            'task': 'Batch task',
            'deadline_date': '2026-11-20',
            'deadline_time': '18:00'
        }

        # First 30 requests should succeed
        for i in range(30):
            res = self.client.post('/assign-task', json=payload)
            self.assertEqual(res.status_code, 200, f"Request {i+1} should succeed")

        # 31st request must be throttled with HTTP 429
        res_blocked = self.client.post('/assign-task', json=payload)
        self.assertEqual(res_blocked.status_code, 429)
        self.assertFalse(res_blocked.get_json().get('success'))


if __name__ == '__main__':
    unittest.main()
