# afrus-Wolverine
## Commercial Agent — afrus Pipeline Orchestrator

**Status:** Production-ready (22/24 issues delivered)
**Architecture:** Multi-Tenant SaaS
**Stack:** Docker · Nest.js · REST API + Swagger · PostgreSQL (RLS) · Prisma ORM · LLM Abstraction Layer

---

## What is this?

Wolverine is an AI-powered commercial agent that extracts leads from the afrus CRM, classifies them as potential buyers, and manages the full sales lifecycle through a structured pipeline system.

It operates as an **orchestration layer over afrus** — not a replacement. Wolverine tracks commercial state (pipeline stages, temperatures, tags, activities) that lives separately from afrus's core donor data, and synchronizes back to afrus via API.

**Wolverine is multi-tenant.** Multiple afrus clients share the same deployment. Each client's data is strictly isolated via PostgreSQL Row Level Security (RLS).

---

## Multi-Tenant Architecture

- Each afrus client = one **Organization** in Wolverine
- Every record belongs to exactly one Organization
- Each Organization has its **own afrus API key** stored in Wolverine
- Sync is **on-demand**, triggered per Organization via **Sync Tags**
- Data isolation enforced at the database level (RLS)

---

## Core Concepts

- **Pipeline Stages:** new → scheduled → met → qualified → proposed → negotiating → won / lost / future
- **Tag Types (5):** stage | origin | temp | action | sync
- **Lead Identity:** Email as Primary Key (not afrus_lead_id)
- **Sync Mode:** On-demand, based on Sync Tags — no automatic scheduled extraction
- **Owner Model:** SDRs are assigned to Organizations

---

## Architecture

```
Wolverine (Docker — multi-tenant)
  ├── PostgreSQL (RLS enforced — per-org data isolation)
  ├── afrus API (per-org API key from organizations table)
  ├── LLM Layer (OpenRouter / DeepInfra)
  └── ALMA (action tag execution via webhook)
```

### Interfaces

| Interface | Endpoint | Status |
|---|---|---|
| CLI | `docker exec wolverine <command>` | ✅ |
| REST API | `http://localhost:3000/api` | ✅ |
| Swagger Docs | `http://localhost:3000/api/docs` | ✅ |
| Web UI (Kanban) | `http://localhost:3000/ui` | ✅ |
| Health Check | `http://localhost:3000/health` | ✅ |

---

## Key Documents

| Document | Description |
|---|---|
| `Roadmap.md` | 24 issues — 22 delivered, 2 skipped |
| `CRM_CONCEPTS.md` | Core entities, tag system, ownership model |
| `MULTITENANT_MODEL.md` | Multi-tenant architecture, RLS, sync tag mechanism |
| `DEVELOPMENT_WORKFLOW.md` | Development process and completion gates |

---

## Getting Started

```bash
# Clone
git clone https://github.com/diegorodriguezlizcano/afrus-wolverine.git
cd afrus-wolverine

# Setup environment
cp .env.example .env
# Fill in all required values (see Environment Variables below)

# Build and start
docker-compose up --build

# Run migrations (first time)
docker-compose exec wolverine npx prisma migrate deploy

# Seed default data
docker-compose exec wolverine npx prisma db seed
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

### Required — Database
```bash
DATABASE_HOST=localhost
DATABASE_PORT=5432
DATABASE_NAME=wolverine
DATABASE_USER=wolverine
DATABASE_PASSWORD=<strong-password>
DATABASE_URL="postgresql://wolverine:<password>@localhost:5432/wolverine?sslmode=disable"
```

### Required — JWT (REST API auth)
```bash
JWT_SECRET=<random-string-at-least_20_chars>
JWT_EXPIRES_IN=7d
```

### Required — LLM Provider (choose one)
```bash
LLM_PROVIDER=openrouter          # or: deepinfra
OPENROUTER_API_KEY=<your-key>    # get from https://openrouter.ai
# OR
DEEPINFRA_API_KEY=<your-key>     # get from https://deepinfra.com
```

### Required — afrus API
```bash
AFRUS_API_URL=https://backend.afrus.app
AFRUS_API_KEY=<your-afrus-api-key>
```

### Optional — ALMA Webhook
```bash
ALMA_WEBHOOK_URL=https://backend.afrus.app/api/v1/alma/webhook
ALMA_WEBHOOK_SECRET=<secret>
```

---

## Roadmap

| Phase | Focus | Issues | Status |
|---|---|---|---|
| 0 | Infrastructure | ISS-001 → ISS-003 | ✅ Complete |
| 1 | Core Logic | ISS-004 → ISS-008 | ✅ Complete |
| 2 | afrus Integration | ISS-009 → ISS-012 | ✅ Complete |
| 3 | Wolverine Agent (LLM) | ISS-013 → ISS-016 | ✅ Complete |
| 4 | Interfaces | ISS-017 → ISS-019 | ✅ Complete |
| 5 | ALMA Integration | ISS-020 → ISS-022 | ⏭ Skipped |
| 6 | Sync On-Demand | ISS-023 → ISS-024 | ✅ Complete |

**Delivered: 21 issues. Skipped: ISS-020, ISS-021, ISS-022.**

---

## License

Private — afrus internal use.
