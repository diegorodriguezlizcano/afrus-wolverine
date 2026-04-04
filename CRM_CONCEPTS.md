# afrus-Wolverine — CRM Commercial System
## Core Concepts & Data Model

**Version:** 1.3
**Date:** April 2026
**Status:** Draft — for Diego's review

---

## 1. Overview

Wolverine is a multi-tenant SaaS commercial agent that extracts leads from the afrus CRM via API, classifies them as potential buyers, and manages the full sales lifecycle through a structured tag system.

The system operates on four core entities: **Organizations**, **Leads**, **Users (SDRs)**, and **Tags**. All commercial state is expressed through tags.

### Multi-Tenant Architecture

Wolverine serves multiple afrus clients simultaneously. Each client = one **Organization** in Wolverine. Every table carries `organization_id` as a mandatory foreign key. Data is strictly isolated per organization via Row Level Security (RLS) in PostgreSQL.

### Two-Level Organization Model

| Concept | Description |
|---|---|
| **Wolverine Organization** | The client as represented in Wolverine's database. Has `organization_id` (UUID, PK) and `afrus_org_id` linking to afrus. Also stores `afrus_api_key` — the API key for that specific client's afrus account. |
| **afrus Organization** | The organization record inside the afrus platform. The `afrus_org_id` and `afrus_api_key` fields link a Wolverine Organization to its corresponding afrus account. |

> Every Wolverine Organization has its **own afrus API key**. Wolverine uses the org's own key when making API calls to afrus on behalf of that client.

---

## 2. Wolverine Admin

Wolverine has two user modes:

| Mode | Description |
|---|---|
| **SDR Mode** | Standard user — manages leads, tags, stages within their organization |
| **Admin Mode** | Can CRUD all administrable tables: origins, lost reasons, tags, users, organizations |

Admin-level entities that require CRUD (API + CLI + UI):

- Origin tags
- Lost reasons
- Pipeline stages
- Tag definitions
- Organization management
- **Sync tags** (new)

---

## 3. Tag System

Tags are the core abstraction. Every tag has a **type** and a **value**. A lead carries one tag per type at any given time.

### 3.1 Tag Types

| Type | Purpose | Example |
|---|---|---|
| **Pipeline Stage** | Current stage in the commercial funnel | `stage:scheduled` |
| **Origin** | Where the lead came from | `origin:inbound`, `origin:linkedin` |
| **Temperature** | Heat level of the lead | `temp:hot`, `temp:warm`, `temp:cold` |
| **Action** | Triggers an automated action via ALMA | `action:send_drip_sequence` |
| **Sync** | Defines which leads to extract from afrus | `sync:fundraiser_leads`, `sync:monthly_donors` |

### 3.2 Tag Administration

All tags require full CRUD management via API, CLI, and UI. This is a minimum requirement for the system.

### 3.3 Sync Tags

Sync tags are the mechanism for extracting leads from afrus. Each sync tag maps to a tag name in afrus.

**How it works:**
1. Wolverine Admin creates a sync tag: `sync:fundraiser_leads` with `afrus_tag_name: "fundraiser_leads"`
2. User triggers on-demand sync for that sync tag
3. Wolverine calls afrus API: "give me all leads that have tag `fundraiser_leads`"
4. afrus returns those leads; Wolverine creates/updates them locally

Only leads matching the specified afrus tag are extracted. Multiple sync tags can exist per organization.

### 3.4 Action Tags & ALMA

When an action tag is assigned to a lead, it triggers a workflow in ALMA (afrus's AI agent). ALMA executes a sequence of actions bound to that tag.

---

## 4. Pipeline Stages

Two categories: **Active Stages** and **Terminal States**.

### Active Stages

| Stage | Description |
|---|---|
| **new** | Lead received — no contact made yet |
| **scheduled** | A meeting has been scheduled with the lead |
| **met** | Meeting has been held with the lead |
| **qualified** | Lead confirmed with need, budget, and urgency |
| **proposed** | Commercial proposal sent to the lead |
| **negotiating** | Active discussion on terms or pricing |
| **future** | Lead alive but on hold until a defined future date |

### Terminal States

| State | Description |
|---|---|
| **won** | Deal closed successfully. Lead became an afrus customer. |
| **lost** | Deal closed without success. Reason must be documented. |

**Total: 7 active stages + 2 terminal states = 9 pipeline states**

### Future Stage Rules

- Must store `next_contact_date` (target date)
- Wolverine auto-reactivates to `new` 30 days before `next_contact_date`
- Does not count toward active pipeline metrics

---

## 5. Lead Temperature

One temperature tag per lead at any given time.

| Temperature | Description |
|---|---|
| **hot** | High urgency. Lead wants to decide soon, has budget approved or in process |
| **warm** | Interested but timing undefined |
| **cold** | No active interest. Exploring or on hold |

---

## 6. Lead Origin

### Origin Fields (from afrus)

Every lead carries the following origin metadata pulled from afrus at extraction time:

| Field | Type | Description |
|---|---|---|
| `campaign_id` | string | afrus campaign identifier |
| `campaign_name` | string | Name of the campaign |
| `widget_id` | string | Widget identifier |
| `widget_name` | string | Widget name |
| `is_imported` | boolean | Was the lead imported? |
| `url` | string | Landing page URL |
| `utm_campaign` | string | UTM campaign tag |

### Origin Tags

Separately, origin tags are assigned to categorize the lead source:

| Category | Values |
|---|---|---|
| **Inbound** | `origin:website`, `origin:form`, `origin:chat` |
| **Outbound** | `origin:cold_email`, `origin:linkedin`, `origin:call` |
| **Referral** | `origin:partner`, `origin:client_referral`, `origin:event` |
| **Platform** | `origin:afrus_trial`, `origin:afrus_signup` |

Origin tags are **administratable** — CRUD required via Admin mode.

---

## 7. Organization

Every lead must belong to exactly one Organization. Organizations are the primary account unit.

### Organization (v1)

| Field | Type | Description |
|---|---|---|
| `org_id` | UUID | Primary key |
| `name` | string | Organization legal name |
| `domain` | string | Website domain |
| `is_customer` | boolean | Is this org already paying afrus? |
| `afrus_org_id` | string | Organization ID in afrus platform |
| `afrus_api_key` | string | API key for this client's afrus account (stored securely) |

> `afrus_api_key` is stored encrypted at rest. Used by the sync engine to make API calls to afrus on behalf of this organization.

### Lead ↔ Organization

- Every lead belongs to exactly one organization
- The relationship is mandatory (not optional)
- Fields: `lead_id`, `org_id`, `contact_role`

### Owner ↔ Organization

SDRs are assigned to **organizations**, not directly to leads. The SDR who owns the organization manages all leads within it.

- One owner per organization
- Owner is a User (human SDR or AI agent)
- Fields: `org_id`, `owner_id`

### Organization Status

- Critical distinction: **prospect** vs. **customer**
- If `is_customer = true`: upsell/cross-sell motion — pipeline stage relevant only for expansion deals

---

## 8. Lead

### Lead Identity

**Primary key: `email`** (email address of the contact)

The lead's identity is determined by email — not by afrus_lead_id. This allows leads to be matched across systems reliably.

| Field | Type | Description |
|---|---|---|
| `email` | string | Primary key. Contact's email address. |
| `afrus_lead_id` | string | Lead ID in afrus (not PK — used for sync mapping) |
| `org_id` | UUID | FK → Organization. Mandatory. |
| `first_name` | string | Contact first name |
| `last_name` | string | Contact last name |
| `phone` | string | Phone number |
| `title` | string | Job title |
| `contact_role` | string | Role in the organization (decision maker, influencer, etc.) |

### Why Email as PK?

- afrus uses internal numeric IDs that can collide or change across exports
- Email is stable, unique per person, and human-readable
- afrus_lead_id is stored as a field for reference and sync purposes, but does not determine identity

---

## 9. Lead Ownership

Every lead has exactly one **owner**: a User (SDR) who owns the **organization** the lead belongs to.

### User (≡ SDR)

| Field | Type | Description |
|---|---|---|
| `user_id` | UUID | Primary key |
| `org_id` | UUID | FK → Organization. User belongs to one org. |
| `type` | enum | `human` or `agent` |
| `email` | string | Email address (login) |
| `name` | string | First name |
| `lastname` | string | Last name |
| `phone` | string | Phone number |
| `afrus_user_id` | string | User ID inside afrus platform |

> Note: `type = agent` is for AI-driven SDRs (like Wolverine itself or ALMA) that can own leads in the system.

### User Responsibilities

**A. Tag Administration**
Administrate all tag types: create, assign, remove, update on leads.

**B. Lead Stage Administration**
Change the pipeline stage of a lead. Only the assigned user (or an admin) can do this.

### Who Can Change What

| Field | Who Can Change |
|---|---|
| Pipeline Stage | Org owner (User) |
| Temperature | Org owner (User) |
| Action Tags | Org owner or ALMA |
| Origin Tags | Wolverine (at extraction) or User |
| Organization | Admin only |
| Sync Tags | Admin only |

---

## 10. On-Demand Sync from afrus

Sync is **never automatic on a schedule**. It is triggered **on-demand**.

### Sync Trigger

User (or API call) specifies a **sync tag** → Wolverine fetches from afrus only the leads that carry the corresponding tag in afrus.

### Sync Flow

```
User selects sync tag "fundraiser_leads"
        ↓
Wolverine reads afrus_api_key from Organization
        ↓
Wolverine calls afrus API:
  "GET /leads?tag=fundraiser_leads"
        ↓
afus returns matching leads
        ↓
Wolverine creates/updates leads locally
(upsert by email — PK match)
        ↓
Sync complete. User notified.
```

### Sync Tag Management

Each sync tag stores:
- `tag_value` — the name used in Wolverine (e.g., `fundraiser_leads`)
- `afrus_tag_name` — the corresponding tag name in afrus (may differ)

CRUD for sync tags is part of Admin mode.

---

## 11. Lost Reasons

When a lead reaches `lost`, a reason must be documented. Lost reasons are **administratable** — CRUD required via Admin mode.

Default values:

| Reason | Description |
|---|---|
| `not_answered` | No response after 3+ contact attempts |
| `no_budget` | Lead has no budget for afrus |
| `no_authority` | Talking to non-decision-maker |
| `timing` | Good fit but wrong timing |
| `competitor` | Went with a competitor |
| `no_need` | No clear fundraising need |
| `too_small` | Organization too small for afrus scope |

---

## 12. Quick Reference — All Concepts Summary

| Concept | Count | Notes |
|---|---|---|
| Tag Types | 5 | stage, origin, temperature, action, sync |
| Pipeline Stages | 9 | 7 active + 2 terminal |
| Temperatures | 3 | hot, warm, cold |
| Origin Tags | Open set | CRUD admin required |
| Sync Tags | Open set | CRUD admin required |
| Origin Fields (from afrus) | 7 | campaign_id, url, utm_campaign, etc. |
| User Types | 2 | human, agent |
| Org Fields (v1) | 7 | id, name, domain, is_customer, afrus_org_id, afrus_api_key |
| Lost Reasons | Open set | CRUD admin required |
| Wolverine Modes | 2 | SDR mode, Admin mode |
| Lead PK | email | Not afrus_lead_id |
| Sync Mode | on-demand | Not scheduled |
