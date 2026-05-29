import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('wa_group_settings')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ group: data });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { group_jid, group_name, reminder_frequency } = body;

    if (!group_jid) {
      return NextResponse.json({ error: 'group_jid required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('wa_group_settings')
      .upsert(
        {
          group_jid,
          group_name: group_name || null,
          reminder_frequency: reminder_frequency || 'off',
          is_active: true,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'group_jid' },
      )
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ group: data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE() {
  const { error } = await supabaseAdmin
    .from('wa_group_settings')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('is_active', true);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
