import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const botUrl = process.env.VPS_BOT_URL || 'http://localhost:8803/webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-key-123';

    const supabase = getSupabaseAdmin();
    let groupJid: string | undefined;

    if (supabase) {
      const { data: groupSettings } = await supabase
        .from('wa_group_settings')
        .select('group_jid')
        .eq('is_active', true)
        .maybeSingle();
      groupJid = groupSettings?.group_jid;
    }

    if (!groupJid) {
      return NextResponse.json({ skipped: true, reason: 'no_group_linked' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(botUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify({
        ...payload,
        type: payload.type || 'group_notify',
        groupJid,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      return NextResponse.json({ error: 'Bot error', details: errText }, { status: 502 });
    }

    const result = await response.json();
    return NextResponse.json({ success: true, ...result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
