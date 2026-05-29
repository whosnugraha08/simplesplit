// ============================================================
// SimpleSplit WhatsApp Bot v2.0 (Polling Edition)
// No inbound ports needed! Bypasses firewall.
// ============================================================

require('dotenv').config();
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

// ── Configuration ───────────────────────────────────────────
const APP_URL = process.env.APP_URL || 'https://simplesplit-gasgasaja.vercel.app';
const POLL_INTERVAL = 3000; // Poll every 3 seconds


// ── WhatsApp Client Setup ───────────────────────────────────
let isReady = false;
let lastQR = null;

const fs = require('fs');

// Auto-detect Chrome Path
let chromePath = process.env.CHROME_PATH;
if (!chromePath) {
  if (fs.existsSync('/usr/bin/google-chrome-stable')) {
    chromePath = '/usr/bin/google-chrome-stable';
  } else {
    chromePath = '/usr/bin/chromium-browser';
  }
}

const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: chromePath,
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

function getTag(person) {
  if (!person) return 'Seseorang';
  if (person.whatsapp_number) {
    let num = person.whatsapp_number.replace(/[^0-9]/g, '');
    if (num.startsWith('0')) num = '62' + num.substring(1);
    return `@${num}`;
  }
  return `*${person.name}*`;
}

function extractMentions(text) {
  const matches = text.match(/@\d+/g);
  if (!matches) return [];
  return matches.map(m => m.substring(1) + '@c.us');
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
  const debtorTag = getTag(debt.debtor);
  const payerTag = getTag(bill.paid_by_friend);
  const payLink = `${APP_URL}/pay/${debt.id}`;

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `📋 *TAGIHAN BARU*\n\n`;
  msg += `Halo ${debtorTag},\n`;
  msg += `Kamu punya tagihan dari ${payerTag} untuk:\n\n`;
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
  const debtorTag = getTag(debt.debtor);
  const payerTag = getTag(bill.paid_by_friend);
  const payLink = `${APP_URL}/pay/${debt.id}`;

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `🔔 *PENGINGAT TAGIHAN*\n\n`;
  msg += `Halo ${debtorTag},\n`;
  msg += `Ini reminder dari ${payerTag} — kamu masih punya tagihan yang belum lunas:\n\n`;
  msg += `🏷️ *${bill.title || 'Bill'}*\n`;
  msg += `💰 *${formatRupiah(debt.amount)}*\n`;
  msg += `\n🔗 *Bayar di sini:*\n${payLink}\n`;
  msg += `\n_(Pesan otomatis dari SimpleSplit)_`;

  return msg;
}

// Template: Notifikasi "sudah bayar" ke penagih
function buildPaidMessage(bill, debt) {
  const debtorTag = getTag(debt.debtor);
  const payerTag = getTag(bill.paid_by_friend);

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `✅ *PEMBAYARAN DITERIMA*\n\n`;
  msg += `Halo ${payerTag},\n`;
  msg += `${debtorTag} baru saja melunasi tagihannya:\n\n`;
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
  const payerTag = getTag(bill.paid_by_friend);
  const debtorTag = getTag(debts[0]?.debtor);
  const total = debts.reduce((sum, d) => sum + Number(d.amount), 0);

  let msg = `*[SIMPLESPLIT]*\n`;
  msg += `✅ *PELUNASAN KOLEKTIF*\n\n`;
  msg += `Halo ${payerTag},\n`;
  msg += `Mantap! ${debtorTag} baru saja melunasi *SEMUA* tunggakannya kepadamu.\n\n`;
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

// Linked group JID (set via webhook or env)
let linkedGroupJid = process.env.WA_GROUP_JID || null;

async function sendToGroup(groupJid, message, imageUrl) {
  if (!isReady) throw new Error('WhatsApp client belum ready');
  const chatId = groupJid.includes('@') ? groupJid : groupJid + '@g.us';
  const mentions = extractMentions(message);

  try {
    const options = {};
    if (mentions.length > 0) options.mentions = mentions;

    if (imageUrl && imageUrl.startsWith('http')) {
      const media = await MessageMedia.fromUrl(imageUrl, { unsafeMime: true });
      options.caption = message;
      await client.sendMessage(chatId, media, options);
    } else {
      await client.sendMessage(chatId, message, options);
    }
    console.log(`✅ Pesan grup terkirim ke ${chatId}`);
    return { success: true };
  } catch (err) {
    console.error(`❌ Gagal kirim ke grup:`, err.message);
    return { success: false, reason: err.message };
  }
}

function buildGroupBillMessage(bill, items, debts) {
  let msg = `*[SIMPLESPLIT]*\n🧾 *Bill baru!*\n\n`;
  msg += `🏷️ *${bill.title || 'Bill'}* — Total ${formatRupiah(bill.total_amount || 0)}\n`;
  debts.forEach(d => {
    msg += `├ ${getTag(d.debtor)}: ${formatRupiah(d.amount)}\n`;
  });
  msg += `\n_(Notifikasi grup SimpleSplit)_`;
  return msg;
}

async function handleGroupCommand(message) {
  const body = message.body.trim();
  if (!body.startsWith('!')) return;

  const parts = body.slice(1).split(/\s+/);
  const command = parts[0].toLowerCase();
  const args = parts.slice(1);

  try {
    const res = await fetch(`${APP_URL}/api/wa-group/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-webhook-secret': WEBHOOK_SECRET,
      },
      body: JSON.stringify({ command, args }),
    });
    const data = await res.json();
    if (data.text) {
      await message.reply(data.text);
    }
  } catch (err) {
    console.error('Group command error:', err.message);
    await message.reply('⚠️ Gagal memproses perintah. Coba lagi nanti.');
  }
}

client.on('message', async (message) => {
  try {
    const chat = await message.getChat();
    if (!chat.isGroup) return;

    // Helper command to get group ID easily
    if (message.body.trim().toLowerCase() === '!id') {
      console.log(`\n📌 ID Grup: ${chat.id._serialized}\n`);
      await message.reply(`*ID GRUP INI:*\n${chat.id._serialized}\n\n_Silakan salin ID di atas dan masukkan ke menu Hubungkan Grup WA di web._`);
      return;
    }

    if (linkedGroupJid && chat.id._serialized !== linkedGroupJid) return;
    await handleGroupCommand(message);
  } catch (err) {
    console.error('Message handler error:', err.message);
  }
});

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

// ── Polling Queue ───────────────────────────────────────────

async function processQueueItem(item) {
  const payload = item.payload;
  const { bill, items, debts, type, paymentMethods, payerHasQris, groupJid } = payload;

  // Register linked group
  if (groupJid) {
    linkedGroupJid = groupJid;
  }

  // Group-only notification (no individual DMs required)
  if (type === 'group_notify') {
    if (!bill || !debts?.length) return false;
    const targetGroup = groupJid || linkedGroupJid;
    if (!targetGroup) return false;
    
    const msg = buildGroupBillMessage(bill, items, debts);
    const result = await sendToGroup(targetGroup, msg);
    return result.success;
  }

  if (!bill || !debts || debts.length === 0) return false;

  console.log(`\n📨 Memproses pesan antrean — type: ${type || 'tagihan'}, debts: ${debts.length}`);

  try {
    // Also notify linked group on new bills
    if ((type === 'tagihan' || !type) && (groupJid || linkedGroupJid)) {
      const targetGroup = groupJid || linkedGroupJid;
      const groupMsg = buildGroupBillMessage(bill, items, debts);
      await sendToGroup(targetGroup, groupMsg);
      await sleep(1000);
    }
    // ── PAID ALL (kolektif) ───────────────────────────────
    if (type === 'paid_all') {
      const targetGroup = groupJid || linkedGroupJid;
      if (targetGroup) {
        const msg = buildPaidAllMessage(bill, debts);
        const proofUrl = debts[0]?.proof_image_url || null;
        await sendToGroup(targetGroup, msg, proofUrl);
      }
    }
    // ── PAID (single) ─────────────────────────────────────
    else if (type === 'paid') {
      const targetGroup = groupJid || linkedGroupJid;
      if (targetGroup) {
        const msg = buildPaidMessage(bill, debts[0]);
        const proofUrl = debts[0]?.proof_image_url || null;
        await sendToGroup(targetGroup, msg, proofUrl);
      }
    }
    // ── NETTING (offset) ──────────────────────────────────
    else if (type === 'netting') {
      const targetGroup = groupJid || linkedGroupJid;
      if (targetGroup) {
        const { pair } = payload;
        // In netting, we only have personA and personB strings in pair. 
        // We will try to rely on their names, or if we pass full objects from Vercel we could tag.
        // Wait, payload doesn't have the person objects, only their names.
        // I will let netting be names for now since we didn't update Vercel side payload for netting yet.
        let msg = `*[SIMPLESPLIT]*\n🔄 *NETTING OTOMATIS*\n\n`;
        msg += `Hutang antara *${pair.personA}* dan *${pair.personB}* baru saja di-offset (saling dikurangi) sebesar *${formatRupiah(pair.offsetAmount)}*!\n\n`;
        
        if (pair.netDirection === 'settled') {
          msg += `✅ Hasilnya: Hutang mereka berdua impas! (Tidak ada yang perlu transfer).`;
        } else {
          const payer = pair.netDirection === 'a_pays_b' ? pair.personA : pair.personB;
          const receiver = pair.netDirection === 'a_pays_b' ? pair.personB : pair.personA;
          msg += `✅ Hasilnya: *${payer}* tinggal bayar sisanya sebesar *${formatRupiah(pair.netAmount)}* ke *${receiver}*.`;
        }
        
        msg += `\n\n_(Pesan otomatis dari SimpleSplit)_`;
        await sendToGroup(targetGroup, msg);
      }
    }
    // ── REMIND ────────────────────────────────────────────
    else if (type === 'remind') {
      for (const debt of debts) {
        const phone = debt.debtor?.whatsapp_number;
        if (phone) {
          const msg = buildRemindMessage(bill, debt);
          await sendWhatsApp(phone, msg);
          if (debts.length > 1) await sleep(1500);
        }
      }
    }
    // ── TAGIHAN (default) ─────────────────────────────────
    else {
      const targetGroup = groupJid || linkedGroupJid;
      if (targetGroup) {
        console.log('📎 Grup terhubung, skip japri dan hanya mengirim pesan ke grup.');
      } else {
        // Fallback japri
        for (const debt of debts) {
          const phone = debt.debtor?.whatsapp_number;
          if (phone) {
            const msg = buildBillMessage(bill, items, debt, paymentMethods, payerHasQris);
            await sendWhatsApp(phone, msg);
            if (debts.length > 1) await sleep(2000);
          }
        }
      }
    }

    return true; // Successfully processed
  } catch (err) {
    console.error('❌ Error processing queue item:', err);
    return false; // Will retry next time
  }
}

let isPolling = false;

async function pollQueue() {
  if (!isReady || isPolling) return;
  isPolling = true;

  try {
    const res = await fetch(`${APP_URL}/api/bot/queue`);
    if (!res.ok) throw new Error(`HTTP Error ${res.status}`);
    
    const data = await res.json();
    if (data.items && data.items.length > 0) {
      const processedIds = [];
      
      for (const item of data.items) {
        const success = await processQueueItem(item);
        if (success !== false) { // even if false due to no group, we should ack it so it's not stuck
          processedIds.push(item.id);
        }
      }

      if (processedIds.length > 0) {
        await fetch(`${APP_URL}/api/bot/queue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: processedIds })
        });
        console.log(`✅ ${processedIds.length} pesan antrean telah diselesaikan.`);
      }
    }
  } catch (err) {
    // console.error('Error polling queue:', err.message);
  } finally {
    isPolling = false;
  }
}

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

// Start Polling Loop
setInterval(pollQueue, POLL_INTERVAL);
console.log(`📡 Sistem Polling aktif. Mengambil data dari web setiap ${POLL_INTERVAL/1000} detik.`);
console.log('');

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
