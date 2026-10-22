# PHOENIX — Employee Automation System

A full-stack employee task management and email automation platform with role-based access, AI-assisted email drafting, and production-hardened security.

---

## Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | HTML5, CSS3, Vanilla JavaScript |
| **Backend** | Python 3.10+, Flask 3.x |
| **Database** | SQLite (WAL mode, foreign key enforcement) |
| **Email** | Gmail SMTP via Python `smtplib` |
| **AI** | OpenAI API (GPT-based task email drafts) |
| **Auth** | Session-based with `werkzeug` password hashing |
| **Rate Limiting** | Flask-Limiter |
| **WSGI (prod)** | Gunicorn |

---

## Application Pages

| Page | Route | Description |
|---|---|---|
| Login | `index.html` | Email + password login with session management |
| Project Manager Dashboard | `manager.html` | Assign tasks, manage employees, send AI emails |
| Employee Dashboard | `employee.html` | View tasks, update progress, post comments |
| Admin Dashboard | `admin.html` | Full system overview, audit log (admin role) |

---

## User Roles

- **Admin** — full read/write access to all employees and tasks
- **Project Manager** — can add employees and assign tasks to their employees
- **Employee** — can only view and update their own tasks

---

## Key Features

- **Role-based access control** enforced server-side on every protected route
- **Task lifecycle**: Assigned → In Progress → Completed, with auto-sync between status and % progress
- **AI email drafts**: OpenAI generates task notification emails that can be previewed and edited before sending
- **Gmail SMTP delivery**: Notification emails delivered via Google App Password
- **Comment system**: Employees and managers can comment on individual tasks
- **Notification feed**: Employees see real-time in-app notifications
- **Activity log**: Per-task audit trail of all state changes
- **Deadline tracking**: Date + time deadlines with past-due classification
- **Dashboard KPIs**: Live counts of active/completed/overdue tasks per manager

---

## Security

- Passwords hashed with `werkzeug.security` (PBKDF2-HMAC-SHA256)
- `SECRET_KEY` required in production; raises on startup if missing
- `SESSION_COOKIE_HTTPONLY`, `SESSION_COOKIE_SAMESITE=Lax`, `SESSION_COOKIE_SECURE` (production)
- CORS restricted to explicitly listed trusted origins
- Security headers on every response: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`
- Rate limits: login (10/min, 30/hr), AI email (15/min, 60/hr), task assignment (30/min, 100/hr)
- SQL injection prevented via parameterised queries throughout
- Employee data isolation: cross-user access rejected with HTTP 403

---

## Local Development Setup

### 1. Clone the repository

```bash
git clone https://github.com/praptichavan25/Employee-Management-Prapti.git
cd Employee-Management-Prapti
```

### 2. Create and activate a Python virtual environment

```bash
python3 -m venv venv
source venv/bin/activate        # macOS / Linux
# venv\Scripts\activate         # Windows
```

### 3. Install backend dependencies

```bash
pip install -r backend/requirements.txt
```

### 4. Configure environment variables

```bash
cp backend/.env.example backend/.env
# Edit backend/.env with your real values (see table below)
```

| Variable | Required | Description |
|---|---|---|
| `GMAIL_ADDRESS` | Yes (email) | Gmail address used to send task notifications |
| `GMAIL_APP_PASSWORD` | Yes (email) | 16-char Google App Password (not your login password) |
| `OPENAI_API_KEY` | Yes (AI drafts) | OpenAI API key starting with `sk-` |
| `SECRET_KEY` | Yes (production) | Long random string; generate with `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `PORT` | No | Backend port (default: `5001`) |
| `FLASK_DEBUG` | No | Set `False` in production |
| `RATELIMIT_STORAGE_URI` | No | Rate-limit backend (default: `memory://`; use Redis URI in production) |

### 5. Start the backend

**Development (Flask dev server):**
```bash
cd backend
python app.py
# Listening on http://127.0.0.1:5001
```

**Production (Gunicorn):**
```bash
cd backend
gunicorn -w 4 -b 127.0.0.1:5001 app:app
```

### 6. Serve the frontend

Open `frontend/index.html` in a browser directly, **or** use a simple static server:

```bash
# From the project root
python3 -m http.server 8090 --directory frontend
# Visit http://localhost:8090
```

---

## Running Tests

```bash
# From the project root with venv active
source venv/bin/activate
python -m pytest tests/ -v
```

**Test suite coverage:**

| Module | Tests |
|---|---|
| `test_auth.py` | Login, invalid credentials, session, logout |
| `test_auth_security.py` | Authorization, role isolation, brute-force protection |
| `test_employees.py` | Add employee, duplicate email, validation |
| `test_tasks.py` | Assign task, lifecycle, cross-user isolation |
| `test_comments.py` | Comment CRUD, task isolation |
| `test_email_service.py` | SMTP send, auth errors, network errors |
| `test_ai_email.py` | OpenAI draft generation, error handling |
| `test_rate_limiting.py` | HTTP 429, Retry-After, window recovery |
| `test_routes.py` | Route availability, health check, 404 |
| `test_frontend_contracts.py` | API URL alignment, KPI logic, deadline logic |

**Current status: 66/66 tests passing.**

---

## Production Deployment Checklist

- [ ] Set `SECRET_KEY` to a strong random value in environment
- [ ] Set `FLASK_DEBUG=False` and `ENVIRONMENT=production`
- [ ] Set `SESSION_COOKIE_SECURE=True` (requires HTTPS)
- [ ] Configure `RATELIMIT_STORAGE_URI` to a Redis instance for multi-worker deployments
- [ ] Serve frontend via a CDN or static web host (Netlify, Vercel, Nginx)
- [ ] Use Gunicorn with ≥2 workers behind a reverse proxy (Nginx / Caddy)
- [ ] Back up `phoenix.db` on a schedule; exclude from version control
- [ ] Configure CORS origins to match your production domain
- [ ] Enable HTTPS; terminate TLS at the reverse proxy

---

## Project Structure

```
Employee-Management-Prapti/
├── backend/
│   ├── app.py                  # Flask application (routes, auth, DB, rate limiting)
│   ├── email_service.py        # Gmail SMTP delivery
│   ├── ai_email_service.py     # OpenAI email draft generation
│   ├── requirements.txt        # Python dependencies
│   ├── .env.example            # Environment variable template (safe to commit)
│   ├── set_passwords.py        # One-time script: hash and set employee passwords
│   └── data/
│       └── employees.json      # Seed data for employees
├── frontend/
│   ├── index.html              # Login page
│   ├── manager.html            # Project Manager dashboard
│   ├── employee.html           # Employee dashboard
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── main.js             # Login logic
│       ├── manager.js          # Manager dashboard logic
│       └── employee.js         # Employee dashboard logic
├── tests/
│   ├── test_base.py            # Shared BaseTestCase with in-memory DB
│   ├── test_auth.py
│   ├── test_auth_security.py
│   ├── test_employees.py
│   ├── test_tasks.py
│   ├── test_comments.py
│   ├── test_email_service.py
│   ├── test_ai_email.py
│   ├── test_rate_limiting.py
│   ├── test_routes.py
│   └── test_frontend_contracts.py
├── run_tests.py                # Alternative test runner
└── README.md
```

---

## Git & Secrets Policy

- `backend/.env` — **never committed** (in `.gitignore`)
- `backend/phoenix.db` — **never committed** (contains employee data)
- `backend/.env.example` — safe placeholder template, committed to the repository
- `venv/` — excluded from version control

---

## License

Private project. All rights reserved.
