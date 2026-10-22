#!/usr/bin/env python3
"""
PHOENIX Employee Automation System — Password Setup Utility
===========================================================
Run this script ONCE to hash and store passwords for all users in employees.json.
Existing password_hash fields are preserved (skip-safe: only sets hash if absent).

Usage:
    python backend/set_passwords.py

Each user will be prompted interactively for a password.
Press ENTER to skip a user and leave their password unchanged.
"""

import os
import sys
import json
import getpass

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(BACKEND_DIR, 'data', 'employees.json')

try:
    from werkzeug.security import generate_password_hash
except ImportError:
    print("ERROR: werkzeug is not installed. Activate the venv and run: pip install werkzeug")
    sys.exit(1)


def set_passwords():
    with open(DATA_PATH, 'r') as f:
        data = json.load(f)

    changed = False
    groups = [
        ('administrators', data.get('administrators', [])),
        ('project_managers', data.get('project_managers', [])),
        ('employees', data.get('employees', [])),
    ]

    print("=" * 60)
    print("  PHOENIX Password Setup Utility")
    print("  Press ENTER to skip a user and keep their current password.")
    print("=" * 60)

    for group_name, users in groups:
        if not users:
            continue
        print(f"\n--- {group_name.upper()} ---")
        for user in users:
            name = user.get('name', '(unknown)')
            email = user.get('email', '')
            has_hash = bool(user.get('password_hash'))
            status = "(has password)" if has_hash else "(NO PASSWORD SET)"
            print(f"\n  {name} <{email}> {status}")
            raw = getpass.getpass(f"  New password (ENTER to skip): ")
            if raw.strip():
                user['password_hash'] = generate_password_hash(raw.strip())
                print(f"  ✓ Password set for {name}")
                changed = True
            else:
                print(f"  — Skipped {name}")

    if changed:
        with open(DATA_PATH, 'w') as f:
            json.dump(data, f, indent=2)
        print("\n✓ employees.json updated with new password hashes.")
    else:
        print("\n— No changes made.")


if __name__ == '__main__':
    set_passwords()
