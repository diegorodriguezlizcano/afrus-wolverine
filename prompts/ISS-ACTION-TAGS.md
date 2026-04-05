# ISS-ACTION-TAGS — Structured Implementation Prompt
**For:** Minimax M2.7
**From:** Opus (Claude Opus 4-6)
**Feature:** Action Tags with ALMA Webhook Trigger
**Project:** afrus-Wolverine (NestJS/TypeScript/PostgreSQL/Prisma)

---

## 1. CONTEXT — Read These Files First

Before writing any code, read:

```
/home/drl/.openclaw/workspace/afrus-wolverine/Roadmap.md
/home/drl/.openclaw/workspace/afrus-wolverine/CRM_CONCEPTS.md
/home/drl/.openclaw/workspace/afrus-wolverine/MULTITENANT_MODEL.md
/home/drl/.openclaw/workspace/afrus-wolverine/package.json
/home/drl/.openclaw/workspace/afrus-wolverine/src/app.module.ts
/home/drl/.openclaw/workspace/afrus-wolverine/src/main.ts
```

## 2. FEATURE DESCRIPTION

### What Is Being Built

**ISS-ACTION-TAGS: Action Tags with ALMA Webhook Integration**

When a LEAD is assigned a Pipeline Stage tag (e.g., `stage:scheduled`), the system must also allow assigning Action tags (e.g., `action:meeting_scheduled`) that trigger automations via ALMA's webhook endpoint.

The feature has three components:

1. **Tag Assignment Enhancement** — Extend the tag assignment logic to support adding `action:` tags simultaneously with `stage:` tags (or independently). The tag assignment API must accept an array of tags and assign them atomically.

2. **Action Tag Detection** — When any `action:` tag is assigned to a lead, detect it immediately.

3. **ALMA Webhook Call** — On action tag assignment, call the ALMA webhook endpoint with full lead context (lead data, org data, tags, stage, temperature).

### Why This Matters

Per Roadmap.md, the ALMA Integration phase (Phase 5) requires Wolverine to fire ALMA webhooks when `action:` tags are assigned. This feature implements the core engine that makes that possible.

Per CRM_CONCEPTS.md:
- Action tags trigger a workflow in ALMA (afrus's AI agent)
- Wolverine handles ALMA callbacks on completion
- Action tag log tracks every trigger

### Existing Project State

- Phase 0 scaffold only — no services, no Prisma schema, no DB
- NestJS 10 app with `@nestjs/schedule`, `@prisma/client`, `class-validator`
- Standard afrus design system (color palette defined in DEVELOPMENT_WORKFLOW.md)
- No existing tag service, no webhook client, no action tag logic

---

## 3. ARCHITECTURE OVERVIEW

```
assignTags(leadEmail, tags[])
  → parse tags into categories (stage:, action:, temp:, origin:)
  → validate one-tag-per-type invariant
  → upsert tags in DB (Prisma)
  → if any action: tag present → call AlmaWebhookClient.trigger(actionTag, leadContext)
  → log to action_tag_log
  → return result
```

### New Files to Create

| File | Purpose |
|---|---|
| `src/prisma/prisma.service.ts` | Prisma client singleton |
| `src/prisma/prisma.module.ts` | Prisma module |
| `src/tags/dto/assign-tags.dto.ts` | Input DTO for tag assignment |
| `src/tags/tag-type.enum.ts` | Enum: STAGE, ORIGIN, TEMP, ACTION, SYNC |
| `src/tags/tags.service.ts` | Tag assignment logic with action detection |
| `src/tags/tags.controller.ts` | REST endpoint: POST /leads/:email/tags |
| `src/tags/tags.module.ts` | Tags module |
| `src/alma/alma-webhook-client.service.ts` | HTTP calls to ALMA webhook |
| `src/alma/alma-webhook-client.spec.ts` | Unit tests for webhook client |
| `src/alma/alma.module.ts` | Alma module |
| `prisma/schema.prisma` | DB schema (all 5 tag types + action_tag_log) |
| `src/leads/dto/create-lead.dto.ts` | CreateLead DTO |
| `src/leads/lead.entity.ts` | Lead entity |
| `src/leads/leads.service.ts` | Lead CRUD |
| `src/leads/leads.controller.ts` | REST endpoints for leads |
| `src/leads/leads.module.ts` | Leads module |
| `src/app.module.ts` | Updated to import TagsModule, AlmaModule, LeadsModule, PrismaModule |

### Prisma Schema Additions

Extend `prisma/schema.prisma` (create if missing):

```prisma
// Tag type enum
enum TagType {
  STAGE
  ORIGIN
  TEMP
  ACTION
  SYNC
}

model Organization {
  organizationId   String   @id @default(uuid())
  afrusOrgId      String   @unique
  afrusApiKey     String
  name            String
  domain          String?
  isCustomer      Boolean  @default(false)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  leads           Lead[]
  users           User[]
  tags            Tag[]
  syncTags        SyncTag[]
  actionTagLogs   ActionTagLog[]
}

model User {
  userId          String       @id @default(uuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [organizationId])
  type            String       // 'human' | 'agent'
  email           String
  name            String
  lastname        String
  phone           String?
  afrusUserId     String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
}

model Lead {
  email           String       @id
  orgId           String
  org             Organization @relation(fields: [orgId], references: [organizationId])
  afrusLeadId     String?
  firstName       String
  lastName        String
  phone           String?
  title           String?
  contactRole     String?
  // Pipeline fields
  stage           String       @default("new")
  temperature     String       @default("warm")
  scheduledAt     DateTime?
  scheduledBy     String?
  metAt           DateTime?
  qualifiedAt     DateTime?
  proposedAt      DateTime?
  negotiatingSince DateTime?
  wonAt           DateTime?
  lostAt          DateTime?
  lostBy          String?
  nextContactDate DateTime?
  reactivatedAt   DateTime?
  dealValue       Float?
  // Origin fields
  campaignId      String?
  campaignName    String?
  widgetId        String?
  widgetName      String?
  isImported      Boolean?
  url             String?
  utmCampaign     String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  tags            Tag[]
  stageTransitionLogs StageTransitionLog[]
  actionTagLogs   ActionTagLog[]
}

model Tag {
  id              String       @id @default(uuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [organizationId])
  leadEmail       String
  lead            Lead         @relation(fields: [leadEmail], references: [email])
  type            TagType
  value           String
  assignedBy      String?
  assignedAt      DateTime     @default(now())
  createdAt       DateTime     @default(now())
  @@unique([orgId, leadEmail, type]) // one tag per type per lead per org
}

model ActionTagLog {
  id              String       @id @default(uuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [organizationId])
  leadEmail       String
  lead            Lead         @relation(fields: [leadEmail], references: [email])
  actionTag       String       // e.g. "meeting_scheduled"
  actionTagFull   String       // e.g. "action:meeting_scheduled"
  payload         Json         // context sent to ALMA
  almaResponse    Json?
  status          String       @default("pending") // pending | success | failed | needs_human
  triggeredAt     DateTime     @default(now())
  completedAt     DateTime?
  retryCount      Int          @default(0)
}

model SyncTag {
  id              String       @id @default(uuid())
  orgId           String
  org             Organization @relation(fields: [orgId], references: [organizationId])
  tagValue        String       // Wolverine name: "fundraiser_leads"
  afrusTagName    String       // afrus filter name
  description     String?
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt
  @@unique([orgId, tagValue])
}

model StageTransitionLog {
  id              String       @id @default(uuid())
  orgId           String
  leadEmail       String
  lead            Lead         @relation(fields: [leadEmail], references: [email])
  fromStage       String?
  toStage         String
  triggeredBy     String?
  notes           String?
  createdAt       DateTime     @default(now())
}
```

---

## 4. ALMA WEBHOOK INTEGRATION

### Endpoint

```
POST https://backend.afrus.app/api/v1/alma/webhook
Authorization: Bearer <org's afrus_api_key>
Content-Type: application/json
```

### Webhook Payload Schema

```typescript
interface AlmaWebhookPayload {
  event: 'action_tag_assigned';
  actionTag: string;          // e.g. "meeting_scheduled" (without prefix)
  actionTagFull: string;     // e.g. "action:meeting_scheduled"
  lead: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    title: string | null;
    contactRole: string | null;
    stage: string;
    temperature: string;
    campaignName: string | null;
    utmCampaign: string | null;
    url: string | null;
  };
  organization: {
    orgId: string;
    name: string;
    domain: string | null;
    isCustomer: boolean;
  };
  context: {
    assignedBy: string | null;
    assignedAt: string; // ISO 8601
    allTags: string[];  // all current tags on the lead
  };
  wolverine: {
    version: string;
    instanceId: string;
  };
}
```

### Expected Response

```typescript
interface AlmaWebhookResponse {
  status: 'received' | 'error';
  callbackId?: string;    // for Wolverine to track completion
  message?: string;
}
```

### Retry Logic

- Retry up to 3 times with exponential backoff (1s, 2s, 4s)
- Log every attempt in `ActionTagLog.retryCount`
- If all retries fail, set `ActionTagLog.status = 'failed'` and throw

---

## 5. TAG ASSIGNMENT API

### Endpoint

```
POST /leads/:email/tags
Content-Type: application/json
X-API-Key: <org-api-key>

{
  "tags": ["stage:scheduled", "action:meeting_scheduled", "temp:warm"]
}
```

### Response

```json
{
  "success": true,
  "leadEmail": "john@example.com",
  "assignedTags": [
    { "type": "STAGE", "value": "scheduled" },
    { "type": "ACTION", "value": "meeting_scheduled" },
    { "type": "TEMP", "value": "warm" }
  ],
  "actionTagsTriggered": ["meeting_scheduled"],
  "almaCallbacks": [
    {
      "actionTag": "meeting_scheduled",
      "status": "pending",
      "callbackId": "atl_abc123"
    }
  ]
}
```

### Tag Parsing Rules

- Tag format: `<type>:<value>` (e.g., `stage:scheduled`, `action:meeting_scheduled`)
- Valid types: `stage`, `origin`, `temp`, `action`, `sync`
- Invalid format → return 400 with descriptive error
- Duplicate type in array → return 400 (one tag per type per lead)
- Unknown tag type → return 400
- Empty array → return 400

### Tags Controller also needs:

```
GET  /leads/:email/tags     → list all tags on a lead
GET  /leads                  → list leads (with pagination)
POST /leads                  → create a lead (upsert by email)
GET  /leads/:email           → get lead details
```

---

## 6. UNIT TEST REQUIREMENTS

### tags.service.spec.ts

```typescript
describe('TagsService', () => {
  // 1. assignTags — parses and stores stage + action + temp tags atomically
  it('should assign multiple tags including action tags atomically')
  it('should parse tag strings into type+value objects')
  it('should reject duplicate tag types in same request')
  it('should reject invalid tag format')
  it('should reject unknown tag type')
  it('should reject empty tags array')

  // 2. detectActionTags — extracts action: tags from parsed tags
  it('should return empty array when no action tags present')
  it('should return action tag values when present')
  it('should strip action: prefix from tag values')

  // 3. getLeadTags — returns all tags for a lead
  it('should return all tags for a lead')
  it('should return empty array for lead with no tags')
})
```

### alma-webhook-client.spec.ts

```typescript
describe('AlmaWebhookClient', () => {
  // 1. trigger — calls ALMA webhook with correct payload
  it('should POST to correct endpoint with Bearer token')
  it('should include all required fields in payload')
  it('should return callbackId on success')

  // 2. retry logic
  it('should retry on 5xx errors')
  it('should not retry on 4xx errors')
  it('should use exponential backoff')
  it('should give up after 3 retries')

  // 3. error handling
  it('should throw on network failure after all retries')
  it('should log all retry attempts')
})
```

---

## 7. INTEGRATION TEST REQUIREMENTS

Test file: `test/action-tags.integration.spec.ts`

```typescript
describe('Action Tags Integration', () => {
  // 1. Full flow: assign stage + action tags → check DB + webhook called
  it('should assign tags, store in DB, and trigger ALMA webhook')

  // 2. action_tag_log record created with correct fields
  it('should create ActionTagLog record with pending status')

  // 3. Stage tag alone → no ALMA webhook
  it('should NOT trigger ALMA webhook when assigning stage tag only')

  // 4. Multiple action tags → webhook called once per action tag
  it('should trigger ALMA once per action tag assigned')

  // 5. Webhook failure → ActionTagLog status = failed, error logged
  it('should mark ActionTagLog as failed when webhook returns error')

  // 6. Webhook retry → exponential backoff used
  it('should retry webhook with exponential backoff on failure')
})
```

---

## 8. RESTRICTIONS

1. **DO NOT break existing code** — the app currently has a scaffold only, so maintain that scaffold (app.module.ts, main.ts, health.controller.ts)
2. **DO NOT delete any existing files** — only add new ones
3. **Follow NestJS conventions** — modules, controllers, services, DTOs with class-validator decorators
4. **Use Prisma** for all database operations
5. **Multi-tenant** — every DB query must scope to `organizationId` via API key in `X-API-Key` header
6. **No hardcoded API keys** — all org credentials from DB
7. **Use the afrus design system colors** if adding any UI (CSS vars from DEVELOPMENT_WORKFLOW.md)
8. **Retry with exponential backoff** on ALMA webhook calls
9. **TypeScript strict mode** — no `any` types; use proper interfaces
10. **Do not call afrus backend API for lead CRUD** — Wolverine owns the lead data locally; afrus API is only used for extraction (Phase 2) and webhook triggering (ALMA)

---

## 9. ACCEPTANCE CRITERIA

| # | Criterion |
|---|---|
| AC-1 | `POST /leads/:email/tags` accepts an array of tag strings and assigns them atomically |
| AC-2 | Tags are parsed as `type:value`, validated by type enum |
| AC-3 | One-tag-per-type invariant enforced (returns 400 on duplicates) |
| AC-4 | Tags stored in `Tag` table with correct `TagType` enum value |
| AC-5 | When any `action:` tag is assigned, ALMA webhook is called with full lead context |
| AC-6 | `ActionTagLog` record created with status `pending` on action tag assignment |
| AC-7 | Webhook retry logic: 3 retries with exponential backoff (1s, 2s, 4s) |
| AC-8 | On webhook success, `ActionTagLog.status = 'success'` and `callbackId` stored |
| AC-9 | On all retries exhausted, `ActionTagLog.status = 'failed'` |
| AC-10 | Stage tag alone does NOT trigger ALMA webhook |
| AC-11 | All queries are organization-scoped via `X-API-Key` header |
| AC-12 | Unit tests pass for `TagsService.assignTags` and `AlmaWebhookClient.trigger` |
| AC-13 | Code compiles without errors (`npm run build`) |
| AC-14 | No existing files modified except `app.module.ts` (to import new modules) |

---

## 10. EXIT CRITERIA

Code is **only accepted** if:

1. `npm run build` succeeds with zero errors
2. All unit tests in `tags.service.spec.ts` pass
3. All unit tests in `alma-webhook-client.spec.ts` pass
4. All acceptance criteria (AC-1 through AC-14) are demonstrably met
5. No existing files are deleted or broken
6. The app starts without errors (`npm run start:dev` or `docker-compose up`)

---

## 11. WEBHOOK CONFIG

Environment variable for ALMA webhook base URL:
```
ALMA_WEBHOOK_URL=https://backend.afrus.app/api/v1/alma/webhook
```

Store in `.env.example`:
```bash
# ALMA Integration
ALMA_WEBHOOK_URL=https://backend.afrus.app/api/v1/alma/webhook
```

---

## 12. IMPLEMENTATION HINTS

- **Prisma module pattern**: Use `@Injectable()` PrismaService extending `PrismaClient`, provided in `PrismaModule`
- **API key auth**: Extract `X-API-Key` in a guard or interceptor, look up org, set `organizationId` in request context
- **Action tag detection**: In `TagsService.assignTags`, after parsing, filter for `type === 'ACTION'` to get the list of action tags to fire
- **Webhook payload**: Build the `AlmaWebhookPayload` from the lead + org data before calling `AlmaWebhookClient.trigger`
- **Exponential backoff**: Implement as `Math.pow(2, attempt - 1) * 1000` ms
- **ActionTagLog**: Insert record BEFORE firing webhook (optimistic — better UX), update status after response
