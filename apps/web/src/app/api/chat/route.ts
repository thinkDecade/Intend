import { type NextRequest, NextResponse } from 'next/server';
import { streamText }  from 'ai';
import { cookies }     from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import {
  getUserById, getActiveGoals, getActivePositions, getPendingConfirmations,
  createIntent, cacheSet, keys, TTL,
} from '@intend/data';
import {
  buildUFM, interpretIntent, streamConfirmationMessage, detectModeSwitch,
} from '@intend/intelligence';
import { updateUserSettings, logEvent } from '@intend/data';
import { generatePlan } from '@intend/decision';
import { getModel } from '@intend/intelligence';

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
    message?: string;
    userId?:  string;
    history?: HistoryMessage[];
  };

  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  const userId  = body.userId ?? '';
  const history = (body.history ?? []).slice(-20); // cap at last 20 messages

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

        const [positions, goals, pending] = await Promise.all([
          getActivePositions(userId).catch(() => []),
          getActiveGoals(userId).catch(() => []),
          getPendingConfirmations(userId).catch(() => []),
        ]);

        const ufm = await buildUFM(userId, {
          balances: [],
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

        // 3a. LOW confidence or conversational → respond with streaming chat
        if (!isHighConfidenceFinancial) {
          const systemPrompt = buildConversationalSystemPrompt(ufm, dbUser.display_name);
          const messages = [
            ...history.map(h => ({ role: h.role as 'user' | 'assistant', content: h.content })),
            { role: 'user' as const, content: message },
          ];

          // If there's a clarification question AND it makes sense for a financial intent, use it
          // Otherwise respond conversationally
          if (needs_clarification && clarification_question && intention.intent_confidence > 0.4) {
            send({ type: 'text', content: clarification_question });
            send({ type: 'done' });
            controller.close();
            return;
          }

          // Pure conversation — stream a natural response with full history
          const { textStream } = streamText({
            model: getModel('primary'),
            system: systemPrompt,
            messages,
          });

          for await (const chunk of textStream) {
            send({ type: 'text', content: chunk });
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

// ── Conversational system prompt ───────────────────────────────────────────

function buildConversationalSystemPrompt(
  ufm: Awaited<ReturnType<typeof buildUFM>>,
  displayName: string | null,
): string {
  const name = displayName ?? 'there';
  return `You are Intend — a world-class personal financial concierge. You are warm, direct, and genuinely helpful. You speak like a trusted friend who happens to be a financial expert.

The user's name is ${name}.

Your capabilities:
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

Your voice:
- Warm but not effusive. Confident. Direct.
- One idea per sentence.
- Use numbers over adjectives: "$47 earned" not "a decent return"
- Never start with "Great question!" or similar filler
- Short responses — never more than 3-4 sentences for casual messages
- If the user seems ready to take a financial action, gently guide them toward expressing their intention

You have full context of their financial situation. Use it to make responses feel personal and relevant.`;
}

