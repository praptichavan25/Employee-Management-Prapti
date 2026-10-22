#!/usr/bin/env python3
"""
Temporary test backend runner for End-to-End browser testing.
Runs on 127.0.0.1:5001 against backend/phoenix_e2e.db and backend/data/employees_e2e.json.
Safely logs and mocks Gmail SMTP and OpenAI API calls to prevent unapproved external side effects.
"""

import os
import sys

PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app

# Route database and employee storage to isolated E2E test copies
app.DB_PATH = os.path.join(BACKEND_DIR, 'phoenix_e2e.db')
app.DATA_PATH = os.path.join(BACKEND_DIR, 'data', 'employees_e2e.json')
app.init_db()

# Mock external Gmail SMTP dispatch safely
def safe_mock_send_email(employee_name, employee_email, task, deadline, assigned_by="Prapti Chavan", custom_subject=None, custom_body=None):
    print(f"[E2E_SAFE_SMTP] Intercepted email to '{employee_name}' <{employee_email}> for task '{task}' by '{assigned_by}'.")
    return True

# Mock external OpenAI generation safely with realistic structured response
def safe_mock_generate_email(employee_name, task_description, deadline, manager_name, priority="Medium"):
    print(f"[E2E_SAFE_OPENAI] Intercepted AI draft generation for '{employee_name}' by '{manager_name}'.")
    return {
        'success': True,
        'subject': f"[PHOENIX] New Task Assignment: {task_description[:35]}",
        'greeting': f"Dear {employee_name},",
        'intro': f"You have been assigned a new {priority.lower()}-priority deliverable by {manager_name}.",
        'details': f"Scope: {task_description}. Target milestone deadline: {deadline}.",
        'action': "Please review the specifications and acknowledge receipt.",
        'closing': "Thank you for your dedication to engineering excellence.",
        'signature': f"Regards,\n{manager_name}\nProject Manager -- PHOENIX"
    }

app.send_task_email = safe_mock_send_email
app.generate_task_email = safe_mock_generate_email

if __name__ == '__main__':
    print("Starting PHOENIX E2E Test Backend on 127.0.0.1:5001...")
    app.app.run(host='127.0.0.1', port=5001, debug=False)
