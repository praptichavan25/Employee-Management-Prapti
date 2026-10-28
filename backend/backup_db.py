#!/usr/bin/env python3
"""
PHOENIX Employee Automation System — Database & Seed Backup Utility
Creates a timestamped backup archive of phoenix.db and employees.json.
Can be executed manually or as a scheduled cron task.
"""

import os
import shutil
import sqlite3
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.environ.get('PHOENIX_DATA_DIR', BACKEND_DIR)
BACKUP_DIR = os.environ.get('PHOENIX_BACKUP_DIR', os.path.join(BACKEND_DIR, 'backups'))

DB_PATH = os.path.join(DATA_DIR, 'phoenix.db')
EMPLOYEES_PATH = os.path.join(DATA_DIR, 'employees.json') if os.environ.get('PHOENIX_DATA_DIR') else os.path.join(BACKEND_DIR, 'data', 'employees.json')


def backup():
    os.makedirs(BACKUP_DIR, exist_ok=True)
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

    print(f"[*] Starting PHOENIX backup: {timestamp}")
    print(f"[*] Backup destination: {BACKUP_DIR}")

    # 1. Backup SQLite database safely using SQLite online backup API
    if os.path.exists(DB_PATH):
        dest_db = os.path.join(BACKUP_DIR, f"phoenix_{timestamp}.db")
        try:
            src_conn = sqlite3.connect(DB_PATH)
            dst_conn = sqlite3.connect(dest_db)
            src_conn.backup(dst_conn)
            dst_conn.close()
            src_conn.close()
            print(f"[✓] SQLite database backed up to: {dest_db}")
        except Exception as e:
            print(f"[✗] Failed to backup SQLite database: {e}")
    else:
        print(f"[-] SQLite database not found at {DB_PATH}; skipping.")

    # 2. Backup employees.json
    if os.path.exists(EMPLOYEES_PATH):
        dest_json = os.path.join(BACKUP_DIR, f"employees_{timestamp}.json")
        try:
            shutil.copy2(EMPLOYEES_PATH, dest_json)
            print(f"[✓] Employees JSON backed up to: {dest_json}")
        except Exception as e:
            print(f"[✗] Failed to backup employees JSON: {e}")
    else:
        print(f"[-] Employees JSON not found at {EMPLOYEES_PATH}; skipping.")

    print(f"[✓] Backup complete: {timestamp}")


if __name__ == '__main__':
    backup()

