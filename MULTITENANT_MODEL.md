# Multi-Tenant Architecture — afrus Wolverine

**Version:** 1.0
**Date:** April 2026

---

## Overview

Wolverine is a **multi-tenant SaaS** commercial agent. Multiple afrus clients share the same Wolverine deployment, but each client's data is strictly isolated.

The isolation boundary is the **Organization** — every client in Wolverine is one Organization, and every data record belongs to exactly one Organization.

---

## Two-Level Organization Model

| Concept | Description |
|---|---|
| **Wolverine Organization** | The client as represented in Wolverine. Has its own `organization_id` (UUID), data, users, and pipeline. |
| **afrus Organization** | The client's account in the afrus platform. Identified by `afrus_org_id` and authenticated via `afrus_api_key`. |

A Wolverine Organization maps to **one afrus account**. Multiple afrus accounts = multiple Wolverine Organizations.

---

## Data Isolation

### Row Level Security (RLS)

PostgreSQL RLS policies enforce isolation at the database engine level. Every query to tenant-scoped tables automatically includes `organization_id = :current_org_id`.

```sql
-- Example: RLS policy on leads table
CREATE POLICY leads_org_isolation ON leads
  USING (organization_id = current_setting('app.current_org_id')::uuid);
```

No application-level filter can accidentally leak data between organizations. If the filter is missing in code, the database rejects the query.

### Tables that are Tenant-Scoped (have RLS)

- `leads`
- `users`
- `tags`
- `stage_transition_log`
- `action_tag_log`
- `sync_log`
- `sync_tags`

### Tables that are NOT Tenant-Scoped

- `organizations` (the tenant registry itself — seeded by admins)
- `lost_reasons` (global catalog per organization)
- `pipeline_stages` (global catalog per organization)

---

## Organization Table Schema

```sql
organizations
├── organization_id     UUID (PK)
├── afrus_org_id       VARCHAR      -- afrus account ID for this client
├── afrus_api_key      VARCHAR      -- per-client API key (encrypted at rest)
├── name               VARCHAR
├── domain             VARCHAR
├── is_customer        BOOLEAN
├── created_at         TIMESTAMP
└── updated_at         TIMESTAMP
```

> `afrus_api_key` is the API key that Wolverine uses when making API calls **to afrus** on behalf of this organization. Each client provides their own afrus API key during onboarding.

---

## Sync Tags — How Lead Extraction Works

Sync is **on-demand**, not scheduled. The mechanism:

```
Organization Admin creates Sync Tag:
  tag_value      = "fundraiser_leads"     (Wolverine name)
  afrus_tag_name = "fundraiser_leads"     (afurs tag filter)
  description    = "Monthly donor leads for nurturing"
        ↓
User or API triggers extraction for this sync tag
        ↓
Wolverine reads afrus_api_key from Organizations table
        ↓
Wolverine calls afrus API:
  GET /leads?tag=fundraiser_leads
  (using this org's own afrus_api_key)
        ↓
afurs returns only leads with tag "fundraiser_leads"
        ↓
Wolverine upserts leads by email (PK)
        ↓
Leads now appear in Wolverine pipeline
```

---

## Lead Identity — Email as PK

| Field | Role |
|---|---|
| `email` | Primary Key. Uniquely identifies a person across systems. |
| `afrus_lead_id` | Stored as a field — used for afrus API sync reference, but does NOT determine identity. |

**Why email as PK?**
- afrus uses internal numeric IDs that can change across exports
- Email is stable, globally unique per person
- A person can be matched across systems (Wolverine, afrus, email) reliably
- If the same email appears in two different Organizations, they are treated as different leads (organization_id scope applies)

---

## Sync Flow — Complete Diagram

```
User (or API)
    ↓ triggers extraction
Wolverine — SyncTrigger
    ↓ reads org's afrus_api_key
Organizations table (per-org key lookup)
    ↓
Afrus API — GET /leads?tag=<sync_tag.afrus_tag_name>
(using org's own afrus_api_key)
    ↓
Afrus returns matching leads (paginated)
    ↓
Wolverine: upsert by email
  - New leads → INSERT
  - Existing leads (matched by email) → UPDATE
    ↓
Stage tag applied (default: stage:new)
Origin tags applied (from afrus metadata)
Sync log written
    ↓
User notified: extraction complete — N leads imported
```

---

## API Key Management

| Stage | How API Key is Used |
|---|---|
| Onboarding | Client provides afrus API key → stored encrypted in `organizations.afrus_api_key` |
| Extraction | Wolverine reads `afrus_api_key` for the target organization from DB |
| API Calls | Key is passed in `Authorization: Bearer <key>` header to afrus |
| Key Rotation | Admin updates key via Wolverine Admin CLI/API — takes effect on next sync |

---

## PostgreSQL Schema — Key Relationships

```
organizations
  └── organization_id (PK)

users
  └── organization_id (FK → organizations)

leads
  └── organization_id (FK → organizations)
  └── email (PK, not FK)

tags
  └── organization_id (FK → organizations)

sync_tags
  └── organization_id (FK → organizations)

stage_transition_log
  └── organization_id (FK → organizations)
  └── lead_email (FK → leads.email)

sync_log
  └── organization_id (FK → organizations)
```

---

## RLS Enforcement Example

```sql
-- Wolverine sets session context before queries:
SET app.current_org_id = 'uuid-of-org-123';

-- All queries to leads table now automatically filter:
SELECT * FROM leads;
-- Executed as:
-- SELECT * FROM leads WHERE organization_id = 'uuid-of-org-123';
```

If a bug in application code omits the `organization_id` filter, RLS ensures the query returns **zero rows** for the wrong organization — not data leakage.
