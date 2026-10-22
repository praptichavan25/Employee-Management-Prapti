import smtplib
import unittest
from unittest.mock import patch, MagicMock
import email_service


class TestEmailService(unittest.TestCase):
    """
    Tests Gmail SMTP email dispatch service with mocked smtplib network calls.
    Validates message structure, credentials loading, error resilience,
    and custom AI content support. Never sends real emails.
    """

    @patch('email_service.smtplib.SMTP')
    @patch.dict('os.environ', {'GMAIL_ADDRESS': 'system@gmail.com', 'GMAIL_APP_PASSWORD': 'test_app_password'})
    def test_send_task_email_success(self, mock_smtp_cls):
        """Service properly connects via TLS, authenticates, and dispatches message."""
        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        success = email_service.send_task_email(
            employee_name="Alice Developer",
            employee_email="alice@gmail.com",
            task="Refactor Database Models",
            deadline="30 October 2026",
            assigned_by="Test Manager"
        )

        self.assertTrue(success)

        # Verify SMTP server lifecycle
        mock_smtp_cls.assert_called_with('smtp.gmail.com', 587)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_with('system@gmail.com', 'test_app_password')
        mock_server.send_message.assert_called_once()
        mock_server.quit.assert_called_once()

        # Inspect constructed email headers
        sent_msg = mock_server.send_message.call_args[0][0]
        self.assertEqual(sent_msg['To'], 'alice@gmail.com')
        self.assertEqual(sent_msg['From'], 'system@gmail.com')
        self.assertIn("New Task Assigned - PHOENIX", sent_msg['Subject'])

    @patch('email_service.smtplib.SMTP')
    @patch.dict('os.environ', {'GMAIL_ADDRESS': 'system@gmail.com', 'GMAIL_APP_PASSWORD': 'test_app_password'})
    def test_send_task_email_with_custom_content(self, mock_smtp_cls):
        """Custom subject and custom body from approved AI drafts are respected."""
        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server

        custom_subj = "[PHOENIX] Urgent Architecture Review"
        custom_body = "Hello Alice,\n\nPlease review the attached system architecture.\n\nRegards,\nTest Manager"

        success = email_service.send_task_email(
            employee_name="Alice Developer",
            employee_email="alice@gmail.com",
            task="Review",
            deadline="Tomorrow",
            assigned_by="Test Manager",
            custom_subject=custom_subj,
            custom_body=custom_body
        )

        self.assertTrue(success)
        sent_msg = mock_server.send_message.call_args[0][0]
        self.assertEqual(sent_msg['Subject'], custom_subj)

    @patch.dict('os.environ', {'GMAIL_ADDRESS': '', 'GMAIL_APP_PASSWORD': ''}, clear=True)
    def test_send_task_email_missing_credentials(self):
        """Service gracefully fails when credentials are missing from environment."""
        success = email_service.send_task_email(
            employee_name="Alice",
            employee_email="alice@gmail.com",
            task="Task",
            deadline="Tomorrow"
        )
        self.assertFalse(success)

    @patch('email_service.smtplib.SMTP')
    @patch.dict('os.environ', {'GMAIL_ADDRESS': 'system@gmail.com', 'GMAIL_APP_PASSWORD': 'bad_password'})
    def test_send_task_email_authentication_error(self, mock_smtp_cls):
        """SMTPAuthenticationError is caught cleanly without crashing."""
        mock_server = MagicMock()
        mock_smtp_cls.return_value = mock_server
        mock_server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"Authentication failed")

        success = email_service.send_task_email(
            employee_name="Alice",
            employee_email="alice@gmail.com",
            task="Task",
            deadline="Tomorrow"
        )
        self.assertFalse(success)

    @patch('email_service.smtplib.SMTP')
    @patch.dict('os.environ', {'GMAIL_ADDRESS': 'system@gmail.com', 'GMAIL_APP_PASSWORD': 'test_password'})
    def test_send_task_email_network_error(self, mock_smtp_cls):
        """Network/Connection error (e.g. DNS or firewall) returns False without crashing."""
        mock_smtp_cls.side_effect = OSError("Connection timed out to smtp.gmail.com:587")

        success = email_service.send_task_email(
            employee_name="Alice",
            employee_email="alice@gmail.com",
            task="Task",
            deadline="Tomorrow"
        )
        self.assertFalse(success)


if __name__ == '__main__':
    unittest.main()
