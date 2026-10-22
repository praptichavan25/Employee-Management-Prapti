import os
import sys
import json
import sqlite3
import tempfile
import unittest
from werkzeug.security import generate_password_hash

# Ensure backend directory is in sys.path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(PROJECT_ROOT, 'backend')
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app


class BaseTestCase(unittest.TestCase):
    """
    Base test case providing isolated temporary SQLite database and
    temporary employee store for each test execution.
    Guarantees zero pollution of production or development data.
    """

    def setUp(self):
        # 1. Create temporary database file
        self._temp_db = tempfile.NamedTemporaryFile(suffix='.db', delete=False)
        self.db_path = self._temp_db.name
        self._temp_db.close()

        # 2. Create temporary employees.json file with clean test accounts
        self._temp_json = tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False)
        self.json_path = self._temp_json.name

        self.test_data = {
            "company": "PHOENIX",
            "administrators": [
                {
                    "name": "Test Admin",
                    "email": "admin@phoenix.test",
                    "role": "administrator",
                    "department": "Administration",
                    "status": "active",
                    "password_hash": generate_password_hash("admin_pass_123")
                }
            ],
            "project_managers": [
                {
                    "name": "Test Manager",
                    "email": "manager@phoenix.test",
                    "role": "project_manager",
                    "department": "Project Management",
                    "status": "active",
                    "password_hash": generate_password_hash("manager_pass_123")
                }
            ],
            "employees": [
                {
                    "name": "Alice Developer",
                    "email": "alice@gmail.com",
                    "role": "employee",
                    "department": "Engineering",
                    "status": "active",
                    "password_hash": generate_password_hash("alice_pass_123")
                },
                {
                    "name": "Bob Designer",
                    "email": "bob@gmail.com",
                    "role": "employee",
                    "department": "Design",
                    "status": "active",
                    "password_hash": generate_password_hash("bob_pass_123")
                }
            ]
        }
        json.dump(self.test_data, self._temp_json, indent=2)
        self._temp_json.close()

        # 3. Patch app module paths to temporary files
        self._original_db_path = app.DB_PATH
        self._original_data_path = app.DATA_PATH

        app.DB_PATH = self.db_path
        app.DATA_PATH = self.json_path

        # 4. Initialize schema on fresh temporary database
        app.init_db()

        # 5. Create Flask test client
        self.app = app.app
        self.app.config['TESTING'] = True
        self.limiter = app.limiter
        self.limiter.enabled = False
        self.client = self.app.test_client()

    def tearDown(self):
        # Reset rate limiter
        if hasattr(self, 'limiter'):
            self.limiter.reset()
        # Restore original paths
        app.DB_PATH = self._original_db_path
        app.DATA_PATH = self._original_data_path

        # Clean up temporary files
        if os.path.exists(self.db_path):
            try:
                os.unlink(self.db_path)
            except OSError:
                pass

        if os.path.exists(self.json_path):
            try:
                os.unlink(self.json_path)
            except OSError:
                pass

    def get_db_connection(self):
        """Helper to get a direct connection to the test database."""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def insert_test_task(self, employee_name="Alice Developer", task="Build API", deadline="2026-10-25 17:00:00", status="Assigned", assigned_by="Test Manager", progress=0):
        """Helper to insert a test task and return its ID."""
        conn = self.get_db_connection()
        cursor = conn.cursor()
        cursor.execute(
            'INSERT INTO tasks (employee_name, task, deadline, status, assigned_by, progress) VALUES (?, ?, ?, ?, ?, ?)',
            (employee_name, task, deadline, status, assigned_by, progress)
        )
        conn.commit()
        task_id = cursor.lastrowid
        conn.close()
        return task_id
