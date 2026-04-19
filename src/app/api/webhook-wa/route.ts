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

    // Forward the payload to the VPS Bot
    const botUrl = process.env.VPS_BOT_URL || 'http://202.155.143.184:8803/webhook';
    const webhookSecret = process.env.WEBHOOK_SECRET || 'super-secret-key-123';

    // Use AbortController for timeout (10 seconds)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(botUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errText = await response.text();
        console.error('Bot VPS replied with error:', response.status, errText);
        
        let userMessage = 'Gagal menghubungi Bot WA';
        if (response.status === 503) {
          userMessage = 'Bot WA belum terhubung. Scan QR dulu di VPS!';
        } else if (response.status === 401) {
          userMessage = 'Webhook secret tidak cocok';
        }
        
        return NextResponse.json(
          { error: userMessage, details: errText },
          { status: 502 }
        );
      }

      const result = await response.json();
      return NextResponse.json({ 
        success: true, 
        message: 'Webhook terkirim ke VPS',
        sent: result.sent || 0,
        failed: result.failed || 0,
      });
    } catch (fetchError: any) {
      clearTimeout(timeout);
      
      if (fetchError.name === 'AbortError') {
        console.error('Bot VPS timeout after 10s');
        return NextResponse.json(
          { error: 'Bot WA tidak merespon (timeout). Pastikan bot berjalan di VPS.' },
          { status: 504 }
        );
      }
      
      console.error('Bot VPS unreachable:', fetchError.message);
      return NextResponse.json(
        { error: 'Tidak bisa menghubungi Bot WA. Pastikan bot berjalan di VPS.', details: fetchError.message },
        { status: 502 }
      );
    }
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
