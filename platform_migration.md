# Brief for Claude Code — Platform Resolution + Migration Sequencing

**Status: approved by the founder. Execute against this. Where this conflicts with docs/project_instructions.md or CLAUDE.md, this brief wins — and step 4 below requires you to update those docs so the conflict stops existing.**

---

## Locked decisions

| Area | Decision | Notes |
|---|---|---|
| Chain | **Arbitrum Sepolia primary** (migrate off Base-primary). **Robinhood Chain testnet configured alongside** (balance reads + wallet work; no user-facing function until mainnet). | Testnet = free. Promote to Arbitrum One post-sprint, founder's explicit call required. |
| Wallet | **Keep CDP AgentKit** — it supports Arbitrum. No Privy/Pimlico migration. | Docs currently say Privy/Pimlico; correct them in step 4. |
| Gas | Faucet ETH on Sepolia for now. Gasless via Pimlico free testnet tier only if a task requires it — ask before adding. | |
| Hosting | **Migrate off GCP entirely (trial ended — treat as urgent).** Target: **Cloudflare free tier** — Pages (Next.js web via OpenNext adapter), Worker (Telegram webhook), Cron Triggers (background market watcher). | No PM2, no VMs, nothing to babysit. |
| Telegram | **Port to grammY in webhook mode.** node-telegram-bot-api's polling model doesn't fit serverless. | Small port; handler logic carries over. |
| Database | **Keep Supabase** (free tier, Postgres + pgvector). No Neon migration. | |
| Cache/signals | **Upstash Redis free tier.** | |
| Secrets | **Cloudflare native secrets** (`wrangler secret put`) + `.dev.vars` gitignored locally. Keep gitleaks pre-commit + GitHub push protection. GCP Secret Manager contents must be migrated before GCP access dies, then rotated. | |
| LLM | **Anthropic only**, per docs/intelligence_rearchitecture.md. Minimize spend: Haiku for classifier trivial-path, prompt caching on every call, conservative max_tokens. | The one unavoidable cost — keep it small. |

## Hard constraints

- **$0 infrastructure.** Every service on a free tier. If any step requires a paid plan, STOP and report — do not sign up for anything paid.
- **No new providers** beyond those named above without asking.
- **Secrets posture is unchanged and non-negotiable:** no secrets in code/commits/logs; rotate every key that ever lived in GCP after migration.
- **Security pipeline and verified tool boundary** (CLAUDE.md hard rules 2–3) apply unchanged through all migrations.

## Sequencing — with approval checkpoints

**Step 0 (immediate, before anything else): GCP rescue.** Inventory everything currently on GCP — env vars/secrets, cron jobs, any data not in Supabase. Export it all to a local gitignored file and report what you found. GCP access may vanish; treat this as the only time-critical task. ⛔ CHECKPOINT: report inventory, wait for go-ahead.

**Step 1–2: Intelligence migration steps 1–2** (claude.ts client; classifier port + green 50-message gate) per docs/intelligence_rearchitecture.md, unchanged. If already in progress, finish to the green gate. ⛔ CHECKPOINT: show the remapped test results.

**Step 3: Hosting migration.** Cloudflare Pages for web (OpenNext adapter — if the adapter fights a specific Next.js feature, report the trade-off rather than hacking around it), grammY webhook Worker for Telegram, Cron Trigger for the market watcher skeleton. Secrets loaded via wrangler. Decommission GCP only after a full smoke test passes on Cloudflare. ⛔ CHECKPOINT: smoke-test results before GCP teardown.

**Step 4: Chain migration.** Base-primary → Arbitrum Sepolia-primary: AgentKit wallet provider on Arbitrum Sepolia, USDC/Uniswap V3/Aave V3 testnet addresses, Pyth feed config, Robinhood Chain testnet entry (pull real chain ID + RPC from Robinhood's published docs — never ship the placeholder). Keep Base config present but inactive (cheap insurance). ⛔ CHECKPOINT: balance read + one send + one swap green on Arbitrum Sepolia.

**Step 5: Doc sync.** Update docs/project_instructions.md §6 and CLAUDE.md to the resolved reality: CDP AgentKit, Arbitrum Sepolia + Robinhood Chain, Cloudflare, Supabase, Upstash, grammY, Cloudflare secrets. Remove every stale reference (Privy, Pimlico, Neon, Railway, Doppler, GCP, PM2, node-telegram-bot-api, Base-primary). The docs must stop lying.

**Then resume** the remaining intelligence-migration steps (3–7) per docs/intelligence_rearchitecture.md.

## End-of-session protocol (every session)

Summarize what was done, current step, open checkpoints awaiting founder approval, whether typecheck/tests are green, and any cost or free-tier-limit concern encountered.
