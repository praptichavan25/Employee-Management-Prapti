"""
PHOENIX — Initial Password Setup Script
=======================================
Derives a password for every user from their initials + '2026!' and stores
the werkzeug PBKDF2 hash in backend/data/employees.json.

Usage (run from the project root with venv active):
    python backend/set_passwords.py

Safe to re-run: it always re-derives and re-hashes from the current name,
so running it twice produces a different salt but the same logical password.
"""

import json
import os
import sys
from collections import defaultdict
from werkzeug.security import generate_password_hash

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_PATH = os.path.join(SCRIPT_DIR, "data", "employees.json")


def derive_password(name: str) -> str:
    """
    Return the initial-based password for a given display name.
    Rules:
      - Split on whitespace; take the first character of each part, uppercased.
      - Append '2026!'.
    Examples:
      'Prapti Chavan'   → 'PC2026!'
      'Akshit'          → 'A2026!'
      'Yash R More'     → 'YRM2026!'
      'mandar'          → 'M2026!'
    """
    parts = name.strip().split()
    initials = "".join(p[0].upper() for p in parts if p)
    return f"{initials}2026!"


def main():
    if not os.path.exists(DATA_PATH):
        print(f"ERROR: Cannot find {DATA_PATH}")
        sys.exit(1)

    with open(DATA_PATH, "r", encoding="utf-8") as fh:
        data = json.load(fh)

    # Track (password → list of names) to report duplicates
    password_to_names: dict[str, list[str]] = defaultdict(list)

    sections = [
        ("administrators",    data.get("administrators", [])),
        ("project_managers",  data.get("project_managers", [])),
        ("employees",         data.get("employees", [])),
    ]

    updated = 0
    for section_key, users in sections:
        for user in users:
            name = user.get("name", "")
            email = user.get("email", "")
            password = derive_password(name)
            password_to_names[password].append(f"{name} ({email})")

            # Hash with werkzeug's default method (scrypt / pbkdf2:sha256)
            user["password_hash"] = generate_password_hash(password)
            updated += 1

    # Write back atomically (write to .tmp then rename)
    tmp_path = DATA_PATH + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as fh:
        json.dump(data, fh, indent=2, ensure_ascii=False)
    os.replace(tmp_path, DATA_PATH)

    # ── Report ──────────────────────────────────────────────────────────────
    print(f"\n✅  Updated {updated} account(s) in {DATA_PATH}\n")
    print("Password assignments (initials rule — do not share publicly):")
    print("-" * 62)

    for section_key, users in sections:
        label = section_key.replace("_", " ").title()
        print(f"\n  {label}:")
        for user in users:
            name  = user.get("name", "")
            email = user.get("email", "")
            pw    = derive_password(name)
            # Print password to console only (this is a local setup script;
            # operator must distribute credentials out-of-band)
            print(f"    {name:<22}  {email:<40}  → {pw}")

    # ── Duplicate report ────────────────────────────────────────────────────
    duplicates = {pw: names for pw, names in password_to_names.items()
                  if len(names) > 1}
    if duplicates:
        print("\n⚠️   DUPLICATE PASSWORDS DETECTED (same initials rule result):")
        for pw, names in duplicates.items():
            print(f"    Password '{pw}' is shared by:")
            for n in names:
                print(f"      • {n}")
        print("    Affected users must be given unique passwords manually after first login.")
    else:
        print("\n✅  No duplicate passwords.")

    print("\nDone. Restart the Flask backend so it reads the updated file.\n")


if __name__ == "__main__":
    main()
