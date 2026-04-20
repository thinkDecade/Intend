import { type NextRequest, NextResponse } from 'next/server';
import { streamText }  from 'ai';
import { cookies }     from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  getUserById, getActiveGoals, getActivePositions, getPendingConfirmations,
  createIntent, cacheSet, cacheGet, keys, TTL,
  getUserPrimaryWallet,
} from '@intend/data';
import type { Balance } from '@intend/core';
import {
  buildUFM, interpretIntent, streamConfirmationMessage, detectModeSwitch, loadERP,
} from '@intend/intelligence';
import type { EconomicRealityProfile } from '@intend/core';
import { updateUserSettings, logEvent, markOnboardingComplete, seedERPFromOnboarding } from '@intend/data';
import { generatePlan } from '@intend/decision';
import { getModel } from '@intend/intelligence';
import { generateObject } from 'ai';
import { z } from 'zod';

const isEvmAddress = (v: string): boolean => /^0x[0-9a-fA-F]{40}$/.test(v);

// ── SSE helper ─────────────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── History message type ────────────────────────────────────────────────────

interface HistoryMessage {
  role:    'user' | 'assistant';
  content: string;
}

// ── POST /api/chat ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    message?:      string;
    userId?:       string;
    history?:      HistoryMessage[];
    isOnboarding?: boolean;
  };

  const message      = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const userId       = body.userId ?? '';
  const history      = (body.history ?? []).slice(-20);
  const isOnboarding = body.isOnboarding ?? false;

  // ── Mode-switch detection (pre-LLM, regex only) ──────────────────────────
  const newMode = detectModeSwitch(message);
  if (newMode !== null) {
    await updateUserSettings(userId, { execution_mode: newMode });
    await logEvent({
      user_id:    userId,
      event_type: 'execution_mode_changed',
      source:     'web',
      event_data: { new_mode: newMode },
    });
    const modeMsg = newMode === 'autonomous'
      ? `Done. I'll execute from now on and send you a receipt after each action.`
      : `Done. I'll always show you the plan first and wait for your go-ahead.`;
    return NextResponse.json({ type: 'mode_switch', message: modeMsg });
  }

  // ── Stream response ────────────────────────────────────────────────────────
  const encoder = new TextEncoder();
  const stream  = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(sseEvent(event)));
      }

      try {
        // 1. Load user + build UFM
        const dbUser = await getUserById(userId);
        if (!dbUser) {
          send({ type: 'error', error: 'Account not found. Please contact support.' });
          controller.close();
          return;
        }

        const CHAIN = process.env['NODE_ENV'] === 'production' ? 'base' : 'base_sepolia';
        const NETWORK = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';

        const [positions, goals, pending, walletRowInitial, cachedBalances, erp] = await Promise.all([
          getActivePositions(userId).catch(() => []),
          getActiveGoals(userId).catch(() => []),
          getPendingConfirmations(userId).catch(() => []),
          getUserPrimaryWallet(userId, CHAIN as 'base' | 'base_sepolia').catch(() => null),
          cacheGet<Balance[]>(keys.userBalances(userId)).then(c => c?.data ?? []).catch(() => [] as Balance[]),
          loadERP(userId).catch((err: Error) => {
            console.warn(`[chat] loadERP failed for ${userId}:`, err.message);
            return null as EconomicRealityProfile | null;
          }),
        ]);

        // Self-heal: if onboarding is done but no wallet row exists, provision
        // on-demand here. Idempotent — getOrCreateWallet returns the existing
        // row if it's there.
        //
        // BUT: this is bounded by a hard 4s timeout. If the CDP API is slow
        // we'd rather respond with the empty-wallet fallback than blow past
        // the serverless function timeout (which produces an HTTP 504 and a
        // dead chat for the user). The next turn will retry.
        let walletRow = walletRowInitial;
        let walletProvisionFailed = false;
        if (!walletRow && !isOnboarding) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const execution = await import('@intend/execution' as any);
            const NETWORK_TS = NETWORK as string;
            const wallet = await Promise.race([
              (execution as {
                getOrCreateWallet: (id: string, net: string) => Promise<{ info: { address: string; wallet_id: string } }>
              }).getOrCreateWallet(userId, NETWORK_TS),
              new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('wallet provisioning timed out after 4s')), 4000),
              ),
            ]);
            walletRow = await getUserPrimaryWallet(userId, CHAIN as 'base' | 'base_sepolia').catch(() => null);
            if (!walletRow) {
              walletRow = {
                wallet_id:  wallet.info.wallet_id,
                user_id:    userId,
                chain:      CHAIN,
                address:    wallet.info.address,
                provider:   'agentkit_cdp',
                is_primary: true,
                created_at: new Date().toISOString(),
              };
            }
          } catch (err) {
            walletProvisionFailed = true;
            console.warn('[chat] on-demand wallet provisioning failed:', err);
          }
        }

        const ufm = await buildUFM(userId, {
          balances: cachedBalances,
          activePositions: positions.map(p => ({
            id:           p.position_id,
            asset:        p.asset,
            protocol:     p.protocol,
            amount:       Number(p.amount_deposited),
            usd_value:    Number(p.amount_current),
            apy_at_entry: Number(p.apy_at_entry ?? 0),
            opened_at:    p.opened_at,
          })),
          activeGoals: goals.map(g => ({
            id:          g.horizon_id,
            name:        g.goal_name,
            target_usd:  Number(g.target_amount),
            current_usd: Number(g.current_amount),
            apy:         null,
            created_at:  g.created_at,
          })),
          pendingConfirmations: pending.map(p => ({
            intent_id:  p.intent_id,
            primitive:  p.primitive,
            summary:    p.raw_input,
            created_at: p.created_at,
            expires_at: new Date(Date.parse(p.created_at) + 40 * 60 * 1000).toISOString(),
          })),
        });

        // 2. Classify intent — is this financial or conversational?
        const interpretation = await interpretIntent(message, ufm, erp);
        const { intention, needs_clarification, clarification_question } = interpretation;

        // STORE is read-only in v0.5 — no plan, just conversation. Route it
        // through the streaming chat branch so the agent can show balance,
        // wallet address, deposit instructions, etc.
        const isHighConfidenceFinancial =
          intention.intent_confidence >= 0.75
          && !needs_clarification
          && intention.primitive !== 'STORE';

        // 3a. LOW confidence / conversational / onboarding → streaming chat
        if (!isHighConfidenceFinancial || isOnboarding) {
          const allMessages = [
            ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user' as const, content: message },
          ];

          const systemPrompt = isOnboarding
            ? buildOnboardingSystemPrompt(dbUser.display_name)
            : buildConversationalSystemPrompt(
                ufm,
                dbUser.display_name,
                walletRow?.address ?? null,
                cachedBalances,
                walletProvisionFailed,
                message,
              );

          // Clarification only makes sense when the user is clearly attempting
          // a financial action but the parameters are ambiguous. For greetings,
          // small talk, or out-of-scope chatter we let the conversational LLM
          // handle it naturally instead of dropping a generic "tell me more"
          // line that feels like a non-sequitur (the v0.5 issue we hit).
          const looksFinancial =
            intention.intent_confidence >= 0.55 &&
            (intention.primitive === 'SEND' || intention.primitive === 'CONVERT' || intention.primitive === 'ALLOCATE');
          if (!isOnboarding && needs_clarification && clarification_question && looksFinancial) {
            send({ type: 'text', content: clarification_question });
            send({ type: 'done' });
            controller.close();
            return;
          }

          // Stream response
          const { textStream } = streamText({
            model:    getModel('primary'),
            system:   systemPrompt,
            messages: allMessages,
          });

          for await (const chunk of textStream) {
            send({ type: 'text', content: chunk });
          }

          // Onboarding extraction — after 2+ user messages, kick off profile
          // extraction + wallet provisioning IN THE BACKGROUND. Both are slow
          // (LLM call + CDP API) and were previously serialised inside the SSE
          // response, blowing past the serverless function timeout (HTTP 504).
          // We close the stream as soon as the conversational reply finishes;
          // the celebratory wallet message lands on the user's NEXT turn via
          // the on-demand wallet provisioning self-heal earlier in this route.
          if (isOnboarding) {
            const userTurns = allMessages.filter(m => m.role === 'user').length;
            if (userTurns >= 2) {
              const transcript = allMessages
                .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                .join('\n');
              // Fire-and-forget. We must NOT await this — the SSE response
              // would otherwise stay open until both the extraction LLM and
              // the CDP API resolve, which routinely exceeds 10s.
              void runOnboardingExtraction(userId, transcript).catch(err => {
                console.warn('[onboarding] background extraction failed:', err);
              });
            }
          }

          send({ type: 'done' });
          controller.close();
          return;
        }

        // 3b. HIGH confidence financial intent → generate plan.
        //     v0.5_updated: only SEND reaches this branch with a real plan.
        //     CONVERT/ALLOCATE (and any straggler legacy primitives) hit the
        //     PrimitiveDisabledError below and surface a precise message.
        const recipientRaw  = intention.parameters.recipient_raw ?? '';
        const resolvedAddress = isEvmAddress(recipientRaw) ? recipientRaw : '';
        const amountRaw     = intention.parameters.amount ?? 0;
        const amountUsd     = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;

        const stratCtx = {
          network:        (process.env['NODE_ENV'] === 'production' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet',
          recipientType:  'claim' as const,
          resolvedAddress,
          isNewRecipient: resolvedAddress !== '',
        };

        const plan = await generatePlan(intention, ufm, stratCtx);

        const intentRow = await createIntent(userId, 'web', intention);
        const fullPlan  = { ...plan, plan_id: intentRow.intent_id, created_at: intentRow.created_at };

        await cacheSet(keys.planCache(intentRow.intent_id), fullPlan, TTL.PLAN_CACHE);

        // Stream confirmation preview
        const textStream = await streamConfirmationMessage(fullPlan, ufm, erp);
        for await (const chunk of textStream) {
          send({ type: 'text', content: chunk });
        }

        send({
          type: 'plan',
          plan: {
            intent_id:   intentRow.intent_id,
            plan_id:     fullPlan.plan_id,
            primitive:   intention.primitive,
            fees_total:  fullPlan.fees.total_usd,
            amount_usd:  amountUsd,
            description: intention.raw_input,
          },
        });

        send({ type: 'done' });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Something went wrong.';
        send({ type: 'error', error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
    },
  });
}

// ── Background onboarding extraction + wallet provisioning ────────────────
//
// Runs detached from the SSE response so the user's reply isn't blocked on
// the LLM extraction call or the CDP API. State the next chat turn cares
// about (display_name, region, ERP, wallet row) is persisted to Supabase,
// so the on-demand wallet self-heal at the top of POST() picks it up
// transparently.

async function runOnboardingExtraction(userId: string, transcript: string): Promise<void> {
  const { object: profile } = await generateObject({
    model: getModel('primary'),
    schema: z.object({
      display_name:     z.string().nullable()
        .describe("The user's first name or preferred name, null if not yet given"),
      location_country: z.string().nullable()
        .describe('ISO 3166-1 alpha-2 country code inferred from what the user said (e.g. "GH", "US", "NG"). null if unclear.'),
      local_currency:   z.string().nullable()
        .describe('3-letter ISO 4217 currency code (e.g. "GHS", "USD", "NGN"). null if unclear.'),
      profile_complete: z.boolean()
        .describe('true only when display_name, location_country, AND local_currency are all known.'),
    }),
    prompt: `Extract the user's onboarding profile from this conversation.\nReturn null for any field that hasn't been clearly stated.\n\n${transcript}`,
  });

  if (!profile.display_name || !profile.location_country || !profile.local_currency) {
    return; // not enough yet — the next turn will retry
  }

  // Persist captured fields. updateUserSettings + seedERPFromOnboarding are
  // both idempotent so running this on every qualifying turn is safe.
  await updateUserSettings(userId, {
    display_name:   profile.display_name,
    local_currency: profile.local_currency,
    region:         profile.location_country,
  });
  await seedERPFromOnboarding(userId, {
    location_country: profile.location_country,
    local_currency:   profile.local_currency,
  });

  // Provision wallet (idempotent — getOrCreateWallet returns the existing row).
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const execution = await import('@intend/execution' as any);
    const NETWORK = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';
    await (execution as {
      getOrCreateWallet: (id: string, net: string) => Promise<{ info: { address: string } }>
    }).getOrCreateWallet(userId, NETWORK);
  } catch (walletErr) {
    console.warn('[onboarding] wallet provisioning failed:', walletErr);
    // Non-fatal — the on-demand provisioning in the main POST handler will retry.
  }

  if (profile.profile_complete) {
    await markOnboardingComplete(userId);
  }
}

// ── Onboarding system prompt ───────────────────────────────────────────────

function buildOnboardingSystemPrompt(existingName: string | null): string {
  const hasName = !!existingName?.trim();
  return `You are Intend — a warm, intelligent personal financial concierge having your first conversation with a new user.

This first chat is short by design. You only need three things, gathered naturally in conversation:

1. **Name** — what to call them
2. **Where they live** — country (so Intend understands their currency exposure, inflation context, and political signals automatically — DO NOT ask about inflation, risk tolerance, time horizon, or income)
3. **Primary currency** — what they earn and spend day-to-day (cedis, dollars, naira, pounds…)

Rules for this conversation:
- Be warm, brief, conversational — short messages, no long paragraphs
- Ask **one question at a time** — never stack questions
- No bullet points or numbered lists in your replies
- Never mention "DeFi", "blockchain", "wallet", "chain", "protocol", or any infrastructure word
- Never ask about risk appetite, time horizon, income band, or automation preferences — those are derived later or asked only when relevant to a specific intention
- Once you have all three, confirm what you heard in one short sentence
- After confirmation, the system will silently provision their wallet. When you receive a system note that the wallet is ready, congratulate them warmly in one short message, share the address (full, never truncated), and tell them they can now hold funds and send to anyone — don't list other capabilities
- ${hasName ? `Their name is already "${existingName}" — use it and skip the name question. Move on to where they live.` : 'Start by warmly greeting them and asking their name.'}

Keep each message under 3 sentences. Be human, not a survey.`;
}

// ── Conversational system prompt ───────────────────────────────────────────

function buildConversationalSystemPrompt(
  ufm: Awaited<ReturnType<typeof buildUFM>>,
  displayName: string | null,
  walletAddress: string | null,
  balances: Balance[],
  walletProvisionFailed: boolean = false,
  currentUserMessage: string = '',
): string {
  const name = displayName ?? 'there';
  const userAskedAboutWallet = /\b(wallet|address|deposit|receive|fund|0x[0-9a-fA-F]+)\b/i.test(currentUserMessage);

  // Wallet section — content depends on (a) whether we have an address,
  // (b) whether provisioning just failed, and (c) whether the user's CURRENT
  // message is even about the wallet. The agent must NEVER volunteer a
  // wallet error on a greeting like "hi" — that was the previous failure
  // mode where prior buggy assistant turns kept echoing forward.
  let walletSection: string;
  if (walletAddress) {
    walletSection = `
The user's wallet address is: ${walletAddress}
When asked for it, share the address directly and completely — never truncate, never say "let me check", never say it's being created.
To receive funds, they send USDC to that address on Base. Do NOT name the chain unless they explicitly ask about technicals.
Fiat deposits (card / bank) are not yet available — if asked, say it's coming in the next version, and meanwhile they can fund the wallet by sending USDC to the address above from any other crypto wallet or exchange.`;
  } else if (walletProvisionFailed && userAskedAboutWallet) {
    walletSection = `
The user's wallet could not be loaded on this turn (the wallet service is temporarily slow). Since they are asking about their wallet, say honestly: "Your wallet couldn't load just now — try sending another message in a moment. If it keeps failing please report it." Do NOT invent a creation timeline. Do NOT say "create one manually". Do NOT promise to flag it to the team — just ask them to try again.`;
  } else if (walletProvisionFailed) {
    walletSection = `
The user has a wallet but it's temporarily slow to load. They have NOT asked about it on this turn, so DO NOT mention any wallet issue — just answer whatever they actually asked. Never volunteer trouble that the user didn't bring up.`;
  } else {
    walletSection = `
The user does not have a wallet provisioned yet. They have NOT asked about it on this turn, so DO NOT mention wallets at all unless their next message specifically requests it. If they later ask, say: "Your wallet will be set up automatically — send me what you'd like to do and I'll handle it from there."`;
  }

  // Balance section — only shown when there's something to show
  const totalAvailable = balances.reduce((s, b) => s + b.usd_value, 0);
  const balanceSection = balances.length > 0
    ? `
Current wallet balance: $${totalAvailable.toFixed(2)} USD equivalent
Breakdown: ${balances.map(b => `${b.amount.toFixed(4)} ${b.asset} (~$${b.usd_value.toFixed(2)})`).join(', ')}
When asked about their balance, give these specific numbers. If they ask whether they have enough for something, do the maths.`
    : `
The wallet is currently empty. If they ask about their balance, say it's empty. If they ask how to add funds, give them the wallet address above and tell them to send USDC to it from any other wallet or exchange. There is NO "Fund section" or in-app fiat onramp yet — never invent one.`;

  return `You are Intend — a world-class personal financial concierge. You are warm, direct, and genuinely helpful. You speak like a trusted friend who happens to be a financial expert.

The user's name is ${name}.
${walletSection}
${balanceSection}

What you can do for them (v0.5 — all four are live):
- **Hold and show their balance** — receive funds, share their wallet address, report exactly what they have
- **Send funds to anyone** — to a person or to pay for something, in one motion. The destination is just an address.
- **Convert between assets** — swap one asset for another at the best available rate (e.g. ETH → USDC, USDC → EURC)
- **Allocate idle funds** — deploy what's sitting still into yield, save toward a named goal, or hedge against inflation

Important rules you never break:
1. Never name protocols, chains, or DeFi infrastructure to the user — speak in outcomes only
2. Never reference primitives by their internal names (no "STORE", "SEND", "CONVERT", "ALLOCATE", "PROTECT", "MOVE", "SPEND", "GROW", "EARN", "INVEST" — those words don't exist for the user). Talk about what happens to the money.
3. If they ask for something genuinely outside those four (KYC, fiat onramp, cards, mobile app), say plainly that it's coming in a later version — never invent a workflow that doesn't exist
4. Never guarantee returns — use "historically", "typically", "expected to"
5. Never give direct financial advice — present facts and options
6. Never reveal technical implementation details
7. When sharing a wallet address, always show the full address — never truncate

Your voice:
- Warm but not effusive. Confident. Direct.
- One idea per sentence.
- Use numbers over adjectives: "$47 earned" not "a decent return"
- Never start with "Great question!" or similar filler
- Short responses — never more than 3-4 sentences for casual messages
- If the user seems ready to take a financial action, gently guide them toward expressing their intention

You have full context of their financial situation. Use it to make responses feel personal and relevant.`;
}

