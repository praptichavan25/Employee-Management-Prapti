# PHOENIX — Employee Email Automation System

A simple Python email automation system with a lightweight web interface.

## Purpose

Demonstrate Python email automation. A Project Manager can send emails to employees through a simple web interface, and Python automatically sends the emails via Gmail.

## Project Philosophy

- **Keep it simple** — No over-engineering
- **No unnecessary features** — Only build what's requested
- **Lean technology stack** — Vanilla HTML/CSS/JS, Python, Flask, SQLite

## Technology Stack

**Frontend:**
- HTML
- CSS
- Vanilla JavaScript

**Backend (Phase 3+):**
- Python
- Flask

**Database (Phase 6+):**
- SQLite

**Email Automation (Phase 2+):**
- Python SMTP / Gmail

## Application Pages

### 1. Login Page
- PHOENIX branding
- Email input
- Password input
- Login button

### 2. Project Manager Page
- PHOENIX branding
- Project Manager heading
- Employee Gmail address input
- Email subject input
- Email message textarea
- Send Email button
- Status display (success/error)
- Logout button

### 3. Employee Page
- PHOENIX branding
- Employee name
- Assigned task/message
- Deadline
- Status
- Mark Complete button
- Logout button

## Development Phases

**Phase 1:** Build frontend only (HTML/CSS/JS)
**Phase 2:** Build and test Python Gmail email automation independently
**Phase 3:** Create simple Flask backend
**Phase 4:** Connect Project Manager Send Email button to Flask/Python
**Phase 5:** Connect employee task functionality
**Phase 6:** Add SQLite if needed
**Phase 7:** Test complete application

## What We're NOT Using

- React, Vue, Angular
- Tailwind, Bootstrap
- Node.js
- MongoDB, Firebase
- Docker
- Microservices
- AI
- Unnecessary APIs
- Complicated authentication
- Unnecessary libraries

## Current Status

Project initialized. Ready for Phase 1 (Frontend Development).

## Directory Structure

```
phoenix/
├── frontend/
│   ├── index.html (Login page)
│   ├── manager.html (Project Manager page)
│   ├── employee.html (Employee page)
│   ├── css/
│   │   └── styles.css
│   └── js/
│       └── main.js
├── backend/
│   └── (Phase 3+)
├── tests/
│   └── (Phase 2+)
└── docs/
    └── development_plan.md
```
