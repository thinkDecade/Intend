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
  buildUFM, interpretIntent, streamConfirmationMessage, detectModeSwitch,
} from '@intend/intelligence';
import { updateUserSettings, logEvent, markOnboardingComplete } from '@intend/data';
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

        const [positions, goals, pending, walletRow, cachedBalances] = await Promise.all([
          getActivePositions(userId).catch(() => []),
          getActiveGoals(userId).catch(() => []),
          getPendingConfirmations(userId).catch(() => []),
          getUserPrimaryWallet(userId, CHAIN as 'base' | 'base_sepolia').catch(() => null),
          cacheGet<Balance[]>(keys.userBalances(userId)).then(c => c?.data ?? []).catch(() => [] as Balance[]),
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
        const interpretation = await interpretIntent(message, ufm);
        const { intention, needs_clarification, clarification_question } = interpretation;

        const isHighConfidenceFinancial =
          intention.intent_confidence >= 0.75 && !needs_clarification;

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

          // Onboarding extraction — after 2+ user messages, try to extract profile data
          if (isOnboarding) {
            const userTurns = allMessages.filter(m => m.role === 'user').length;
            if (userTurns >= 2) {
              try {
                const transcript = allMessages
                  .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
                  .join('\n');

                const { object: profile } = await generateObject({
                  model: getModel('primary'),
                  schema: z.object({
                    display_name:     z.string().nullable().describe('The user\'s first name or preferred name, null if not yet given'),
                    local_currency:   z.string().nullable().describe('3-letter ISO currency code inferred from what the user said, null if unclear'),
                    execution_mode:   z.enum(['autonomous', 'semi_autonomous']).nullable().describe('autonomous if user wants Intend to act without asking, semi_autonomous if they want to confirm first, null if not yet clear'),
                    profile_complete: z.boolean().describe('true only when display_name AND local_currency are both known'),
                  }),
                  prompt: `Extract the user's setup preferences from this onboarding conversation:\n\n${transcript}\n\nReturn null for any field that hasn't been clearly stated.`,
                });

                if (profile.display_name || profile.local_currency || profile.execution_mode) {
                  send({ type: 'onboarding_data', profile });
                }

                if (profile.profile_complete && profile.display_name && profile.local_currency) {
                  // Save and mark complete on the server
                  await updateUserSettings(userId, {
                    display_name:   profile.display_name,
                    local_currency: profile.local_currency,
                    ...(profile.execution_mode ? { execution_mode: profile.execution_mode } : {}),
                  });
                  await markOnboardingComplete(userId);

                  // Provision wallet (non-fatal)
                  try {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const execution = await import('@intend/execution' as any);
                    const NETWORK = process.env['NODE_ENV'] === 'production' ? 'base' : 'base-sepolia';
                    await (execution as { getOrCreateWallet: (id: string, net: string) => Promise<unknown> }).getOrCreateWallet(userId, NETWORK);
                  } catch { /* non-fatal */ }

                  send({ type: 'onboarding_complete' });
                }
              } catch { /* extraction is non-fatal */ }
            }
          }

          send({ type: 'done' });
          controller.close();
          return;
        }

        // 3b. HIGH confidence financial intent → generate plan
        const recipientRaw  = intention.parameters.recipient_raw ?? '';
        const resolvedAddress = isEvmAddress(recipientRaw) ? recipientRaw : '';
        const amountRaw     = intention.parameters.amount ?? 0;
        const amountUsd     = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;

        let goalId: string | undefined;
        if (intention.primitive === 'SAVE') {
          const goalName = intention.parameters.goal_name;
          const matched  = goalName
            ? ufm.present.active_goals.find(g => g.name.toLowerCase() === goalName.toLowerCase())
            : ufm.present.active_goals[0];
          goalId = matched?.id;
        }

        const stratCtx = {
          network:        (process.env['NODE_ENV'] === 'production' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet',
          recipientType:  'claim' as const,
          ...(goalId ? { goalId } : {}),
          inboundAsset:   intention.parameters.asset_from ?? 'USDC',
          inboundAmount:  typeof intention.parameters.amount === 'number' ? intention.parameters.amount : 0,
          resolvedAddress,
          isNewRecipient: resolvedAddress !== '',
        };

        const plan = await generatePlan(intention, ufm, stratCtx);

        const intentRow = await createIntent(userId, 'web', intention);
        const fullPlan  = { ...plan, plan_id: intentRow.intent_id, created_at: intentRow.created_at };

        await cacheSet(keys.planCache(intentRow.intent_id), fullPlan, TTL.PLAN_CACHE);

        // Stream confirmation preview
        const textStream = await streamConfirmationMessage(fullPlan, ufm);
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

Your goal in this conversation is to learn three things, naturally:
1. What to call them (their first name or preferred name)
2. Their primary day-to-day currency (e.g. US dollars, Ghanaian cedis, British pounds)
3. How they want Intend to act: should Intend always show a plan and wait for confirmation ("guided"), or just act within limits and report back ("autonomous")?

Rules for this conversation:
- Be warm, brief, and conversational — no long paragraphs
- Ask one question at a time
- Don't use bullet points or numbered lists
- Don't explain DeFi, blockchain, or protocols
- Don't mention wallets or technical setup — just focus on them
- When you have their name and currency, you can confirm everything in one sentence and say you're ready
- ${hasName ? `Their name is already set to "${existingName}" — you can use it and skip asking for name, but still ask about currency and mode.` : 'Start by warmly greeting them and asking their name.'}

Keep each message under 3 sentences. Be human.`;
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

Your capabilities:
- Store funds safely on the user's behalf — Intend holds assets and acts on them when the user intends something (this is the default state for deposited funds)
- Protect money from inflation and currency risk
- Grow idle capital (yield generation)
- Move money to anyone, anywhere
- Convert between currencies at best rates
- Save toward named goals
- Earn on incoming funds
- Invest in assets the user believes in
- Spend via any payment rail

Important rules you never break:
1. Never name protocols, chains, or DeFi infrastructure to the user — speak in outcomes only
2. Never guarantee returns — use "historically", "typically", "expected to"
3. Never give direct financial advice — present facts and options
4. Never reveal technical implementation details
5. When sharing a wallet address, always show the full address — never truncate

Your voice:
- Warm but not effusive. Confident. Direct.
- One idea per sentence.
- Use numbers over adjectives: "$47 earned" not "a decent return"
- Never start with "Great question!" or similar filler
- Short responses — never more than 3-4 sentences for casual messages
- If the user seems ready to take a financial action, gently guide them toward expressing their intention

You have full context of their financial situation. Use it to make responses feel personal and relevant.`;
}

