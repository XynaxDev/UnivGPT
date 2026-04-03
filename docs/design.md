# UnivGPT Design

This document explains the current architecture, request flows, and role boundaries.

## High-Level Architecture

### Frontend

- React + TypeScript + Vite
- Role-based dashboard routes: `student`, `faculty`, `admin`
- Key pages: chat, courses, faculty directory, notifications, upload, users, audit, dean appeals

### Backend

- FastAPI app (`backend/app/main.py`)
- Routers:
  - `app/routers/auth.py`
  - `app/routers/agent.py`
  - `app/routers/documents.py`
  - `app/routers/admin.py`
- Middleware:
  - JWT auth (`app/middleware/auth.py`)
  - RBAC (`app/middleware/rbac.py`)

### Core Integrations

- Supabase: Auth + Postgres tables (`profiles`, `documents`, `conversations`, `audit_logs`)
- Pinecone: vector search for RAG
- OpenRouter: LLM generation + intent/moderation classification
- SMTP: OTP and moderation/appeal decision emails

## Core Runtime Flows

### 1) Auth Flow

1. User signs up or logs in.
2. Backend validates against Supabase Auth.
3. OTP flows (`signup`, `verify`, `forgot-password`, `reset-password`) use SMTP.
4. Profile sync happens in `profiles`.
5. JWT protects all role-scoped APIs.

### 2) Document Ingestion Flow

1. Admin/faculty uploads document with metadata (`doc_type`, `department`, `course`, `tags`).
2. File is validated and text is extracted/chunked.
3. Embeddings are generated and upserted to Pinecone.
4. Document metadata is persisted in Supabase.
5. Audit entry is written.

### 3) Agent Query Flow

1. Query enters `agent_pipeline`.
2. User role/scope is resolved.
3. Intent + moderation checks run.
4. Structured tools and/or vector retrieval are selected by intent.
5. LLM response is generated with role-safe context.
6. Conversation and audit rows are persisted.

### 4) Moderation and Appeals Flow

1. Abusive messages are flagged by moderation routing.
2. Warning/escalation state is tracked per user.
3. User may submit appeal.
4. Dean/admin reviews appeal in admin UI.
5. Decision updates moderation state and notifies user via email.

## Role Scope Model

- `student`: `student` + `public` context
- `faculty`: `faculty` + `student` + `public` context
- `admin`: full context + governance endpoints

Scope is enforced both at API authorization and retrieval context level.

## Performance Notes

- Short-lived response caches are used for notifications, faculty directory, and course directory.
- Audit query rows are pruned periodically to avoid unbounded growth.
- OpenRouter timeout/retry/backoff are configurable.
- Pinecone query timeout is configurable.

## Operational Notes

- Run migrations/runtime checks: `python migrate.py`
- Seed/reset controlled datasets: `python seed.py`
- Frontend build check: `npm run build`
- Keep secrets in `.env` only; never commit secrets.
