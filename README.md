# afrus-Wolverine
## Commercial Agent — afrus Pipeline Orchestrator

**Status:** In development
**Architecture:** Multi-Tenant SaaS
**Stack:** Docker · Nest.js CLI · REST API · PostgreSQL (RLS) · LLM Abstraction Layer (EZRI + OpenRouter + DeepInfra)

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
- **Tag Types (5):** Pipeline Stage | Origin | Temperature | Action | **Sync** (on-demand extraction filter)
- **Lead Identity:** Email as Primary Key (not afrus_lead_id)
- **Sync Mode:** On-demand, based on Sync Tags — no automatic scheduled extraction
- **Owner Model:** SDRs are assigned to Organizations — not to individual leads

---

## Architecture

```
Wolverine (Docker — multi-tenant)
  ├── PostgreSQL (RLS enforced — per-org data isolation)
  ├── afrus API (per-org API key from organizations table)
  ├── LLM Layer (EZRI / OpenRouter / DeepInfra)
  └── ALMA (action tag execution)
```

### Interfaces

| Interface | Technology |
|---|---|
| CLI | Nest.js |
| API | REST |
| Web UI | TBD |

---

## Key Documents

| Document | Description |
|---|---|
| `CRM_CONCEPTS.md` | Core entities, tag system, ownership model, v1.3 |
| `MULTITENANT_MODEL.md` | Multi-tenant architecture, RLS, sync tag mechanism |
| `ContextArchitectInput.md` | Technical constraints and integrations |
| `Roadmap.md` | 24 issues across 6 phases (ISS-001 → ISS-024) |

---

## Getting Started

```bash
# Clone
git clone https://github.com/diegorodriguezlizcano/afrus-wolverine.git
cd afrus-wolverine

# Setup
cp .env.example .env
# Fill in organization onboarding + LLM keys

# Build
docker-compose up --build
```

---

## Roadmap

| Phase | Focus | Issues |
|---|---|---|
| 0 | Infrastructure | ISS-001 → ISS-003 |
| 1 | Core Logic | ISS-004 → ISS-008 |
| 2 | afrus Integration (on-demand) | ISS-009 → ISS-012 |
| 3 | Wolverine Agent (LLM) | ISS-013 → ISS-016 |
| 4 | Interfaces | ISS-017 → ISS-019 |
| 5 | ALMA Integration | ISS-020 → ISS-022 |
| 6 | Sync On-Demand Engine | ISS-023 → ISS-024 |

**Infrastructure complete:** ISS-001 ✅ (Docker scaffold) + ISS-002 ✅ (PostgreSQL schema + RLS)

---

## License

Private — afrus internal use.
