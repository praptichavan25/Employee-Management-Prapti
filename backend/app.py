from flask import Flask, request, jsonify
from flask_cors import CORS
import json
import os
import sqlite3
from email_service import send_task_email

app = Flask(__name__)
CORS(app)

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BACKEND_DIR, 'data', 'employees.json')
DB_PATH = os.path.join(BACKEND_DIR, 'phoenix.db')


def init_db():
    """Initializes the SQLite database, creates tasks table, and handles migration for assigned_by."""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS tasks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT NOT NULL,
            task TEXT NOT NULL,
            deadline TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'Assigned',
            assigned_by TEXT NOT NULL DEFAULT 'Prapti Chavan'
        )
    ''')
    conn.commit()

    # Migration check: Ensure assigned_by column exists for existing tables
    cursor.execute("PRAGMA table_info(tasks)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'assigned_by' not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN assigned_by TEXT NOT NULL DEFAULT 'Prapti Chavan'")
        conn.commit()

    conn.close()


# Initialize database on startup
init_db()


def get_employee_email(employee_name):
    """Finds an employee's email by name from employees.json."""
    if not os.path.exists(DATA_PATH):
        return None
    
    with open(DATA_PATH, 'r') as f:
        data = json.load(f)
    
    employees = data.get('employees', [])
    for emp in employees:
        if emp.get('name', '').strip().lower() == employee_name.strip().lower():
            return emp.get('email')
    
    return None


def validate_manager(manager_identifier):
    """Validates that manager_identifier matches an authorized Project Manager from employees.json."""
    if not os.path.exists(DATA_PATH) or not manager_identifier:
        return None

    with open(DATA_PATH, 'r') as f:
        data = json.load(f)

    clean_id = manager_identifier.strip().lower()
    for pm in data.get('project_managers', []):
        pm_name = pm.get('name', '').strip()
        pm_email = pm.get('email', '').strip().lower()
        if clean_id == pm_name.lower() or clean_id == pm_email:
            return pm_name

    return None


@app.route('/login', methods=['POST'])
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()

    if not email:
        return jsonify({
            'success': False,
            'message': 'Email is required'
        }), 400

    if not os.path.exists(DATA_PATH):
        return jsonify({
            'success': False,
            'message': 'Employee data file not found'
        }), 500

    with open(DATA_PATH, 'r') as f:
        emp_data = json.load(f)

    # Check project managers
    for pm in emp_data.get('project_managers', []):
        if pm.get('email', '').strip().lower() == email:
            return jsonify({
                'success': True,
                'user': {
                    'name': pm.get('name'),
                    'email': pm.get('email'),
                    'role': 'project_manager',
                    'department': pm.get('department')
                }
            }), 200

    # Check employees
    for emp in emp_data.get('employees', []):
        if emp.get('email', '').strip().lower() == email:
            return jsonify({
                'success': True,
                'user': {
                    'name': emp.get('name'),
                    'email': emp.get('email'),
                    'role': 'employee',
                    'department': emp.get('department')
                }
            }), 200

    return jsonify({
        'success': False,
        'message': 'Invalid PHOENIX email address.'
    }), 401


@app.route('/employees', methods=['GET'])
def get_employees():
    if not os.path.exists(DATA_PATH):
        return jsonify({'success': False, 'message': 'Employee data file not found'}), 500

    with open(DATA_PATH, 'r') as f:
        emp_data = json.load(f)

    return jsonify({
        'success': True,
        'employees': emp_data.get('employees', [])
    }), 200


@app.route('/add-employee', methods=['POST'])
def add_employee():
    data = request.get_json() or {}
    name = data.get('name', '').strip()
    email = data.get('email', '').strip().lower()
    department = data.get('department', '').strip()

    if not name or not email or not department:
        return jsonify({
            'success': False,
            'message': 'Please enter the employee name, Gmail, and department.'
        }), 400

    # Validate reasonable Gmail format
    if '@' not in email or not email.endswith('@gmail.com') or len(email) <= 10:
        return jsonify({
            'success': False,
            'message': 'Please enter a valid Gmail address (e.g., user@gmail.com).'
        }), 400

    if not os.path.exists(DATA_PATH):
        return jsonify({
            'success': False,
            'message': 'Employee data file not found'
        }), 500

    with open(DATA_PATH, 'r') as f:
        emp_data = json.load(f)

    # Check if email already exists in project_managers or employees
    all_emails = [pm.get('email', '').strip().lower() for pm in emp_data.get('project_managers', [])] + \
                 [emp.get('email', '').strip().lower() for emp in emp_data.get('employees', [])]

    if email in all_emails:
        return jsonify({
            'success': False,
            'message': 'An employee with this Gmail already exists.'
        }), 400

    new_employee = {
        'name': name,
        'email': email,
        'role': 'employee',
        'department': department,
        'status': 'active'
    }

    emp_data.setdefault('employees', []).append(new_employee)

    with open(DATA_PATH, 'w') as f:
        json.dump(emp_data, f, indent=2)

    return jsonify({
        'success': True,
        'message': 'Employee added successfully.',
        'employee': new_employee
    }), 200


@app.route('/assign-task', methods=['POST'])
def assign_task():
    data = request.get_json() or {}
    employee_name = data.get('employee_name', '').strip()
    task = data.get('task', '').strip()
    deadline = data.get('deadline', '').strip()
    assigned_by_input = data.get('assigned_by', '').strip()

    if not employee_name or not task or not deadline:
        return jsonify({
            'success': False,
            'message': 'Missing required fields: employee_name, task, and deadline are required.'
        }), 400

    # 1. Validate assigned_by manager against employees.json
    manager_name = validate_manager(assigned_by_input) if assigned_by_input else 'Prapti Chavan'
    if not manager_name:
        return jsonify({
            'success': False,
            'message': 'Unauthorized or invalid Project Manager.'
        }), 403

    # 2. Find employee email from employees.json
    employee_email = get_employee_email(employee_name)
    if not employee_email:
        return jsonify({
            'success': False,
            'message': 'Employee not found'
        }), 404

    # 3. Store task in SQLite with assigned_by
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO tasks (employee_name, task, deadline, status, assigned_by) VALUES (?, ?, ?, ?, ?)',
            (employee_name, task, deadline, 'Assigned', manager_name)
        )
        conn.commit()
        task_id = cursor.lastrowid
        conn.close()
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to store task in database: {str(e)}'
        }), 500

    # 4. Send email using existing email service with manager name
    email_sent = send_task_email(employee_name, employee_email, task, deadline, assigned_by=manager_name)

    # 5. Return success only when task stored and email sent
    if email_sent:
        return jsonify({
            'success': True,
            'message': 'Task assigned and email sent successfully',
            'task_id': task_id,
            'assigned_by': manager_name
        }), 200
    else:
        return jsonify({
            'success': False,
            'message': 'Task saved in database, but failed to send email'
        }), 500


@app.route('/tasks/<employee_name>', methods=['GET'])
def get_employee_tasks(employee_name):
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT id, employee_name, task, deadline, status, assigned_by FROM tasks WHERE LOWER(employee_name) = LOWER(?)',
            (employee_name.strip(),)
        )
        rows = cursor.fetchall()
        conn.close()

        tasks = [
            {
                'id': row['id'],
                'employee_name': row['employee_name'],
                'task': row['task'],
                'deadline': row['deadline'],
                'status': row['status'],
                'assigned_by': row['assigned_by'] if 'assigned_by' in row.keys() and row['assigned_by'] else 'Prapti Chavan'
            }
            for row in rows
        ]

        return jsonify({
            'success': True,
            'tasks': tasks
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error fetching tasks: {str(e)}'
        }), 500


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5001, debug=True)
