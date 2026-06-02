import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function formatRupiah(num: number): string {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-webhook-secret');
  if (secret !== (process.env.WEBHOOK_SECRET || 'super-secret-key-123')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 503 });
  }

  try {
    const { command, args } = await req.json();
    const cmd = (command || '').toLowerCase().trim();

    if (cmd === 'bantuan' || cmd === 'help') {
      return NextResponse.json({
        text:
          `*SimpleSplit Bot — Perintah Grup*\n\n` +
          `!bot [pesan] — ngobrol atau catat hutang otomatis pakai AI\n` +
          `!hutang @nama — hutang aktif seseorang\n` +
          `!ringkasan — semua hutang aktif\n` +
          `!history @nama — history bulan ini\n` +
          `!lunas @nama Rp[X] — tandai lunas (perlu konfirmasi)\n` +
          `!bantuan — tampilkan daftar ini`,
      });
    }

    if (cmd === 'bot') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ text: '⚠️ Gemini API Key belum dikonfigurasi di server.' });

      const promptText = args.join(' ');
      if (!promptText) return NextResponse.json({ text: '🤖 Ya bos? Ketik pesanmu setelah !bot.' });

      const { data: debts } = await supabase
        .from('debts')
        .select('id, amount, status, notes, debtor:debtor_id(id, name), creditor:creditor_id(id, name), bill:bill_id(title)')
        .eq('status', 'unpaid');
        
      const { data: friends } = await supabase.from('friends').select('id, name');
      const { data: bills } = await supabase.from('bills').select('id, title, status, total_amount, created_at, paid_by(name)').order('created_at', { ascending: false }).limit(10);

      const systemPrompt = `Kamu adalah bot asisten keuangan WhatsApp "SimpleSplit" yang super pintar. Bahasamu gaul, asik, tapi tetap sopan.

TUGAS UTAMAMU:
1. Jika user bertanya data hutang/ringkasan, jawablah berdasarkan DATA HUTANG.
2. Jika user MEMINTA UNTUK MENCATAT HUTANG BARU (misal: "catatin Budi ngutang ke aku 50rb"), kembalikan JSON create_debt.
3. Jika user MEMINTA MENGHAPUS HUTANG SESEORANG (misal: "hapus tagihan bensin faiz" atau "batalkan hutang sate"), cari ID hutang di DATA HUTANG lalu kembalikan JSON delete_debt.
4. Jika user MEMINTA MENGHAPUS TAGIHAN SECARA KESELURUHAN (misal: "hapus bill kisah manis huis" atau "hapus tagihan kisah manis huis"), cari ID tagihan di DATA TAGIHAN KESELURUHAN lalu kembalikan JSON delete_bill.

ATURAN OUTPUT JSON UNTUK MENCATAT HUTANG:
{
  "action": "create_debt",
  "debtor_name": "Nama teman yang berhutang",
  "creditor_name": "Nama teman yang memberi hutangan",
  "amount": 50000,
  "notes": "Alasan/Catatan singkat"
}

ATURAN OUTPUT JSON UNTUK MENGHAPUS HUTANG:
{
  "action": "delete_debt",
  "debt_id": "masukkan ID hutang dari DATA HUTANG yang paling cocok"
}

ATURAN OUTPUT JSON UNTUK MENGHAPUS TAGIHAN KESELURUHAN (BILL):
{
  "action": "delete_bill",
  "bill_id": "masukkan ID tagihan (id) dari DATA TAGIHAN KESELURUHAN yang paling cocok"
}

Jika kamu mengeluarkan JSON di atas, JANGAN tambahkan teks sapaan apapun.
Jika user BUKAN meminta mencatat/menghapus hutang/tagihan, jawablah dengan TEKS GAUL biasa (gunakan *asterisk* untuk bold).

DATA HUTANG AKTIF SAAT INI:
${JSON.stringify(debts, null, 2)}
DATA TAGIHAN KESELURUHAN:
${JSON.stringify(bills, null, 2)}
DATA TEMAN:
${JSON.stringify(friends, null, 2)}`;

      // Multi-model fallback (urutkan: model terbaik dulu, volume tinggi di akhir sebagai safety net)
      const AI_MODELS = [
        'gemini-2.5-flash',
        'gemini-3.5-flash',
        'gemini-3-flash',
        'gemini-3.1-flash-lite',  // 500 RPD, safety net
        'gemini-2.5-flash-lite',
      ];

      let aiData: any = null;
      for (const model of AI_MODELS) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: systemPrompt + '\n\nChat dari user: ' + promptText }] }]
            })
          });

          if (response.ok) {
            aiData = await response.json();
            console.log(`[bot] AI model ${model} berhasil.`);
            break;
          }
          console.warn(`[bot] Model ${model} gagal (${response.status}), coba model selanjutnya...`);
        } catch (e: any) {
          console.warn(`[bot] Model ${model} error: ${e.message}`);
        }
      }

      if (!aiData) {
        return NextResponse.json({ text: '⚠️ Semua model AI sedang sibuk/kena limit. Coba lagi nanti ya bos!' });
      }

      let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
      aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

      if (!aiText) {
        return NextResponse.json({ text: 'Waduh, otak gue lagi nge-blank nih bro. Coba tanya lagi nanti ya.' });
      }

      // Cek apakah AI membalas dengan JSON
      if (aiText.startsWith('{') && aiText.includes('"action"')) {
        try {
          const parsed = JSON.parse(aiText);
          
          if (parsed.action === 'create_debt') {
            const debtor = friends?.find(f => f.name.toLowerCase().includes(String(parsed.debtor_name).toLowerCase()));
            const creditor = friends?.find(f => f.name.toLowerCase().includes(String(parsed.creditor_name).toLowerCase()));
            
            if (!debtor || !creditor) {
              return NextResponse.json({ text: `❌ Gagal mencatat otomatis: Gak nemu nama teman yang cocok untuk ${parsed.debtor_name} atau ${parsed.creditor_name}. Coba cek ejaan namanya!` });
            }

            const { data: bill } = await supabase
              .from('bills')
              .insert({ title: 'Tagihan Manual via AI', total_amount: parsed.amount, paid_by: creditor.id, status: 'assigned' })
              .select().single();

            if (bill) {
              await supabase.from('debts').insert({
                bill_id: bill.id,
                debtor_id: debtor.id,
                creditor_id: creditor.id,
                amount: parsed.amount,
                status: 'unpaid',
                notes: `[AI] ${parsed.notes}`
              });

              return NextResponse.json({ text: `🤖 *SIAP BOS!* Hutang sukses dicatat.\n\n👤 *${debtor.name}* berhutang *${formatRupiah(parsed.amount)}* ke *${creditor.name}*.\n📝 Catatan: ${parsed.notes}` });
            }
          }

          if (parsed.action === 'delete_debt') {
            if (!parsed.debt_id) {
              return NextResponse.json({ text: `❌ Gagal menghapus: AI nggak nemu ID hutangnya di database.` });
            }
            
            // Get bill ID before deleting
            const { data: debtToDelete } = await supabase.from('debts').select('bill_id, bill:bills(title)').eq('id', parsed.debt_id).maybeSingle();

            const { error } = await supabase.from('debts').delete().eq('id', parsed.debt_id);
            if (error) {
              return NextResponse.json({ text: `❌ Gagal menghapus dari database: ${error.message}` });
            }

            // Cleanup empty AI bills
            if (debtToDelete?.bill_id) {
              const { count } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('bill_id', debtToDelete.bill_id);
              if (count === 0 && (debtToDelete.bill as any)?.title === 'Tagihan Manual via AI') {
                await supabase.from('bills').delete().eq('id', debtToDelete.bill_id);
              }
            }

            return NextResponse.json({ text: `🤖 *BERES!* Hutang tersebut sudah gue hapus dari buku catatan ya bos!` });
          }

          if (parsed.action === 'delete_bill') {
            if (!parsed.bill_id) {
              return NextResponse.json({ text: `❌ Gagal menghapus: AI nggak nemu ID tagihannya di database.` });
            }
            const { error } = await supabase.from('bills').delete().eq('id', parsed.bill_id);
            if (error) {
              return NextResponse.json({ text: `❌ Gagal menghapus tagihan dari database: ${error.message}` });
            }
            return NextResponse.json({ text: `🤖 *BERES!* Tagihan utuh tersebut beserta seluruh utangnya sudah gue sapu bersih bos! 🧹` });
          }

        } catch (e) {
          console.error("Failed to parse AI JSON", e);
        }
      }

      return NextResponse.json({ text: aiText });
    }

    if (cmd === 'ringkasan') {
      const { data: debts } = await supabase
        .from('debts')
        .select('amount, status, debtor:debtor_id(name), creditor:creditor_id(name), bill:bill_id(title)')
        .eq('status', 'unpaid');

      const list = debts || [];
      const total = list.reduce((s, d) => s + Number(d.amount), 0);
      
      let text = `📊 *Ringkasan Keseluruhan*\nTotal Hutang Aktif: *${formatRupiah(total)}*\n\n`;
      
      if (list.length === 0) {
        text += `✅ _Semua hutang sudah lunas! Tidak ada tagihan aktif._ 🎉`;
      } else {
        const byDebtor: Record<string, typeof list> = {};
        list.forEach(d => {
          const debtorName = (d.debtor as { name?: string })?.name || 'Seseorang';
          if (!byDebtor[debtorName]) byDebtor[debtorName] = [];
          byDebtor[debtorName].push(d);
        });
        
        for (const [debtor, userDebts] of Object.entries(byDebtor)) {
          text += `👤 *${debtor}* perlu membayar:\n`;
          userDebts.forEach(d => {
            const creditorName = (d.creditor as { name?: string })?.name || '?';
            const billTitle = (d.bill as { title?: string })?.title || 'Tagihan';
            text += `   - ${formatRupiah(Number(d.amount))} ke ${creditorName} (${billTitle})\n`;
          });
          text += `\n`;
        }
      }

      return NextResponse.json({ text: text.trim() });
    }

    if (cmd === 'hutang') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      if (!nameQuery) {
        return NextResponse.json({ text: '⚠️ Format: !hutang @nama' });
      }

      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        return NextResponse.json({ text: `❌ Teman "${nameQuery}" tidak ditemukan.` });
      }

      const { data: debts } = await supabase
        .from('debts')
        .select('amount, notes, bill:bill_id(title, bill_date), creditor:creditor_id(name)')
        .eq('debtor_id', friend.id)
        .eq('status', 'unpaid');

      if (!debts?.length) {
        return NextResponse.json({ text: `✅ *${friend.name}* tidak punya hutang aktif.` });
      }

      let text = `💰 *Hutang ${friend.name}*\n\n`;
      debts.forEach(d => {
        const bill = d.bill as { title?: string; bill_date?: string } | null;
        const creditorName = (d.creditor as { name?: string })?.name || 'Seseorang';
        
        text += `🧾 *${bill?.title || 'Bill'}* (ke ${creditorName})\n`;
        text += `   Nominal: *${formatRupiah(Number(d.amount))}*\n`;
        
        if (d.notes) {
          const noteLines = String(d.notes).split('\n').filter(Boolean);
          const nettingLines = noteLines.filter((line: string) => line.includes('NETTING OTOMATIS'));
          
          if (nettingLines.length > 0) {
            text += `   📌 Catatan Netting:\n`;
            nettingLines.forEach((line: string) => {
              text += `      - ${line.trim().replace('🔄 ', '')}\n`;
            });
          }
        }
        text += `\n`;
      });
      return NextResponse.json({ text: text.trim() });
    }

    if (cmd === 'history') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        return NextResponse.json({ text: `❌ Teman tidak ditemukan.` });
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: debts } = await supabase
        .from('debts')
        .select('status, amount')
        .or(`debtor_id.eq.${friend.id},creditor_id.eq.${friend.id}`)
        .gte('created_at', startOfMonth.toISOString());

      const paid = debts?.filter(d => d.status === 'paid').length || 0;
      const pending = debts?.filter(d => d.status === 'unpaid').length || 0;

      return NextResponse.json({
        text: `📜 *History ${friend.name}* (bulan ini)\n${debts?.length || 0} transaksi — ${paid} lunas, ${pending} pending`,
      });
    }

    if (cmd === 'lunas') {
      return NextResponse.json({
        text: '⏳ Fitur !lunas via grup memerlukan konfirmasi penerima di web app. Buka simplesplit untuk approve.',
      });
    }

    return NextResponse.json({ text: '❓ Perintah tidak dikenal. Ketik !bantuan' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
