import json
import unittest
from unittest.mock import patch, MagicMock
from tests.test_base import BaseTestCase
import ai_email_service


class TestAIEmailService(BaseTestCase):
    """
    Tests AI email generation service with mocked external OpenAI requests.
    Validates input validation, response parsing, quota exhaustion fallback,
    and error handling. Never calls paid OpenAI APIs.
    """

    @patch('ai_email_service.OpenAI')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'mock_test_key_sk_12345'})
    def test_generate_ai_email_success(self, mock_openai_cls):
        """Service successfully calls OpenAI and parses structured email components."""
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client

        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content=json.dumps({
                "subject": "[PHOENIX] New Task: Complete Backend Unit Testing",
                "greeting": "Dear Alice Developer,",
                "intro": "You have been assigned a new task by Test Manager.",
                "details": "Please implement full test coverage before the deadline.",
                "action": "Acknowledge receipt of this assignment.",
                "closing": "Wishing you great success.",
                "signature": "Regards,\nTest Manager\nProject Manager -- PHOENIX"
            })))
        ]
        mock_client.chat.completions.create.return_value = mock_completion

        # Test service function directly
        result = ai_email_service.generate_task_email(
            employee_name="Alice Developer",
            task_description="Complete Backend Unit Testing",
            deadline="15 November 2026 at 06:00 PM IST",
            manager_name="Test Manager",
            priority="High"
        )

        self.assertTrue(result['success'])
        self.assertIn('[PHOENIX]', result['subject'])
        self.assertEqual(result['greeting'], 'Dear Alice Developer,')
        self.assertIn('Regards', result['signature'])

    @patch.dict('os.environ', {'OPENAI_API_KEY': ''}, clear=True)
    def test_generate_ai_email_missing_api_key(self):
        """Service gracefully returns error when OPENAI_API_KEY is not configured."""
        result = ai_email_service.generate_task_email(
            employee_name="Alice Developer",
            task_description="Task",
            deadline="Tomorrow",
            manager_name="Test Manager"
        )
        self.assertFalse(result['success'])
        self.assertIn('not configured', result.get('error', '').lower())

    @patch('ai_email_service.OpenAI')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'mock_test_key'})
    def test_generate_ai_email_quota_exhausted_fallback(self, mock_openai_cls):
        """When OpenAI credit is exhausted, service returns structured fallback template."""
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_client.chat.completions.create.side_effect = Exception("insufficient_quota: You exceeded your current quota")

        result = ai_email_service.generate_task_email(
            employee_name="Alice Developer",
            task_description="Deploy Container to Staging",
            deadline="20 November 2026",
            manager_name="Test Manager",
            priority="Medium"
        )

        # Built-in resilience: returns success=True with notice and structured template
        self.assertTrue(result['success'])
        self.assertIn('notice', result)
        self.assertIn('Deploy Container', result['details'])

    @patch('ai_email_service.OpenAI')
    @patch.dict('os.environ', {'OPENAI_API_KEY': 'mock_test_key'})
    def test_generate_ai_email_malformed_json_response(self, mock_openai_cls):
        """Service catches and handles non-JSON raw responses from OpenAI."""
        mock_client = MagicMock()
        mock_openai_cls.return_value = mock_client
        mock_completion = MagicMock()
        mock_completion.choices = [
            MagicMock(message=MagicMock(content="Here is your email: Subject: Hi..."))  # Non-JSON
        ]
        mock_client.chat.completions.create.return_value = mock_completion

        result = ai_email_service.generate_task_email(
            employee_name="Alice Developer",
            task_description="Task",
            deadline="Tomorrow",
            manager_name="Test Manager"
        )
        self.assertFalse(result['success'])
        self.assertIn('failed to parse', result.get('error', '').lower())

    @patch('app.generate_task_email')
    def test_generate_ai_email_endpoint_validation(self, mock_service):
        """POST /generate-ai-email validates input fields and authorized manager."""
        # Missing task
        res_missing = self.client.post('/generate-ai-email', json={
            'employee_name': 'Alice Developer',
            'task': ''
        })
        self.assertEqual(res_missing.status_code, 400)

        # Unauthorized manager
        res_unauth = self.client.post('/generate-ai-email', json={
            'employee_name': 'Alice Developer',
            'task': 'Task',
            'assigned_by': 'Unrecognized Person'
        })
        self.assertEqual(res_unauth.status_code, 403)


if __name__ == '__main__':
    unittest.main()
