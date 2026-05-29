import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();

    // Fetch the payer's payment methods
    if (payload.bill && payload.bill.paid_by) {
      const { data: pmData } = await supabase
        .from('payment_methods')
        .select('*')
        .eq('friend_id', payload.bill.paid_by);
      
      const hasQris = pmData?.some(pm => pm.type === 'qris') || false;
      payload.payerHasQris = hasQris;
      payload.paymentMethods = pmData || [];
    }

    // Always try to attach the linked WA group JID
    try {
      const adminClient = getSupabaseAdmin();
      if (adminClient) {
        const { data: groupSettings } = await adminClient
          .from('wa_group_settings')
          .select('group_jid')
          .eq('is_active', true)
          .maybeSingle();
        if (groupSettings?.group_jid) {
          payload.groupJid = groupSettings.group_jid;
        }
      }
    } catch (e) {
      console.error('Failed to fetch group JID for webhook:', e);
    }

    // Save payload to bot_queue instead of forwarding via HTTP
    const adminClient = getSupabaseAdmin();
    if (!adminClient) {
      console.warn('⚠️ Supabase admin client not found, cannot queue bot message.');
      return NextResponse.json({ success: false, error: 'Admin client not configured' }, { status: 500 });
    }

    const { error: insertError } = await adminClient
      .from('bot_queue')
      .insert({ payload });

    if (insertError) {
      console.error('Failed to insert into bot_queue:', insertError);
      return NextResponse.json({ success: false, error: 'Failed to queue message' }, { status: 500 });
    }

    return NextResponse.json({ success: true, queued: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
