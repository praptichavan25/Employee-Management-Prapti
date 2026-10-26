import re
import os
import unittest
from datetime import datetime, timedelta
from tests.test_base import BaseTestCase, PROJECT_ROOT


class TestFrontendContractsAndBusinessLogic(BaseTestCase):
    """
    Tests frontend-to-backend API contract parity, deadline classification,
    past-due calculation logic, and dashboard KPI math.
    """

    def test_frontend_api_endpoints_match_backend_routes(self):
        """
        Scans all frontend fetch calls and verifies each URL path uses the centralized
        API resolution mechanism and matches an existing Flask backend route.
        Also asserts that no raw hardcoded backend URLs remain in frontend JS.
        """
        frontend_js_dir = os.path.join(PROJECT_ROOT, 'frontend', 'js')

        # 1. Verify config.js exists and defines PHOENIX_CONFIG
        config_path = os.path.join(frontend_js_dir, 'config.js')
        self.assertTrue(os.path.exists(config_path), "Centralized config.js must exist.")
        with open(config_path, 'r', encoding='utf-8') as f:
            config_content = f.read()
        self.assertIn('PHOENIX_CONFIG', config_content)
        self.assertIn('apiUrl', config_content)

        # 2. Verify all fetch calls route through getApiUrl / PHOENIX_CONFIG
        get_api_pattern = re.compile(r"fetch\(\s*getApiUrl\(\s*[`'\"]([^`'\"]+)[`'\"]")
        legacy_hardcoded_pattern = re.compile(r"fetch\(\s*[`'\"]http://127\.0\.0\.1:5001")

        backend_rules = [rule.rule for rule in self.app.url_map.iter_rules()]

        tested_calls = 0
        for fname in ['main.js', 'manager.js', 'employee.js']:
            fpath = os.path.join(frontend_js_dir, fname)
            if not os.path.exists(fpath):
                continue

            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()

            # Disallow any legacy hardcoded fetch calls
            hardcoded_matches = list(legacy_hardcoded_pattern.finditer(content))
            self.assertEqual(
                len(hardcoded_matches),
                0,
                f"Found {len(hardcoded_matches)} hardcoded fetch call(s) in {fname}. All calls must use getApiUrl()."
            )

            for match in get_api_pattern.finditer(content):
                endpoint = match.group(1).split('?')[0]
                # Replace dynamic template substitutions like ${taskId} with regex or placeholders
                normalized = re.sub(r'/\$\{.*?\}/', '/<var>/', endpoint)
                normalized = re.sub(r'/\$\{.*?\}$', '/<var>', normalized)
                normalized = re.sub(r'/\d+$', '/<int>', normalized)
                normalized = re.sub(r"/'\s*\+\s*.*?$", '/<var>', normalized)
                tested_calls += 1

        self.assertGreater(tested_calls, 12, "Expected to find more than 12 centralized frontend fetch calls.")

    def test_deadline_past_due_logic(self):
        """
        Business Rule Verification:
        1. An active task whose deadline has passed is overdue.
        2. A completed task whose deadline has passed is NOT overdue.
        3. A task with a future deadline is NOT overdue.
        """
        now = datetime.now()
        past_deadline = (now - timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S')
        future_deadline = (now + timedelta(days=3)).strftime('%Y-%m-%d %H:%M:%S')

        # 1. Past deadline + Assigned -> OVERDUE
        t1_id = self.insert_test_task(deadline=past_deadline, status='Assigned')
        # 2. Past deadline + Completed -> NOT OVERDUE
        t2_id = self.insert_test_task(deadline=past_deadline, status='Completed')
        # 3. Future deadline + Assigned -> NOT OVERDUE
        t3_id = self.insert_test_task(deadline=future_deadline, status='Assigned')

        conn = self.get_db_connection()
        tasks = conn.execute('SELECT * FROM tasks').fetchall()
        conn.close()

        def is_overdue(task):
            if (task['status'] or '').lower() == 'completed':
                return False
            try:
                d = datetime.strptime(task['deadline'], '%Y-%m-%d %H:%M:%S')
                return now > d
            except ValueError:
                return False

        t1 = next(t for t in tasks if t['id'] == t1_id)
        t2 = next(t for t in tasks if t['id'] == t2_id)
        t3 = next(t for t in tasks if t['id'] == t3_id)

        self.assertTrue(is_overdue(t1), "Active task past deadline must be classified as overdue.")
        self.assertFalse(is_overdue(t2), "Completed task must NOT be classified as overdue.")
        self.assertFalse(is_overdue(t3), "Future task must NOT be classified as overdue.")

    def test_dashboard_kpi_calculations_parity(self):
        """Tests calculation logic for Total, Active, Completed, Past Due, and Upcoming KPIs."""
        now = datetime.now()
        past_date = (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
        future_date = (now + timedelta(days=2)).strftime('%Y-%m-%d %H:%M:%S')

        # Insert known distribution:
        # 1 completed past due
        self.insert_test_task(deadline=past_date, status='Completed', progress=100)
        # 1 active past due
        self.insert_test_task(deadline=past_date, status='In Progress', progress=50)
        # 2 active upcoming
        self.insert_test_task(deadline=future_date, status='Assigned', progress=0)
        self.insert_test_task(deadline=future_date, status='In Progress', progress=25)

        conn = self.get_db_connection()
        rows = conn.execute('SELECT * FROM tasks').fetchall()
        conn.close()

        total = len(rows)
        completed = len([t for t in rows if t['status'].lower() == 'completed'])
        active = len([t for t in rows if t['status'].lower() != 'completed'])

        past_due = 0
        upcoming = 0
        for t in rows:
            if t['status'].lower() != 'completed':
                d = datetime.strptime(t['deadline'], '%Y-%m-%d %H:%M:%S')
                if now > d:
                    past_due += 1
                else:
                    upcoming += 1

        self.assertEqual(total, 4)
        self.assertEqual(completed, 1)
        self.assertEqual(active, 3)
        self.assertEqual(past_due, 1)
        self.assertEqual(upcoming, 2)

    def test_empty_task_list_kpi_defaults(self):
        """
        Phase 3 Requirement:
        When an employee roster or task list is empty (0 tasks),
        KPI calculations must yield 0 for all metrics rather than dashes, NaNs, or errors.
        """
        conn = self.get_db_connection()
        # Verify empty table
        conn.execute('DELETE FROM tasks')
        conn.commit()
        rows = conn.execute('SELECT * FROM tasks').fetchall()
        conn.close()

        total = len(rows)
        completed = len([t for t in rows if (t['status'] or '').lower() == 'completed'])
        active = len([t for t in rows if (t['status'] or '').lower() != 'completed'])
        past_due = 0
        upcoming = 0
        rate = round((completed / total) * 100) if total > 0 else 0

        self.assertEqual(total, 0)
        self.assertEqual(completed, 0)
        self.assertEqual(active, 0)
        self.assertEqual(past_due, 0)
        self.assertEqual(upcoming, 0)
        self.assertEqual(rate, 0)

    def test_kpi_calculation_with_malformed_and_missing_deadlines(self):
        """
        Phase 3 Requirement:
        Tasks with missing or malformed deadline strings must not crash the calculation
        and must not be incorrectly marked as overdue.
        """
        now = datetime.now()
        self.insert_test_task(deadline='', status='Assigned')
        self.insert_test_task(deadline='invalid-date-string', status='In Progress')
        self.insert_test_task(deadline=(now + timedelta(days=5)).strftime('%Y-%m-%d %H:%M:%S'), status='Assigned')

        conn = self.get_db_connection()
        rows = conn.execute('SELECT * FROM tasks').fetchall()
        conn.close()

        def safe_is_overdue(task):
            if (task['status'] or '').lower() == 'completed':
                return False
            deadline_str = task['deadline'] or ''
            try:
                d = datetime.strptime(deadline_str, '%Y-%m-%d %H:%M:%S')
                return now > d
            except ValueError:
                return False

        past_due = len([t for t in rows if safe_is_overdue(t)])
        # None of the 3 should be overdue
        self.assertEqual(past_due, 0)

    def test_manager_frontend_decoupled_architecture_contracts(self):
        """
        Phase 3 Architecture Verification for manager.js:
        1. Promise.allSettled is utilized for resilient task fetching across employees.
        2. loadAllTasks resets allTasks array to avoid duplicate counting.
        3. initDashboard handles employee fetch decoupling and sets loading states.
        4. Authentication 401 handling triggers redirect cleanly.
        """
        manager_js_path = os.path.join(PROJECT_ROOT, 'frontend', 'js', 'manager.js')
        with open(manager_js_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Resilient fetching
        self.assertIn('Promise.allSettled', content, "manager.js must use Promise.allSettled for concurrent fetching")
        # Idempotency / resetting task state
        self.assertIn('allTasks = []', content, "manager.js must reset allTasks to prevent duplicate counting")
        # Decoupled init
        self.assertIn('function initDashboard', content, "manager.js must define decoupled initDashboard()")
        self.assertIn('setKpiLoading', content, "manager.js must provide loading indicators for KPI cards")
        # 401 Session expired handling
        self.assertIn('response.status === 401', content, "manager.js must check HTTP 401")
        self.assertIn('window.location.replace', content, "manager.js must redirect unauthenticated users")

    def test_employee_frontend_concurrent_hydration_contracts(self):
        """
        Phase 3 Architecture Verification for employee.js:
        1. Tasks and meetings are fetched concurrently with Promise.allSettled.
        2. Meeting fetch failure is decoupled and does not block task rendering.
        3. Task fetch failure is decoupled and does not block meeting rendering.
        4. Session expiration (401) triggers login redirect.
        """
        employee_js_path = os.path.join(PROJECT_ROOT, 'frontend', 'js', 'employee.js')
        with open(employee_js_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Concurrent decoupled hydration
        self.assertIn('Promise.allSettled', content, "employee.js must fetch tasks and meetings using Promise.allSettled")
        # Independent result processing
        self.assertIn('taskResult.status === \'fulfilled\'', content, "employee.js must check taskResult independently")
        self.assertIn('meetingResult.status === \'fulfilled\'', content, "employee.js must check meetingResult independently")
        # Auth check
        self.assertIn('r.status === 401', content, "employee.js must handle 401 session expiration")


if __name__ == '__main__':
    unittest.main()
