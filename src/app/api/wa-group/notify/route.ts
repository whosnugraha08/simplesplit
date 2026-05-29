import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const botUrl = process.env.VPS_BOT_URL || 'http://localhost:8803/webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-key-123';

    const { data: groupSettings } = await supabaseAdmin
      .from('wa_group_settings')
      .select('group_jid')
      .eq('is_active', true)
      .maybeSingle();

    if (!groupSettings?.group_jid) {
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
        groupJid: groupSettings.group_jid,
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
