# INTEND — Tasks In Progress

> Agents move tasks here from backlog.md when claimed.
> Format: task ID, agent name, timestamp, branch.

---

## [P9] Economic Reality Profile (ERP) — schema + retrieval + system prompt

Agent: Channels Agent (DB) + Intelligence Agent (retrieval/prompt)
Started: 2026-04-19
Branch: main
Spec: `v0.5_final/v0.5_spec_final.md` § Economic Reality Profile

**Scope (this phase):**
- New table `economic_reality_profile` with 7 ERP dimensions, RLS on
- Enable pgvector extension; reserve `erp_embedding` column for v0.6
- `packages/data/src/repositories/erp.ts` — typed CRUD
- `packages/intelligence/src/erp-loader.ts` — fetch + derive at session start
- `buildSystemPrompt()` injects ERP block ahead of UFM
- Backfill helper for existing users

**Dependent phases (queued, not started):**
- P10 Conversational Onboarding (consumes ERP repo)
- P11 Skill Verification Pipeline
- P12 Telegram parity verification
- P13 Passkey auth
- P14 Doc + Handover refresh
