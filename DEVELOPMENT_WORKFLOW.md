# afrus-Wolverine — Development Workflow

**Version:** 1.0
**Date:** April 2026
**Status:** Active

---

## Overview

Wolverine follows a structured **Opus → Minimax** cascade for all code development. No code is committed without passing through this workflow.

---

## Code-Building Workflow (mandatory for all code issues)

### Step 1 — Issue Selection
Select the next ready issue from `Roadmap.md` following this priority order:
- Issues with no blockers (dependencies resolved)
- Priority: HIGH before MEDIUM before LOW
- Phase order: Phase 0 → Phase 1 → Phase 2 → etc.

### Step 2 — Opus Reads the Issue
Opus (Claude Opus 4) reads:
- Full issue description from `Roadmap.md`
- All relevant context files: `references/roadmap.md`, `references/crm-concepts.md`, `references/architecture.md`, `references/tech-stack.md`
- The afrus API docs at `https://backend.afrus.app/docs` if the issue involves API integration

### Step 3 — Opus Creates the Structured Prompt
Opus produces a detailed prompt for Minimax M2.7 containing:
1. Full issue description and acceptance criteria
2. Instructions to read all relevant context MD files
3. Clear restrictions:
   - Do not break existing code
   - Preserve backward compatibility
   - Follow the tech-stack conventions
   - Use the afrus design system (color palette, CSS variables)
4. List of acceptance criteria the code must satisfy
5. Unit test requirements
6. Integration test requirements
7. Regression test requirements
8. Exit criteria: code is **only accepted** if it passes Opus's proposed tests

### Step 4 — Minimax M2.7 Executes
Minimax M2.7 executes the prompt produced by Opus:
- Produces working code
- Produces unit tests
- Produces integration/regression tests
- All code must compile and pass the proposed tests

### Step 5 — Opus Reviews
Opus reviews the generated code against:
- Acceptance criteria from the issue
- Test results (unit, integration, regression)
- Code quality standards (security, data integrity, NestJS/TypeScript conventions, Prisma/DB patterns)
- Design system compliance (UI issues only)
- Existing code preservation

### Step 6 — Accept or Reject
- **If accepted**: Proceed to Step 7
- **If rejected**: Provide specific feedback. Minimax iterates. Opus re-reviews. Loop until accepted.

### Step 7 — Completion
After Opus approves the code:
1. Commit to GitHub
2. Update `README.md` if needed
3. Mark issue as **Done** in `Roadmap.md`

---

## UI/Design Standards

All Wolverine UI must use the **afrus design system**:

### Color Palette (from afrus.org)
| Role | Color | CSS Variable |
|---|---|---|
| Primary Blue | `#003893` | `--afrus-primary` |
| Accent Teal/Green | `#00d084` | `--afrus-accent` |
| Emerald | `#059669`, `#10b981` | `--afrus-success` |
| Magenta | `#F26DFF` | `--afrus-highlight` |
| Hot Pink | `#FF027A` | `--afrus-alert` |
| Gold | `#fcb900`, `#ffc400` | `--afrus-warning` |
| Orange | `#f97316` | `--afrus-orange` |
| Red | `#ce1126` | `--afrus-error` |
| Background Dark | `#0a0a0f` | `--afrus-bg-dark` |
| Surface Dark | `#111827` | `--afrus-surface-dark` |
| Surface Light | `#1f2937` | `--afrus-surface-light` |
| Text Primary | `#f8fafc` | `--afrus-text-primary` |
| Text Secondary | `#ffffff` | `--afrus-text` |

### UI Reference
For UI/UX patterns, reference in order of preference:
1. **Pipedrive** — best UX feedback
2. **HubSpot**
3. **Salesforce**

### Typography
- Font stack: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`
- System: 4px base spacing grid

---

## Issue Lifecycle

1. **Not Started** → Issue is selected and work begins
2. **In Progress** → Opus has created the prompt, Minimax is executing
3. **Review** → Opus is reviewing Minimax's output
4. **Done** → Code committed, README updated, issue marked done

---

## afrus API Integration

All afrus API calls use `https://backend.afrus.app/docs` as the reference.
- Organization-scoped API keys stored in `organizations.afrus_api_key`
- No API key is hardcoded or stored in env files for org-specific operations
- Retry with exponential backoff on failures
