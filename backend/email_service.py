import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

# Load environment variables from .env file in the backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, '.env')
load_dotenv(env_path)


def send_task_email(employee_name, employee_email, task, deadline, assigned_by="Prapti Chavan"):
    """
    Sends a task assignment email to an employee with the assigning manager name.
    """
    # Read Gmail credentials from environment variables
    gmail_address = os.getenv('GMAIL_ADDRESS', '').strip()
    gmail_app_password = os.getenv('GMAIL_APP_PASSWORD', '').strip()

    # Remove any non-breaking spaces and special characters from password
    gmail_app_password = gmail_app_password.replace('\xa0', '').replace('\u202f', '')

    # Validate environment variables
    if not gmail_address or not gmail_app_password:
        print("Error: GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables must be set.")
        return False

    # Email details
    subject = "New Task Assigned - PHOENIX"
    message_body = f"""Hello {employee_name},

You have been assigned a new task.

Task Assigned By:
{assigned_by}

Task:
{task}

Deadline:
{deadline}

Please complete the task before the deadline.

Regards,
PHOENIX
Project Management"""

    # Create the email message
    msg = MIMEMultipart()
    msg['From'] = gmail_address
    msg['To'] = employee_email
    msg['Subject'] = subject
    msg.attach(MIMEText(message_body, 'plain'))

    # Send the email
    try:
        # Connect to Gmail SMTP server
        print("Connecting to smtp.gmail.com:587...")
        server = smtplib.SMTP('smtp.gmail.com', 587)
        print("Connection successful.")
        
        print("Starting TLS...")
        server.starttls()
        print("TLS enabled.")
        
        # Login with Gmail credentials
        print("Logging in...")
        server.login(gmail_address, gmail_app_password)
        print("Login successful.")
        
        # Send the email
        print("Sending email...")
        server.send_message(msg)
        print("Email sent.")
        
        server.quit()
        
        # Success message
        print("\n✓ Email sent successfully!")
        print(f"  From: {gmail_address}")
        print(f"  To: {employee_email}")
        print(f"  Subject: {subject}")
        return True
        
    except smtplib.SMTPAuthenticationError:
        print("✗ Error: Gmail authentication failed.")
        print("  Check your GMAIL_ADDRESS and GMAIL_APP_PASSWORD.")
        print("  Note: Use an App Password, not your regular Gmail password.")
        return False
        
    except smtplib.SMTPException as e:
        print(f"✗ Error: SMTP error occurred: {e}")
        return False
        
    except OSError as e:
        print(f"✗ Error: Network/Connection error: {e}")
        print("  Cannot connect to smtp.gmail.com")
        print("  This may be a network, DNS, or firewall issue.")
        return False
        
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


if __name__ == '__main__':
    # Test sending task email
    test_name = "Sanjana Chavan"
    test_email = "sanjanachavan2809@gmail.com"
    test_task = "Complete Python Automation Project"
    test_deadline = "20 August 2026"

    send_task_email(test_name, test_email, test_task, test_deadline)
