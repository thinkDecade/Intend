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

        const [positions, goals, pending, walletRow, cachedBalances, erp] = await Promise.all([
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
            : buildConversationalSystemPrompt(ufm, dbUser.display_name, walletRow?.address ?? null, cachedBalances);

          // If there's a clarification question AND it makes sense for a financial intent, use it
          if (!isOnboarding && needs_clarification && clarification_question && intention.intent_confidence > 0.4) {
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

          // Onboarding extraction — after 2+ user messages, try to extract profile data.
          // We extract incrementally so the UI can reflect partial state, and we only
          // commit + complete once every required ERP field is filled.
          if (isOnboarding) {
            const userTurns = allMessages.filter(m => m.role === 'user').length;
            if (userTurns >= 2) {
              try {
                const transcript = allMessages
                  .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                  .join('\n');

                // v0.5_updated: onboarding only captures the three fields the
                // spec calls for — name, location, currency. Inflation, currency
                // risk, and political signals are derived from `location_country`
                // by the enrichment job; risk tolerance / time horizon / income
                // band / automation mode are no longer asked up-front.
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

                // Stream partial state so the client can render progress if it wants.
                send({ type: 'onboarding_data', profile });

                // ── Inline wallet provisioning (spec step 5) ─────────────────
                //   The moment we have enough to identify the user (name +
                //   country + currency), spin up their CDP wallet silently in
                //   the background. The next assistant turn will surface a
                //   celebratory "your wallet is ready" message. We use the
                //   `wallet_provisioned` event flag to fire this exactly once.
                if (
                  profile.display_name &&
                  profile.location_country &&
                  profile.local_currency
                ) {
                  // 1. Persist the three captured fields immediately so subsequent
                  //    chat turns see them in the UFM/ERP.
                  await updateUserSettings(userId, {
                    display_name:   profile.display_name,
                    local_currency: profile.local_currency,
                    region:         profile.location_country,
                  });
                  await seedERPFromOnboarding(userId, {
                    location_country: profile.location_country,
                    local_currency:   profile.local_currency,
                  });

                  // 2. Provision wallet (idempotent; non-fatal). On first success
                  //    emit a `wallet_ready` event the client surfaces as a
                  //    celebratory message in the next turn.
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const execution = await import('@intend/execution' as any);
                    const NETWORK = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';
                    const wallet = await (execution as {
                      getOrCreateWallet: (id: string, net: string) => Promise<{ info: { address: string } }>
                    }).getOrCreateWallet(userId, NETWORK);
                    const address = wallet.info.address;
                    send({ type: 'wallet_ready', address });
                    // Celebratory inline note appended to the same assistant
                    // bubble — shows the address in full and tells them what
                    // they can do now. Spec step 5.
                    send({
                      type: 'text',
                      content:
                        `\n\n🎉 Your wallet is ready.\n\nAddress: ${address}\n\n` +
                        `You can now hold funds here and send to anyone — just tell me what you'd like to do.`,
                    });
                  } catch (walletErr) {
                    console.warn('[onboarding] wallet provisioning failed:', walletErr);
                    /* non-fatal — next turn will retry */
                  }

                  // 3. Flip the onboarding flag once everything above has landed.
                  if (profile.profile_complete) {
                    await markOnboardingComplete(userId);
                    send({ type: 'onboarding_complete' });
                  }
                }
              } catch (extractionErr) {
                console.warn('[onboarding] extraction failed:', extractionErr);
                /* non-fatal — next user turn retries */
              }
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
): string {
  const name = displayName ?? 'there';

  // Wallet section — only shown when an address exists
  const walletSection = walletAddress
    ? `
The user's wallet address is: ${walletAddress}
When asked, share this address directly and completely — never truncate it.
The wallet is on Base (a fast, low-cost Ethereum network), but NEVER mention the chain name to the user unless they specifically ask about technical details.`
    : `
The user does not have a wallet provisioned yet. If they ask about their wallet address or want to receive funds, tell them: "Your wallet will be created automatically the moment you make your first transaction — you don't need to do anything." Do not suggest they go somewhere or take manual steps.`;

  // Balance section — only shown when there's something to show
  const totalAvailable = balances.reduce((s, b) => s + b.usd_value, 0);
  const balanceSection = balances.length > 0
    ? `
Current wallet balance: $${totalAvailable.toFixed(2)} USD equivalent
Breakdown: ${balances.map(b => `${b.amount.toFixed(4)} ${b.asset} (~$${b.usd_value.toFixed(2)})`).join(', ')}
When asked about their balance, give these specific numbers. If they ask whether they have enough for something, do the maths.`
    : `
The wallet currently shows no balance (empty or not yet loaded). If they ask about their balance, tell them it appears to be empty and they can add funds from the Fund section.`;

  return `You are Intend — a world-class personal financial concierge. You are warm, direct, and genuinely helpful. You speak like a trusted friend who happens to be a financial expert.

The user's name is ${name}.
${walletSection}
${balanceSection}

What you can actually do for them right now (v0.5):
- **Hold and show their balance** — receive funds, show wallet address, report what they have
- **Send funds to anyone** — to a person or to pay for something, in one motion. The destination is just an address.

Coming soon (do NOT offer these — if asked, say honestly "that's coming in the next version"):
- Converting between currencies at best rates
- Allocating funds to grow, save toward a goal, or earn yield

Important rules you never break:
1. Never name protocols, chains, or DeFi infrastructure to the user — speak in outcomes only
2. Never reference primitives by name (no "PROTECT", "MOVE", "SPEND", "GROW", "EARN", "INVEST" — those words don't exist for the user)
3. Never offer a capability that isn't in the active list above. If they ask for one, name it plainly and say it's coming in the next version
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

