# INTEND — Tasks Done

> Security + QA Agent signs off and moves tasks here.

---

## [P0-04] Model Router
Agent: Intelligence Agent
Completed: 2026-04-15
Signed off: 2026-04-15

**Verified:**
- Provider chain: Claude Sonnet 4.6 (primary) → GLM-4-32B free via OpenRouter (fallback1) → Llama-3.1-8B free (fallback2) → Qwen-2.5-7B free (fast)
- All OpenRouter fallbacks are zero-cost (:free suffix) — single `OPENROUTER_API_KEY` covers all three tiers
- Per-tier timeouts: 15 s (primary), 30 s (fallback1/2), 20 s (fast)
- `withFallback()` advances on error or timeout; logs tier used when not primary
- `tierAvailable()` checks env vars at runtime — safe startup diagnostics
- `logModelRouterStatus()` exported for entry-point health logging
- `@ai-sdk/google` and `@ai-sdk/groq` removed from package.json (unused)
- `.env.example` updated: `OPENROUTER_API_KEY` replaces `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY`
- 15/15 unit tests pass, 1 integration test correctly skipped (requires real `OPENROUTER_API_KEY`)
- `yarn workspace @intend/intelligence tsc --noEmit` — clean ✓

---

## [P0-02] Supabase schema migration
Agent: Channels Agent
Completed: 2026-04-15
Signed off: 2026-04-15

**Verified:**
- All 14 tables live on `intend-v0.5-staging` (Supabase, North EU Stockholm)
- Project ref: `otlnqhgixnnppktrzxmj` — linked via Supabase CLI
- `supabase migration list` — 001 tracked as applied on local + remote
- Tables confirmed via `supabase inspect db table-stats`: users, wallets, sessions, intents, positions, life_horizons, claims, confirmation_reminders, kyc_records, x402_events, signal_snapshots, revenue_events, event_log, parallel_lanes
- RLS enabled on all 14 tables ✓
- Append-only triggers active: `event_log_append_only` + `revenue_events_append_only` ✓
- `supabase/config.toml` — project initialised (project_id = "Intend") ✓

---

## [P0-12] Session Manager
Agent: Channels Agent
Completed: 2026-04-15
Signed off: 2026-04-15

**Verified:**
- `packages/data/src/repositories/sessions.ts` — typed session repository with 6 functions
- `packages/data/src/index.ts` — sessions repo exported
- `apps/bot/src/session.ts` — refactored to use repository pattern (no raw Supabase calls)
- Cross-channel handoff: `getMostRecentActiveSession()` enables Telegram → WebApp session restore
- `yarn typecheck` — 10/10 packages pass ✓

---

## [P0-01] Turborepo monorepo initialisation
Agent: Channels Agent
Completed: 2026-04-13
Signed off: 2026-04-13

**Verified:**
- `yarn typecheck` — 10/10 packages pass
- `yarn lint` — 10/10 packages pass
- `yarn dev` — all 3 apps start without errors
- All 7 packages scaffolded with correct structure
- `apps/web` Next.js 14, `apps/bot` + `apps/whatsapp` stubs
- `.env.example`, `.gitignore`, `supabase/migrations/001_initial_schema.sql` in place

---

## [PHASE-09] ERP schema + retrieval
Agent: Channels Agent
Completed: 2026-04-19

**Verified:**
- Migration `005_economic_reality_profile.sql` live; `005a_backfill_erp_from_users.sql` seeds existing users (`seed_source = 'backfill'`)
- `pgvector` extension enabled; `erp_embedding vector(1536)` reserved for v0.6 retrieval
- RLS: each user reads their own row only; service role bypasses for system prompt assembly
- `getERP`/`upsertERP` exported from `@intend/data`
- ERP loaded once per session and injected into the system prompt **ahead of UFM**

## [PHASE-10] Onboarding rebuild
Agent: Channels Agent
Completed: 2026-04-19

**Verified:**
- `/onboard` is a conversational agent (not a settings form); produces ERP rows directly
- `apps/web/src/app/onboard/actions.ts` saves ERP + flips `users.onboarding_completed = true`
- First intent flows from onboarding into `ChatPanel` via sessionStorage hand-off
- Both OTP and magic-link auth paths route to `/onboard` when `onboarding_completed = false`

## [PHASE-11] Skill verification pipeline
Agent: Execution Agent (with Channels Agent for audit log)
Completed: 2026-04-19

**Verified:**
- `packages/skills/scripts/verify.mjs` re-hashes every playbook and exits non-zero on drift, unpinned versions, or missing files
- `packages/skills/scripts/hash.mjs` regenerates the manifest, preserving provenance
- `setSkillAuditHook` exposed as the package-boundary contract (no hard dep on `@intend/data`)
- Execution dispatcher writes `event_log.event_type='skill_invoked'` (`{ skill, chain, action, network, version, sha256, external, args_hash, tx_count }`) fire-and-forget after every successful `buildTransaction`
- `args_hash` is a deterministic SHA-256 — sandbox-safe to log

## [PHASE-12] Telegram parity
Agent: Channels Agent
Completed: 2026-04-19

**Verified:**
- `users.telegram_id` and `whatsapp_id` writable through `updateUserSettings` (BIGINT serialised via `.toString()` to keep PostgREST happy)
- `linkTelegram(formData)` server action consumes `intend:link_code:{code}` from Redis, writes `users.telegram_id`, deletes the code, logs `channel_linked`
- `unlinkTelegram` clears `users.telegram_id` + logs `channel_unlinked`
- 6-digit numeric input on the Telegram channel card with link/unlink buttons + status feedback
- `tests/cross-channel.e2e.ts` smoke covers ERP roundtrip, /connect link consumption, `getUserByTelegramId` resolution, and session row persistence

## [PHASE-13] Passkey auth (WebAuthn)
Agent: Channels Agent
Completed: 2026-04-19

**Verified:**
- Migration `006_passkey_credentials.sql` — `passkey_credentials` (`credential_id` UNIQUE, `public_key BYTEA`, `counter BIGINT`, `transports TEXT[]`, `device_label`) + `passkey_challenges` (single-use, 5-min TTL) — RLS enabled on both
- Five routes under `/api/auth/passkey/`: `register/{options,verify}`, `login/{options,verify}`, `list` (GET + DELETE)
- `login/options` never leaks email existence — falls back to per-email SHA-256 surrogate when no user matches
- `login/verify` enforces anti-cloning counter check (`newCounter > 0 && newCounter <= cred.counter` → reject), then mints Supabase session via `admin.generateLink({ type: 'magiclink' })` → `verifyOtp({ token_hash, type: 'magiclink' })`. Magic-link token never leaves the server.
- RP context derived per-request from the `Origin` header — production, staging, and `localhost` all work without redeploys
- Login page: passkey button + OTP input separated by an "or" divider, equal prominence
- Settings: `PasskeySection` lists registered authenticators with register/remove actions via `@simplewebauthn/browser`
- Dashboard: `PasskeyNudge` shown when `userId && !isOnboarding && passkeys.length === 0`. Dismissible via `localStorage` (`intend:passkey_nudge_dismissed_at`, 7-day suppression). First-deposit reinforcement reserved as Phase-2 hook via `data-passkey-nudge`.
- `npx turbo run build` — all 10 packages green

## [PHASE-14] Doc + handover refresh
Agent: Orchestrator
Completed: 2026-04-19

**Verified:**
- `BUILD_PLAN.md` Phase 13 ticked complete (Phase 14 in-flight item: this entry)
- `DOCUMENTATION.md` §15 migrations table includes `006_passkey_credentials.sql`; §16 grows full **Passkey Flow (WebAuthn — Phase 13)** subsection
- `CLAUDE.md` — v0.5_updated framing, four-active-primitives table, `scripts/wipe-users.{sql,ts}` operational note
- `apps/CLAUDE.md` — channel surface refresh: ERP repo, passkey routes/components, onboarding chat, Telegram link/unlink server actions
- `HANDOVER.md` — Phases 9–14 recap at top; Phase-8 history preserved below
- `scripts/wipe-users.{sql,ts}` shipped; demo-clean run executed (auth users + per-user Redis cleared)
