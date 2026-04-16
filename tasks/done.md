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
