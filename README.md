# PHOENIX — Employee Email Automation System

A production-hardened full-stack employee task management and email automation platform with role-based access control, AI-assisted email drafting, real-time collaboration, and deployment configurations for Render and Netlify.

---

## 1. Architecture Overview

- **Frontend**: Static HTML5, modern CSS3, Vanilla JavaScript (zero framework runtime). Deployed to Netlify (or Render Static Site).
- **Backend**: Python 3.10+ with Flask 3.x, Gunicorn WSGI server. Deployed to Render Web Service (`https://employee-management-prapti-1.onrender.com`).
- **Authentication**: Dual authentication architecture:
  - **JWT Bearer Token** (`Authorization: Bearer <token>` stored in client `localStorage` under `phoenix_token`): Primary cross-origin authentication strategy. Unaffected by browser third-party cookie restrictions (Safari ITP, Chrome Privacy Sandbox).
  - **Server-Side Flask Session Cookie**: Secondary/fallback mechanism for same-origin or local development. Configured with `SameSite=None`, `Secure=True`, and `HttpOnly=True` in production.
- **Database**: SQLite 3 with WAL (Write-Ahead Logging) mode and foreign key cascading. Managed via parameterised queries. Configurable persistent storage mount via `PHOENIX_DATA_DIR`.
- **Employee Store**: JSON document store (`employees.json`) with PBKDF2-HMAC-SHA256 password hashes (`werkzeug.security`) and atomic file write replacements to prevent file corruption.
- **Email Delivery**: Python `smtplib` integrating with Gmail SMTP (`smtp.gmail.com:587` with TLS).
- **AI Email Drafting**: OpenAI API (`gpt-4o-mini`) producing structured JSON task notification emails that managers can preview and edit before dispatch.

---

## 2. Repository Structure

```
Employee-Management-Prapti/
├── backend/
│   ├── app.py                  # Main Flask application & 18 API routes
│   ├── email_service.py        # Gmail SMTP TLS delivery & error handling
│   ├── ai_email_service.py     # OpenAI task email generator (gpt-4o-mini)
│   ├── backup_db.py            # SQLite & employees.json backup utility
│   ├── requirements.txt        # Python production dependencies (pinned)
│   ├── gunicorn.conf.py        # Production WSGI configuration (reads $PORT)
│   ├── set_passwords.py        # Utility to initialize/reset employee passwords
│   ├── .env.example            # Environment variables template (safe to commit)
│   └── data/
│       └── employees.json      # Employee seed data with password hashes
├── frontend/
│   ├── index.html              # Sign-In interface
│   ├── manager.html            # Project Manager Dashboard (tasks, KPIs, AI email)
│   ├── employee.html           # Employee Workspace (tasks, meetings, comments)
│   ├── css/
│   │   └── styles.css          # PHOENIX Apple/macOS design system styles
│   └── js/
│       ├── config.js           # Centralized API resolution & JWT fetch interceptor
│       ├── main.js             # Login submission & JWT persistence
│       ├── manager.js          # PM dashboard state & task orchestration
│       └── employee.js         # Employee workspace state & comments
├── tests/
│   ├── test_base.py            # BaseTestCase with isolated in-memory DB
│   ├── test_auth.py            # Authentication, login, logout, roles
│   ├── test_auth_security.py   # Security hardening, authorization, headers
│   ├── test_jwt_auth.py        # JWT generation, signature, claims, expiry
│   ├── test_employees.py       # Employee retrieval & registration
│   ├── test_tasks.py           # Task assignment, status/progress lifecycle
│   ├── test_comments.py        # Task comments CRUD & access controls
│   ├── test_email_service.py   # Gmail SMTP mocking & error resilience
│   ├── test_ai_email.py        # OpenAI email mocking & quota fallbacks
│   ├── test_rate_limiting.py   # Limiter thresholds (HTTP 429 & Retry-After)
│   ├── test_routes.py          # Route registry & health check endpoint
│   └── test_frontend_contracts.py # Frontend JS contract parity tests
├── render.yaml                 # Render Infrastructure as Code Blueprint
├── runtime.txt                 # Python runtime version pin (3.11.0)
├── Procfile                    # Web process launch definition for PaaS
├── run_tests.py                # Standalone test runner (100/100 tests passing)
└── README.md                   # This documentation
```

---

## 3. Local Development Setup

### Prerequisites
- Python 3.10, 3.11, 3.12, or 3.13
- Git

### Step-by-Step

1. **Clone the repository:**
   ```bash
   git clone https://github.com/praptichavan25/Employee-Management-Prapti.git
   cd Employee-Management-Prapti
   ```

2. **Create and activate a virtual environment:**
   ```bash
   python3 -m venv venv
   source venv/bin/activate       # On macOS / Linux
   # .\venv\Scripts\activate      # On Windows
   ```

3. **Install dependencies:**
   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Set up local environment variables:**
   ```bash
   cp backend/.env.example backend/.env
   ```
   Edit `backend/.env` with your development values:
   ```ini
   ENVIRONMENT=development
   SECRET_KEY=local-dev-secret-key-32bytes-min-len
   PORT=5001
   ALLOWED_ORIGINS=http://127.0.0.1:8090,http://localhost:8090,http://127.0.0.1:5500
   # Optional: set for real email and AI testing
   GMAIL_ADDRESS=your_email@gmail.com
   GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx
   OPENAI_API_KEY=sk-...
   ```

5. **Start the Flask backend:**
   ```bash
   cd backend
   python app.py
   # Backend starts on http://127.0.0.1:5001
   ```

6. **Serve the frontend locally:**
   In a separate terminal window:
   ```bash
   python3 -m http.server 8090 --directory frontend
   # Open http://127.0.0.1:8090 in your browser
   ```
   When visited on `localhost` or `127.0.0.1`, `frontend/js/config.js` automatically directs API calls to `http://127.0.0.1:5001`.

7. **Verify health endpoint:**
   ```bash
   curl http://127.0.0.1:5001/health
   # Expected: {"service":"PHOENIX Employee Automation Backend","status":"healthy","timestamp":"..."}
   ```

---

## 4. Running the Automated Test Suite

The test suite runs with fully isolated, temporary SQLite databases and mocked external services (zero real emails dispatched, zero paid OpenAI calls).

```bash
# Activate your virtual environment
source venv/bin/activate

# Execute all tests via the custom runner
python run_tests.py

# Or run directly via pytest
python -m pytest tests/ -v
```

**Test Coverage Summary (100 / 100 passing):**

| Test Module | Coverage Description | Test Count |
|---|---|---|
| `test_auth.py` | Login validation, password verification, roles, sessions, logout | 18 |
| `test_auth_security.py` | Manager impersonation prevention, security headers, CORS origin hygiene, employee isolation | 18 |
| `test_jwt_auth.py` | JWT token issuance, Bearer verification, expiry, signature tampering, algorithm validation | 10 |
| `test_tasks.py` | Task creation, status lifecycle, discrete progress (0-100), cross-employee update isolation | 11 |
| `test_comments.py` | Comment CRUD, non-author edit/delete prevention, task comments list | 8 |
| `test_employees.py` | Employee roster retrieval, credential sanitization (no password_hash leak), add employee | 7 |
| `test_email_service.py` | Gmail SMTP connection, TLS handshake, auth failure handling, network timeout handling | 5 |
| `test_ai_email.py` | OpenAI task draft generation, missing key detection, quota exhaustion fallback, JSON parsing | 5 |
| `test_rate_limiting.py` | Rate limiter enforcement on login (10/min), AI (15/min), task assign (30/min), window recovery | 4 |
| `test_routes.py` | Route availability, 404 handler, health check | 5 |
| `test_frontend_contracts.py` | Frontend `getApiUrl()` usage, KPI calculations parity, overdue deadline logic | 9 |

---

## 5. Render Backend Deployment

The Flask backend is configured to run as a **Render Web Service** using `gunicorn`.

### Option A: Deploy via Render Blueprint (`render.yaml`)

1. Push your repository to GitHub.
2. In the Render Dashboard ([dashboard.render.com](https://dashboard.render.com)):
   - Click **New** → **Blueprint**.
   - Select your `Employee-Management-Prapti` repository.
   - Render automatically reads `render.yaml`.
3. Provide the secret environment variables when prompted (`GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `OPENAI_API_KEY`, `ALLOWED_ORIGINS`).

### Option B: Manual Web Service Setup on Render

If creating the Web Service manually via the Render UI:

| Setting | Value | Notes |
|---|---|---|
| **Service Type** | Web Service | Python environment |
| **Name** | `phoenix-backend` | Or any preferred name |
| **Region** | Oregon (or nearest) | |
| **Branch** | `main` | |
| **Root Directory** | *(leave empty — repository root)* | |
| **Runtime** | Python 3 | Pinned to 3.11.0 via `runtime.txt` |
| **Build Command** | `pip install -r backend/requirements.txt` | |
| **Start Command** | `cd backend && gunicorn -c gunicorn.conf.py app:app` | Binds to `0.0.0.0:$PORT` |
| **Health Check Path** | `/health` | Render verifies 200 before routing |

### Required Environment Variables (Render Dashboard → Environment)

| Variable Name | Required | Example / Description |
|---|---|---|
| `ENVIRONMENT` | **Yes** | `production` (enforces strict security mode) |
| `SECRET_KEY` | **Yes** | 64-char hex string: `python3 -c "import secrets; print(secrets.token_hex(32))"` |
| `GMAIL_ADDRESS` | **Yes** | `prapti.chavan25@gmail.com` (Gmail address for outbound emails) |
| `GMAIL_APP_PASSWORD` | **Yes** | 16-character Google App Password (e.g. `abcd efgh ijkl mnop`) |
| `OPENAI_API_KEY` | **Yes** | `sk-proj-...` (OpenAI API key for AI email drafting) |
| `ALLOWED_ORIGINS` | **Yes** | Your deployed frontend origin(s): e.g. `https://employee-management-prapti.netlify.app` *(comma-separated, no trailing slashes)* |
| `SESSION_COOKIE_SAMESITE` | **Yes** | `None` (required for cross-origin authentication) |
| `JWT_EXPIRY_HOURS` | No | `24` (token validity period in hours) |
| `FLASK_DEBUG` | No | `False` |
| `RATELIMIT_STORAGE_URI` | No | `memory://` (or `redis://...` if scaling to multiple instances) |
| `LOG_LEVEL` | No | `info` |
| `PHOENIX_DATA_DIR` | No | `/var/data` (set if attaching a Render Persistent Disk) |

---

## 6. Frontend Deployment & API Connection

The frontend is hosted separately on **Netlify** (or as a Render Static Site).

### Configuring the Backend URL on the Frontend

The frontend resolves its backend target using this priority order in `frontend/js/config.js`:
1. `window.__PHOENIX_API_URL__` (runtime script injection)
2. `<meta name="phoenix-api-base" content="...">` in each HTML file
3. `localStorage.getItem('phoenix_api_base_url')` (for testing/QA)
4. Local development detection (`localhost` / `127.0.0.1` → `http://127.0.0.1:5001`)
5. Fallback to `DEFAULT_PROD_API_URL` (`https://employee-management-prapti-1.onrender.com`)

### Step-by-Step for Netlify:

1. **Deploy Settings in Netlify:**
   - **Base directory**: *(leave empty)*
   - **Publish directory**: `frontend`
   - **Build command**: *(leave empty)*
2. **Set the Backend Meta Tag:**
   Ensure each HTML file (`index.html`, `manager.html`, `employee.html`) has the meta tag pointing to your Render backend:
   ```html
   <meta name="phoenix-api-base" content="https://employee-management-prapti-1.onrender.com">
   ```
3. **Configure CORS in Render:**
   Copy your Netlify URL (e.g. `https://phoenix-tasks.netlify.app`) and set it in the Render backend environment variable:
   ```ini
   ALLOWED_ORIGINS=https://phoenix-tasks.netlify.app
   ```
   Save and redeploy the Render backend.

---

## 7. Database Persistence & Storage Strategy

### SQLite & JSON on Ephemeral Filesystems (Render Free Tier)
Render Free web services run on ephemeral containers. When the container restarts or spins down due to inactivity:
- Changes written to disk during runtime (new tasks in `phoenix.db` or new employees in `employees.json`) are reset to the Git repository state.
- **Safe mitigation in code**:
  - `backend/app.py` supports `PHOENIX_DATA_DIR`.
  - Writing to `employees.json` uses atomic file replacement (`.tmp` file + `os.replace`) to prevent file corruption.
  - SQLite uses WAL mode (`PRAGMA journal_mode=WAL`) and foreign keys (`PRAGMA foreign_keys=ON`).

### Recommended Persistence Options:

1. **Render Persistent Disk**:
   - Upgrade Render Web Service to Starter plan ($7/month).
   - In Render Dashboard → Disks → Add Disk: Mount at `/var/data` with size 1 GB.
   - Set environment variable: `PHOENIX_DATA_DIR=/var/data`.
   - On first startup, PHOENIX automatically copies `employees.json` from the repo into `/var/data/employees.json` and creates `/var/data/phoenix.db`. All subsequent writes persist permanently across restarts and deployments.

2. **Automated Backups (`backend/backup_db.py`)**:
   - Run manual or scheduled backups:
     ```bash
     python backend/backup_db.py
     ```
   - Uses SQLite's online backup API (`src_conn.backup(dst_conn)`) to ensure consistent point-in-time snapshots without locking the database.

---

## 8. Gmail SMTP Setup & Safe Testing

1. **Generate a Google App Password:**
   - Go to Google Account → Security → 2-Step Verification.
   - Scroll to **App passwords** (or search "App passwords").
   - Create a new password with App name `PHOENIX`.
   - Google gives you a 16-character code (e.g. `xxxx xxxx xxxx xxxx`).
2. **Configure in Render or `.env`:**
   - `GMAIL_ADDRESS`: your Gmail address.
   - `GMAIL_APP_PASSWORD`: the 16-character code (spaces are automatically stripped by `email_service.py`).
3. **Safe Test Procedure:**
   - Do not test by assigning tasks to all employees.
   - Log into `manager.html` and assign a task to **yourself** (or a single test address).
   - Verify the inbox receives the email with correct sender, manager name, task details, and formatted deadline.

---

## 9. AI Email Draft Generation Setup

1. **OpenAI API Key:**
   - Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys).
   - Create a restricted or standard API key.
   - Set `OPENAI_API_KEY=sk-...` in the Render environment variables.
2. **Model & Architecture:**
   - Uses `gpt-4o-mini` with `response_format={"type": "json_object"}`.
   - Enforces structured components: `subject`, `greeting`, `intro`, `details`, `action`, `closing`, `signature`.
   - **Built-in Quota Resilience**: If the OpenAI account has an exhausted credit balance, `ai_email_service.py` automatically falls back to an enterprise template so the project manager can still preview, edit, and send the email without interruption.

---

## 10. Troubleshooting Guide

| Issue | Root Cause | Solution |
|---|---|---|
| **CORS Error in Browser** (`Cross-Origin Request Blocked`) | Backend `ALLOWED_ORIGINS` does not match the frontend origin. | In Render Dashboard, set `ALLOWED_ORIGINS` to exact frontend URL (e.g. `https://my-app.netlify.app`, no trailing slash). |
| **HTTP 401 Unauthorized** on API calls | JWT token missing or expired in `localStorage`. | Re-authenticate at `index.html`. Verify `Authorization: Bearer <token>` header is present in browser Network tab. |
| **HTTP 403 Forbidden** on manager routes | Logged-in user has role `employee`. | Manager actions (`/assign-task`, `/add-employee`, `/assign-meeting`) require `project_manager` or `administrator` role. |
| **HTTP 404 Not Found** on API calls | Frontend is sending API calls to its static host instead of the backend. | Check `<meta name="phoenix-api-base">` in `index.html`, `manager.html`, and `employee.html`. Must point to `https://employee-management-prapti-1.onrender.com`. |
| **HTTP 429 Too Many Requests** | Rate limit threshold reached. | Wait 60 seconds. In production, configure Redis backend via `RATELIMIT_STORAGE_URI=redis://...`. |
| **Gmail Auth Error** (`535 5.7.8`) | Regular Gmail password used instead of App Password, or 2FA disabled. | Generate an App Password in Google Account Settings and set `GMAIL_APP_PASSWORD`. |
| **Backend 502 Bad Gateway / Startup Crash** | `SECRET_KEY` missing in production environment. | In Render Dashboard, set `SECRET_KEY` environment variable. |
| **Backend Takes 50+ Seconds to Respond** | Free tier spin-down after 15 minutes of inactivity. | Free Render instances sleep when idle. First request wakes it up. Upgrade to Starter ($7/mo) to keep always-on. |

---

## 11. End-to-End Verification Sequence

To verify full system functionality:

1. **Health Check**:
   ```bash
   curl -i https://employee-management-prapti-1.onrender.com/health
   # Verify HTTP 200 and {"status": "healthy"}
   ```
2. **Login & Token Issuance**:
   - Open frontend `index.html`.
   - Submit manager credentials.
   - Confirm redirection to `manager.html`.
   - Check `localStorage.getItem('phoenix_token')` is populated in browser DevTools.
3. **Manager Dashboard Hydration**:
   - Verify KPI cards display counts (Total, Active, Upcoming, Past Due, Completed).
   - Verify employee dropdown loads from `GET /employees`.
4. **AI Email Generation & Task Assignment**:
   - Fill in Task form, select priority, click "Draft with AI".
   - Confirm structured preview loads in the slide-out panel.
   - Click "Assign Task" — verify task appears in list and email is sent.
5. **Employee Workspace & Status Updates**:
   - Log out and log in as the assigned employee.
   - Confirm redirection to `employee.html`.
   - Update task progress slider (e.g. to 50%) — confirm status changes to "In Progress".
   - Post a comment on the task — confirm it appears immediately in the task comments thread.
6. **Logout & Invalidation**:
   - Click Logout.
   - Verify `phoenix_token` and `phoenix_user` are cleared from `localStorage`.
   - Attempting to visit `manager.html` directly immediately redirects to `index.html`.
