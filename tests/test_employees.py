import json
import unittest
from tests.test_base import BaseTestCase


class TestEmployeeManagement(BaseTestCase):
    """
    Tests employee directory retrieval, creation, validation,
    duplicate email constraints, and persistence.
    """

    def test_get_employees_returns_all_employees(self):
        """GET /employees returns active employee list with details."""
        response = self.client.get('/employees')
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        employees = data.get('employees', [])
        names = [e['name'] for e in employees]
        self.assertIn('Alice Developer', names)
        self.assertIn('Bob Designer', names)

    def test_add_employee_success(self):
        """POST /add-employee successfully registers a new employee and updates file."""
        new_emp = {
            'name': 'Charlie Tester',
            'email': 'charlietest@gmail.com',
            'department': 'Quality Assurance'
        }
        response = self.client.post('/add-employee', json=new_emp)
        self.assertEqual(response.status_code, 200)
        data = response.get_json()
        self.assertTrue(data.get('success'))
        self.assertEqual(data['employee']['name'], 'Charlie Tester')

        # Verify disk persistence in the isolated JSON store
        with open(self.json_path, 'r') as f:
            saved_data = json.load(f)
        saved_emails = [e['email'] for e in saved_data.get('employees', [])]
        self.assertIn('charlietest@gmail.com', saved_emails)

    def test_add_employee_missing_fields(self):
        """POST /add-employee with missing fields should return HTTP 400."""
        cases = [
            {'name': '', 'email': 'test@gmail.com', 'department': 'Engineering'},
            {'name': 'Test', 'email': '', 'department': 'Engineering'},
            {'name': 'Test', 'email': 'test@gmail.com', 'department': ''},
        ]
        for case in cases:
            response = self.client.post('/add-employee', json=case)
            self.assertEqual(response.status_code, 400)
            data = response.get_json()
            self.assertFalse(data.get('success'))

    def test_add_employee_rejects_non_gmail_email(self):
        """POST /add-employee enforces @gmail.com address validation."""
        response = self.client.post('/add-employee', json={
            'name': 'Dave Enterprise',
            'email': 'dave@corporate.org',
            'department': 'Operations'
        })
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data.get('success'))
        self.assertIn('gmail', data.get('message', '').lower())

    def test_add_employee_duplicate_email_rejected(self):
        """POST /add-employee rejects email that already exists in directory."""
        # Attempt to register with Alice's existing email
        response = self.client.post('/add-employee', json={
            'name': 'Alice Clone',
            'email': 'alice@gmail.com',
            'department': 'Design'
        })
        self.assertEqual(response.status_code, 400)
        data = response.get_json()
        self.assertFalse(data.get('success'))
        self.assertIn('already exists', data.get('message', '').lower())


if __name__ == '__main__':
    unittest.main()
