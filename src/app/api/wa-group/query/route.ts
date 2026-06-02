import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function formatRupiah(num: number): string {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

// Model fallback — sesuai Free Tier yang tersedia
const AI_MODELS = [
  'gemini-2.5-flash',
  'gemini-3.5-flash',
  'gemini-3-flash',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
];

async function callGemini(apiKey: string, prompt: string): Promise<string | null> {
  for (const model of AI_MODELS) {
    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        if (text) return text;
      }
      console.warn(`[bot] Model ${model} gagal (${response.status})`);
    } catch (e: any) {
      console.warn(`[bot] Model ${model} error: ${e.message}`);
    }
  }
  return null;
}

function extractJson(text: string): any | null {
  // Bersihkan markdown fences
  let clean = text.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // Coba parse langsung
  try { return JSON.parse(clean); } catch {}

  // Cari JSON object pertama di dalam teks
  const objMatch = clean.match(/\{[\s\S]*"action"[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  // Cari JSON array
  const arrMatch = clean.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }

  return null;
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
          `!scan — scan struk dan bikin polling otomatis\n` +
          `!idku [nama] — hubungkan WA kamu ke nama di web\n` +
          `!hutang @nama — hutang aktif seseorang\n` +
          `!ringkasan — semua hutang aktif\n` +
          `!history @nama — history bulan ini\n` +
          `!selesai — selesaikan polling aktif\n` +
          `!batal — batalkan polling aktif\n` +
          `!bantuan — tampilkan daftar ini`,
      });
    }

    if (cmd === 'bot') {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) return NextResponse.json({ text: '⚠️ Gemini API Key belum dikonfigurasi di server.' });

      const promptText = (args || []).join(' ').trim();
      if (!promptText) return NextResponse.json({ text: '🤖 Ya bos? Ketik pesanmu setelah !bot.\n\nContoh:\n• !bot siapa yang punya hutang?\n• !bot AL hutang 50rb ke Faiz buat bensin\n• !bot hapus tagihan nerd laboratory' });

      const { data: debts } = await supabase
        .from('debts')
        .select('id, amount, status, notes, debtor:debtor_id(id, name), creditor:creditor_id(id, name), bill:bill_id(id, title)')
        .eq('status', 'unpaid');
        
      const { data: friends } = await supabase.from('friends').select('id, name');
      const { data: bills } = await supabase.from('bills').select('id, title, status, total_amount, created_at, paid_by(name)').order('created_at', { ascending: false }).limit(20);

      // Buat ringkasan hutang yang lebih readable untuk AI
      const debtSummary = (debts || []).map(d => {
        const debtor = (d.debtor as any)?.name || '?';
        const creditor = (d.creditor as any)?.name || '?';
        const bill = (d.bill as any)?.title || '?';
        return `ID: ${d.id} | ${debtor} hutang ${formatRupiah(Number(d.amount))} ke ${creditor} (Bill: ${bill})`;
      }).join('\n') || '(Tidak ada hutang aktif)';

      const billSummary = (bills || []).map(b => {
        const payer = (b.paid_by as any)?.name || '?';
        return `ID: ${b.id} | "${b.title}" | ${formatRupiah(Number(b.total_amount))} | Status: ${b.status} | Ditalangi: ${payer}`;
      }).join('\n') || '(Tidak ada tagihan)';

      const friendNames = (friends || []).map(f => f.name).join(', ') || '(Belum ada teman)';

      const systemPrompt = `Kamu adalah bot keuangan WhatsApp "SimpleSplit". Bahasamu gaul tapi sopan.

DAFTAR TEMAN: ${friendNames}

HUTANG AKTIF:
${debtSummary}

TAGIHAN TERAKHIR:
${billSummary}

KEMAMPUAN KAMU:
1. Jawab pertanyaan tentang hutang/tagihan berdasarkan data di atas.
2. Catat hutang baru → kembalikan JSON:
   {"action":"create_debt","debtor_name":"yang berhutang","creditor_name":"yang dihutangi","amount":50000,"title":"Judul singkat","notes":"catatan"}
3. Hapus hutang → kembalikan JSON:
   {"action":"delete_debt","debt_id":"ID dari HUTANG AKTIF"}
4. Hapus tagihan utuh → kembalikan JSON:
   {"action":"delete_bill","bill_id":"ID dari TAGIHAN TERAKHIR"}
5. Catat BANYAK hutang sekaligus → kembalikan JSON array:
   [{"action":"create_debt",...},{"action":"create_debt",...}]

ATURAN PENTING:
- Jika mengeluarkan JSON, HANYA keluarkan JSON saja tanpa teks lain.
- "title" di create_debt = judul singkat deskriptif (contoh: "Bensin", "Makan Siang", "Parkir"). JANGAN pakai "Tagihan Manual via AI".
- "amount" HARUS angka positif dalam Rupiah (50rb = 50000, 1.5jt = 1500000).
- "debtor_name" dan "creditor_name" HARUS cocok dengan nama di DAFTAR TEMAN.
- Untuk pertanyaan biasa, jawab dengan teks biasa (gunakan *bold* untuk penekanan).`;

      const aiText = await callGemini(apiKey, systemPrompt + '\n\nUser: ' + promptText);
      if (!aiText) {
        return NextResponse.json({ text: '⚠️ Semua model AI sedang sibuk. Coba lagi nanti ya bos!' });
      }

      // Cek apakah AI mengembalikan JSON action
      const parsed = extractJson(aiText);
      if (parsed) {
        // Normalize: pastikan selalu array
        const actions = Array.isArray(parsed) ? parsed : [parsed];
        const results: string[] = [];
        let hasError = false;

        for (const action of actions) {
          if (!action.action) continue;

          try {
            if (action.action === 'create_debt') {
              const amount = Number(action.amount);
              if (!amount || amount <= 0) {
                results.push(`❌ Amount tidak valid: ${action.amount}`);
                hasError = true;
                continue;
              }

              const debtor = friends?.find(f => f.name.toLowerCase().includes(String(action.debtor_name || '').toLowerCase()));
              const creditor = friends?.find(f => f.name.toLowerCase().includes(String(action.creditor_name || '').toLowerCase()));
              
              if (!debtor || !creditor) {
                results.push(`❌ Nama tidak ditemukan: "${action.debtor_name || '?'}" atau "${action.creditor_name || '?'}"`);
                hasError = true;
                continue;
              }

              if (debtor.id === creditor.id) {
                results.push(`❌ ${debtor.name} tidak bisa berhutang ke diri sendiri.`);
                hasError = true;
                continue;
              }

              const billTitle = action.title || action.notes || 'Tagihan Bot';

              const { data: bill } = await supabase
                .from('bills')
                .insert({ title: billTitle, total_amount: amount, paid_by: creditor.id, status: 'assigned' })
                .select().single();

              if (bill) {
                await supabase.from('debts').insert({
                  bill_id: bill.id,
                  debtor_id: debtor.id,
                  creditor_id: creditor.id,
                  amount: amount,
                  status: 'unpaid',
                  notes: action.notes || billTitle
                });
                results.push(`✅ *${debtor.name}* hutang *${formatRupiah(amount)}* ke *${creditor.name}* (${billTitle})`);
              }
            }

            else if (action.action === 'delete_debt') {
              if (!action.debt_id) {
                results.push(`❌ ID hutang tidak ditemukan.`);
                hasError = true;
                continue;
              }
              
              const { data: debtToDelete } = await supabase.from('debts').select('bill_id, amount, debtor:debtor_id(name), creditor:creditor_id(name), bill:bill_id(title)').eq('id', action.debt_id).maybeSingle();
              
              if (!debtToDelete) {
                results.push(`❌ Hutang dengan ID tersebut tidak ditemukan.`);
                hasError = true;
                continue;
              }

              const { error } = await supabase.from('debts').delete().eq('id', action.debt_id);
              if (error) {
                results.push(`❌ Gagal menghapus: ${error.message}`);
                hasError = true;
                continue;
              }

              // Cleanup empty bills
              if (debtToDelete.bill_id) {
                const { count } = await supabase.from('debts').select('*', { count: 'exact', head: true }).eq('bill_id', debtToDelete.bill_id);
                if (count === 0) {
                  await supabase.from('bills').delete().eq('id', debtToDelete.bill_id);
                }
              }

              const debtorName = (debtToDelete.debtor as any)?.name || '?';
              const creditorName = (debtToDelete.creditor as any)?.name || '?';
              results.push(`✅ Hutang ${debtorName} ke ${creditorName} (${formatRupiah(Number(debtToDelete.amount))}) sudah dihapus.`);
            }

            else if (action.action === 'delete_bill') {
              if (!action.bill_id) {
                results.push(`❌ ID tagihan tidak ditemukan.`);
                hasError = true;
                continue;
              }

              const { data: billToDelete } = await supabase.from('bills').select('title').eq('id', action.bill_id).maybeSingle();
              
              if (!billToDelete) {
                results.push(`❌ Tagihan dengan ID tersebut tidak ditemukan.`);
                hasError = true;
                continue;
              }

              // ON DELETE CASCADE akan hapus debts & items juga
              const { error } = await supabase.from('bills').delete().eq('id', action.bill_id);
              if (error) {
                results.push(`❌ Gagal menghapus: ${error.message}`);
                hasError = true;
                continue;
              }
              results.push(`✅ Tagihan "${billToDelete.title}" beserta hutangnya sudah dihapus bersih. 🧹`);
            }
          } catch (e: any) {
            results.push(`❌ Error: ${e.message}`);
            hasError = true;
          }
        }

        if (results.length > 0) {
          const emoji = hasError ? '🤖' : '🤖';
          return NextResponse.json({ text: `${emoji} *Hasil:*\n\n${results.join('\n')}` });
        }
      }

      // AI menjawab dengan teks biasa (bukan JSON action)
      const cleanText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
      return NextResponse.json({ text: cleanText });
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
          const debtorTotal = userDebts.reduce((s, d) => s + Number(d.amount), 0);
          text += `👤 *${debtor}* — Total: *${formatRupiah(debtorTotal)}*\n`;
          userDebts.forEach(d => {
            const creditorName = (d.creditor as { name?: string })?.name || '?';
            const billTitle = (d.bill as { title?: string })?.title || 'Tagihan';
            text += `   └ ${formatRupiah(Number(d.amount))} ke ${creditorName} (${billTitle})\n`;
          });
          text += `\n`;
        }
      }

      return NextResponse.json({ text: text.trim() });
    }

    if (cmd === 'hutang') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      if (!nameQuery) {
        return NextResponse.json({ text: '⚠️ Format: !hutang NamaTeman\nContoh: !hutang AL' });
      }

      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        const available = friends?.map(f => f.name).join(', ') || '-';
        return NextResponse.json({ text: `❌ Teman "${nameQuery}" tidak ditemukan.\n\nTeman yang terdaftar: ${available}` });
      }

      const { data: debtsAsDebtor } = await supabase
        .from('debts')
        .select('amount, notes, bill:bill_id(title, bill_date), creditor:creditor_id(name)')
        .eq('debtor_id', friend.id)
        .eq('status', 'unpaid');

      const { data: debtsAsCreditor } = await supabase
        .from('debts')
        .select('amount, notes, bill:bill_id(title, bill_date), debtor:debtor_id(name)')
        .eq('creditor_id', friend.id)
        .eq('status', 'unpaid');

      const owes = debtsAsDebtor || [];
      const owed = debtsAsCreditor || [];

      if (owes.length === 0 && owed.length === 0) {
        return NextResponse.json({ text: `✅ *${friend.name}* tidak punya hutang aktif. Bersih! 🎉` });
      }

      let text = `💰 *Keuangan ${friend.name}*\n\n`;

      if (owes.length > 0) {
        const totalOwes = owes.reduce((s, d) => s + Number(d.amount), 0);
        text += `📤 *Hutang (harus bayar): ${formatRupiah(totalOwes)}*\n`;
        owes.forEach(d => {
          const creditorName = (d.creditor as any)?.name || '?';
          const billTitle = (d.bill as any)?.title || 'Tagihan';
          text += `   └ ${formatRupiah(Number(d.amount))} ke ${creditorName} (${billTitle})\n`;
        });
        text += `\n`;
      }

      if (owed.length > 0) {
        const totalOwed = owed.reduce((s, d) => s + Number(d.amount), 0);
        text += `📥 *Piutang (belum diterima): ${formatRupiah(totalOwed)}*\n`;
        owed.forEach(d => {
          const debtorName = (d.debtor as any)?.name || '?';
          const billTitle = (d.bill as any)?.title || 'Tagihan';
          text += `   └ ${formatRupiah(Number(d.amount))} dari ${debtorName} (${billTitle})\n`;
        });
      }

      return NextResponse.json({ text: text.trim() });
    }

    if (cmd === 'history') {
      const nameQuery = (args?.[0] || '').replace('@', '').toLowerCase();
      if (!nameQuery) {
        return NextResponse.json({ text: '⚠️ Format: !history NamaTeman\nContoh: !history AL' });
      }

      const { data: friends } = await supabase.from('friends').select('id, name');
      const friend = friends?.find(f => f.name.toLowerCase().includes(nameQuery));

      if (!friend) {
        return NextResponse.json({ text: `❌ Teman "${nameQuery}" tidak ditemukan.` });
      }

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const { data: debts } = await supabase
        .from('debts')
        .select('status, amount, bill:bill_id(title)')
        .or(`debtor_id.eq.${friend.id},creditor_id.eq.${friend.id}`)
        .gte('created_at', startOfMonth.toISOString());

      const paid = debts?.filter(d => d.status === 'paid') || [];
      const pending = debts?.filter(d => d.status === 'unpaid') || [];
      const paidTotal = paid.reduce((s, d) => s + Number(d.amount), 0);
      const pendingTotal = pending.reduce((s, d) => s + Number(d.amount), 0);

      let text = `📜 *History ${friend.name}* (bulan ini)\n\n`;
      text += `📊 Total transaksi: ${debts?.length || 0}\n`;
      text += `✅ Lunas: ${paid.length} (${formatRupiah(paidTotal)})\n`;
      text += `⏳ Pending: ${pending.length} (${formatRupiah(pendingTotal)})\n`;

      return NextResponse.json({ text: text.trim() });
    }

    if (cmd === 'lunas') {
      return NextResponse.json({
        text: '⏳ Fitur !lunas via grup belum tersedia. Silakan buka web SimpleSplit untuk menandai lunas dan upload bukti bayar.',
      });
    }

    return NextResponse.json({ text: '❓ Perintah tidak dikenal. Ketik *!bantuan* untuk lihat daftar perintah.' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    console.error('[wa-group/query] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
