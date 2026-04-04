# afrus-Wolverine — Roadmap

**Version:** 1.0
**Date:** April 2026
**Status:** Draft

---

## 1. Persistence Recommendation

### v1 — PostgreSQL

PostgreSQL is the persistence layer from day one. The rationale:

- **Multi-user writes from day one**: Multiple SDRs will access Wolverine simultaneously. PostgreSQL handles concurrent writes without serialization issues that would arise with SQLite.
- **ACID transactions**: Critical for a CRM where stage transitions must be atomic. If a stage transition fails mid-way, transactions ensure data integrity.
- **Team growth**: Diego may onboard additional SDRs or open the system to the afrus team. PostgreSQL scales without architectural changes.
- **Docker-ready**: PostgreSQL runs in its own container alongside Wolverine via docker-compose. Zero operational overhead in development and cloud deployments.
- **ORM compatibility**: TypeORM and Prisma both have first-class PostgreSQL support, which simplifies ISS-002 onwards.

**Rejected: SQLite for v1** — acceptable for solo projects, but inappropriate given multi-user requirements and the need to avoid a migration later.

### When to Consider Distributed Database

The following would trigger a re-evaluation toward distributed databases (CockroachDB, PlanetScale):

| Trigger | Threshold |
|---|---|
| Multi-region deployment | afrus expands to EU/NA with regional teams |
| Geo-distributed writes | Writes must happen in multiple regions simultaneously |
| 100K+ leads | Above this, a single PostgreSQL instance becomes a bottleneck |

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

SLA = maximum calendar days a lead may remain in a stage before an alert is triggered.

| Stage | SLA (days) | Alert Target | Escalation |
|---|---|---|---|
| `new` | 2 | SDR (owner of the org) | Reminder → Escalation to Admin if no contact attempt logged |
| `scheduled` | 7 | SDR | Meeting should occur within this window or lead is at risk |
| `met` | 5 | SDR | Next step (qualification) must be initiated within this window |
| `qualified` | 10 | SDR + ALMA | Proposal stage should be entered or deal is cooling |
| `proposed` | 14 | SDR | Follow-up required; deal can go cold fast without engagement |
| `negotiating` | 21 | SDR + Admin | Contract stage; Admin should be aware of deal health |
| `future` | N/A | N/A | No SLA — on hold until `next_contact_date`; auto-reactivated by Wolverine |

---

### 2.2 Stale Rules

A lead is marked **stale** when:

| Stage | Stale condition | Action |
|---|---|---|
| `new` | No contact attempt within 3 days of entering `new` | Wolverine sets `temp:cold` automatically; alerts SDR |
| `scheduled` | Meeting not confirmed or rescheduled within 5 days | Wolverine alerts SDR; if > 8 days, set `temp:cold` |
| `met` | No stage advancement within 7 days of meeting | Wolverine alerts SDR; sets `temp:warm` |
| `qualified` | No stage advancement within 14 days | Wolverine alerts SDR; sets `temp:cold` |
| `proposed` | No response within 18 days of sending proposal | Wolverine sets `temp:cold`; ALMA triggers follow-up sequence |
| `negotiating` | No stage advancement within 30 days | Wolverine alerts Admin; sets `temp:cold` |
| `future` | — | Never stale; stage is intentionally paused |

---

### 2.3 Transition Definitions

---

#### ON `new` → `scheduled`

**CONDITIONS:**
- A meeting has been scheduled with a confirmed contact (name, email, and at least one phone or WhatsApp number on file)
- The contact has explicitly agreed to a meeting slot (verbal or written confirmation)
- The scheduled meeting date/time is in the future or ongoing

**ACTIONS:**
- `stage:new` → `stage:scheduled` (Wolverine-auto, via tag update)
- Log `scheduled_at` timestamp on the lead (Wolverine-auto)
- Assign or confirm `scheduled_by` (user_id of SDR who scheduled — from org owner)
- Set `temp:warm` if currently `temp:cold` (Wolverine-auto)
- If `action:meeting_scheduled` tag exists, trigger ALMA to send confirmation message (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push updated stage tag (`stage:scheduled`) to afrus via API
- Yes — update `next_meeting_date` on the afrus lead record if afrus API supports this field

---

#### ON `new` → `lost`

**CONDITIONS:**
- SDR or Admin explicitly marks the lead as lost
- A `lost_reason` tag is assigned at the same time (mandatory — system enforces this)
- Valid lost reasons: `not_answered`, `no_budget`, `no_authority`, `timing`, `competitor`, `no_need`, `too_small`

**ACTIONS:**
- `stage:new` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — enforced by system as mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto, if not already set)
- Remove all pending `action:` tags (Wolverine-auto — no actions should fire on lost leads)
- If `action:lost_notification` tag exists, trigger ALMA to notify SDR's manager (ALMA)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus via API
- Yes — update afrus lead status to reflect lost state

---

#### ON `scheduled` → `met`

**CONDITIONS:**
- The scheduled meeting has occurred (SDR confirms manually or Wolverine auto-detects via calendar integration if configured)
- Meeting notes or outcome are logged (at minimum: "met" or "completed" outcome)

**ACTIONS:**
- `stage:scheduled` → `stage:met` (Human — SDR confirms meeting occurred)
- Log `met_at` timestamp (Wolverine-auto)
- Set `temp:warm` if not already set; if meeting went exceptionally well, SDR may set `temp:hot`
- If `action:post_meeting_followup` tag exists, trigger ALMA (ALMA)
- Clear `action:meeting_scheduled` tag if still present (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:met` to afrus
- Yes — push meeting completion note if afrus API supports notes on leads

---

#### ON `scheduled` → `lost`

**CONDITIONS:**
- The scheduled meeting did not occur and cannot be rescheduled
- SDR or Admin marks as lost with a mandatory `lost_reason` tag
- OR Wolverine auto-detects 15+ days in `scheduled` with no meeting confirmed (Wolverine-auto alert to SDR, then Human marks lost)

**ACTIONS:**
- `stage:scheduled` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `met` → `qualified`

**CONDITIONS:**
- Lead has been met and SDR confirms all three qualification criteria are met:
  1. **Need**: Organization has a confirmed fundraising or donor management need
  2. **Budget**: Budget confirmed or likely within the next 90 days
  3. **Urgency**: Timeline for decision is defined (within Q1, Q2, etc.)
- SDR assigns `stage:qualified` and optionally logs qualification notes

**ACTIONS:**
- `stage:met` → `stage:qualified` (Human — SDR who owns the org)
- Log `qualified_at` timestamp (Wolverine-auto)
- Set `temp:warm` or `temp:hot` depending on urgency and budget clarity (Human — SDR decides)
- If `action:start_qualification_nurture` tag is configured, trigger ALMA (ALMA)
- Clear `action:post_meeting_followup` tag if still present (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:qualified` to afrus
- Note: afrus may not have a native "qualified" concept; map to most equivalent afrus pipeline stage

---

#### ON `met` → `lost`

**CONDITIONS:**
- Lead was met but SDR or Admin determines the deal is not viable
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:met` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `qualified` → `proposed`

**CONDITIONS:**
- A commercial proposal has been sent to the lead
- Proposal document is attached or linked in Wolverine (minimum: proposal sent date logged)
- SDR marks stage as `proposed`

**ACTIONS:**
- `stage:qualified` → `stage:proposed` (Human — SDR)
- Log `proposed_at` timestamp (Wolverine-auto)
- Set `temp:hot` if proposal matches lead's budget and urgency (Human — SDR decides)
- If `action:proposal_sent` tag exists, trigger ALMA to send a professional follow-up sequence (ALMA)
- Clear `action:start_qualification_nurture` tag if still present (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:proposed` to afrus
- Yes — push proposal date if afrus API supports a `proposal_sent_date` field

---

#### ON `qualified` → `future`

**CONDITIONS:**
- Lead is qualified (meets need, budget, urgency criteria) but the timing is not right
- SDR or Admin sets `next_contact_date` (future date, mandatory — system enforces this)
- `next_contact_date` must be between 31 and 365 days from today

**ACTIONS:**
- `stage:qualified` → `stage:future` (Human — SDR or Admin)
- Log `next_contact_date` (mandatory field) (Human — SDR sets date)
- Wolverine stores `next_contact_date` and schedules reactivation job (Wolverine-auto)
- Set `temp:warm` (Wolverine-auto)
- Remove all pending `action:` tags — they will be re-evaluated on reactivation (Wolverine-auto)
- Wolverine sets an internal cron/scheduler job to reactivate at `next_contact_date - 30 days`

**SYNC_TO_AFRUS:**
- Yes — push `stage:future` to afrus
- Note: track `next_contact_date` in Wolverine; afrus API may not support this field natively

---

#### ON `qualified` → `lost`

**CONDITIONS:**
- Lead was qualified but deal subsequently died (budget cut, champion left, competitor won, timing changed)
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:qualified` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `proposed` → `negotiating`

**CONDITIONS:**
- Lead has received the proposal and responded with active interest
- There is an active discussion on pricing, terms, scope, or contract details
- At least one response from the lead's side has been received (email, call, meeting)

**ACTIONS:**
- `stage:proposed` → `stage:negotiating` (Human — SDR updates)
- Log `negotiating_since` timestamp (Wolverine-auto)
- Set `temp:hot` (Wolverine-auto, as active negotiation signals high intent)
- If `action:negotiation_started` tag exists, trigger ALMA to prepare contract review or legal checklist (ALMA)
- Clear `action:proposal_sent` tag if still present (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:negotiating` to afrus

---

#### ON `proposed` → `lost`

**CONDITIONS:**
- Proposal was sent and the lead went silent or explicitly declined
- Mandatory `lost_reason` tag assigned
- Wolverine auto-alerts if lead has been in `proposed` > 18 days without advancement (stale rule)

**ACTIONS:**
- `stage:proposed` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus

---

#### ON `negotiating` → `won`

**CONDITIONS:**
- Contract signed or deal closed (verbal or written commitment from lead's authorized signatory)
- `deal_value` is recorded (optional but strongly recommended — log if available)
- SDR or Admin marks as `won`

**ACTIONS:**
- `stage:negotiating` → `stage:won` (Human — SDR or Admin)
- Log `won_at` timestamp and `won_by` user_id (Wolverine-auto)
- Set `temp:hot` (Wolverine-auto — celebration moment)
- Log `deal_value` if provided (Human — SDR provides)
- If `action:deal_won` tag exists, trigger ALMA for onboarding sequence (ALMA)
- Remove all pending `action:` tags (Wolverine-auto)
- Wolverine notifies SDR and Admin of win (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:won` to afrus with `won_at` timestamp
- Yes — update afrus organization status to `is_customer = true` if not already set

---

#### ON `negotiating` → `lost`

**CONDITIONS:**
- Negotiation ended without a deal; lead dropped out, chose competitor, or terms could not be agreed
- Mandatory `lost_reason` tag assigned

**ACTIONS:**
- `stage:negotiating` → `stage:lost` (Human — SDR or Admin)
- Assign `lost_reason:<reason>` tag (Human — mandatory)
- Log `lost_at` timestamp and `lost_by` user_id (Wolverine-auto)
- Set `temp:cold` (Wolverine-auto)
- Remove all pending `action:` tags (Wolverine-auto)

**SYNC_TO_AFRUS:**
- Yes — push `stage:lost` and `lost_reason:<reason>` to afrus
- Note: afrus organization status may remain `is_customer = false`

---

#### ON `future` → `new` (Wolverine Auto-Reactivation)

**CONDITIONS:**
- Lead is in `future` stage with a stored `next_contact_date`
- Current date is `>= next_contact_date - 30 days` (Wolverine auto-triggers reactivation 30 days before the target date)
- OR current date is `>= next_contact_date` (hard deadline reactivation)

**ACTIONS:**
- `stage:future` → `stage:new` (Wolverine-auto — scheduler/cron job triggers this)
- Log `reactivated_at` timestamp (Wolverine-auto)
- Set `temp:warm` (Wolverine-auto — previously qualified lead, rekindle interest)
- Wolverine creates a task/notification for the SDR to reach out: "Re-engage lead — target contact date was [date]" (Wolverine-auto)
- Re-evaluate `action:` tags based on current stage (`new`) (Wolverine-auto)
- Clear `next_contact_date` from the lead record (Wolverine-auto, after reactivation)

**SYNC_TO_AFRUS:**
- Yes — push `stage:new` to afrus (lead re-enters active pipeline)
- Yes — push reactivation note if afrus API supports it

---

## 3. Development Roadmap

**Phases:** 0 (Infrastructure) → 1 (Core Logic) → 2 (afrus Integration) → 3 (Wolverine Agent) → 4 (Interfaces) → 5 (ALMA Integration)

---

### Phase 0 — Infrastructure

**Purpose:** Establish the foundation that all subsequent phases build on. Docker, database, configuration management, and CI/CD skeleton.

---

**ISS-001 — Project Scaffold and Docker Setup**

- **Description:** Bootstrap the Wolverine project with a `Dockerfile`, `docker-compose.yml`, and a `.env.example` template. The container must run locally and in any cloud environment without modification. Establish the project directory structure (src/, tests/, scripts/, docs/).
- **Deliverable:** A `Dockerfile` that builds a working Wolverine image. A `docker-compose.yml` that spins up Wolverine + SQLite. A `.env.example` documenting all required environment variables (afrus API key, LLM provider keys, etc.).
- **Depends on:** None
- **Priority:** HIGH

---

**ISS-002 — PostgreSQL Database Schema and Migrations**

- **Description:** Define the complete PostgreSQL schema covering all entities described in CRM_CONCEPTS.md: leads, organizations, users, tags (all 4 types), lost_reasons, origins, and pipeline_stage_logs. Use `pg` driver with TypeORM or Prisma ORM for schema management. Set up database migrations using a versioned migration system (Alembic for Python, or Prisma Migrate for TypeScript) so the schema can evolve without manual SQL. Enforce referential integrity via foreign keys. Include connection pooling configuration (pgBouncer or equivalent) for production.
- **Deliverable:** A `migrations/` directory with versioned migration scripts. The full PostgreSQL schema with tables, indexes, and constraints defined. A seed script with default pipeline stages, default lost reasons, and a default admin user. `docker-compose.yml` updated to include a PostgreSQL service with persistent volume.
- **Depends on:** ISS-001
- **Priority:** HIGH

---

**ISS-003 — Secrets and Configuration Management**

- **Description:** Establish the `.env` loading pattern. All secrets (API keys for afrus, LLM providers) must be read from environment variables at runtime. No secrets hardcoded or committed. Implement a config validation step on startup that fails fast with a clear error if required keys are missing.
- **Deliverable:** A `src/config/` module that loads, validates, and exposes all configuration. On invalid config: a clear, actionable error message (not a cryptic stack trace).
- **Depends on:** ISS-001
- **Priority:** HIGH

---

### Phase 1 — Core Logic

**Purpose:** Build the internal rule engine, tag system, and stage state machine. This is the heart of Wolverine — everything else is an interface to these primitives.

---

**ISS-004 — Tag System (CRUD + Assignment Engine)**

- **Description:** Implement the tag data model and the full CRUD API for all 4 tag types: `stage:`, `origin:`, `temp:`, `action:`. A lead may carry multiple tags simultaneously. The assignment engine must allow adding, removing, and replacing tags. Tag uniqueness per type per lead must be enforced (a lead has exactly one `stage:` tag at any time, exactly one `temp:` tag, etc.).
- **Deliverable:** Tag CRUD operations (create, read, update, delete) for all tag types. Tag assignment and removal functions. Enforcement of one-tag-per-type invariants. Unit tests covering all tag operations.
- **Depends on:** ISS-002
- **Priority:** HIGH

---

**ISS-005 — Pipeline Stage State Machine and Transition Validation**

- **Description:** Implement the pipeline stage state machine. Define valid transitions as a directed graph (allowed: new→scheduled, new→lost, scheduled→met, etc.; blocked: new→proposed, met→won, etc.). Every stage change must pass through the state machine — direct stage writes bypassing the machine are rejected. Emit a `stage_transition_log` entry on every transition.
- **Deliverable:** A `StageMachine` class that accepts a transition, validates it against the allowed graph, executes it, and logs it. Rejection of invalid transitions with a clear error. `stage_transition_log` table populated on every valid transition.
- **Depends on:** ISS-004
- **Priority:** HIGH

---

**ISS-006 — Stage Transition Rule Engine**

- **Description:** Implement the full rule engine as described in Section 2 of this document. Each transition type (new→scheduled, qualified→future, etc.) has its own rule set: preconditions (conditions), side effects (actions), and afrus sync requirements. Rules are defined declaratively (as configuration or rule objects) rather than embedded in procedural code. Wolverine evaluates rules on every stage change request before committing the transition.
- **Deliverable:** A `RuleEngine` class with rule definitions for all 14 transitions in Section 2. Rules validate conditions before allowing a transition. Actions fire as side effects (tag mutations, notifications). Sync instructions are returned so the calling layer can execute afrus API calls. Enforces mandatory `lost_reason` on all →lost transitions.
- **Depends on:** ISS-005
- **Priority:** HIGH

---

**ISS-007 — SLA Monitoring and Stale Detection**

- **Description:** Implement SLA timers and stale detection per stage as defined in Section 2. Wolverine must track time-in-stage for every active lead. When SLA threshold is breached, Wolverine creates an internal alert task and notifies the lead's owner SDR. When stale criteria are met, Wolverine automatically applies the configured tag mutations (e.g., `temp:cold`). Implement a background job (cron or scheduler) that runs every hour to evaluate SLA and stale conditions.
- **Deliverable:** An `SlaMonitor` background job. Per-stage SLA timer tracking. Stale detection that auto-downgrades temperature tags. Alert generation for SLA breaches. Unit tests for stale detection logic.
- **Depends on:** ISS-006
- **Priority:** HIGH

---

**ISS-008 — `future` Stage Auto-Reactivation Engine**

- **Description:** Implement the auto-reactivation logic for leads in `future` stage. Wolverine schedules a reactivation job at `next_contact_date - 30 days`. On trigger, the lead moves back to `new` with appropriate temperature and notification to the SDR. This is a specialized rule within the rule engine but isolated here for focused implementation.
- **Deliverable:** A `FutureReactivator` scheduler job. Reactivation from `future` → `new` with correct logging, temperature setting, and SDR notification. Integration with the rule engine for `future`→`new` transition.
- **Depends on:** ISS-006
- **Priority:** MEDIUM

---

### Phase 2 — afrus Integration

**Purpose:** Bidirectional sync with the afrus CRM. Wolverine reads from afrus and writes its state changes back.

---

**ISS-009 — afrus API Client (Lead Extraction)**

- **Description:** Implement a typed client for the afrus backend API (`https://backend.afrus.app/docs`). The client must cover lead extraction (fetch all leads, paginated), organization data fetching, and user data fetching. Handle authentication via API key from `.env`. Implement retry logic with exponential backoff for resilience. Map afrus lead fields to Wolverine's internal PostgreSQL schema.
- **Deliverable:** An `AfrusClient` class with methods: `get_leads()`, `get_organizations()`, `get_users()`. Proper error handling and retry logic. Field mapping from afrus schema to Wolverine internal PostgreSQL schema. Integration tests against the afrus API sandbox or staging endpoint if available.
- **Depends on:** ISS-003, ISS-002
- **Priority:** HIGH

---

**ISS-010 — afrus → Wolverine Extraction Pipeline**

- **Description:** Implement the extraction pipeline that runs on a schedule (configurable, default: every 15 minutes). Wolverine fetches new and updated leads from afrus, creates or updates internal lead records, assigns `origin:` tags based on afrus origin fields (campaign_id, utm_campaign, widget_name, etc.), and maps afrus pipeline stages to Wolverine stages. Deleted leads in afrus should be flagged in Wolverine (not deleted — audit trail).
- **Deliverable:** An `ExtractionPipeline` class. Scheduled extraction via cron or scheduler. `origin:` tag assignment logic based on afrus lead metadata. Deduplication: leads already owned by Wolverine are updated, not duplicated. A manual "force sync" trigger via CLI.
- **Depends on:** ISS-009
- **Priority:** HIGH

---

**ISS-011 — Wolverine → afrus Write-Back (Sync)**

- **Description:** Implement the write-back layer. After Wolverine processes a stage transition, the system calls the afrus API to push the updated stage, temperature tags, and relevant metadata. Write-back must be idempotent (re-sending the same state is safe). If the afrus API is unavailable, the sync must be queued for retry, not silently dropped. Implement a `sync_log` PostgreSQL table to track what has been pushed to afrus.
- **Deliverable:** An `AfrusSyncWriter` class. Queue-based retry mechanism for failed syncs. `sync_log` PostgreSQL table. Idempotent write-back logic. Sync status visible per lead in Wolverine (synced / pending / failed).
- **Depends on:** ISS-010
- **Priority:** HIGH

---

**ISS-012 — Bidirectional Sync Orchestrator**

- **Description:** Orchestrate the full bidirectional sync loop: extraction → internal processing → write-back. Detect and resolve conflicts (e.g., lead updated in afrus by a human SDR while Wolverine is processing a stage change on the same lead — last-write-wins with a conflict log entry). Implement a sync health dashboard accessible via CLI showing last sync time, leads pending sync, and failures.
- **Deliverable:** A `SyncOrchestrator` class that runs the full loop. Conflict resolution logic with audit logging. A `wolverine sync status` CLI command showing sync health metrics.
- **Depends on:** ISS-010, ISS-011
- **Priority:** MEDIUM

---

### Phase 3 — Wolverine Agent (LLM)

**Purpose:** Turn Wolverine from a state manager into an intelligent SDR agent. The LLM drives next-action recommendations, lead summarization, and conversation drafting.

---

**ISS-013 — LLM Provider Abstraction Layer**

- **Description:** Abstract the LLM provider behind a clean interface (similar to the OpenAI-compatible chat completions API). Support DeepInfra and OpenRouter as initial providers. The abstraction must allow swapping providers via environment variable without code changes. Implement provider health checks on startup to verify credentials. Return structured responses where needed.
- **Deliverable:** An `LlmProvider` interface/abstract class. Concrete implementations for DeepInfra and OpenRouter. Provider selection via `LLM_PROVIDER` env var. Startup health check. Unit tests with mock provider.
- **Depends on:** ISS-003
- **Priority:** HIGH

---

**ISS-014 — Next-Action Recommendation Engine**

- **Description:** Implement the core agentic loop. For a given lead, Wolverine queries the LLM with the lead's full context (stage, temperature, tags, org data, history of interactions) and asks for a next-action recommendation. The recommendation is returned as a structured object (action type, suggested email subject, talk track, etc.) and presented to the SDR but never auto-executed. Wolverine logs every recommendation it makes.
- **Deliverable:** A `NextActionAgent` class. Prompt templates for each pipeline stage (different context for `qualified` vs `negotiating` leads). Structured recommendation output. Recommendation history log per lead. A `wolverine recommend <lead_id>` CLI command.
- **Depends on:** ISS-013, ISS-006
- **Priority:** HIGH

---

**ISS-015 — Lead Summarization and Qualification Assistant**

- **Description:** Implement a lead summarization feature: given a lead_id, Wolverine calls the LLM to produce a structured brief (need, budget, urgency, key contacts, risk factors, next step). Also implement a qualification assistant: feed it raw notes from a meeting and it returns a qualification score and flags missing qualification criteria (need/budget/urgency).
- **Deliverable:** A `LeadBriefAgent` class producing structured briefs. A `QualificationAssistant` class that analyzes meeting notes and returns structured qualification output. Both accessible via CLI and API.
- **Depends on:** ISS-013, ISS-014
- **Priority:** MEDIUM

---

**ISS-016 — Conversation Drafting (Email, WhatsApp, LinkedIn)**

- **Description:** Implement message drafting. Given a lead and a recommended action, Wolverine generates a draft message (email, WhatsApp, or LinkedIn) in the lead's language (ES/EN/PT — pulled from afrus org data). Drafts are returned to the SDR for review and send — no auto-send. Implement a prompt library with templates for each stage transition (e.g., "first outreach after meeting", "follow-up after proposal sent", "re-engagement after future reactivation").
- **Deliverable:** A `MessageDraftAgent` class. Language-aware drafting (ES/EN/PT). Templates for at least 8 core SDR touchpoints. A `wolverine draft <lead_id> <touchpoint>` CLI command. Draft output includes subject line, body, and estimated send time.
- **Depends on:** ISS-013, ISS-014
- **Priority:** MEDIUM

---

### Phase 4 — Interfaces

**Purpose:** Expose Wolverine via CLI, REST API, and a management UI.

---

**ISS-017 — Nest.js CLI Application**

- **Description:** Build the command-line interface using Nest.js. The CLI is the primary interface for SDRs. Commands must cover: lead management (list, view, update), tag management, stage transitions, extraction triggers, sync status, and the agent features from Phase 3. The CLI must be installable as a Docker image and runnable with `docker run wolverine-cli <command>`.
- **Deliverable:** A Nest.js CLI application with commands: `wolverine leads list`, `wolverine leads show <id>`, `wolverine stage transition <lead_id> <new_stage>`, `wolverine tags assign <lead_id> <tag>`, `wolverine extract run`, `wolverine sync status`, `wolverine recommend <lead_id>`, `wolverine draft <lead_id> <touchpoint>`, `wolverine admin <entity> <crud>`.
- **Depends on:** ISS-006, ISS-014
- **Priority:** HIGH

---

**ISS-018 — REST API**

- **Description:** Implement a REST API using Nest.js to expose Wolverine's core functionality over HTTP. Endpoints for leads CRUD, tags CRUD, stage transitions, sync status, and agent features. Authentication via API key (shared secret in `X-API-Key` header). Rate limiting to prevent abuse. Structured error responses (JSON with error code, message, and details).
- **Deliverable:** A Nest.js REST API with endpoints: `GET/POST /leads`, `GET/PUT/DELETE /leads/:id`, `POST /leads/:id/tags`, `DELETE /leads/:id/tags/:tag`, `POST /leads/:id/transition`, `GET /sync/status`, `POST /extract/trigger`, `GET /recommend/:lead_id`, `POST /draft/:lead_id`. OpenAPI/Swagger docs generated automatically.
- **Depends on:** ISS-017
- **Priority:** HIGH

---

**ISS-019 — Web Management UI**

- **Description:** Build a lightweight web UI for Wolverine management. The UI is primarily for SDRs who prefer a browser interface over CLI. Core views: lead pipeline board (Kanban-style by stage), lead detail view with tag management, stage transition modal, sync status dashboard, SLA/stale alerts dashboard. Technology: React or Vue (TBD — decision deferred to this issue). The UI authenticates via the REST API's API key.
- **Deliverable:** A web UI with: a Kanban pipeline board, lead detail pages, tag management UI, stage transition modal with rule validation, SLA alert panel, stale lead list. Deployed as a separate Docker container or served by the Nest.js app.
- **Depends on:** ISS-018
- **Priority:** MEDIUM

---

### Phase 5 — ALMA Integration

**Purpose:** Connect Wolverine's `action:` tags to ALMA's automation engine. Action tags are the trigger; ALMA is the executor.

---

**ISS-020 — Action Tag → ALMA Webhook Integration**

- **Description:** Implement the webhook bridge between Wolverine and ALMA. When Wolverine assigns an `action:<action_name>` tag to a lead, it must call the ALMA webhook endpoint with the lead's context (lead_id, org_id, contact info, stage, temperature, tags). ALMA receives the payload and executes the corresponding sequence. Wolverine must handle ALMA callbacks for action completion.
- **Deliverable:** An `AlmaWebhookClient` class. Action tag assignment triggers a webhook call. Retry logic for failed webhook deliveries. `action_tag_log` table tracking which action tags fired, when, and ALMA's response. ALMA callback handler endpoint registered in the Nest.js API.
- **Depends on:** ISS-004
- **Priority:** HIGH

---

**ISS-021 — ALMA Action Library (wolverine-specific sequences)**

- **Description:** Define the canonical set of `action:` tags that Wolverine uses and the corresponding ALMA sequences they trigger. Tags include: `action:meeting_scheduled`, `action:post_meeting_followup`, `action:start_qualification_nurture`, `action:proposal_sent`, `action:negotiation_started`, `action:deal_won`, `action:lost_notification`, `action:stale_reengagement`. Each action maps to a named ALMA sequence. Document the payload schema passed to ALMA for each action.
- **Deliverable:** An `action-library.md` document defining all action tags, their ALMA sequence names, trigger conditions (which stage transitions fire them), payload schema, and expected ALMA callback behavior. This is a coordination document between the Wolverine and ALMA teams.
- **Depends on:** ISS-020
- **Priority:** HIGH

---

**ISS-022 — ALMA → Wolverine Callback and Completion Tracking**

- **Description:** Implement the callback handler that ALMA calls when an action sequence completes (success, failure, or needs human input). Wolverine logs the callback, updates the lead's `action_tag_log` with the outcome, and optionally triggers follow-up actions. If ALMA returns "needs_human" for a sequence, Wolverine creates an alert task for the SDR.
- **Deliverable:** A `AlmaCallbackHandler` in the Nest.js API. `action_tag_log` updated with ALMA's response. SDR alert task creation on `needs_human` response. Unit tests for callback handling and task creation.
- **Depends on:** ISS-020, ISS-021
- **Priority:** MEDIUM

---

## Appendix: Issue Summary Table

| ID | Title | Phase | Priority | Depends on |
|---|---|---|---|---|
| ISS-001 | Project Scaffold and Docker Setup | 0 | HIGH | — |
| ISS-002 | SQLite Database Schema and Migrations | 0 | HIGH | ISS-001 |
| ISS-003 | Secrets and Configuration Management | 0 | HIGH | ISS-001 |
| ISS-004 | Tag System (CRUD + Assignment Engine) | 1 | HIGH | ISS-002 |
| ISS-005 | Pipeline Stage State Machine | 1 | HIGH | ISS-004 |
| ISS-006 | Stage Transition Rule Engine | 1 | HIGH | ISS-005 |
| ISS-007 | SLA Monitoring and Stale Detection | 1 | HIGH | ISS-006 |
| ISS-008 | `future` Stage Auto-Reactivation | 1 | MEDIUM | ISS-006 |
| ISS-009 | afrus API Client (Lead Extraction) | 2 | HIGH | ISS-003, ISS-002 |
| ISS-010 | afrus → Wolverine Extraction Pipeline | 2 | HIGH | ISS-009 |
| ISS-011 | Wolverine → afrus Write-Back | 2 | HIGH | ISS-010 |
| ISS-012 | Bidirectional Sync Orchestrator | 2 | MEDIUM | ISS-010, ISS-011 |
| ISS-013 | LLM Provider Abstraction Layer | 3 | HIGH | ISS-003 |
| ISS-014 | Next-Action Recommendation Engine | 3 | HIGH | ISS-013, ISS-006 |
| ISS-015 | Lead Summarization and Qualification Assistant | 3 | MEDIUM | ISS-013, ISS-014 |
| ISS-016 | Conversation Drafting (Email, WhatsApp, LinkedIn) | 3 | MEDIUM | ISS-013, ISS-014 |
| ISS-017 | Nest.js CLI Application | 4 | HIGH | ISS-006, ISS-014 |
| ISS-018 | REST API | 4 | HIGH | ISS-017 |
| ISS-019 | Web Management UI | 4 | MEDIUM | ISS-018 |
| ISS-020 | Action Tag → ALMA Webhook Integration | 5 | HIGH | ISS-004 |
| ISS-021 | ALMA Action Library | 5 | HIGH | ISS-020 |
| ISS-022 | ALMA → Wolverine Callback and Completion Tracking | 5 | MEDIUM | ISS-020, ISS-021 |