# ALMA Action Library — Canonical Action Tags

**Version:** 1.0
**Date:** April 2026
**Coordination:** Wolverine ↔ ALMA teams

---

## Overview

When Wolverine assigns an `action:<name>` tag to a lead, the ALMA webhook is triggered. Each action tag maps to a named ALMA sequence that executes one or more automated steps (email, WhatsApp, internal notification, etc.).

This document defines the canonical set of action tags, their trigger conditions, payload schema, and expected ALMA callback behavior.

---

## Action Tags

### 1. `action:meeting_scheduled`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `SCHEDULED` stage |
| **ALMA Sequence** | `seq_meeting_confirmation` |
| **Description** | Send meeting confirmation email/WhatsApp to the lead. Include time, date, link (if virtual). |
| **Payload** | `{ leadEmail, firstName, stage: "SCHEDULED", scheduledAt, meetingLink? }` |
| **Expected Callback** | `{ status: "completed", messageSent: true }` |

### 2. `action:post_meeting_followup`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions from `SCHEDULED` → `MET` |
| **ALMA Sequence** | `seq_post_meeting_followup` |
| **Description** | Send thank-you + next-step email 24h after meeting. Include summary if available. |
| **Payload** | `{ leadEmail, firstName, stage: "MET", metAt }` |
| **Expected Callback** | `{ status: "completed", messageSent: true }` |

### 3. `action:start_qualification_nurture`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `QUALIFIED` stage |
| **ALMA Sequence** | `seq_qualification_nurture` |
| **Description** | Begin nurture drip: 3-email sequence over 7 days. Educational content about afrus platform. |
| **Payload** | `{ leadEmail, firstName, stage: "QUALIFIED", needConfirmed, budgetConfirmed, urgencyConfirmed }` |
| **Expected Callback** | `{ status: "completed", emailsSent: 3, opens: N, clicks: N }` |

### 4. `action:proposal_sent`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `PROPOSED` stage |
| **ALMA Sequence** | `seq_proposal_followup` |
| **Description** | Reminder sequence: 3d, 7d, 14d after proposal. Nudge to review and respond. |
| **Payload** | `{ leadEmail, firstName, stage: "PROPOSED", proposedAt, dealValue? }` |
| **Expected Callback** | `{ status: "completed", remindersSent: N }` |

### 5. `action:negotiation_started`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `NEGOTIATING` stage |
| **ALMA Sequence** | `seq_negotiation_support` |
| **Description** | Internal notification to SDR + Admin. Prepare closing checklist. |
| **Payload** | `{ leadEmail, firstName, stage: "NEGOTIATING", dealValue? }` |
| **Expected Callback** | `{ status: "completed", notified: ["sdr", "admin"] }` |

### 6. `action:deal_won`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `WON` stage |
| **ALMA Sequence** | `seq_onboarding_welcome` |
| **Description** | Welcome email + onboarding sequence for new customer. Internal celebration notification. |
| **Payload** | `{ leadEmail, firstName, stage: "WON", wonAt, dealValue? }` |
| **Expected Callback** | `{ status: "completed", onboardingStarted: true }` |

### 7. `action:lost_notification`

| Field | Value |
|---|---|
| **Trigger** | Lead transitions to `LOST` stage |
| **ALMA Sequence** | `seq_lost_notification` |
| **Description** | Internal notification to SDR + Admin. Log reason. Optional "sorry to see you go" email. |
| **Payload** | `{ leadEmail, firstName, stage: "LOST", lostAt, lostReason }` |
| **Expected Callback** | `{ status: "completed", notified: ["sdr", "admin"] }` |

### 8. `action:stale_reengagement`

| Field | Value |
|---|---|
| **Trigger** | SLA Monitor detects stale lead (2× SLA breach) |
| **ALMA Sequence** | `seq_stale_reengagement` |
| **Description** | Re-engagement attempt: "We noticed we haven't connected in a while..." |
| **Payload** | `{ leadEmail, firstName, stage, hoursInStage, temperature }` |
| **Expected Callback** | `{ status: "completed" | "needs_human", messageSent: boolean }` |

---

## Webhook Payload Schema

Every ALMA webhook call includes this standard payload:

```json
{
  "event": "action_tag_assigned",
  "actionTag": "meeting_scheduled",
  "actionTagFull": "action:meeting_scheduled",
  "lead": {
    "email": "contact@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "phone": "+57-300-1234567",
    "stage": "SCHEDULED",
    "temperature": "WARM"
  },
  "organization": {
    "orgId": "uuid",
    "name": "Org Name",
    "isCustomer": false
  },
  "context": {
    "assignedBy": "sdr@afrus.ai",
    "assignedAt": "2026-04-04T20:00:00Z",
    "allTags": ["stage:scheduled", "temp:warm", "action:meeting_scheduled"]
  },
  "wolverine": {
    "version": "0.1.0",
    "instanceId": "local"
  }
}
```

---

## ALMA Callback Schema

ALMA responds to Wolverine via callback:

```json
{
  "status": "received" | "completed" | "failed" | "needs_human",
  "callbackId": "alma-callback-uuid",
  "message": "Optional human-readable message",
  "data": {
    // Sequence-specific data (emails sent, opens, etc.)
  }
}
```

### Callback Status Values

| Status | Meaning | Wolverine Action |
|---|---|---|
| `received` | ALMA acknowledged the webhook | Update ActionTagLog → TRIGGERED |
| `completed` | Sequence finished successfully | Update ActionTagLog → COMPLETED |
| `failed` | Sequence failed | Update ActionTagLog → FAILED, alert SDR |
| `needs_human` | Sequence requires human intervention | Update ActionTagLog → NEEDS_HUMAN, create SDR task |

---

## Configuration

Environment variable for ALMA webhook:
```
ALMA_WEBHOOK_URL=https://backend.afrus.app/api/v1/alma/webhook
ALMA_WEBHOOK_SECRET=<shared-secret-for-hmac>
```

Per-organization API keys are passed in the `Authorization: Bearer <org_api_key>` header.
