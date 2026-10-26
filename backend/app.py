import os
import sys
import json
import sqlite3
from datetime import datetime
from functools import wraps
from flask import Flask, request, jsonify, session, send_from_directory
from flask_cors import CORS
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from dotenv import load_dotenv
from werkzeug.security import check_password_hash

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

# Load environment variables
load_dotenv(os.path.join(BACKEND_DIR, '.env'))

from email_service import send_task_email
from ai_email_service import generate_task_email

app = Flask(__name__)
# Secret key management: use env variable or development fallback
secret_key_env = os.environ.get('SECRET_KEY')
if secret_key_env:
    app.config['SECRET_KEY'] = secret_key_env
else:
    if os.environ.get('ENVIRONMENT', 'development').lower() == 'production' and not app.debug:
        raise RuntimeError("CRITICAL: SECRET_KEY environment variable must be set in production!")
    app.config['SECRET_KEY'] = 'phoenix-development-fallback-key-32bytes-min-len'

app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = os.environ.get('SESSION_COOKIE_SAMESITE', 'Lax')
if os.environ.get('ENVIRONMENT', 'development').lower() == 'production':
    app.config['SESSION_COOKIE_SECURE'] = True


# CORS configuration — origins loaded from env var for production flexibility
# Set ALLOWED_ORIGINS to a comma-separated list of trusted frontend URLs.
# Example: https://phoenix-frontend.onrender.com,https://myapp.vercel.app
def get_allowed_origins():
    """
    Parses and sanitizes allowed CORS origins.
    - Preserves approved local development origins in non-production environments.
    - Loads production frontend origins from ALLOWED_ORIGINS env var.
    - Explicitly filters out wildcards ('*') and 'null' to prevent insecure credentialed CORS bypasses.
    - Strips trailing slashes to ensure standard origin matching.
    """
    dev_origins = [
        'http://127.0.0.1:8090', 'http://localhost:8090',
        'http://127.0.0.1:8080', 'http://localhost:8080',
        'http://127.0.0.1:5500', 'http://localhost:5500',
    ]
    raw_env = os.environ.get('ALLOWED_ORIGINS', '')
    parsed_env = [
        o.strip().rstrip('/')
        for o in raw_env.split(',')
        if o.strip() and o.strip() != '*' and o.strip().lower() != 'null'
    ]

    render_external_url = os.environ.get('RENDER_EXTERNAL_URL', '').strip().rstrip('/')
    if render_external_url and render_external_url not in parsed_env:
        parsed_env.append(render_external_url)

    is_production = os.environ.get('ENVIRONMENT', 'development').lower() == 'production'
    if is_production:
        return parsed_env if parsed_env else dev_origins

    # In development/testing, merge dev origins with any custom origins (deduplicated)
    return list(dict.fromkeys(dev_origins + parsed_env))


_allowed_origins = get_allowed_origins()
CORS(
    app,
    supports_credentials=True,
    origins=_allowed_origins,
    methods=['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allow_headers=['Content-Type', 'Authorization', 'X-User-Email'],
    expose_headers=['Content-Type', 'X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'Retry-After'],
    max_age=86400
)

# Rate limiting configuration (configurable storage backend, defaults to memory)
ratelimit_storage_uri = os.environ.get('RATELIMIT_STORAGE_URI', 'memory://')
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=[],
    storage_uri=ratelimit_storage_uri,
    strategy='fixed-window',
    headers_enabled=True
)


@app.errorhandler(429)
def ratelimit_handler(e):
    """Clean JSON response for rate limit violations with standard Retry-After headers."""
    return jsonify({
        'success': False,
        'message': f'Too many requests: {e.description}. Please slow down.'
    }), 429


DATA_PATH = os.path.join(BACKEND_DIR, 'data', 'employees.json')
DB_PATH = os.path.join(BACKEND_DIR, 'phoenix.db')
FRONTEND_DIR = os.path.abspath(os.path.join(BACKEND_DIR, '..', 'frontend'))


@app.after_request
def add_security_headers(response):
    """Adds standard security headers to all HTTP responses."""
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    return response


def get_db():
    """Returns a SQLite connection with foreign keys enabled."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    """Initializes the SQLite database, creates tasks, meetings, task_comments, and task_activity tables."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA foreign_keys = ON;")
    try:
        conn.execute("PRAGMA journal_mode = WAL;")
    except Exception:
        pass
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

    # Migration check: Ensure assigned_by and progress columns exist for existing tables
    cursor.execute("PRAGMA table_info(tasks)")
    columns = [col[1] for col in cursor.fetchall()]
    if 'assigned_by' not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN assigned_by TEXT NOT NULL DEFAULT 'Prapti Chavan'")
        conn.commit()
    if 'progress' not in columns:
        cursor.execute("ALTER TABLE tasks ADD COLUMN progress INTEGER DEFAULT 0")
        conn.commit()

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS meetings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            employee_name TEXT NOT NULL,
            title TEXT NOT NULL,
            description TEXT,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            host TEXT NOT NULL,
            participants_count INTEGER DEFAULT 1,
            link TEXT
        )
    ''')
    conn.commit()

    # Create task_comments table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS task_comments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            user_name TEXT NOT NULL,
            user_email TEXT NOT NULL,
            user_role TEXT NOT NULL,
            comment TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()

    # Create task_activity table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS task_activity (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            task_id INTEGER NOT NULL,
            actor_name TEXT NOT NULL,
            actor_email TEXT NOT NULL,
            actor_role TEXT NOT NULL,
            activity_type TEXT NOT NULL,
            activity_description TEXT NOT NULL,
            created_at TEXT NOT NULL,
            metadata TEXT,
            FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
        )
    ''')
    conn.commit()

    conn.close()


# Initialize database on startup
init_db()


def get_user_info(user_identifier):
    """Finds user info from employees.json by email or name. Supports administrator, project_manager, and employee roles."""
    if not os.path.exists(DATA_PATH) or not user_identifier:
        return None

    with open(DATA_PATH, 'r') as f:
        data = json.load(f)

    clean_id = str(user_identifier).strip().lower()

    for admin in data.get('administrators', []):
        a_email = admin.get('email', '').strip().lower()
        a_name = admin.get('name', '').strip().lower()
        if clean_id == a_email or clean_id == a_name:
            return {
                'name': admin.get('name'),
                'email': admin.get('email'),
                'role': 'administrator',
                'department': admin.get('department')
            }

    for pm in data.get('project_managers', []):
        pm_email = pm.get('email', '').strip().lower()
        pm_name = pm.get('name', '').strip().lower()
        if clean_id == pm_email or clean_id == pm_name:
            return {
                'name': pm.get('name'),
                'email': pm.get('email'),
                'role': 'project_manager',
                'department': pm.get('department')
            }

    for emp in data.get('employees', []):
        emp_email = emp.get('email', '').strip().lower()
        emp_name = emp.get('name', '').strip().lower()
        if clean_id == emp_email or clean_id == emp_name:
            return {
                'name': emp.get('name'),
                'email': emp.get('email'),
                'role': 'employee',
                'department': emp.get('department')
            }

    return None


def log_activity(task_id, actor_name, actor_email, actor_role, activity_type, activity_description, metadata=None):
    """Inserts a system activity record into task_activity table."""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        meta_json = json.dumps(metadata) if metadata else None

        cursor.execute('''
            INSERT INTO task_activity (task_id, actor_name, actor_email, actor_role, activity_type, activity_description, created_at, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', (task_id, actor_name, actor_email, actor_role, activity_type, activity_description, created_at, meta_json))

        conn.commit()
        conn.close()
    except Exception as e:
        print(f"Error logging activity: {e}")



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
    """Validates that manager_identifier matches an authorized Project Manager or Administrator from employees.json."""
    if not os.path.exists(DATA_PATH) or not manager_identifier:
        return None

    with open(DATA_PATH, 'r') as f:
        data = json.load(f)

    clean_id = str(manager_identifier).strip().lower()
    for pm in data.get('project_managers', []):
        pm_name = pm.get('name', '').strip()
        pm_email = pm.get('email', '').strip().lower()
        if clean_id == pm_name.lower() or clean_id == pm_email:
            return pm_name

    for admin in data.get('administrators', []):
        admin_name = admin.get('name', '').strip()
        admin_email = admin.get('email', '').strip().lower()
        if clean_id == admin_name.lower() or clean_id == admin_email:
            return admin_name

    return None


def get_current_user():
    """
    Retrieves the currently authenticated user context.
    Primary source: Flask session['user'].
    Fallback (for testing or API callers with user context):
    Checks header X-User-Email, query parameter user_email,
    or JSON payload fields if in testing mode.
    """
    if 'user' in session and session['user']:
        return session['user']

    # Testing or fallback user identification
    user_email = request.headers.get('X-User-Email') or request.args.get('user_email')
    if not user_email and request.is_json:
        data = request.get_json(silent=True) or {}
        user_email = (
            data.get('actor_email')
            or data.get('user_email')
            or data.get('assigned_by')
            or data.get('employee_name')
        )

    if user_email:
        u = get_user_info(user_email)
        if u:
            if app.config.get('TESTING'):
                return u
            return None

    return None


def login_required(f):
    """Decorator requiring a valid authenticated session (or testing user context)."""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        user = get_current_user()
        if not user:
            return jsonify({
                'success': False,
                'message': 'Authentication required. Please log in.'
            }), 401
        return f(*args, **kwargs)
    return decorated_function


def role_required(*allowed_roles):
    """Decorator requiring user to have one of the specified roles."""
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user = get_current_user()
            if not user:
                return jsonify({
                    'success': False,
                    'message': 'Authentication required. Please log in.'
                }), 401
            user_role = (user.get('role') or '').strip().lower()
            allowed = [r.strip().lower() for r in allowed_roles]
            if user_role not in allowed:
                return jsonify({
                    'success': False,
                    'message': 'Forbidden: Insufficient privileges for this action.'
                }), 403
            return f(*args, **kwargs)
        return decorated_function
    return decorator


@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint for production monitors and load balancers."""
    return jsonify({
        'status': 'healthy',
        'timestamp': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
        'service': 'PHOENIX Employee Automation Backend'
    }), 200


@app.route('/login', methods=['POST'])
@limiter.limit("10 per minute; 30 per hour")
def login():
    data = request.get_json() or {}
    email = data.get('email', '').strip().lower()
    password = data.get('password', '')

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

    def _build_user_response(user_record, role):
        """Verifies password and builds login response for a matching user record."""
        stored_hash = user_record.get('password_hash', '')
        if not stored_hash or not check_password_hash(stored_hash, password):
            return None, jsonify({
                'success': False,
                'message': 'Invalid password.'
            }), 401
        user_info = {
            'name': user_record.get('name'),
            'email': user_record.get('email'),
            'role': role,
            'department': user_record.get('department')
        }
        # Establish server-side session
        session['user'] = user_info
        return user_info, None, None

    # Check administrators
    for admin in emp_data.get('administrators', []):
        if admin.get('email', '').strip().lower() == email:
            user_info, err_resp, err_code = _build_user_response(admin, 'administrator')
            if err_resp:
                return err_resp, err_code
            return jsonify({'success': True, 'user': user_info}), 200

    # Check project managers
    for pm in emp_data.get('project_managers', []):
        if pm.get('email', '').strip().lower() == email:
            user_info, err_resp, err_code = _build_user_response(pm, 'project_manager')
            if err_resp:
                return err_resp, err_code
            return jsonify({'success': True, 'user': user_info}), 200

    # Check employees
    for emp in emp_data.get('employees', []):
        if emp.get('email', '').strip().lower() == email:
            user_info, err_resp, err_code = _build_user_response(emp, 'employee')
            if err_resp:
                return err_resp, err_code
            return jsonify({'success': True, 'user': user_info}), 200

    return jsonify({
        'success': False,
        'message': 'Invalid PHOENIX email address.'
    }), 401


def sanitize_employee(emp_record):
    """
    Strips credentials, password hashes, and sensitive internal security keys
    from employee records while preserving legitimate profile attributes.
    """
    if not isinstance(emp_record, dict):
        return {}
    allowed_keys = {'id', 'name', 'email', 'department', 'role', 'status'}
    sanitized = {k: v for k, v in emp_record.items() if k in allowed_keys}
    for sensitive in ('password_hash', 'password', 'secret', 'token'):
        sanitized.pop(sensitive, None)
    return sanitized


@app.route('/auth/me', methods=['GET'])
def get_auth_session():
    """
    Validates the active server-side session and returns the sanitized user profile.
    Used by frontend authentication guards to prevent unauthorized access.
    """
    current_user = get_current_user()
    if not current_user:
        return jsonify({
            'success': False,
            'authenticated': False,
            'message': 'Authentication required. Please log in.'
        }), 401

    return jsonify({
        'success': True,
        'authenticated': True,
        'user': {
            'name': current_user.get('name'),
            'email': current_user.get('email'),
            'role': current_user.get('role'),
            'department': current_user.get('department')
        }
    }), 200


@app.route('/logout', methods=['POST'])
def logout():
    """Clears the server-side session cookie, invalidating the user's login state."""
    session.clear()
    return jsonify({'success': True, 'message': 'Logged out successfully.'}), 200


@app.route('/employees', methods=['GET'])
def get_employees():
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if not os.path.exists(DATA_PATH):
        return jsonify({'success': False, 'message': 'Employee data file not found'}), 500

    with open(DATA_PATH, 'r') as f:
        emp_data = json.load(f)

    sanitized_employees = [sanitize_employee(e) for e in emp_data.get('employees', [])]

    return jsonify({
        'success': True,
        'employees': sanitized_employees
    }), 200


@app.route('/add-employee', methods=['POST'])
def add_employee():
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if current_user and current_user.get('role', '').lower() not in ['project_manager', 'administrator']:
        return jsonify({
            'success': False,
            'message': 'Forbidden: Only Project Managers or Administrators can register employees.'
        }), 403

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
        'employee': sanitize_employee(new_employee)
    }), 200


@app.route('/generate-ai-email', methods=['POST'])
@limiter.limit("15 per minute; 60 per hour")
def generate_ai_email():
    """
    Generates a structured AI-drafted email for a task assignment.
    Accepts: employee_name, task, deadline_date, deadline_time, assigned_by, priority
    Returns: structured email fields (subject, greeting, intro, details, action, closing, signature)
    The OpenAI API key is NEVER returned to the caller.
    """
    data = request.get_json() or {}

    employee_name  = data.get('employee_name', '').strip()
    task           = data.get('task', '').strip()
    deadline_date  = data.get('deadline_date', '').strip()
    deadline_time  = data.get('deadline_time', '').strip()
    assigned_by    = data.get('assigned_by', '').strip()
    priority       = data.get('priority', 'Medium').strip()

    # Validate required fields
    if not employee_name or not task:
        return jsonify({
            'success': False,
            'message': 'Missing required fields: employee_name and task are required.'
        }), 400

    # Validate manager identity
    current_user = get_current_user()
    if current_user:
        if current_user.get('role', '').lower() not in ['project_manager', 'administrator']:
            return jsonify({
                'success': False,
                'message': 'Unauthorized or invalid Project Manager.'
            }), 403
        manager_name = current_user.get('name')
    else:
        if not app.config.get('TESTING'):
            return jsonify({
                'success': False,
                'message': 'Authentication required. Please log in.'
            }), 401
        manager_name = validate_manager(assigned_by) if assigned_by else None
        if not manager_name:
            return jsonify({
                'success': False,
                'message': 'Unauthorized or invalid Project Manager.'
            }), 403

    # Build human-readable deadline string
    deadline_str = ''
    if deadline_date and deadline_time:
        try:
            dt = datetime.strptime(f'{deadline_date} {deadline_time}', '%Y-%m-%d %H:%M')
            deadline_str = dt.strftime('%d %B %Y at %I:%M %p IST')
        except ValueError:
            deadline_str = f'{deadline_date} {deadline_time}'
    elif deadline_date:
        deadline_str = deadline_date
    else:
        deadline_str = 'TBD'

    # Call the AI email generation service
    result = generate_task_email(
        employee_name=employee_name,
        task_description=task,
        deadline=deadline_str,
        manager_name=manager_name,
        priority=priority
    )

    if result.get('success'):
        return jsonify({
            'success':   True,
            'subject':   result['subject'],
            'greeting':  result['greeting'],
            'intro':     result['intro'],
            'details':   result['details'],
            'action':    result['action'],
            'closing':   result['closing'],
            'signature': result['signature'],
            'notice':    result.get('notice')
        }), 200
    else:
        return jsonify({
            'success': False,
            'message': result.get('error', 'AI email generation failed.')
        }), 500


@app.route('/assign-task', methods=['POST'])
@limiter.limit("30 per minute; 100 per hour")
def assign_task():
    data = request.get_json() or {}
    employee_name = data.get('employee_name', '').strip()
    task = data.get('task', '').strip()
    deadline_date_str = data.get('deadline_date', '').strip()
    deadline_time_str = data.get('deadline_time', '').strip()
    assigned_by_input = data.get('assigned_by', '').strip()
    custom_subject = data.get('custom_subject', '').strip()
    custom_body = data.get('custom_body', '').strip()

    # Fallback to older `deadline` if the frontend hasn't been fully updated yet or API is used directly
    legacy_deadline = data.get('deadline', '').strip()

    if not employee_name or not task:
        return jsonify({
            'success': False,
            'message': 'Missing required fields: employee_name and task are required.'
        }), 400

    # Combine deadline date and time
    combined_deadline_iso = ""
    email_deadline_str = ""

    if deadline_date_str and deadline_time_str:
        try:
            # Create exact datetime object
            dt = datetime.strptime(f"{deadline_date_str} {deadline_time_str}", "%Y-%m-%d %H:%M")
            combined_deadline_iso = dt.strftime("%Y-%m-%d %H:%M:00")
            # 20 August 2026 at 5:30 PM IST
            email_deadline_str = dt.strftime("%d %B %Y at %I:%M %p IST")
        except ValueError:
            return jsonify({
                'success': False,
                'message': 'Invalid deadline date or time format.'
            }), 400
    elif legacy_deadline:
        combined_deadline_iso = legacy_deadline
        email_deadline_str = legacy_deadline
    else:
        return jsonify({
            'success': False,
            'message': 'Missing required fields: deadline date and time are required.'
        }), 400

    # 1. Validate assigned_by manager against employees.json
    current_user = get_current_user()
    if current_user:
        if current_user.get('role', '').lower() not in ['project_manager', 'administrator']:
            return jsonify({
                'success': False,
                'message': 'Unauthorized or invalid Project Manager.'
            }), 403
        manager_name = current_user.get('name')
    else:
        if not app.config.get('TESTING'):
            return jsonify({
                'success': False,
                'message': 'Authentication required. Please log in.'
            }), 401
        manager_name = validate_manager(assigned_by_input) if assigned_by_input else None
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
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO tasks (employee_name, task, deadline, status, assigned_by) VALUES (?, ?, ?, ?, ?)',
            (employee_name, task, combined_deadline_iso, 'Assigned', manager_name)
        )
        conn.commit()
        task_id = cursor.lastrowid
        conn.close()

        # Log Task Assigned Activity
        manager_info = get_user_info(manager_name) or {'name': manager_name, 'email': 'prapti.chavan25@gmail.com', 'role': 'project_manager'}
        log_activity(
            task_id,
            manager_info['name'],
            manager_info['email'],
            'project_manager',
            'TASK_ASSIGNED',
            f"{manager_info['name']} assigned this task to {employee_name}"
        )
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to store task in database: {str(e)}'
        }), 500

    # 4. Send email using existing email service with manager name
    email_sent = send_task_email(
        employee_name,
        employee_email,
        task,
        email_deadline_str,
        assigned_by=manager_name,
        custom_subject=custom_subject or None,
        custom_body=custom_body or None
    )

    # 5. Return success only when task stored and email sent
    if email_sent:
        log_activity(
            task_id,
            manager_info['name'],
            manager_info['email'],
            'project_manager',
            'EMAIL_SENT',
            f"Task assignment email sent to {employee_name}"
        )
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
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if current_user and current_user.get('role', '').lower() == 'employee':
        if current_user.get('name', '').strip().lower() != employee_name.strip().lower():
            return jsonify({
                'success': False,
                'message': 'Unauthorized: You can only view your own tasks.'
            }), 403

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute('''
            SELECT t.id, t.employee_name, t.task, t.deadline, t.status, t.assigned_by, t.progress,
                   (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) AS comment_count
            FROM tasks t
            WHERE LOWER(t.employee_name) = LOWER(?)
        ''', (employee_name.strip(),))
        rows = cursor.fetchall()
        conn.close()

        tasks = [
            {
                'id': row['id'],
                'employee_name': row['employee_name'],
                'task': row['task'],
                'deadline': row['deadline'],
                'status': row['status'],
                'assigned_by': row['assigned_by'] if 'assigned_by' in row.keys() and row['assigned_by'] else 'Prapti Chavan',
                'progress': row['progress'] if ('progress' in row.keys() and row['progress'] is not None) else (100 if row['status'] == 'Completed' else 0),
                'comment_count': row['comment_count'] if 'comment_count' in row.keys() else 0
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


@app.route('/tasks/<int:task_id>/status', methods=['PATCH'])
def update_task_status(task_id):
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    data = request.get_json() or {}
    new_status = data.get('status', '').strip()
    employee_name = data.get('employee_name', '').strip()
    actor_email = data.get('actor_email', '').strip() or data.get('user_email', '').strip()

    # Allowed status values
    allowed_statuses = ['Assigned', 'In Progress', 'Completed']
    matched_status = next((s for s in allowed_statuses if s.lower() == new_status.lower()), None)

    if not matched_status:
        return jsonify({
            'success': False,
            'message': 'Invalid task status. Allowed values: Assigned, In Progress, Completed'
        }), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check if task exists
        cursor.execute(
            'SELECT id, employee_name, task, deadline, status, assigned_by, progress FROM tasks WHERE id = ?',
            (task_id,)
        )
        task_row = cursor.fetchone()

        if not task_row:
            conn.close()
            return jsonify({
                'success': False,
                'message': 'Task not found'
            }), 404

        # Verify employee ownership if logged in as employee or employee_name is provided in request context
        if current_user and current_user.get('role', '').lower() == 'employee':
            if task_row['employee_name'].strip().lower() != current_user.get('name', '').strip().lower():
                conn.close()
                return jsonify({
                    'success': False,
                    'message': 'Unauthorized: Task belongs to another employee.'
                }), 403
        elif employee_name and task_row['employee_name'].strip().lower() != employee_name.lower():
            conn.close()
            return jsonify({
                'success': False,
                'message': 'Unauthorized: Task belongs to another employee.'
            }), 403

        old_status = task_row['status']
        curr_progress = task_row['progress'] if ('progress' in task_row.keys() and task_row['progress'] is not None) else 0

        # Sync progress based on status change
        new_progress = curr_progress
        if matched_status == 'Completed':
            new_progress = 100
        elif matched_status == 'Assigned' and curr_progress >= 100:
            new_progress = 0
        elif matched_status == 'In Progress' and curr_progress == 0:
            new_progress = 25

        # Update status and progress
        cursor.execute(
            'UPDATE tasks SET status = ?, progress = ? WHERE id = ?',
            (matched_status, new_progress, task_id)
        )
        conn.commit()

        # Fetch updated task
        cursor.execute('''
            SELECT t.id, t.employee_name, t.task, t.deadline, t.status, t.assigned_by, t.progress,
                   (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) AS comment_count
            FROM tasks t WHERE t.id = ?
        ''', (task_id,))
        updated_row = cursor.fetchone()
        conn.close()

        # Log status transition activity
        actor_info = get_user_info(actor_email) if actor_email else None
        if not actor_info:
            target_name = employee_name or task_row['employee_name']
            actor_info = get_user_info(target_name) or {
                'name': target_name,
                'email': (get_employee_email(target_name) or ''),
                'role': 'employee'
            }

        if old_status != matched_status:
            log_activity(
                task_id,
                actor_info['name'],
                actor_info['email'],
                actor_info['role'],
                'STATUS_CHANGED',
                f"{actor_info['name']} changed status from {old_status} to {matched_status}"
            )

        updated_task = {
            'id': updated_row['id'],
            'employee_name': updated_row['employee_name'],
            'task': updated_row['task'],
            'deadline': updated_row['deadline'],
            'status': updated_row['status'],
            'assigned_by': updated_row['assigned_by'] if 'assigned_by' in updated_row.keys() and updated_row['assigned_by'] else 'Prapti Chavan',
            'progress': updated_row['progress'] if ('progress' in updated_row.keys() and updated_row['progress'] is not None) else (100 if updated_row['status'] == 'Completed' else 0),
            'comment_count': updated_row['comment_count'] if 'comment_count' in updated_row.keys() else 0
        }

        return jsonify({
            'success': True,
            'message': 'Task status updated successfully',
            'task': updated_task
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error updating task status: {str(e)}'
        }), 500


@app.route('/tasks/<int:task_id>/progress', methods=['PATCH'])
def update_task_progress(task_id):
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    data = request.get_json() or {}
    progress_val = data.get('progress')
    employee_name = data.get('employee_name', '').strip()
    actor_email = data.get('actor_email', '').strip() or data.get('user_email', '').strip()

    try:
        progress_int = int(progress_val)
        if progress_int not in [0, 25, 50, 75, 100]:
            return jsonify({'success': False, 'message': 'Progress must be one of: 0, 25, 50, 75, 100'}), 400
    except (ValueError, TypeError):
        return jsonify({'success': False, 'message': 'Invalid progress value'}), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, employee_name, task, deadline, status, assigned_by, progress FROM tasks WHERE id = ?', (task_id,))
        task_row = cursor.fetchone()

        if not task_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Task not found'}), 404

        # Verify employee ownership if logged in as employee or employee_name is provided in request context
        if current_user and current_user.get('role', '').lower() == 'employee':
            if task_row['employee_name'].strip().lower() != current_user.get('name', '').strip().lower():
                conn.close()
                return jsonify({'success': False, 'message': 'Unauthorized: Task belongs to another employee.'}), 403
        elif employee_name and task_row['employee_name'].strip().lower() != employee_name.lower():
            conn.close()
            return jsonify({'success': False, 'message': 'Unauthorized: Task belongs to another employee.'}), 403

        old_status = task_row['status']
        old_progress = task_row['progress'] if ('progress' in task_row.keys() and task_row['progress'] is not None) else (100 if old_status == 'Completed' else 0)

        # Automatic status transition based on progress:
        # Assigned -> In Progress if progress > 0
        # Completed if progress == 100
        # In Progress if status was Completed and progress < 100
        new_status = old_status
        if progress_int == 100:
            new_status = 'Completed'
        elif progress_int > 0 and old_status == 'Assigned':
            new_status = 'In Progress'
        elif progress_int < 100 and old_status == 'Completed':
            new_status = 'In Progress'
        elif progress_int == 0 and old_status == 'Completed':
            new_status = 'Assigned'

        cursor.execute(
            'UPDATE tasks SET progress = ?, status = ? WHERE id = ?',
            (progress_int, new_status, task_id)
        )
        conn.commit()

        cursor.execute('''
            SELECT t.id, t.employee_name, t.task, t.deadline, t.status, t.assigned_by, t.progress,
                   (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) AS comment_count
            FROM tasks t WHERE t.id = ?
        ''', (task_id,))
        updated_row = cursor.fetchone()
        conn.close()

        # Log activity
        actor_info = get_user_info(actor_email) if actor_email else None
        if not actor_info:
            target_name = employee_name or task_row['employee_name']
            actor_info = get_user_info(target_name) or {
                'name': target_name,
                'email': (get_employee_email(target_name) or ''),
                'role': 'employee'
            }

        log_activity(
            task_id,
            actor_info['name'],
            actor_info['email'],
            actor_info['role'],
            'PROGRESS_UPDATED',
            f"{actor_info['name']} updated progress to {progress_int}%"
        )

        if old_status != new_status:
            log_activity(
                task_id,
                actor_info['name'],
                actor_info['email'],
                actor_info['role'],
                'STATUS_CHANGED',
                f"{actor_info['name']} changed status from {old_status} to {new_status}"
            )

        updated_task = {
            'id': updated_row['id'],
            'employee_name': updated_row['employee_name'],
            'task': updated_row['task'],
            'deadline': updated_row['deadline'],
            'status': updated_row['status'],
            'assigned_by': updated_row['assigned_by'] if 'assigned_by' in updated_row.keys() and updated_row['assigned_by'] else 'Prapti Chavan',
            'progress': updated_row['progress'],
            'comment_count': updated_row['comment_count'] if 'comment_count' in updated_row.keys() else 0
        }

        return jsonify({
            'success': True,
            'message': f'Task progress updated to {progress_int}%',
            'task': updated_task
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error updating task progress: {str(e)}'
        }), 500


@app.route('/meetings/<employee_name>', methods=['GET'])
def get_meetings(employee_name):
    if not employee_name:
        return jsonify({'success': False, 'message': 'Employee name is required'}), 400

    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if current_user and current_user.get('role', '').lower() == 'employee':
        if current_user.get('name', '').strip().lower() != employee_name.strip().lower():
            return jsonify({
                'success': False,
                'message': 'Unauthorized: You can only view your own meetings.'
            }), 403

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        
        cursor.execute(
            'SELECT id, employee_name, title, description, start_time, end_time, host, participants_count, link '
            'FROM meetings WHERE LOWER(employee_name) = LOWER(?)',
            (employee_name,)
        )
        rows = cursor.fetchall()
        conn.close()

        meetings = []
        for row in rows:
            meetings.append({
                'id': row['id'],
                'employee_name': row['employee_name'],
                'title': row['title'],
                'description': row['description'],
                'start_time': row['start_time'],
                'end_time': row['end_time'],
                'host': row['host'],
                'participants_count': row['participants_count'],
                'link': row['link']
            })

        return jsonify({
            'success': True,
            'meetings': meetings
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error fetching meetings: {str(e)}'
        }), 500


@app.route('/assign-meeting', methods=['POST'])
def assign_meeting():
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if current_user and current_user.get('role', '').lower() not in ['project_manager', 'administrator']:
        return jsonify({
            'success': False,
            'message': 'Forbidden: Only Project Managers or Administrators can assign meetings.'
        }), 403

    data = request.get_json() or {}
    employee_name = data.get('employee_name', '').strip()
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    start_time = data.get('start_time', '').strip()
    end_time = data.get('end_time', '').strip()
    host = data.get('host', '').strip()
    participants_count = data.get('participants_count', 1)
    link = data.get('link', '').strip()

    if not employee_name or not title or not start_time or not end_time or not host:
        return jsonify({
            'success': False,
            'message': 'Missing required fields.'
        }), 400

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO meetings (employee_name, title, description, start_time, end_time, host, participants_count, link) '
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            (employee_name, title, description, start_time, end_time, host, participants_count, link)
        )
        conn.commit()
        meeting_id = cursor.lastrowid
        conn.close()
        
        return jsonify({
            'success': True,
            'message': 'Meeting assigned successfully',
            'meeting_id': meeting_id
        }), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to store meeting: {str(e)}'
        }), 500


@app.route('/tasks/id/<int:task_id>', methods=['GET'])
def get_task_by_id(task_id):
    """Returns details for a single task."""
    current_user = get_current_user()
    user_email = request.args.get('user_email', '').strip()
    user_info = current_user or (get_user_info(user_email) if app.config.get('TESTING') else None)

    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('''
            SELECT t.id, t.employee_name, t.task, t.deadline, t.status, t.assigned_by, t.progress,
                   (SELECT COUNT(*) FROM task_comments WHERE task_id = t.id) AS comment_count
            FROM tasks t WHERE t.id = ?
        ''', (task_id,))
        row = cursor.fetchone()
        conn.close()

        if not row:
            return jsonify({'success': False, 'message': 'Task not found'}), 404

        task_data = {
            'id': row['id'],
            'employee_name': row['employee_name'],
            'task': row['task'],
            'deadline': row['deadline'],
            'status': row['status'],
            'assigned_by': row['assigned_by'] if 'assigned_by' in row.keys() and row['assigned_by'] else 'Prapti Chavan',
            'progress': row['progress'] if ('progress' in row.keys() and row['progress'] is not None) else (100 if row['status'] == 'Completed' else 0),
            'comment_count': row['comment_count'] if 'comment_count' in row.keys() else 0
        }

        # Check authorization if user_info is available
        if user_info and user_info.get('role', '').lower() == 'employee':
            emp_name = task_data['employee_name'].strip().lower()
            u_name = user_info['name'].strip().lower()
            u_email = user_info['email'].strip().lower()
            emp_email = (get_employee_email(task_data['employee_name']) or '').strip().lower()
            if u_name != emp_name and u_email != emp_email:
                return jsonify({'success': False, 'message': 'Unauthorized access to task'}), 403

        return jsonify({'success': True, 'task': task_data}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching task: {str(e)}'}), 500


@app.route('/tasks/<int:task_id>/comments', methods=['GET'])
def get_task_comments(task_id):
    """Returns comments for a specific task."""
    current_user = get_current_user()
    user_email = request.args.get('user_email', '').strip()
    user_info = current_user or (get_user_info(user_email) if app.config.get('TESTING') else None)

    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Check task existence
        cursor.execute('SELECT id, employee_name FROM tasks WHERE id = ?', (task_id,))
        task_row = cursor.fetchone()
        if not task_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Task not found'}), 404

        # Validate employee authorization
        if user_info and user_info['role'] == 'employee':
            emp_name = task_row['employee_name'].strip().lower()
            u_name = user_info['name'].strip().lower()
            u_email = user_info['email'].strip().lower()
            emp_email = (get_employee_email(task_row['employee_name']) or '').strip().lower()
            if u_name != emp_name and u_email != emp_email:
                conn.close()
                return jsonify({'success': False, 'message': 'Unauthorized access to task comments'}), 403

        cursor.execute('''
            SELECT id, task_id, user_name, user_email, user_role, comment, created_at, updated_at
            FROM task_comments WHERE task_id = ? ORDER BY id ASC
        ''', (task_id,))
        rows = cursor.fetchall()
        conn.close()

        comments = [
            {
                'id': r['id'],
                'task_id': r['task_id'],
                'user_name': r['user_name'],
                'user_email': r['user_email'],
                'user_role': r['user_role'],
                'comment': r['comment'],
                'created_at': r['created_at'],
                'updated_at': r['updated_at']
            }
            for r in rows
        ]

        return jsonify({'success': True, 'comments': comments}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching comments: {str(e)}'}), 500


@app.route('/tasks/<int:task_id>/comments', methods=['POST'])
def add_task_comment(task_id):
    """Adds a new comment to a task."""
    current_user = get_current_user()
    data = request.get_json() or {}
    comment_text = data.get('comment', '').strip()
    user_email = data.get('user_email', '').strip()

    if not comment_text:
        return jsonify({'success': False, 'message': 'Comment text cannot be empty'}), 400

    user_info = current_user or ((get_user_info(user_email) or get_user_info(data.get('user_name', '').strip())) if app.config.get('TESTING') else None)

    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401
    if not user_info:
        return jsonify({'success': False, 'message': 'Unauthorized user context'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, employee_name FROM tasks WHERE id = ?', (task_id,))
        task_row = cursor.fetchone()
        if not task_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Task not found'}), 404

        # Validate employee permission
        if user_info.get('role', '').lower() == 'employee':
            emp_name = task_row['employee_name'].strip().lower()
            u_name = user_info['name'].strip().lower()
            u_email = user_info['email'].strip().lower()
            emp_email = (get_employee_email(task_row['employee_name']) or '').strip().lower()
            if u_name != emp_name and u_email != emp_email:
                conn.close()
                return jsonify({'success': False, 'message': "Unauthorized: Cannot comment on another employee's task"}), 403

        created_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        cursor.execute('''
            INSERT INTO task_comments (task_id, user_name, user_email, user_role, comment, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
        ''', (task_id, user_info['name'], user_info['email'], user_info['role'], comment_text, created_at))
        conn.commit()
        comment_id = cursor.lastrowid
        conn.close()

        # Log system activity
        log_activity(
            task_id,
            user_info['name'],
            user_info['email'],
            user_info['role'],
            'COMMENT_ADDED',
            f"{user_info['name']} added a comment"
        )

        new_comment = {
            'id': comment_id,
            'task_id': task_id,
            'user_name': user_info['name'],
            'user_email': user_info['email'],
            'user_role': user_info['role'],
            'comment': comment_text,
            'created_at': created_at,
            'updated_at': None
        }

        return jsonify({'success': True, 'message': 'Comment added successfully', 'comment': new_comment}), 201

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to add comment: {str(e)}'}), 500


@app.route('/tasks/<int:task_id>/comments/<int:comment_id>', methods=['PATCH'])
def edit_task_comment(task_id, comment_id):
    """Allows the author to edit their own comment."""
    current_user = get_current_user()
    data = request.get_json() or {}
    new_comment_text = data.get('comment', '').strip()
    user_email = data.get('user_email', '').strip()

    if not new_comment_text:
        return jsonify({'success': False, 'message': 'Comment text cannot be empty'}), 400

    user_info = current_user or (get_user_info(user_email) if app.config.get('TESTING') else None)
    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401
    if not user_info:
        return jsonify({'success': False, 'message': 'Unauthorized user context'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, task_id, user_email, user_name FROM task_comments WHERE id = ? AND task_id = ?', (comment_id, task_id))
        comment_row = cursor.fetchone()

        if not comment_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Comment not found'}), 404

        # Validate comment ownership
        if comment_row['user_email'].strip().lower() != user_info['email'].strip().lower():
            conn.close()
            return jsonify({'success': False, 'message': 'Unauthorized: You can only edit your own comments'}), 403

        updated_at = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        cursor.execute('UPDATE task_comments SET comment = ?, updated_at = ? WHERE id = ?', (new_comment_text, updated_at, comment_id))
        conn.commit()
        conn.close()

        # Log system activity
        log_activity(
            task_id,
            user_info['name'],
            user_info['email'],
            user_info['role'],
            'COMMENT_EDITED',
            f"{user_info['name']} edited a comment"
        )

        return jsonify({'success': True, 'message': 'Comment updated successfully'}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to update comment: {str(e)}'}), 500


@app.route('/tasks/<int:task_id>/comments/<int:comment_id>', methods=['DELETE'])
def delete_task_comment(task_id, comment_id):
    """Allows the author to delete their own comment."""
    current_user = get_current_user()
    data = request.get_json(silent=True) or {}
    user_email = data.get('user_email', '').strip() or request.args.get('user_email', '').strip()

    user_info = current_user or (get_user_info(user_email) if app.config.get('TESTING') else None)
    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401
    if not user_info:
        return jsonify({'success': False, 'message': 'Unauthorized user context'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, task_id, user_email, user_name FROM task_comments WHERE id = ? AND task_id = ?', (comment_id, task_id))
        comment_row = cursor.fetchone()

        if not comment_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Comment not found'}), 404

        # Validate comment ownership
        if comment_row['user_email'].strip().lower() != user_info['email'].strip().lower():
            conn.close()
            return jsonify({'success': False, 'message': 'Unauthorized: You can only delete your own comments'}), 403

        cursor.execute('DELETE FROM task_comments WHERE id = ?', (comment_id,))
        conn.commit()
        conn.close()

        # Log system activity
        log_activity(
            task_id,
            user_info['name'],
            user_info['email'],
            user_info['role'],
            'COMMENT_DELETED',
            f"{user_info['name']} deleted a comment"
        )

        return jsonify({'success': True, 'message': 'Comment deleted successfully'}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Failed to delete comment: {str(e)}'}), 500


@app.route('/tasks/<int:task_id>/activity', methods=['GET'])
def get_task_activity(task_id):
    """Returns activity records for a specific task sorted newest first."""
    current_user = get_current_user()
    user_email = request.args.get('user_email', '').strip()
    user_info = current_user or (get_user_info(user_email) if app.config.get('TESTING') else None)

    if not user_info and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('SELECT id, employee_name FROM tasks WHERE id = ?', (task_id,))
        task_row = cursor.fetchone()
        if not task_row:
            conn.close()
            return jsonify({'success': False, 'message': 'Task not found'}), 404

        if user_info and user_info.get('role', '').lower() == 'employee':
            emp_name = task_row['employee_name'].strip().lower()
            u_name = user_info['name'].strip().lower()
            u_email = user_info['email'].strip().lower()
            emp_email = (get_employee_email(task_row['employee_name']) or '').strip().lower()
            if u_name != emp_name and u_email != emp_email:
                conn.close()
                return jsonify({'success': False, 'message': 'Unauthorized access to task activity'}), 403

        cursor.execute('''
            SELECT id, task_id, actor_name, actor_email, actor_role, activity_type, activity_description, created_at, metadata
            FROM task_activity WHERE task_id = ? ORDER BY id DESC
        ''', (task_id,))
        rows = cursor.fetchall()
        conn.close()

        activities = [
            {
                'id': r['id'],
                'task_id': r['task_id'],
                'actor_name': r['actor_name'],
                'actor_email': r['actor_email'],
                'actor_role': r['actor_role'],
                'activity_type': r['activity_type'],
                'activity_description': r['activity_description'],
                'created_at': r['created_at'],
                'metadata': json.loads(r['metadata']) if r['metadata'] else None
            }
            for r in rows
        ]

        return jsonify({'success': True, 'activity': activities}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching activity: {str(e)}'}), 500


@app.route('/activity/recent', methods=['GET'])
def get_recent_team_activity():
    """Returns top 6 recent activities across all tasks for Manager Dashboard."""
    current_user = get_current_user()
    if not current_user and not app.config.get('TESTING'):
        return jsonify({'success': False, 'message': 'Authentication required. Please log in.'}), 401

    if current_user and current_user.get('role', '').lower() == 'employee':
        return jsonify({'success': False, 'message': 'Forbidden: Only Project Managers or Administrators can view team activity.'}), 403

    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("PRAGMA foreign_keys = ON;")
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        cursor.execute('''
            SELECT a.id, a.task_id, a.actor_name, a.actor_email, a.actor_role, a.activity_type,
                   a.activity_description, a.created_at, t.task as task_title, t.employee_name
            FROM task_activity a
            JOIN tasks t ON a.task_id = t.id
            ORDER BY a.id DESC LIMIT 6
        ''')
        rows = cursor.fetchall()
        conn.close()

        recent = [
            {
                'id': r['id'],
                'task_id': r['task_id'],
                'actor_name': r['actor_name'],
                'actor_email': r['actor_email'],
                'actor_role': r['actor_role'],
                'activity_type': r['activity_type'],
                'activity_description': r['activity_description'],
                'created_at': r['created_at'],
                'task_title': r['task_title'],
                'employee_name': r['employee_name']
            }
            for r in rows
        ]

        return jsonify({'success': True, 'activities': recent}), 200

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error fetching recent activity: {str(e)}'}), 500


# ── Frontend Static Asset & Page Serving ─────────────────────────────────────
@app.route('/')
def serve_index():
    """Serves the frontend login page at the root URL."""
    if os.path.exists(os.path.join(FRONTEND_DIR, 'index.html')):
        return send_from_directory(FRONTEND_DIR, 'index.html')
    return jsonify({'status': 'healthy', 'service': 'PHOENIX Backend'}), 200


@app.route('/<path:path>')
def serve_static(path):
    """Serves frontend pages and static assets (HTML, CSS, JS, images). Falls back to 404."""
    file_path = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(file_path):
        return send_from_directory(FRONTEND_DIR, path)
    return jsonify({'success': False, 'message': f'Route not found: {path}'}), 404


if __name__ == '__main__':
    port = int(os.getenv('PORT', 5001))
    debug = os.getenv('FLASK_DEBUG', 'False').lower() in ('true', '1', 't')
    host = os.getenv('HOST', '127.0.0.1')
    app.run(host=host, port=port, debug=debug)
