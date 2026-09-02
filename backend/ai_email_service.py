"""
PHOENIX AI Email Assistant — ai_email_service.py
-------------------------------------------------
Generates structured, professional task-assignment email content
using the OpenAI API (gpt-4o-mini — cost-efficient model).

Returns a structured dict with:
  subject, greeting, intro, details, action, closing, signature

The API key is read solely from backend/.env via python-dotenv.
No secrets are ever returned to the frontend.
"""

import os
import json
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables from the backend/.env file
_backend_dir = os.path.dirname(os.path.abspath(__file__))
_env_path = os.path.join(_backend_dir, '.env')
load_dotenv(_env_path)


def generate_task_email(
    employee_name: str,
    task_description: str,
    deadline: str,
    manager_name: str,
    priority: str = "Medium"
) -> dict:
    """
    Calls OpenAI to generate a structured, professional task-assignment email.

    Parameters
    ----------
    employee_name    : Full name of the employee being assigned the task.
    task_description : The task description / scope / deliverables.
    deadline         : Human-readable deadline string (e.g. "02 September 2026 at 05:30 PM IST").
    manager_name     : Full name of the assigning project manager.
    priority         : Task priority -- "Low", "Medium", or "High".

    Returns
    -------
    dict with keys:
        success   (bool)
        subject   (str)   -- Email subject line
        greeting  (str)   -- Opening salutation
        intro     (str)   -- First paragraph introducing the task
        details   (str)   -- Task details / expectations paragraph
        action    (str)   -- Call-to-action / acknowledgement request paragraph
        closing   (str)   -- Warm closing line
        signature (str)   -- Sign-off with manager name and company
        error     (str)   -- Only present when success is False
    """
    api_key = os.getenv('OPENAI_API_KEY', '').strip()
    if not api_key:
        return {
            'success': False,
            'error': 'OpenAI API key is not configured. Please add OPENAI_API_KEY to backend/.env.'
        }

    client = OpenAI(api_key=api_key)

    # Priority phrasing used in the prompt
    priority_phrasing = {
        'low':    'a standard-priority',
        'medium': 'a medium-priority',
        'high':   'a high-priority, time-sensitive'
    }.get(priority.strip().lower(), 'a medium-priority')

    system_prompt = (
        "You are a professional workplace communications assistant for PHOENIX, "
        "a premium project management company. "
        "You write concise, clear, warm, and professional internal emails. "
        "Your tone is encouraging and respectful. "
        "You NEVER use buzzwords, filler phrases, or excessive formality. "
        "You ALWAYS return ONLY valid JSON -- no markdown, no explanation, no code fences."
    )

    user_prompt = (
        f"Write a professional task-assignment email for the following context "
        f"and return ONLY a valid JSON object:\n\n"
        f"Employee Name: {employee_name}\n"
        f"Task Description: {task_description}\n"
        f"Deadline: {deadline}\n"
        f"Assigned By (Project Manager): {manager_name}\n"
        f"Priority: {priority} ({priority_phrasing} task)\n"
        f"Company: PHOENIX\n\n"
        f"Return this exact JSON structure (all values must be plain text strings -- no HTML, no markdown):\n"
        f'{{\n'
        f'  "subject": "A concise, informative subject line starting with [PHOENIX]",\n'
        f'  "greeting": "Opening salutation line only (e.g. Dear {employee_name},)",\n'
        f'  "intro": "One warm introductory sentence assigning the task and mentioning who assigned it.",\n'
        f'  "details": "Two to three sentences describing the task scope, expectations, and the deadline clearly.",\n'
        f'  "action": "One sentence asking the employee to acknowledge receipt and reach out with questions.",\n'
        f'  "closing": "One warm closing sentence (e.g. Wishing you the best with this assignment.)",\n'
        f'  "signature": "Sign-off block: Regards, then newline, {manager_name}, then newline, Project Manager -- PHOENIX"\n'
        f'}}\n\n'
        f"Respond with ONLY the JSON object. Do not include any other text."
    )

    try:
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user",   "content": user_prompt}
            ],
            temperature=0.7,
            max_tokens=600,
            response_format={"type": "json_object"}
        )

        raw_content = response.choices[0].message.content.strip()

        # Parse the JSON response
        email_data = json.loads(raw_content)

        # Validate all required keys are present
        required_keys = ['subject', 'greeting', 'intro', 'details', 'action', 'closing', 'signature']
        missing = [k for k in required_keys if k not in email_data]
        if missing:
            return {
                'success': False,
                'error': 'AI response was missing required fields: ' + ', '.join(missing)
            }

        return {
            'success':   True,
            'subject':   email_data.get('subject', ''),
            'greeting':  email_data.get('greeting', ''),
            'intro':     email_data.get('intro', ''),
            'details':   email_data.get('details', ''),
            'action':    email_data.get('action', ''),
            'closing':   email_data.get('closing', ''),
            'signature': email_data.get('signature', '')
        }

    except json.JSONDecodeError as e:
        return {
            'success': False,
            'error': 'Failed to parse AI response as JSON: ' + str(e)
        }
    except Exception as e:
        error_msg = str(e)
        if 'api_key' in error_msg.lower() or 'authentication' in error_msg.lower():
            return {
                'success': False,
                'error': 'OpenAI authentication failed. Please check your OPENAI_API_KEY in backend/.env.'
            }

        # If quota is exhausted or billing issues occur, return a high-quality structured template
        # so the user is never blocked from previewing, editing, and sending emails.
        if 'insufficient_quota' in error_msg.lower() or 'billing' in error_msg.lower() or 'credit_balance_exhausted' in error_msg.lower():
            return {
                'success': True,
                'subject': f"[PHOENIX] New Task Assignment: {task_description[:50]}",
                'greeting': f"Dear {employee_name},",
                'intro': f"You have been assigned a new {priority.lower()}-priority task by {manager_name}.",
                'details': f"Task Scope: {task_description}. Please complete this deliverable before the deadline: {deadline}.",
                'action': "Please review the requirements, acknowledge receipt of this email, and let me know if you have any questions.",
                'closing': "Thank you for your dedication and commitment to excellence.",
                'signature': f"Regards,\n{manager_name}\nProject Manager -- PHOENIX",
                'notice': 'OpenAI credit balance is currently exhausted. Generated a structured PHOENIX template for preview & edit.'
            }

        if 'rate_limit' in error_msg.lower():
            return {
                'success': False,
                'error': 'OpenAI rate limit reached. Please wait a moment and try again.'
            }

        return {
            'success': False,
            'error': 'AI generation failed: ' + error_msg
        }
