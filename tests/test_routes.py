import unittest
from tests.test_base import BaseTestCase


class TestRoutesAvailability(BaseTestCase):
    """
    Tests application startup and verifies all defined backend routes
    are properly mounted, registered, and accessible.
    """

    def test_routes_exist_on_app(self):
        """Verifies that all 18 endpoints exist in Flask url_map."""
        rules = [rule.rule for rule in self.app.url_map.iter_rules()]
        expected_endpoints = [
            '/login',
            '/logout',
            '/employees',
            '/add-employee',
            '/generate-ai-email',
            '/assign-task',
            '/tasks/<employee_name>',
            '/tasks/<int:task_id>/status',
            '/tasks/<int:task_id>/progress',
            '/meetings/<employee_name>',
            '/assign-meeting',
            '/tasks/id/<int:task_id>',
            '/tasks/<int:task_id>/comments',
            '/tasks/<int:task_id>/comments/<int:comment_id>',
            '/tasks/<int:task_id>/activity',
            '/activity/recent',
            '/health',
        ]
        for endpoint in expected_endpoints:
            self.assertIn(
                endpoint,
                rules,
                f"Expected route '{endpoint}' was not registered on the Flask application."
            )

    def test_health_check_endpoint(self):
        """GET /health should return HTTP 200 with service health status."""
        response = self.client.get('/health')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertEqual(data.get('status'), 'healthy')
        self.assertIn('timestamp', data)

    def test_get_employees_endpoint(self):
        """GET /employees should return HTTP 200 with list of employees."""
        response = self.client.get('/employees')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(len(data.get('employees', [])), 2)

    def test_get_recent_activity_empty(self):
        """GET /activity/recent should return HTTP 200 with empty list on fresh database."""
        response = self.client.get('/activity/recent')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data.get('activities'), [])

    def test_unknown_route_returns_404(self):
        """Requests to nonexistent routes should return 404."""
        response = self.client.get('/nonexistent-endpoint-xyz')
        self.assertEqual(response.status_code, 404)


if __name__ == '__main__':
    unittest.main()
