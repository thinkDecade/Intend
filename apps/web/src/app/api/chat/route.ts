import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getUserById, getActiveGoals, getActivePositions, getPendingConfirmations, createIntent } from '@intend/data';
import { buildUFM, interpretIntent, streamConfirmationMessage } from '@intend/intelligence';
import { generatePlan } from '@intend/decision';
import { isAddress } from 'viem';

// ── Helper: SSE event ──────────────────────────────────────────────────────

function sseEvent(data: object): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

// ── POST /api/chat ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Auth guard — user must be authenticated
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { message?: string; userId?: string };
  const message = body.message?.trim();
  if (!message) return NextResponse.json({ error: 'message required' }, { status: 400 });

  // userId from body must match authenticated session
  const userId = body.userId ?? '';

  // 2. Stream response setup
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      function send(event: object) {
        controller.enqueue(encoder.encode(sseEvent(event)));
      }

      try {
        // 3. Build UFM
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
          balances: [], // Web app display — chain balances fetched in portfolio panel
          activePositions: positions.map(p => ({
            id:          p.position_id,
            asset:       p.asset,
            protocol:    p.protocol,
            amount:      Number(p.amount_deposited),
            usd_value:   Number(p.amount_current),
            apy_at_entry: Number(p.apy_at_entry ?? 0),
            opened_at:   p.opened_at,
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

        // 4. Interpret intent
        const interpretation = await interpretIntent(message, ufm);
        const { intention, needs_clarification, clarification_question } = interpretation;

        // 5. Handle clarification
        if (needs_clarification && clarification_question) {
          send({ type: 'text', content: clarification_question });
          send({ type: 'done' });
          controller.close();
          return;
        }

        // 6. Build strategy context
        const recipientRaw = intention.parameters.recipient_raw ?? '';
        const resolvedAddress = isAddress(recipientRaw) ? recipientRaw : '';
        const amountRaw = intention.parameters.amount ?? 0;
        const amountUsd = amountRaw === 'all' ? ufm.present.total_usd_value : amountRaw;

        let goalId: string | undefined;
        if (intention.primitive === 'SAVE') {
          const goalName = intention.parameters.goal_name;
          const matched = goalName
            ? ufm.present.active_goals.find(g => g.name.toLowerCase() === goalName.toLowerCase())
            : ufm.present.active_goals[0];
          goalId = matched?.id;
        }

        const stratCtx = {
          network: (process.env['NODE_ENV'] === 'production' ? 'mainnet' : 'testnet') as 'mainnet' | 'testnet',
          recipientType: 'claim' as const,
          ...(goalId ? { goalId } : {}),
          inboundAsset:  intention.parameters.asset_from ?? 'USDC',
          inboundAmount: typeof intention.parameters.amount === 'number' ? intention.parameters.amount : 0,
          resolvedAddress,
          isNewRecipient: resolvedAddress !== '',
        };

        // 7. Generate execution plan
        const plan = await generatePlan(intention, ufm, stratCtx);

        // 8. Record intent in DB
        const intentRow = await createIntent(userId, 'web', intention);
        const fullPlan = { ...plan, plan_id: intentRow.intent_id, created_at: intentRow.created_at };

        // 9. Stream confirmation preview
        const textStream = await streamConfirmationMessage(fullPlan, ufm);
        for await (const chunk of textStream) {
          send({ type: 'text', content: chunk });
        }

        // 10. Send plan metadata for confirm/cancel buttons
        send({
          type:      'plan',
          plan: {
            intent_id:  intentRow.intent_id,
            plan_id:    fullPlan.plan_id,
            primitive:  intention.primitive,
            fees_total: fullPlan.fees.total_usd,
            amount_usd: amountUsd,
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
