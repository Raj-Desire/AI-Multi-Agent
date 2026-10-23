# AI Voice Platform (Multi-Agent AI Calling)

A white-label platform for building AI voice agents that make and receive real phone calls. Each organization can create its own AI agents, give them a knowledge base, run outbound calling campaigns, and watch live usage, credits and call analytics from a web dashboard.

---

## Table of Contents

1. [What this project does](#1-what-this-project-does)
2. [Tech stack](#2-tech-stack)
3. [Project structure](#3-project-structure)
4. [How it works (simple view)](#4-how-it-works-simple-view)
5. [Accounts and keys you need first](#5-accounts-and-keys-you-need-first)
6. [Install the required software](#6-install-the-required-software)
7. [Step-by-step setup (from GitHub)](#7-step-by-step-setup-from-github)
8. [Run the project (3 terminals)](#8-run-the-project-3-terminals)
9. [Log in and make your first call](#9-log-in-and-make-your-first-call)
10. [Environment variable reference](#10-environment-variable-reference)
11. [Running tests](#11-running-tests)
12. [Troubleshooting](#12-troubleshooting)
13. [Deployment notes](#13-deployment-notes)

---

## 1. What this project does

- **AI voice agents** – create agents with a 7-step wizard (basics, role and conversation, voice and language, personality, behavior and safety, prompt, test and review).
- **Real-time phone calls** – outbound and inbound calls over Twilio, with a real-time spoken AI conversation streamed over WebSockets.
- **Multi-agent routing** – an orchestrator routes the conversation between agents (intent router, handoff controller, human escalation).
- **Knowledge base** – upload PDF/DOCX documents so agents answer from your company information.
- **Campaigns and prospects** – import contacts (Excel/CSV) and run automated calling campaigns.
- **Lead intelligence** – call analytics and lead scoring.
- **Credits and usage** – per-organization credit balance, usage charts and cost tracking.
- **Roles** – Super Admin, Admin and normal users, each with their own panel.
- **Theme Studio** – per-organization colors and branding.
- **Voice library** – many selectable voices with audio previews.
- **Email alerts** – escalation alerts sent through Microsoft Graph (optional).

## 2. Tech stack

| Part | Technology |
|------|------------|
| Backend | Python 3.12+, FastAPI, Uvicorn, WebSockets |
| Frontend | React 18, TypeScript, Vite, Tailwind CSS |
| Database | Azure Cosmos DB (NoSQL) |
| Telephony | Twilio Programmable Voice |
| Voice engine | Real-time spoken AI service (API key required) |
| LLM | Azure OpenAI (or OpenAI) |
| Public tunnel (local dev) | ngrok |

## 3. Project structure

```
AI Multi Agent/
├── backend/                  FastAPI server
│   ├── app/
│   │   ├── main.py           App entry point
│   │   ├── api/v1/           REST + WebSocket routes (auth, agents, calls, campaigns, ...)
│   │   ├── agents/           Multi-agent orchestrator, intent router, prompt builder
│   │   ├── voice/            Real-time audio gateway and call sessions
│   │   ├── providers/        Voice engine client (internal)
│   │   ├── services/         Business logic (calls, credits, knowledge, email, ...)
│   │   ├── repositories/     Database access
│   │   ├── models/ schemas/  Data models
│   │   └── core/             Database setup, security, dependencies
│   ├── static/voice_previews Voice sample audio
│   ├── tests/                Backend tests
│   ├── requirements.txt      Python packages
│   └── .env                  Your secrets (you create this, not in git)
├── frontend/                 React + Vite web app
│   ├── src/                  Components, pages, api-client
│   └── package.json          Node packages
├── sample_documents/         Example files for the knowledge base
├── voice_samples/            Voice preview samples
├── docs/                     Extra documentation and plans
└── README.md                 This file
```

## 4. How it works (simple view)

```
 Browser (React, :3000)
        │  REST API
        ▼
 FastAPI backend (:8000) ──► Azure Cosmos DB (data)
        │  ▲
        │  │ WebSocket audio
        ▼  │
     ngrok public HTTPS URL  ◄────►  Twilio  ◄────►  Phone
        │
        ▼
 Voice engine + Azure OpenAI (the AI "brain" and voice)
```

Twilio is on the internet, so it **cannot reach `localhost`**. That is why `ngrok` is needed when you run locally: it gives your backend a public `https://` address that Twilio can call.

## 5. Accounts and keys you need first

Create these before you start. Free tiers or trials are enough for testing.

| Service | What you need | Where to get it |
|---------|---------------|-----------------|
| **Azure Cosmos DB** | Endpoint URL and Key | Azure Portal → Create "Azure Cosmos DB for NoSQL" → *Keys* (the database and containers are created automatically on first start) |
| **Twilio** | Account SID, Auth Token, a phone number | https://www.twilio.com/console |
| **Voice engine** | API key | Your voice engine provider dashboard |
| **Azure OpenAI** | Endpoint, API key, deployment name | Azure Portal → Azure OpenAI (a `gpt-4o` deployment) |
| **ngrok** | Free account and auth token | https://dashboard.ngrok.com |
| *Optional* Cartesia | API key (extra voices) | https://cartesia.ai |
| *Optional* Microsoft Graph | Tenant ID, Client ID, Client Secret, sender mailbox | Azure Portal → App registrations (only for email alerts) |

## 6. Install the required software

Install these once on your computer.

| Software | Version | Download | Check it works |
|----------|---------|----------|----------------|
| Git | any | https://git-scm.com/downloads | `git --version` |
| Python | 3.12 or newer | https://www.python.org/downloads/ (tick **Add Python to PATH** on Windows) | `python --version` |
| Node.js (includes npm) | 18 or newer (20 LTS recommended) | https://nodejs.org | `node --version` and `npm --version` |
| ngrok | latest | https://ngrok.com/download | `ngrok version` |

Install ngrok quickly:

```bash
# Windows (with winget)
winget install ngrok.ngrok

# macOS (with Homebrew)
brew install ngrok
```

Connect ngrok to your account (run once, use your own token from the ngrok dashboard):

```bash
ngrok config add-authtoken YOUR_NGROK_AUTHTOKEN
```

## 7. Step-by-step setup (from GitHub)

### Step 1 – Download the project

```bash
git clone <your-github-repository-url>
cd "AI-Multi-Agent"
```

(Or click **Code → Download ZIP** on GitHub, unzip it, and open a terminal in that folder.)

### Step 2 – Set up the backend

```bash
cd backend

# Create a virtual environment
python -m venv .venv

# Activate it
#   Windows PowerShell:
.venv\Scripts\Activate.ps1
#   Windows CMD:
#   .venv\Scripts\activate.bat
#   macOS / Linux:
#   source .venv/bin/activate

# Install all required packages
pip install -r requirements.txt
```

> On Windows PowerShell, if activation is blocked, run once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### Step 3 – Create the backend `.env` file

Create a file named `.env` inside the `backend/` folder (this file is git-ignored, never commit it). Copy this template and fill in your own values:

```env
# ---------- Database (Azure Cosmos DB) ----------
COSMOS_ENDPOINT=https://your-account.documents.azure.com:443/
COSMOS_KEY=your-cosmos-primary-key
COSMOS_DATABASE=AIPlatformDB

# ---------- Security ----------
# Use a long random string. Generate one with:
#   python -c "import secrets; print(secrets.token_hex(32))"
JWT_SECRET=replace-with-a-long-random-string
# Key used to encrypt saved Twilio secrets. Generate with:
#   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
ENCRYPTION_KEY=replace-with-generated-fernet-key

# ---------- First Super Admin login (created automatically on first start) ----------
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=choose-a-strong-password

# ---------- Voice engine ----------
DEEPGRAM_API_KEY=your-voice-engine-api-key
CARTESIA_API_KEY=

# ---------- LLM (Azure OpenAI) ----------
AZURE_OPENAI_API_KEY=your-azure-openai-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=gpt-4o
AZURE_OPENAI_API_VERSION=2024-08-01-preview

# ---------- Twilio / public URL ----------
# Paste your ngrok https URL here (see Step 5 in "Run the project")
PUBLIC_BASE_URL=https://your-subdomain.ngrok-free.app
# Optional: Twilio TwiML App SID (only if using browser calling)
TWIML_APP_SID=

# ---------- Optional: email alerts via Microsoft Graph ----------
GRAPH_TENANT_ID=
GRAPH_CLIENT_ID=
GRAPH_CLIENT_SECRET=
MAIL_SENDER=
ESCALATION_ALERTS_ENABLED=false
ESCALATION_ALERT_RECIPIENT=

# ---------- Optional ----------
# Automatically dial campaign contacts in the background (keep false while testing)
ENABLE_CAMPAIGN_BACKGROUND_DIALER=false
```

> Twilio Account SID, Auth Token and phone number are **not** put in `.env`. You enter them later inside the app (**Twilio Settings** page); they are stored encrypted in the database.

### Step 4 – Set up the frontend

Open a **new terminal** in the project root:

```bash
cd frontend
npm install
```

The frontend talks to `http://localhost:8000/api/v1` by default. Only if your backend runs somewhere else, create `frontend/.env`:

```env
VITE_API_BASE_URL=http://localhost:8000/api/v1
```

## 8. Run the project (3 terminals)

You need three terminals open at the same time.

### Terminal 1 – Backend

```bash
cd backend
.venv\Scripts\Activate.ps1        # (macOS/Linux: source .venv/bin/activate)
python -m uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs

The first start creates the database, all containers and the admin user automatically. Wait for it to finish without errors.

### Terminal 2 – Frontend

```bash
cd frontend
npm run dev
```

- Web app: http://localhost:3000

### Terminal 3 – ngrok (needed for real phone calls)

```bash
ngrok http 8000
```

ngrok shows a line like:

```
Forwarding   https://abcd-1234.ngrok-free.app -> http://localhost:8000
```

Copy that **https** address, then do **both** of these:

1. Put it in `backend/.env` as `PUBLIC_BASE_URL=https://abcd-1234.ngrok-free.app`
2. Restart the backend (Terminal 1: press `Ctrl+C`, run the uvicorn command again).

You can also paste it in the app under **Twilio Settings → Public Base URL**.

> **Important:** the free ngrok address changes every time you restart ngrok. Whenever it changes, update `PUBLIC_BASE_URL` and restart the backend. A reserved/static ngrok domain avoids this: `ngrok http --domain=your-name.ngrok-free.app 8000`.

## 9. Log in and make your first call

1. Open http://localhost:3000.
2. Log in with the `ADMIN_EMAIL` and `ADMIN_PASSWORD` you put in `backend/.env`.
3. Go to **Twilio Settings**, enter your Account SID, Auth Token and Twilio phone number, then click **Save Configuration** and **Test Connection**. It should show *Connected & Active*.
4. Create an agent in **Agent Management** (follow the 7-step wizard). Optionally upload documents from `sample_documents/` to its knowledge base.
5. Open the calling console, choose your agent, enter a destination number in international format (for example `+14155550123`), and click **Make Call**.

Trial Twilio accounts can only call numbers you have verified in the Twilio console.

## 10. Environment variable reference

| Variable | Required | Purpose |
|----------|----------|---------|
| `COSMOS_ENDPOINT` | Yes | Cosmos DB URL |
| `COSMOS_KEY` | Yes | Cosmos DB key |
| `COSMOS_DATABASE` | Yes | Database name (auto-created) |
| `JWT_SECRET` | Yes | Signs login tokens |
| `ENCRYPTION_KEY` | Yes | Encrypts stored Twilio secrets |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Yes | First Super Admin account |
| `DEEPGRAM_API_KEY` | Yes | Real-time voice engine key |
| `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME`, `AZURE_OPENAI_API_VERSION` | Yes | LLM for agent replies |
| `PUBLIC_BASE_URL` | Yes for calls | Public HTTPS URL (ngrok or your server) Twilio calls back |
| `TWIML_APP_SID` | No | Twilio TwiML App for browser calling |
| `CARTESIA_API_KEY` | No | Extra voice provider |
| `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `MAIL_SENDER` | No | Send email through Microsoft Graph |
| `ESCALATION_ALERTS_ENABLED`, `ESCALATION_ALERT_RECIPIENT` | No | Human-escalation email alerts |
| `ENABLE_CAMPAIGN_BACKGROUND_DIALER` | No | `true` = auto-dial campaigns in background (default `false`) |
| `ORCHESTRATOR_THINK_PROXY` | No | Advanced: route agent reasoning through the backend (needs one worker and an HTTPS `PUBLIC_BASE_URL`) |
| `ORCHESTRATOR_EMBEDDINGS_ENABLED` | No | Advanced: enable vector embeddings for knowledge search |
| `VITE_API_BASE_URL` | No (frontend) | Backend API URL, default `http://localhost:8000/api/v1` |

## 11. Running tests

```bash
# Backend
cd backend
pytest

# Frontend
cd frontend
npm test
```

## 12. Troubleshooting

| Problem | Fix |
|---------|-----|
| `python` or `pip` not found | Reinstall Python with **Add to PATH** ticked, then reopen the terminal |
| `Activate.ps1 cannot be loaded` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` |
| `ModuleNotFoundError` | Activate the virtual environment, then `pip install -r requirements.txt` |
| `Cosmos DB init failed` in backend log | Check `COSMOS_ENDPOINT` and `COSMOS_KEY`; make sure there are no extra spaces or quotes |
| Frontend shows network / login error | Backend must be running on port 8000; check http://localhost:8000/docs opens |
| "Twilio cannot reach localhost" | Start ngrok and set `PUBLIC_BASE_URL` to the **https** ngrok URL, then restart the backend |
| Call connects but there is silence | `PUBLIC_BASE_URL` is outdated (ngrok restarted). Update it and restart the backend |
| Call fails on a trial Twilio account | Verify the destination number in the Twilio console |
| `ngrok` authentication failed | Run `ngrok config add-authtoken ...` with the token from your ngrok dashboard |
| Port 3000 or 8000 already in use | Close the other program, or change the port (`--port 8001`, and set `VITE_API_BASE_URL`) |
| Voice engine / AI errors on calls | Verify `DEEPGRAM_API_KEY` and the Azure OpenAI values, and that the deployment name exists |

## 13. Deployment notes

- Build the frontend for production with `cd frontend && npm run build` (output in `frontend/dist`). A GitHub Actions workflow for Azure Static Web Apps is included under `.github/workflows`.
- Run the backend on any server with Python 3.12+ using `uvicorn app.main:app --host 0.0.0.0 --port 8000`. In production use a real HTTPS domain for `PUBLIC_BASE_URL` instead of ngrok.
- Never commit `.env` files. Rotate any key that was ever shared publicly.
- Set a strong, unique `JWT_SECRET`, `ENCRYPTION_KEY` and `ADMIN_PASSWORD` in every environment.
