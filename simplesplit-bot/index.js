// ============================================================
// SimpleSplit WhatsApp Bot v2.0
// Express webhook server + whatsapp-web.js client
// ============================================================

const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ── Configuration ───────────────────────────────────────────
const PORT = process.env.PORT || 8803;
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'super-secret-key-123';
const APP_URL = process.env.APP_URL || 'https://simplesplit.vercel.app';

// ── WhatsApp Client Setup ───────────────────────────────────
let isReady = false;
let lastQR = null;

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    // Use system-installed Chromium instead of Puppeteer's bundled Chrome
    executablePath: process.env.CHROME_PATH || '/usr/bin/chromium-browser' ,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--disable-gpu',
    ],
  },
});

client.on('qr', (qr) => {
  lastQR = qr;
  console.log('\n');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   📱 SCAN QR CODE INI PAKAI WA KAMU!    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
  qrcode.generate(qr, { small: true });
  console.log('');
  console.log('Buka WhatsApp > Linked Devices > Link a Device');
  console.log('');
});

client.on('ready', () => {
  isReady = true;
  lastQR = null;
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   ✅ BOT WHATSAPP SIAP!                  ║');
  console.log('║   Menunggu webhook dari SimpleSplit...    ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

client.on('authenticated', () => {
  console.log('🔐 WhatsApp authenticated!');
});

client.on('auth_failure', (msg) => {
  console.error('❌ Auth failure:', msg);
  isReady = false;
});

client.on('disconnected', (reason) => {
  console.log('⚠️  WhatsApp disconnected:', reason);
  isReady = false;
  // Try to reconnect after 5 seconds
  setTimeout(() => {
    console.log('🔄 Mencoba reconnect...');
    client.initialize().catch(console.error);
  }, 5000);
});

// ── Message Templates ───────────────────────────────────────

function formatRupiah(num) {
  return 'Rp ' + Number(num).toLocaleString('id-ID');
}

function buildPaymentInfo(paymentMethods) {
  if (!paymentMethods || paymentMethods.length === 0) return '';
  let info = '\n💳 *Metode Pembayaran:*\n';
  for (const pm of paymentMethods) {
    const label = pm.bank_name || pm.label || 'Transfer';
    if (pm.account_number) {
      info += `➥ ${label} - ${pm.account_number}\n`;
    }
    if (pm.qris_image_url) {
      info += `➥ QRIS tersedia di link bayar\n`;
    }
  }
  return info;
}

// Template: Kirim tagihan ke semua pengutang
function buildBillMessage(bill, items, debt, paymentMethods, payerHasQris) {
  const debtorName = debt.debtor?.name || 'Teman';
  const payerName = bill.paid_by_friend?.name || 'Seseorang';
  const payLink = `${APP_URL}/pay/${debt.id}`;

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `📋 *TAGIHAN BARU*\n\n`;
  msg += `Halo *${debtorName}*,\n`;
  msg += `Kamu punya tagihan dari *${payerName}* untuk:\n\n`;
  msg += `🏷️ *${bill.title || 'Bill'}*\n`;

  // Item details
  if (debt.notes) {
    const lines = debt.notes.split('\n').filter(l => l.trim());
    for (const line of lines) {
      msg += `  • ${line}\n`;
    }
  }

  msg += `\n💰 *Total: ${formatRupiah(debt.amount)}*\n`;
  msg += buildPaymentInfo(paymentMethods);
  msg += `\n🔗 *Bayar di sini:*\n${payLink}\n`;
  msg += `\n_(Pesan otomatis dari SimpleSplit)_`;

  return msg;
}

// Template: Reminder individual
function buildRemindMessage(bill, debt) {
  const debtorName = debt.debtor?.name || 'Teman';
  const payerName = bill.paid_by_friend?.name || 'Seseorang';
  const payLink = `${APP_URL}/pay/${debt.id}`;

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `🔔 *PENGINGAT TAGIHAN*\n\n`;
  msg += `Halo *${debtorName}*,\n`;
  msg += `Ini reminder dari *${payerName}* — kamu masih punya tagihan yang belum lunas:\n\n`;
  msg += `🏷️ *${bill.title || 'Bill'}*\n`;
  msg += `💰 *${formatRupiah(debt.amount)}*\n`;
  msg += `\n🔗 *Bayar di sini:*\n${payLink}\n`;
  msg += `\n_(Pesan otomatis dari SimpleSplit)_`;

  return msg;
}

// Template: Notifikasi "sudah bayar" ke penagih
function buildPaidMessage(bill, debt) {
  const debtorName = debt.debtor?.name || 'Seseorang';
  const payerName = bill.paid_by_friend?.name || 'Kamu';

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `✅ *PEMBAYARAN DITERIMA*\n\n`;
  msg += `Halo *${payerName}*,\n`;
  msg += `*${debtorName}* baru saja melunasi tagihannya:\n\n`;
  msg += `🏷️ *${bill.title || 'Bill'}*\n`;
  msg += `💰 *${formatRupiah(debt.amount)}*\n`;
  if (debt.proof_image_url) {
    msg += `\n📸 *Bukti transfer terlampir di atas* ☝️\n`;
  }
  msg += `\nSilakan cek mutasi rekening kamu ya! 🎉\n`;
  msg += `\n_(Pesan otomatis dari SimpleSplit)_`;

  return msg;
}

// Template: Pelunasan kolektif ("Bayar Semua")
function buildPaidAllMessage(bill, debts) {
  const payerName = bill.paid_by_friend?.name || 'Kamu';
  const debtorName = debts[0]?.debtor?.name || 'Seseorang';
  const total = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `✅ *PELUNASAN KOLEKTIF*\n\n`;
  msg += `Halo *${payerName}*,\n`;
  msg += `Mantap! *${debtorName}* baru saja melunasi *SEMUA* tunggakannya kepadamu.\n\n`;
  msg += `💰 *Total: ${formatRupiah(total)}* (${debts.length} Transaksi)\n\n`;
  msg += `📋 *Rincian:*\n`;

  debts.forEach((d, i) => {
    const title = d.bill?.title || bill.title || 'Bill';
    msg += `${i + 1}. ${title} — ${formatRupiah(d.amount)}\n`;
  });

  msg += `\nSilakan cek mutasi rekening kamu ya! 🎉\n`;
  msg += `\n_(Pesan otomatis dari SimpleSplit)_`;

  return msg;
}

// ── Send Message Helper ─────────────────────────────────────

async function sendWhatsApp(phoneNumber, message, imageUrl) {
  if (!isReady) {
    throw new Error('WhatsApp client belum ready. Scan QR dulu!');
  }

  // Normalize phone number to WhatsApp format
  let number = phoneNumber.replace(/[^0-9]/g, '');
  // Convert 08xxx to 628xxx
  if (number.startsWith('0')) {
    number = '62' + number.substring(1);
  }
  // Add @c.us suffix
  const chatId = number + '@c.us';

  try {
    // Check if the number is registered on WhatsApp
    const isRegistered = await client.isRegisteredUser(chatId);
    if (!isRegistered) {
      console.log(`⚠️  Nomor ${phoneNumber} tidak terdaftar di WhatsApp, skip.`);
      return { success: false, reason: 'not_registered' };
    }

    // Send image first if provided
    if (imageUrl && imageUrl.startsWith('http')) {
      try {
        console.log(`📷 Mengirim bukti pembayaran ke ${phoneNumber}...`);
        const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
        await client.sendMessage(chatId, media, { caption: message });
        console.log(`✅ Pesan + foto terkirim ke ${phoneNumber}`);
        return { success: true };
      } catch (imgErr) {
        console.log(`⚠️  Gagal kirim gambar, kirim teks saja:`, imgErr.message);
        // Fallback: send text only
        await client.sendMessage(chatId, message);
        console.log(`✅ Pesan (teks saja) terkirim ke ${phoneNumber}`);
        return { success: true };
      }
    }

    await client.sendMessage(chatId, message);
    console.log(`✅ Pesan terkirim ke ${phoneNumber}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Gagal kirim ke ${phoneNumber}:`, err.message);
    return { success: false, reason: err.message };
  }
}

// ── Express Webhook Server ──────────────────────────────────

const app = express();
app.use(express.json({ limit: '5mb' }));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: isReady ? 'ready' : 'not_ready',
    whatsapp: isReady ? 'connected' : (lastQR ? 'waiting_for_qr_scan' : 'initializing'),
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Main webhook endpoint
app.post('/webhook', async (req, res) => {
  // Verify secret
  const secret = req.headers['x-webhook-secret'];
  if (secret !== WEBHOOK_SECRET) {
    console.log('❌ Webhook secret mismatch');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (!isReady) {
    console.log('⚠️  Webhook diterima tapi WA belum ready');
    return res.status(503).json({ error: 'WhatsApp belum terhubung. Scan QR dulu!' });
  }

  const payload = req.body;
  const { bill, items, debts, type, paymentMethods, payerHasQris } = payload;

  if (!bill || !debts || debts.length === 0) {
    return res.status(400).json({ error: 'Payload tidak lengkap' });
  }

  console.log(`\n📨 Webhook diterima — type: ${type || 'tagihan'}, debts: ${debts.length}`);

  const results = [];

  try {
    // ── PAID ALL (kolektif) ───────────────────────────────
    if (type === 'paid_all') {
      const creditorPhone = bill.paid_by_friend?.whatsapp_number;
      if (creditorPhone) {
        const msg = buildPaidAllMessage(bill, debts);
        const result = await sendWhatsApp(creditorPhone, msg);
        results.push({ to: creditorPhone, ...result });
      } else {
        console.log('⚠️  Creditor tidak punya nomor WA');
        results.push({ to: 'creditor', success: false, reason: 'no_phone' });
      }
    }

    // ── PAID (single) ─────────────────────────────────────
    else if (type === 'paid') {
      const creditorPhone = bill.paid_by_friend?.whatsapp_number;
      if (creditorPhone) {
        const msg = buildPaidMessage(bill, debts[0]);
        const proofUrl = debts[0]?.proof_image_url || null;
        const result = await sendWhatsApp(creditorPhone, msg, proofUrl);
        results.push({ to: creditorPhone, ...result });
      } else {
        console.log('⚠️  Creditor tidak punya nomor WA');
        results.push({ to: 'creditor', success: false, reason: 'no_phone' });
      }
    }

    // ── REMIND ────────────────────────────────────────────
    else if (type === 'remind') {
      for (const debt of debts) {
        const phone = debt.debtor?.whatsapp_number;
        if (phone) {
          const msg = buildRemindMessage(bill, debt);
          const result = await sendWhatsApp(phone, msg);
          results.push({ to: phone, ...result });
          // Small delay between messages to avoid rate limiting
          if (debts.length > 1) await sleep(1500);
        } else {
          console.log(`⚠️  ${debt.debtor?.name || '?'} tidak punya nomor WA`);
          results.push({ to: debt.debtor?.name, success: false, reason: 'no_phone' });
        }
      }
    }

    // ── TAGIHAN (default — kirim ke semua pengutang) ──────
    else {
      for (const debt of debts) {
        const phone = debt.debtor?.whatsapp_number;
        if (phone) {
          const msg = buildBillMessage(bill, items, debt, paymentMethods, payerHasQris);
          const result = await sendWhatsApp(phone, msg);
          results.push({ to: phone, ...result });
          // Small delay between messages to avoid rate limiting
          if (debts.length > 1) await sleep(2000);
        } else {
          console.log(`⚠️  ${debt.debtor?.name || '?'} tidak punya nomor WA`);
          results.push({ to: debt.debtor?.name, success: false, reason: 'no_phone' });
        }
      }
    }

    const sent = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    console.log(`📊 Hasil: ${sent} terkirim, ${failed} gagal`);

    return res.json({ success: true, results, sent, failed });
  } catch (err) {
    console.error('❌ Error processing webhook:', err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Utility ─────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Start Everything ────────────────────────────────────────

console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   🤖 SIMPLESPLIT BOT v2.0                ║');
console.log('║   Starting...                            ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// Start Express server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Webhook server berjalan di http://0.0.0.0:${PORT}`);
  console.log(`   Endpoint: POST /webhook`);
  console.log(`   Health:   GET  /health`);
  console.log('');
});

// Start WhatsApp client
console.log('📱 Menginisialisasi WhatsApp client...');
console.log('   Tunggu sebentar, QR code akan muncul...');
console.log('');
client.initialize().catch(err => {
  console.error('❌ Gagal inisialisasi WhatsApp:', err.message);
  console.log('');
  console.log('💡 Tips: Pastikan Chromium/Chrome terinstall di server.');
  console.log('   Jalankan: sudo apt install -y chromium-browser');
});
