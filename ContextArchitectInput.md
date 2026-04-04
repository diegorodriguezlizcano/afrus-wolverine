# Context — Architect Input

**Project:** afrus-Wolverine Commercial Agent
**Date:** April 2026
**Status:** Draft

---

## Infrastructure

- Designed to run on a **dockerized container**
- Portable across environments (local, cloud, self-hosted)

---

## LLM Integration

- **Native integration via EZRI** — afrus's internal AI agent
- **Direct integration** with external LLM providers for flexibility:
  - DeepInfra
  - OpenRouter
  - Other popular LLM gateways
- The system can route AI requests to any configured provider
- API keys managed via `.env` variables

---

## Skills System

- Dynamic **skills as `.md` files**
- Skills allow the system to self-improve at runtime
- Skills follow a standard format (compatible with OpenClaw skill ecosystem)
- Skills can be added, updated, or replaced without redeploying

---

## Integrations

- **afrus Backend API** — `https://backend.afrus.app/docs`
  - Lead extraction
  - Tag management
  - Organization data
  - User management
  - Communication channels
- API keys stored securely in `.env`

---

## Interfaces

| Interface | Technology | Status |
|---|---|---|
| **API** | REST | To define |
| **CLI** | Nest.js | To build |
| **UI Frontend** | TBD | Stack not defined yet |

---

## Security

- All sensitive keys (LLM providers, afrus API, etc.) stored in `.env`
- `.env` is **never committed** to source control
- Secrets accessed at runtime via environment variables

---

## Note

This document is input for architectural decisions. It defines the non-negotiable constraints of the system.
