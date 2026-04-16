import { type NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import { getSupabase, logEvent } from '@intend/data';

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const supabase = createClient(cookieStore);
  const { data: { user: authUser } } = await supabase.auth.getUser();
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { intent_id?: string; action?: 'confirm' | 'cancel' };
  const { intent_id, action } = body;

  if (!intent_id || !action) {
    return NextResponse.json({ error: 'intent_id and action required' }, { status: 400 });
  }

  const db = getSupabase();

  if (action === 'cancel') {
    await db.from('intents').update({ status: 'cancelled' }).eq('intent_id', intent_id);
    return NextResponse.json({ success: true });
  }

  // Confirm: mark intent as confirmed
  const { data: intent } = await db
    .from('intents')
    .select('user_id, status')
    .eq('intent_id', intent_id)
    .single();

  if (!intent) return NextResponse.json({ error: 'Intent not found' }, { status: 404 });
  if (intent.status !== 'pending') {
    return NextResponse.json({ error: `Intent is already ${intent.status as string}` }, { status: 409 });
  }

  await db
    .from('intents')
    .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
    .eq('intent_id', intent_id);

  await logEvent({
    user_id:    intent.user_id as string,
    event_type: 'intent_confirmed',
    source:     'web',
    event_data: {},
    intent_id,
  });

  // Execution dispatched asynchronously by the bot worker or server-side cron.
  // The WebApp marks the intent as confirmed — the execution layer picks it up.
  return NextResponse.json({ success: true });
}
