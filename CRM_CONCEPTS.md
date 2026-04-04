# afrus-Wolverine — CRM Commercial System
## Core Concepts & Data Model

**Version:** 1.1
**Date:** April 2026
**Status:** Draft — for Diego's review

---

## 1. Overview

Wolverine is an orchestrator layer that extracts leads from the afrus CRM via API, classifies them as potential buyers, and manages the full commercial sales lifecycle through a structured tag system.

The system operates on three core entities: **Leads**, **Organizations**, and **Users (SDRs)**. All commercial state is expressed through tags.

Every lead **must belong to one Organization**. Organizations are the primary account unit — SDRs are assigned to organizations, not to individual leads.

---

## 2. Wolverine Admin

Wolverine has two user modes:

| Mode | Description |
|---|---|
| **SDR Mode** | Standard user — manages leads, tags, stages |
| **Admin Mode** | Can CRUD all administrable tables: origins, lost reasons, tags, users, organizations |

Admin-level entities that require CRUD (API + CLI + UI):

- Origin tags
- Lost reasons
- Pipeline stages
- Tag definitions
- Organization management

---

## 3. Tag System

Tags are the core abstraction. Every tag has a **type** and a **value**. A lead carries zero or more tags at any time.

### 3.1 Tag Types

| Type | Purpose | Example |
|---|---|---|
| **Pipeline Stage** | Current stage in the commercial funnel | `stage:scheduled` |
| **Origin** | Where the lead came from | `origin:inbound`, `origin:linkedin` |
| **Temperature** | Heat level of the lead | `temp:hot`, `temp:warm`, `temp:cold` |
| **Action** | Triggers an automated action via ALMA | `action:send_drip_sequence` |

### 3.2 Tag Administration

All tags require full CRUD management via API, CLI, and UI. This is a minimum requirement for the system.

### 3.3 Action Tags & ALMA

When an action tag is assigned to a lead, it triggers a workflow in ALMA (afrus's AI agent). ALMA executes a sequence of actions bound to that tag (e.g., send onboarding email, run nurturing sequence, etc.).

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

### Lead ↔ Organization

- Every lead belongs to exactly one organization
- The relationship is mandatory (not optional)
- Fields: `lead_id`, `org_id`, `contact_role` (e.g., "decision maker", "influencer", "end user")

### Owner ↔ Organization

SDRs are assigned to **organizations**, not directly to leads. The SDR who owns the organization manages all leads within it.

- One owner per organization
- Owner is a User (human SDR or AI agent)
- Fields: `org_id`, `owner_id`

### Organization Status

- Critical distinction: **prospect** vs. **customer**
- Pulled from afrus via `newadmin API` at extraction time
- If `is_customer = true`: upsell/cross-sell motion — pipeline stage relevant only for expansion deals

---

## 8. Lead Ownership

Every lead has exactly one **owner**: a User (SDR) who owns the **organization** the lead belongs to.

### User (≡ SDR)

| Field | Type | Description |
|---|---|---|
| `user_id` | UUID | Primary key |
| `type` | enum | `human` or `agent` |
| `email` | string | Email address |
| `name` | string | First name |
| `lastname` | string | Last name |
| `phone` | string | Phone number |
| `afrus_user_id` | string | User ID inside afrus platform (not a lead ID) |

> Note: `type = agent` is for AI-driven SDRs (like Wolverine itself or ALMA) that can own leads in the system.

### User Responsibilities

**A. Tag Administration**
Administrate all tag types: create, assign, remove, update on leads.

**B. Lead Stage Administration**
Change the pipeline stage of a lead. Only the assigned user (or an admin) can do this.

### Who Can Change What

| Field | Who Can Change |
|---|---|
| Pipeline Stage | Assigned User (org owner) |
| Temperature | Assigned User (org owner) |
| Action Tags | Assigned User (org owner) or ALMA (automated) |
| Origin Tags | Wolverine (at extraction) or User |
| Organization | User (admin only) |

---

## 9. Lead Extraction from afrus

- Wolverine extracts leads via **afrus API v1**
- Extraction scope: all leads in the organization's pipeline
- Origin fields (campaign_id, url, etc.) captured at extraction time
- Origin tag assigned by Wolverine at extraction time
- afrus tags mapped to Wolverine pipeline stages where applicable
- New leads entering afrus after extraction are picked up on next sync

---

## 10. Lost Reasons

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

## 11. Quick Reference — All Concepts Summary

| Concept | Count | Notes |
|---|---|---|
| Tag Types | 4 | stage, origin, temperature, action |
| Pipeline Stages | 9 | 7 active + 2 terminal |
| Temperatures | 3 | hot, warm, cold |
| Origin Tags | Open set | CRUD admin required |
| Origin Fields (from afrus) | 7 | campaign_id, url, utm_campaign, etc. |
| User Types | 2 | human, agent |
| Org Fields (v1) | 4 | id, name, domain, is_customer |
| Lost Reasons | Open set | CRUD admin required |
| Wolverine Modes | 2 | SDR mode, Admin mode |
