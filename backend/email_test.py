import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
from dotenv import load_dotenv

# Load environment variables from .env file in the backend directory
backend_dir = os.path.dirname(os.path.abspath(__file__))
env_path = os.path.join(backend_dir, '.env')
load_dotenv(env_path)

# Read Gmail credentials from environment variables
gmail_address = os.getenv('GMAIL_ADDRESS', '').strip()
gmail_app_password = os.getenv('GMAIL_APP_PASSWORD', '').strip()

# Remove any non-breaking spaces and special characters from password
# This handles cases where .env might have been edited with special characters
gmail_app_password = gmail_app_password.replace('\xa0', '').replace('\u202f', '')

# Validate environment variables
if not gmail_address or not gmail_app_password:
    print("Error: GMAIL_ADDRESS and GMAIL_APP_PASSWORD environment variables must be set.")
    print("Set them before running this script.")
    exit(1)

# Email details
recipient = "sanjanachavan2809@gmail.com"
subject = "PHOENIX Email Automation Test"
message_body = """Hello Sanjana,

This is a test email from the PHOENIX Employee Email Automation System.

The Python email automation is working successfully.

Regards,
Prapti Chavan
Project Manager - PHOENIX"""

# Create the email message
msg = MIMEMultipart()
msg['From'] = gmail_address
msg['To'] = recipient
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
    print(f"  To: {recipient}")
    print(f"  Subject: {subject}")
    
except smtplib.SMTPAuthenticationError:
    print("✗ Error: Gmail authentication failed.")
    print("  Check your GMAIL_ADDRESS and GMAIL_APP_PASSWORD.")
    print("  Note: Use an App Password, not your regular Gmail password.")
    
except smtplib.SMTPException as e:
    print(f"✗ Error: SMTP error occurred: {e}")
    
except OSError as e:
    print(f"✗ Error: Network/Connection error: {e}")
    print("  Cannot connect to smtp.gmail.com")
    print("  This may be a network, DNS, or firewall issue.")
    
except Exception as e:
    print(f"✗ Error: {e}")
