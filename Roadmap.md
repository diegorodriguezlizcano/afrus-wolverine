# afrus-Wolverine — Roadmap

**Version:** 2.0
**Date:** April 2026
**Status:** Draft

---

## 1. Persistence Recommendation

### v1 — PostgreSQL + Multi-Tenant

PostgreSQL is the persistence layer from day one. The multi-tenant architecture requires:

- **Row Level Security (RLS):** Every query to `leads`, `organizations`, `users`, `tags`, and related tables must be scoped to `organization_id`. RLS policies enforce isolation at the database level — no application-level filter can accidentally leak data between organizations.
- **Organization-scoped API calls:** The afrus API key is per-organization. Every sync operation uses the `afrus_api_key` belonging to the specific organization being synced.
- **Connection pooling:** pgBouncer manages connection pooling per database. Each organization's API requests share a pool — no per-org database servers.

### When to Consider Distributed Database

| Trigger | Threshold |
|---|---|
| Multi-region deployment | afrus expands to EU/NA with regional teams |
| 100K+ leads | Above this, a single PostgreSQL instance may bottleneck |

---

## 2. Stage Transition Rule Engine

All pipeline stage transitions follow the format below.

**Legend for ownership of actions:**
- `Wolverine-auto` — Wolverine applies this action automatically, no human input
- `ALMA` — ALMA (afrus AI agent) executes the action as a consequence of an `action:` tag
- `Human` — The SDR (or Admin) must perform this action manually

**Legend for sync:**
- `SYNC_TO_AFRUS: yes` — Wolverine must push this change back to afrus via API
- `SYNC_TO_AFRUS: no` — This is Wolverine-internal state; no afrus API call required

---

### 2.1 SLA Rules by Stage

| Stage | SLA (days) | Alert Owner |
|---|---|---|
| new | 2 | SDR |
| scheduled | 7 | SDR |
| met | 5 | SDR |
| qualified | 10 | SDR + ALMA |
| proposed | 14 | SDR |
| negotiating | 21 | SDR + Admin |
| future | N/A | Wolverine auto |

### 2.2 Stale Rules by Stage

| Stage | Condition | Action |
|---|---|---|
| new | No contact in 3 days | Wolverine → `temp:cold` + SDR alert |
| scheduled | Meeting not confirmed in 5 days | Wolverine alerts SDR |
| met | No advancement in 7 days | Wolverine alerts SDR |
| qualified | No advancement in 14 days | Wolverine → `temp:cold` |

---

### 2.3 Transition Rules

#### ON `new` → `scheduled`

**CONDITIONS:**
- Meeting time confirmed by lead
- At least one contact channel verified (email or phone)

**ACTIONS:**
- Log `scheduled_at` timestamp (Wolverine-auto)
- Assign or confirm `scheduled_by` (user_id of SDR — org owner)
- Set `temp:warm` if currently `temp:cold` (Wolverine-auto)
- If `action:meeting_scheduled` tag exists, trigger ALMA (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push `stage:scheduled` to afrus via API
- Yes — update `next_meeting_date` on the afrus lead record if supported

---

#### ON `new` → `lost`

**CONDITIONS:**
- SDR or Admin explicitly marks the lead as lost
- A `lost_reason` tag is assigned at the same time (mandatory — system enforces this)

**ACTIONS:**
- `stage:new` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `scheduled` → `met`

**CONDITIONS:**
- The scheduled meeting has occurred (SDR confirms manually)
- Meeting outcome is logged

**ACTIONS:**
- `stage:scheduled` → `stage:met` (Human — SDR confirms)
- Log `met_at` timestamp (Wolverine-auto)
- Set `temp:warm` or `temp:hot` depending on meeting outcome (Human)
- If `action:post_meeting_followup` tag exists, trigger ALMA (ALMA)
- Clear `action:meeting_scheduled` tag if still present (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:met` to afrus

---

#### ON `scheduled` → `lost`

**CONDITIONS:**
- Scheduled meeting did not occur and cannot be rescheduled
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:scheduled` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` and `lost_by` (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `met` → `qualified`

**CONDITIONS:**
- SDR confirms all three qualification criteria:
  1. **Need**: Confirmed fundraising or donor management need
  2. **Budget**: Confirmed or likely within 90 days
  3. **Urgency**: Timeline defined

**ACTIONS:**
- `stage:met` → `stage:qualified` (Human — SDR who owns the org)
- Log `qualified_at` timestamp (Wolverine-auto)
- Set `temp:warm` or `temp:hot` (Human — SDR decides)
- If `action:start_qualification_nurture` configured, trigger ALMA (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push `stage:qualified` to afrus

---

#### ON `met` → `lost`

**CONDITIONS:**
- Lead met but SDR determines deal is not viable
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:met` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` and `lost_by` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `qualified` → `proposed`

**CONDITIONS:**
- Commercial proposal sent to lead
- Proposal date logged

**ACTIONS:**
- `stage:qualified` → `stage:proposed` (Human — SDR)
- Log `proposed_at` timestamp (Wolverine-auto)
- Set `temp:hot` if proposal matches budget and urgency (Human)
- If `action:proposal_sent` tag exists, trigger ALMA (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push `stage:proposed` to afrus

---

#### ON `qualified` → `future`

**CONDITIONS:**
- Lead is qualified but timing is not right
- `next_contact_date` is set (mandatory — between 31 and 365 days from today)

**ACTIONS:**
- `stage:qualified` → `stage:future` (Human — SDR sets date)
- Wolverine schedules reactivation job at `next_contact_date - 30 days` (Wolverine-auto)
- Set `temp:warm` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto — re-evaluate on reactivation)

**SYNC_TO_AFRUS:**
- Yes — push `stage:future` to afrus

---

#### ON `qualified` → `lost`

**CONDITIONS:**
- Lead was qualified but deal died
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:qualified` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` and `lost_by` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `proposed` → `negotiating`

**CONDITIONS:**
- Lead responded to proposal with active interest
- Active discussion on pricing, terms, or scope

**ACTIONS:**
- `stage:proposed` → `stage:negotiating` (Human — SDR updates)
- Log `negotiating_since` timestamp (Wolverine-auto)
- Set `temp:hot` (Wolverine-auto)
- If `action:negotiation_started` tag exists, trigger ALMA (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push `stage:negotiating` to afrus

---

#### ON `proposed` → `lost`

**CONDITIONS:**
- Proposal sent and lead went silent or declined
- Mandatory `lost_reason` tag assigned
- Wolverine auto-alerts if lead in `proposed` > 18 days without advancement

**ACTIONS:**
- `stage:proposed` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` and `lost_by` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `negotiating` → `won`

**CONDITIONS:**
- Contract signed or verbal/written commitment from authorized signatory
- `deal_value` recorded (optional but recommended)

**ACTIONS:**
- `stage:negotiating` → `stage:won` (Human — SDR or Admin)
- Log `won_at` and `won_by` (Wolverine-auto)
- Log `deal_value` if provided (Human)
- If `action:deal_won` tag exists, trigger ALMA for onboarding sequence (ALMA)
- Wolverine notifies SDR and Admin of win (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:won` with `won_at` to afrus
- Yes — update afrus organization status to `is_customer = true` if applicable

---

#### ON `negotiating` → `lost`

**CONDITIONS:**
- Negotiation ended without a deal
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:negotiating` → `stage:lost` (Human)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` and `lost_by` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `future` → `new` (Wolverine Auto-Reactivation)

**CONDITIONS:**
- Current date `>= next_contact_date - 30 days` (early trigger)
- OR current date `>= next_contact_date` (hard deadline)

**ACTIONS:**
- `stage:future` → `stage:new` (Wolverine-auto — scheduler triggers this)
- Log `reactivated_at` timestamp (Wolverine-auto)
- Set `temp:warm` (Wolverine-auto)
- Create task for SDR: "Re-engage lead — target date was [date]" (Wolverine-auto)
- Clear `next_contact_date` after reactivation (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:new` to afrus (lead re-enters active pipeline)

---

## 3. Development Roadmap

**Phases:** 0 (Infrastructure) → 1 (Core Logic) → 2 (afrus Integration) → 3 (Wolverine Agent) → 4 (Interfaces) → 5 (ALMA Integration)

---

### Phase 0 — Infrastructure

**Purpose:** Docker scaffold, PostgreSQL multi-tenant schema with RLS, config management.

---

**ISS-001 — Project Scaffold and Docker Setup**

- **Description:** Bootstrap the Wolverine project with a `Dockerfile`, `docker-compose.yml`, and a `.env.example` template. The container must run locally and in any cloud environment without modification. Establish the project directory structure (`src/`, `tests/`, `scripts/`, `docs/`).
- **Deliverable:** `Dockerfile` building a working Wolverine image. `docker-compose.yml` with Wolverine + PostgreSQL. `.env.example` documenting all required environment variables.
- **Depends on:** None
- **Priority:** HIGH

---

**ISS-002 — PostgreSQL Multi-Tenant Database Schema and Migrations**

- **Description:** Define the complete PostgreSQL schema covering all entities: `organizations`, `leads`, `users`, `tags` (5 types), `lost_reasons`, `sync_tags`, `origins`, `stage_transition_log`, `action_tag_log`, `sync_log`. Use Prisma ORM with PostgreSQL. Implement Row Level Security (RLS) policies on all tenant-scoped tables. Set up versioned migrations (Prisma Migrate). Organization is the tenant unit — `organization_id` is mandatory on all data tables. Lead PK is `email` (not `afrus_lead_id`). `organizations` table stores `afrus_org_id` and `afrus_api_key` per organization. Seed default pipeline stages, lost reasons, and a default admin user per organization.
- **Deliverable:** `migrations/` directory with versioned migration scripts. Full schema with RLS policies enforced. Seed script. `docker-compose.yml` updated with PostgreSQL + persistent volume.
- **Depends on:** ISS-001
- **Priority:** HIGH

---

**ISS-003 — Secrets and Configuration Management**

- **Description:** Establish the `.env` loading pattern. All secrets (afrus API keys are per-organization — stored in DB, LLM provider keys from env) must be read at runtime. No secrets hardcoded or committed. Config validation on startup fails fast with clear errors.
- **Deliverable:** `src/config/` module loading and validating all configuration. Clear, actionable errors on missing required keys.
- **Depends on:** ISS-001
- **Priority:** HIGH

---

### Phase 1 — Core Logic

**Purpose:** Tag system, state machine, rule engine, SLA/stale monitoring. This is the heart of Wolverine.

---

**ISS-004 — Tag System (CRUD + Assignment Engine)**

- **Description:** Implement the tag data model and full CRUD for all 5 tag types: `stage:`, `origin:`, `temp:`, `action:`, `sync:`. Tag uniqueness per type per lead enforced (one stage tag, one temperature tag, etc.). CRUD accessible via API, CLI, and UI. Includes Sync Tags CRUD.
- **Deliverable:** Tag CRUD operations for all 5 types. Tag assignment and removal. One-tag-per-type invariant enforcement. Unit tests.
- **Depends on:** ISS-002
- **Priority:** HIGH

---

**ISS-005 — Pipeline Stage State Machine and Transition Validation**

- **Description:** Implement the pipeline stage state machine. Define valid transitions as a directed graph (new→scheduled, new→lost, etc.; invalid: new→proposed, met→won, etc.). Every stage change passes through the state machine. Emit a `stage_transition_log` entry on every transition.
- **Deliverable:** `StageMachine` class. Validates transitions against allowed graph. Logs to `stage_transition_log`. Rejects invalid transitions with clear error.
- **Depends on:** ISS-004
- **Priority:** HIGH

---

**ISS-006 — Stage Transition Rule Engine**

- **Description:** Implement the full rule engine as defined in Section 2. Each of the 14 transition types has preconditions, actions, and afrus sync requirements. Rules are declarative (config/rule objects, not embedded code). Wolverine evaluates rules before committing any transition. Enforces mandatory `lost_reason` on all →lost transitions.
- **Deliverable:** `RuleEngine` class with all 14 transition rules. Precondition validation. Side-effect firing. Sync instructions returned to calling layer.
- **Depends on:** ISS-005
- **Priority:** HIGH

---

**ISS-007 — SLA Monitoring and Stale Detection**

- **Description:** Track time-in-stage for every active lead. Background job runs every hour. SLA breach → alert to lead's owner SDR. Stale criteria met → auto temperature downgrade. Defined per stage in Section 2.1 and 2.2.
- **Deliverable:** `SlaMonitor` background job. Per-stage SLA timers. Auto `temp:cold` downgrade on stale leads. SDR alert generation. Unit tests.
- **Depends on:** ISS-006
- **Priority:** HIGH

---

**ISS-008 — `future` Stage Auto-Reactivation Engine**

- **Description:** Wolverine schedules reactivation at `next_contact_date - 30 days`. On trigger: `future` → `new` with correct logging, temperature, SDR notification. Isolated as a specialized rule within the engine.
- **Deliverable:** `FutureReactivator` scheduler job. Reactivation with correct logging and SDR task creation.
- **Depends on:** ISS-006
- **Priority:** MEDIUM

---

### Phase 2 — afrus Integration

**Purpose:** Bidirectional sync with afrus. On-demand extraction based on Sync Tags. Per-org API keys.

---

**ISS-009 — afrus API Client (Per-Org Authentication)**

- **Description:** Implement a typed client for the afrus backend API (`https://backend.afrus.app/docs`). Client reads `afrus_api_key` from the `organizations` table for the organization making the request. Covers: lead extraction (paginated), organization data, user data. Retry with exponential backoff. Field mapping from afrus schema to Wolverine's PostgreSQL schema.
- **Deliverable:** `AfrusClient` class. Per-org authentication via `afrus_api_key` from DB. Methods: `get_leads()`, `get_organizations()`, `get_users()`. Error handling and retry. Integration tests.
- **Depends on:** ISS-003, ISS-002
- **Priority:** HIGH

---

**ISS-010 — afrus → Wolverine On-Demand Extraction Pipeline**

- **Description:** Extraction is **never scheduled**. Triggered **on-demand** by user or API. The trigger specifies a **Sync Tag** — Wolverine calls afrus: "give me all leads that have tag [sync_tag_value]". afrus API is queried using the organization's own `afrus_api_key`. Only leads matching the specified afrus tag are extracted. Upsert by email (PK). Multiple sync tags per organization supported.
- **Deliverable:** `ExtractionPipeline` class. On-demand trigger via CLI and API. Sync tag → afrus tag mapping. Email-based upsert. Manual force-sync trigger. `origin:` tag assignment from afrus lead metadata.
- **Depends on:** ISS-009, ISS-004
- **Priority:** HIGH

---

**ISS-011 — Wolverine → afrus Write-Back (Sync)**

- **Description:** After a stage transition, Wolverine pushes updated stage, temperature, and metadata back to afrus using that organization's own `afrus_api_key`. Idempotent write-back. Failed syncs queued for retry. `sync_log` table tracks push history per lead per organization.
- **Deliverable:** `AfrusSyncWriter` class. Queue-based retry. `sync_log` table. Sync status per lead: `synced / pending / failed`.
- **Depends on:** ISS-010
- **Priority:** HIGH

---

**ISS-012 — Bidirectional Sync Orchestrator**

- **Description:** Orchestrate: extraction → internal processing → write-back. Conflict resolution (last-write-wins with conflict log). Sync health dashboard via CLI: last sync time, leads pending, failures.
- **Deliverable:** `SyncOrchestrator` class. Conflict resolution with audit log. `wolverine sync status` CLI command.
- **Depends on:** ISS-010, ISS-011
- **Priority:** MEDIUM

---

### Phase 3 — Wolverine Agent (LLM)

**Purpose:** Intelligent SDR agent — next-action recommendations, lead summarization, message drafting.

---

**ISS-013 — LLM Provider Abstraction Layer**

- **Description:** Abstract LLM behind a clean interface. Support DeepInfra and OpenRouter as initial providers. Swap provider via `LLM_PROVIDER` env var without code changes. Provider health check on startup. Return structured responses where needed.
- **Deliverable:** `LlmProvider` interface. Implementations for DeepInfra and OpenRouter. Provider selection via env var. Startup health check. Unit tests with mock provider.
- **Depends on:** ISS-003
- **Priority:** HIGH

---

**ISS-014 — Next-Action Recommendation Engine**

- **Description:** For a given lead, Wolverine queries the LLM with full context (stage, temperature, tags, org data, interaction history) and asks for a next-action recommendation. Structured output (action type, suggested email subject, talk track). Presented to SDR — never auto-executed. Every recommendation logged.
- **Deliverable:** `NextActionAgent` class. Prompt templates per pipeline stage. Structured recommendation output. Recommendation history per lead. `wolverine recommend <lead_id>` CLI command.
- **Depends on:** ISS-013, ISS-006
- **Priority:** HIGH

---

**ISS-015 — Lead Summarization and Qualification Assistant**

- **Description:** Given a lead_id, produce a structured brief (need, budget, urgency, contacts, risks, next step). Given raw meeting notes, return a qualification score and flag missing criteria (need/budget/urgency).
- **Deliverable:** `LeadBriefAgent` class. `QualificationAssistant` class. Both accessible via CLI and API.
- **Depends on:** ISS-013, ISS-014
- **Priority:** MEDIUM

---

**ISS-016 — Conversation Drafting (Email, WhatsApp, LinkedIn)**

- **Description:** Generate draft messages in the lead's language (ES/EN/PT — from org data). Templates per stage transition. SDR reviews before sending — no auto-send. Prompt library for 8+ core SDR touchpoints.
- **Deliverable:** `MessageDraftAgent` class. Language-aware drafting. `wolverine draft <lead_id> <touchpoint>` CLI command.
- **Depends on:** ISS-013, ISS-014
- **Priority:** MEDIUM

---

### Phase 4 — Interfaces

**Purpose:** CLI (Nest.js), REST API, Web UI.

---

**ISS-017 — Nest.js CLI Application**

- **Description:** Build the CLI using Nest.js as the primary interface for SDRs. Commands: lead management, tag management, stage transitions, sync triggers, agent features, admin CRUD. Runnable as `docker run wolverine-cli <command>`.
- **Deliverable:** Nest.js CLI with commands: `wolverine leads list`, `wolverine leads show <id>`, `wolverine stage transition <lead_id> <new_stage>`, `wolverine tags assign <lead_id> <tag>`, `wolverine extract run <sync_tag>`, `wolverine sync status`, `wolverine recommend <lead_id>`, `wolverine draft <lead_id> <touchpoint>`, `wolverine admin <entity> <crud>`.
- **Depends on:** ISS-006, ISS-014
- **Priority:** HIGH

---

**ISS-018 — REST API**

- **Description:** REST API using Nest.js for HTTP access. Endpoints for leads CRUD, tags CRUD, stage transitions, sync status, agent features. Authentication via `X-API-Key` header. Rate limiting. Structured error responses.
- **Deliverable:** Nest.js REST API with endpoints: `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`, `POST /leads/:id/tags`, `DELETE /leads/:id/tags/:tag`, `POST /leads/:id/transition`, `GET /sync/status`, `POST /extract/trigger`, `GET /recommend/:lead_id`, `POST /draft/:lead_id`. OpenAPI/Swagger auto-generated.
- **Depends on:** ISS-017
- **Priority:** HIGH

---

**ISS-019 — Web Management UI**

- **Description:** Lightweight web UI for SDRs who prefer browser over CLI. Kanban pipeline board by stage, lead detail with tag management, stage transition modal, sync status dashboard, SLA/stale alerts. Tech: TBD. Authenticates via REST API's API key.
- **Deliverable:** Web UI with Kanban board, lead detail, tag management, stage transition modal, SLA alert panel, stale lead list. Deployed as Docker container.
- **Depends on:** ISS-018
- **Priority:** MEDIUM

---

### Phase 5 — ALMA Integration

**Purpose:** Connect `action:` tags to ALMA's automation engine.

---

**ISS-020 — Action Tag → ALMA Webhook Integration**

- **Description:** When Wolverine assigns an `action:<name>` tag to a lead, call the ALMA webhook endpoint with lead context (lead_id, org_id, contact info, stage, temperature, tags). ALMA executes the corresponding sequence. Wolverine handles ALMA callbacks on completion.
- **Deliverable:** `AlmaWebhookClient` class. Webhook call on action tag assignment. Retry logic. `action_tag_log` table. ALMA callback handler in Nest.js API.
- **Depends on:** ISS-004
- **Priority:** HIGH

---

**ISS-021 — ALMA Action Library**

- **Description:** Document the canonical set of `action:` tags and their corresponding ALMA sequences. Tags: `action:meeting_scheduled`, `action:post_meeting_followup`, `action:start_qualification_nurture`, `action:proposal_sent`, `action:negotiation_started`, `action:deal_won`, `action:lost_notification`, `action:stale_reengagement`. Each maps to a named ALMA sequence. Document payload schema and expected ALMA callback behavior.
- **Deliverable:** `action-library.md` defining all action tags, ALMA sequence names, trigger conditions, payload schema, and callback behavior. Coordination document between Wolverine and ALMA teams.
- **Depends on:** ISS-020
- **Priority:** HIGH

---

**ISS-022 — ALMA → Wolverine Callback and Completion Tracking**

- **Description:** Handle ALMA callbacks when an action sequence completes (success, failure, or needs_human). Wolverine logs the outcome to `action_tag_log`. If ALMA returns `needs_human`, create an SDR alert task.
- **Deliverable:** `AlmaCallbackHandler` in Nest.js API. `action_tag_log` updated with ALMA response. SDR alert task on `needs_human`. Unit tests.
- **Depends on:** ISS-020, ISS-021
- **Priority:** MEDIUM

---

### Phase 6 — Sync On-Demand Engine

**Purpose:** Formalize the on-demand sync mechanism based on Sync Tags.

---

**ISS-023 — Sync Tags CRUD and Management**

- **Description:** Implement CRUD for Sync Tags (`sync:` tag type). Each sync tag stores: `tag_value` (used in Wolverine), `afrus_tag_name` (tag name in afrus to filter on), `description`, `org_id`, `created_at`, `updated_at`. SDR or Admin creates/edits/deletes sync tags. When a sync tag is activated, Wolverine fetches from afrus only leads that carry the corresponding `afrus_tag_name`.
- **Deliverable:** Sync Tags CRUD via CLI and API. Sync tag activation flow. Integration with ISS-010 extraction pipeline.
- **Depends on:** ISS-004, ISS-009
- **Priority:** HIGH

---

**ISS-024 — On-Demand Sync Trigger**

- **Description:** Formalize the on-demand trigger mechanism. User selects one or more sync tags → Wolverine initiates extraction for those tags only. API endpoint: `POST /extract/trigger` with body `{ sync_tags: ["tag1", "tag2"] }`. CLI: `wolverine extract run <sync_tag>`. Supports manual trigger (user-initiated) and API trigger (external system or webhook).
- **Deliverable:** `SyncTrigger` endpoint and CLI command. Batch sync (multiple sync tags in one trigger). Sync history per trigger run. User notified on completion with lead count imported.
- **Depends on:** ISS-010, ISS-023
- **Priority:** HIGH

---

## Appendix: Issue Summary Table

| ID | Title | Phase | Priority | Depends on | Status |
|---|---|---|---|---|
| ISS-001 | Project Scaffold and Docker Setup | 0 | HIGH | — | ✅ Done
| ISS-002 | PostgreSQL Multi-Tenant Schema (RLS + Email PK) | 0 | HIGH | ISS-001 | ✅ Done
| ISS-003 | Secrets and Configuration Management | 0 | HIGH | ISS-001 | ✅ Done
| ISS-004 | Tag System CRUD (5 types including Sync) | 1 | HIGH | ISS-002 | ✅ Done
| ISS-005 | Pipeline Stage State Machine | 1 | HIGH | ISS-004 | ✅ Done
| ISS-006 | Stage Transition Rule Engine | 1 | HIGH | ISS-005 | ✅ Done
| ISS-007 | SLA Monitoring and Stale Detection | 1 | HIGH | ISS-006 | ✅ Done
| ISS-008 | `future` Stage Auto-Reactivation | 1 | MEDIUM | ISS-006 | ✅ Done
| ISS-009 | afrus API Client (Per-Org Authentication) | 2 | HIGH | ISS-003, ISS-002 | ✅ Done
| ISS-010 | On-Demand Extraction Pipeline | 2 | HIGH | ISS-009, ISS-004 | ✅ Done
| ISS-011 | Wolverine → afrus Write-Back | 2 | HIGH | ISS-010 | ✅ Done
| ISS-012 | Bidirectional Sync Orchestrator | 2 | MEDIUM | ISS-010, ISS-011 | ✅ Done
| ISS-013 | LLM Provider Abstraction Layer | 3 | HIGH | ISS-003 | ✅ Done
| ISS-014 | Next-Action Recommendation Engine | 3 | HIGH | ISS-013, ISS-006 | ✅ Done
| ISS-015 | Lead Summarization and Qualification Assistant | 3 | MEDIUM | ISS-013, ISS-014 | ✅ Done
| ISS-016 | Conversation Drafting | 3 | MEDIUM | ISS-013, ISS-014 | ✅ Done
| ISS-017 | Nest.js CLI Application | 4 | HIGH | ISS-006, ISS-014 | ✅ Done
| ISS-018 | REST API | 4 | HIGH | ISS-017 | ✅ Done
| ISS-019 | Web Management UI | 4 | MEDIUM | ISS-018 | ✅ Done
| ISS-020 | Action Tag → ALMA Webhook Integration | 5 | HIGH | ISS-004 | ⛔ Cancelled
| ISS-021 | ALMA Action Library | 5 | HIGH | ISS-020 | ⛔ Cancelled
| ISS-022 | ALMA → Wolverine Callback Handler | 5 | MEDIUM | ISS-020, ISS-021 | ⛔ Cancelled
| ISS-023 | Sync Tags CRUD and Management | 6 | HIGH | ISS-004, ISS-009 | ✅ Done
| ISS-024 | On-Demand Sync Trigger (API + CLI) | 6 | HIGH | ISS-010, ISS-023 | ✅ Done

**Total: 24 issues across 6 phases.**
