<!-- Copyright (c) 2026 XynaxDev | Contact: akashkumar.cs27@gmail.com -->

<h1 align="center">
  Univ<img src="https://img.shields.io/badge/GPT-f97316?style=flat&logoColor=white" alt="GPT" height="28" />
</h1>

<p align="center">
  Role-aware university workspace with grounded AI, live notices, timetable intelligence, moderation controls, and admin operations.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Python-3.12-3776AB?style=flat&logo=python&logoColor=white" alt="Python" />
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=flat&logo=react&logoColor=06151f" alt="React" />
  <img src="https://img.shields.io/badge/Vite-7-646CFF?style=flat&logo=vite&logoColor=white" alt="Vite" />
  <img src="https://img.shields.io/badge/Tailwind-4-06B6D4?style=flat&logo=tailwindcss&logoColor=white" alt="Tailwind" />
  <img src="https://img.shields.io/badge/Supabase-Auth%20%26%20DB-3ECF8E?style=flat&logo=supabase&logoColor=052e16" alt="Supabase" />
  <img src="https://img.shields.io/badge/Pinecone-Vector%20Search-111827?style=flat&logoColor=white" alt="Pinecone" />
  <img src="https://img.shields.io/badge/OpenRouter-Intent%20Layer-0f172a?style=flat&logoColor=white" alt="OpenRouter" />
  <img src="https://img.shields.io/badge/Railway-Backend-0B0D0E?style=flat&logo=railway&logoColor=white" alt="Railway" />
  <img src="https://img.shields.io/badge/Vercel-Frontend-000000?style=flat&logo=vercel&logoColor=white" alt="Vercel" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-Production%20Ready-f97316?style=flat" alt="Production Ready" />
  <img src="https://img.shields.io/badge/Roles-Student%20%C2%B7%20Faculty%20%C2%B7%20Admin-1f2937?style=flat" alt="Roles" />
  <img src="https://img.shields.io/badge/Moderation-Dean%20Review%20Workflow-7f1d1d?style=flat" alt="Moderation" />
  <img src="https://img.shields.io/badge/Search-Grounded%20Citations-1d4ed8?style=flat" alt="Grounded Search" />
</p>

<p align="center">
  <strong>Live scope-aware chat</strong> · <strong>role-bounded dashboards</strong> · <strong>document ingestion</strong> · <strong>appeals and audit workflows</strong>
</p>

## Why UnivGPT

UnivGPT is built to feel like a real university operating layer, not just a generic chatbot. It combines:

- grounded answers from live profile, notice, course, and faculty data
- role-aware experiences for students, faculty, and admins
- document upload, parsing, embeddings, and retrieval
- moderation, appeals, dean review, audit, and notification loops
- responsive dashboards designed for daily campus workflows

## What It Can Do

### Student

- ask about notices, deadlines, faculty, timetable, courses, and profile-bound details
- view role-scoped notifications and timetable
- appeal chat blocks if moderation rules are violated

### Faculty

- view timetable, notices, uploads, and faculty workflows
- access faculty-scoped chat grounded to department/course context

### Admin / Dean

- manage users, uploads, notices, and audit logs
- review moderation appeals
- approve, reject, or reset student chat flags

## Tech Stack

### Backend

- FastAPI
- Supabase Auth + Postgres
- Pinecone
- SentenceTransformers with `all-MiniLM-L6-v2`
- OpenRouter for intent/fallback generation
- Ollama-compatible generation endpoint
- SMTP email delivery for OTP, moderation, and appeal status updates

### Frontend

- React 19 + TypeScript
- Vite 7
- Tailwind CSS
- Framer Motion
- Zustand

## Repository Layout

```text
GPT/
  backend/
    app/
      routers/       # auth, agent, admin, documents
      services/      # moderation, routing, ingestion, integrations
      middleware/    # auth and RBAC
      models/        # pydantic schemas
    migrate.py
    reset_db.py
    requirements.txt
  frontend/
    src/
      pages/
      components/
      store/
      lib/
```

## Local Setup

### 1. Prerequisites

- Python `3.12.x`
- Node.js `20+`
- npm

### 2. Clone the project

```bash
git clone <your-repo-url>
cd GPT
```

### 3. Backend setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Fill `backend/.env` with your real values before starting the API.

Then run:

```bash
python migrate.py
uvicorn app.main:app --reload --port 8000
```

Backend docs:

- `http://localhost:8000/docs`

### 4. Frontend setup

Open a new terminal:

```bash
cd frontend
npm install
copy .env.example .env.local
npm run dev
```

Frontend runs at:

- `http://localhost:5173`

## Required Environment Variables

### Backend `.env`

These are the main variables you need:

```env
ENVIRONMENT=development
FRONTEND_APP_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
OAUTH_REDIRECT_PATH=/auth/callback

SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_JWT_SECRET=
SUPABASE_STORAGE_BUCKET=documents

PINECONE_API_KEY=
PINECONE_INDEX_NAME=univgpt-index

OPENROUTER_API_KEY=
OPENROUTER_INTENT_MODEL=
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
OPENROUTER_GENERATION_FALLBACK_MODELS=

OLLAMA_API_KEY=
OLLAMA_GENERATION_MODEL=
OLLAMA_BASE_URL=

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM_EMAIL=
SMTP_FROM_NAME=UnivGPT Support

DEAN_EMAILS=
PRELOAD_EMBEDDINGS_ON_STARTUP=false
MOCK_LLM=false
ENABLE_DUMMY_AUTH=false
SUPABASE_OFFLINE_MODE=false
```

### Frontend `.env.local`

```env
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_ACADEMIC_EMAIL_DOMAIN=
```

## Supabase Setup

If you are running this project yourself, configure these in Supabase:

### Authentication

- enable Email/Password
- enable Google if you want Google sign-in
- set **Site URL** to your frontend URL
- add **Redirect URLs**:
  - `http://localhost:5173/auth/callback`
  - your production frontend callback URL

### Database

Make sure your Supabase project contains the expected application tables such as:

- `profiles`
- `documents`
- `conversations`
- `audit_logs`

Then run:

```bash
cd backend
python migrate.py
```

to align runtime-required columns and indexes.

## Production Setup

### Recommended hosting

- **Frontend**: Vercel
- **Backend**: Railway

### Production checklist

1. Deploy the backend and get the public Railway URL
2. Deploy the frontend and set the real `VITE_API_URL`
3. Update backend `CORS_ORIGINS` and `FRONTEND_APP_URL`
4. Update Supabase Site URL and Redirect URLs
5. Add real SMTP credentials so signup OTP and appeal emails work
6. Set `DEAN_EMAILS` so moderation alerts go to the right admin/dean recipients

## Core Flows

### Authentication

- email signup sends a verification OTP
- email login requires a verified account
- Google auth respects role selection and admin allowlist rules
- logout clears local chat cache so users start fresh next time

### Grounded AI

- detects role and intent
- pulls structured live context from profile/course/faculty/admin data
- uses vector retrieval where appropriate
- adds role-safe navigation links into the final answer

### Moderation

- student-only moderation
- warnings -> block -> apology appeal
- dean/admin can approve, reject, or reset flags
- email + in-app notifications are sent on decisions

### Documents

- upload with metadata
- extract and chunk text
- generate embeddings
- store searchable context in Pinecone

## Troubleshooting

### Signup says verification email could not be sent

That is usually an SMTP issue, not a frontend issue.

Check:

- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM_EMAIL`

Also make sure your SMTP mailbox/app password actually allows outbound mail.

### Login fails from production frontend

Check:

- backend `CORS_ORIGINS`
- frontend `VITE_API_URL`
- Supabase Site URL / Redirect URLs

### Chat feels slow

Check:

- production model provider latency
- Supabase query speed
- Pinecone query timeout
- `PRELOAD_EMBEDDINGS_ON_STARTUP`

### Faculty/course answers look wrong

Check that your `profiles`, `documents`, and course/faculty mapping data are populated in Supabase.

## Useful Commands

### Backend

```bash
python migrate.py
python reset_db.py
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
npm run dev
npm run build
npm run preview
```

## Notes

- do not commit real `.env` files
- rotate keys immediately if they were ever exposed
- keep `DEAN_EMAILS` and SMTP values correct in production

---

Built to make university operations, notices, and academic assistance feel grounded, role-aware, and actually usable in production.
