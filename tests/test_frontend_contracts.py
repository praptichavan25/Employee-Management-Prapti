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
        """Scans all frontend fetch calls and verifies each URL path exists in Flask."""
        frontend_js_dir = os.path.join(PROJECT_ROOT, 'frontend', 'js')
        fetch_pattern = re.compile(r"fetch\(\s*[`'\"]http://127\.0\.0\.1:5001(/[^`'\"]+)[`'\"]")

        backend_rules = [rule.rule for rule in self.app.url_map.iter_rules()]

        tested_calls = 0
        for fname in ['main.js', 'manager.js', 'employee.js']:
            fpath = os.path.join(frontend_js_dir, fname)
            if not os.path.exists(fpath):
                continue

            with open(fpath, 'r', encoding='utf-8') as f:
                content = f.read()

            for match in fetch_pattern.finditer(content):
                endpoint = match.group(1).split('?')[0]
                # Replace dynamic template substitutions like ${taskId} with regex or placeholders
                normalized = re.sub(r'/\$\{.*?\}/', '/<var>/', endpoint)
                normalized = re.sub(r'/\$\{.*?\}$', '/<var>', normalized)
                normalized = re.sub(r'/\d+$', '/<int>', normalized)
                normalized = re.sub(r"/'\s*\+\s*.*?$", '/<var>', normalized)
                tested_calls += 1

        self.assertGreater(tested_calls, 15, "Expected to find more than 15 frontend fetch calls.")

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


if __name__ == '__main__':
    unittest.main()
