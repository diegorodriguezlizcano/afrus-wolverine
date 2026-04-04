# afrus-Wolverine
## Commercial Agent — afrus Pipeline Orchestrator

**Status:** In development
**Stack:** Docker · Nest.js CLI · REST API · PostgreSQL · LLM Abstraction Layer (EZRI + OpenRouter + DeepInfra)

---

## What is this?

Wolverine is an AI-powered commercial agent that extracts leads from the afrus CRM, classifies them as potential buyers, and manages the full sales lifecycle through a structured pipeline system.

It operates as an orchestration layer over afrus — not a replacement. Wolverine tracks commercial state (pipeline stages, temperatures, tags, activities) that lives separately from afrus's core donor data, and synchronizes back to afrus via API.

---

## Core Concepts

- **Pipeline Stages:** new → scheduled → met → qualified → proposed → negotiating → won / lost / future
- **Tag Types:** Pipeline Stage | Origin | Temperature | Action
- **Entities:** Leads, Organizations, Users (SDRs), Tags, Activities, Lost Reasons
- **Owner Model:** SDRs are assigned to Organizations — not to individual leads
- **Action Tags:** Trigger ALMA (afrus AI agent) workflows

---

## Architecture

```
Wolverine (Docker)
  ├── afrus API (lead extraction + sync)
  ├── PostgreSQL (commercial state)
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

- `CRM_CONCEPTS.md` — Core entities, tag system, ownership model
- `ContextArchitectInput.md` — Technical constraints and integrations
- `Roadmap.md` — 22 issues across 6 phases (ISS-001 → ISS-022)

---

## Getting Started

```bash
# Clone
git clone https://github.com/diegorodriguezlizcano/afrus-wolverine.git
cd afrus-wolverine

# Setup
cp .env.example .env
# Fill in AFRUS_API_KEY, LLM keys, etc.

# Build
docker-compose up --build
```

---

## Roadmap

| Phase | Focus | Issues |
|---|---|---|
| 0 | Infrastructure | ISS-001 → ISS-003 |
| 1 | Core Logic | ISS-004 → ISS-008 |
| 2 | afrus Integration | ISS-009 → ISS-012 |
| 3 | Wolverine Agent (LLM) | ISS-013 → ISS-016 |
| 4 | Interfaces | ISS-017 → ISS-019 |
| 5 | ALMA Integration | ISS-020 → ISS-022 |

**First issue:** ISS-001 — Docker scaffold.

---

## License

Private — afrus internal use.
