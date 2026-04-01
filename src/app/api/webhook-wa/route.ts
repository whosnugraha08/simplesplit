import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

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

    // In a real production app, you might want to authenticate this request
    // using a session token to ensure only the bill owner can trigger it.
    
    // Forward the payload to the VPS Bot
    const botUrl = process.env.VPS_BOT_URL || 'http://202.155.143.184:8803/webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-key-123';

    const response = await fetch(botUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': webhookSecret,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Bot VPS replied with error:', response.status, errText);
      return NextResponse.json(
        { error: 'Gagal menembak webhook ke VPS', details: errText },
        { status: 502 }
      );
    }

    return NextResponse.json({ success: true, message: 'Webhook terkirim ke VPS' });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
