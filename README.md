# UnivGPT

Role-aware university assistant with document ingestion, moderation, and dashboard operations.

## Badges

![Python](https://img.shields.io/badge/Python-3.11+-3776AB?style=flat-square&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat-square&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-7-646CFF?style=flat-square&logo=vite&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white)
![Supabase](https://img.shields.io/badge/Auth%20%26%20DB-Supabase-3ECF8E?style=flat-square&logo=supabase&logoColor=white)
![Pinecone](https://img.shields.io/badge/Vector%20DB-Pinecone-000000?style=flat-square)
![OpenRouter](https://img.shields.io/badge/LLM%20Gateway-OpenRouter-111111?style=flat-square)
![Frontend Build](https://img.shields.io/badge/Frontend%20Build-Passing-brightgreen?style=flat-square)
![Environment](https://img.shields.io/badge/Environment-Local%20Dev-orange?style=flat-square)

## What This Project Does

UnivGPT provides:

- Role-based AI assistants for `student`, `faculty`, and `admin`
- Document upload and metadata routing (`public`, `student`, `faculty`, `admin`)
- Ingestion pipeline: extraction -> chunking -> embeddings -> vector index
- Moderation and appeal workflow (including Dean review flow)
- Dashboard analytics, user management, audit logs, and notifications

## Tech Stack

### Backend

- FastAPI
- Supabase (Auth + Postgres + profile persistence)
- Pinecone (vector search)
- SentenceTransformers (`all-MiniLM-L6-v2`) for embeddings
- OpenRouter for model inference
- SMTP for OTP and moderation/appeal status emails

### Frontend

- React 19 + TypeScript
- Vite 7
- Tailwind CSS
- Framer Motion + Radix primitives
- Zustand state stores

## Repository Layout

```text
GPT/
  backend/
    app/
      routers/         # auth, agent, admin, documents APIs
      services/        # ingestion, moderation, routing, integrations
      middleware/      # auth + RBAC
      models/          # pydantic schemas
    migrate.py
    seed.py
  frontend/
    src/
      pages/           # role dashboards + auth pages
      components/
      store/
      lib/
  docs/
    README.md
    design.md
    tunnel_setup_local_vs_hosted.md
    private/           # ignored from git
  infrastructure/
    supabase/
```

## Quick Start

## 1. Prerequisites

- Python `3.11+`
- Node.js `20+`
- npm

## 2. Clone

```bash
git clone <your-repo-url>
cd GPT
```

## 3. Backend Setup

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Copy env template:

```bash
copy .env.example .env
```

Run migrations:

```bash
python migrate.py
```

Run backend:

```bash
uvicorn app.main:app --reload --port 8000
```

Backend API docs:

- `http://localhost:8000/docs`

## 4. Frontend Setup

Open a new terminal:

```bash
cd frontend
npm install
```

Copy env template:

```bash
copy .env.example .env.local
```

Run frontend:

```bash
npm run dev
```

Frontend URL:

- `http://localhost:5173`

## 5. Optional Seed Commands

```bash
cd backend
python seed.py
```

`seed.py` includes command/menu modes for:

- `seed_all`
- `delete_all`
- `reset`
- `seed_dummy`
- `seed_demo`

## Environment Variables (Important)

In `backend/.env`, configure:

- Supabase:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Postgres direct:
  - `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- Vector DB:
  - `PINECONE_API_KEY`
  - `PINECONE_INDEX_NAME`
- LLM:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_MODEL`
  - `OPENROUTER_INTENT_MODEL`
- Email/OTP:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`
  - `SMTP_FROM_EMAIL`, `SMTP_FROM_NAME`

In `frontend/.env.local`, configure:

- backend API URL
- frontend-side Supabase public keys if used by UI flow

## Core Functional Flows

## Auth

- Email/password + OTP verification
- Google login
- Role-aware access checks at API and UI layers

## Documents

1. Upload document with metadata (`doc_type`, `department`, `course`, `tags`)
2. Extract text
3. Chunk + embed
4. Store metadata in Supabase
5. Store vectors in Pinecone

## Agent Query

1. User query enters intent/moderation routing
2. Role scope resolved
3. Relevant context fetched (structured + vector where needed)
4. LLM response generated with role constraints
5. Conversation + audit stored

## Moderation + Appeals

- Flag abusive behavior
- Warn/block based on policy
- User can submit appeal
- Dean/admin can approve/reject
- Status emails dispatched on decision

## Scripts Reference

From `backend/`:

- `python migrate.py` -> apply/verify schema + runtime columns/indexes
- `python seed.py` -> seed/reset workflows
- `python reset_db.py` -> reset helper

From `frontend/`:

- `npm run dev` -> local dev server
- `npm run build` -> production build
- `npm run preview` -> preview production build

## Troubleshooting

## Supabase DNS / Connectivity

If you see `getaddrinfo failed`:

- verify `SUPABASE_URL`
- verify VPN / DNS resolution
- check ISP restrictions
- test with `migrate.py` and simple auth endpoint

## Pinecone Timeout

If vector query is slow/failing:

- verify `PINECONE_API_KEY` + index name
- confirm index region and host reachability
- reduce query timeout / retries in config

## OpenRouter 429 / Rate Limit

- switch to a more stable model
- configure fallback models
- reduce retries and high-frequency calls during load testing

## SMTP OTP Issues

- verify app password (for Gmail)
- verify sender alignment and SSL/TLS mode
- check logs for blocked socket or auth failure

## Security Notes

- Never commit `.env` files
- Keep `docs/private/` out of public repo (already ignored)
- Rotate exposed keys immediately if leaked

## Contributing

1. Create branch
2. Make small, reviewable commits
3. Run backend compile/tests and frontend build
4. Open PR with clear summary and screenshots for UI changes

## Project Status

Active development. Architecture and UX are being continuously improved for production readiness.
