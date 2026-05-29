import { ParsedReceipt, ParsedReceiptItem } from './types';
import { parsePrice } from './formatters';

let worker: Worker | null = null;
let workerReady = false;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker('/workers/ocr.worker.js');
    workerReady = true;
  }
  return worker;
}

function recognizeInWorker(
  imageDataUrl: string,
  onProgress?: (progress: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = getWorker();
    const id = Math.random().toString(36).slice(2);

    const handler = (e: MessageEvent) => {
      if (e.data.id !== id) return;
      if (e.data.type === 'progress' && onProgress) {
        onProgress(Math.round(e.data.progress * 100));
      }
      if (e.data.type === 'result') {
        w.removeEventListener('message', handler);
        resolve(e.data.text);
      }
      if (e.data.type === 'error') {
        w.removeEventListener('message', handler);
        reject(new Error(e.data.message));
      }
    };

    w.addEventListener('message', handler);
    w.postMessage({ type: 'recognize', imageDataUrl, id });
  });
}

function preprocessImage(imageFile: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      if (!ctx) { reject(new Error('Canvas not supported')); return; }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        const factor = 1.5;
        const adjusted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
        const threshold = adjusted > 140 ? 255 : 0;
        data[i] = threshold;
        data[i + 1] = threshold;
        data[i + 2] = threshold;
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(imageFile);
  });
}

export async function scanReceipt(
  imageFile: File,
  onProgress?: (progress: number) => void,
): Promise<ParsedReceipt> {
  const processedImage = await preprocessImage(imageFile);
  const rawText = await recognizeInWorker(processedImage, onProgress);
  return parseReceiptText(rawText);
}

export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const items: ParsedReceiptItem[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let serviceCharge: number | null = null;
  let total: number | null = null;

  const taxPatterns = /^(?:tax|pajak|ppn|pb1|pbr|pbi|vat)\s*:?\s*/i;
  const servicePatterns = /^(?:service|servis|sc|svc|service\s*charge)\s*:?\s*/i;
  const totalPatterns = /^(?:total|grand\s*total|jumlah|g\.?\s*total|amount)\s*:?\s*/i;
  const subtotalPatterns = /^(?:sub\s*total|subtotal|sub\.?\s*total)\s*:?\s*/i;
  const skipPatterns = /^(---|===|\*\*\*|#{2,}|tanggal|date|kasir|cashier|no\.|receipt|invoice|struk|nota|thank|terima|member|telp|phone|alamat|address|table|meja|mode|info|dine|take\s*away|delivery|instagram|@\w|www\.|http|\d+\s*item)/i;
  const nonItemPatterns = /^\s*(pembulatan|rounding|kembalian|change|tunai|cash|debit|kredit|credit|qris|qr\s*is|oris|ovo|gopay|dana|shopeepay|linkaja|card|kartu|visa|master|bca|mandiri|bni|bri|cimb|grand\s*total|5\s*item|\d+\s*item)\s*:?\s*/i;

  function isNonItem(text: string): boolean {
    const t = text.trim().toLowerCase();
    const blacklist = ['pembulatan', 'rounding', 'kembalian', 'change', 'tunai', 'cash',
      'debit', 'kredit', 'credit', 'qris', 'qr is', 'oris', 'ovo', 'gopay', 'dana',
      'shopeepay', 'linkaja', 'card', 'kartu', 'grand total', 'subtotal', 'sub total',
      'total', 'tax', 'pajak', 'ppn', 'pb1', 'pbr', 'pbi', 'vat', 'service', 'servis',
      'service charge', 'discount', 'diskon', 'potongan'];
    return blacklist.some(b => t.startsWith(b)) || /^\d+\s*item/.test(t);
  }

  const discountPatterns = /^(?:discount|diskon|disc|potongan)\s*:?\s*/i;
  const priceAtEnd = /(\d[\d.,]*\d|\d+)\s*$/;
  const qtyLineRegex = /^(\d+)\s*[xX×]\s*@?\s*([\d.,]+)/;
  const isQtyPriceLine = /^\d+\s*[xX×]\s*@?\s*[\d.,]+/;
  const isOnlyNumbers = /^[0@\s.,\d]+$/;
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];

    if (skipPatterns.test(line)) continue;
    if (line.length < 3) continue;
    if (/^-+$/.test(line) || /^=+$/.test(line)) continue;
    if (nonItemPatterns.test(line)) continue;

    if (taxPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) tax = parsePrice(match[1]);
      continue;
    }
    if (servicePatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) serviceCharge = parsePrice(match[1]);
      continue;
    }
    if (subtotalPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) subtotal = parsePrice(match[1]);
      continue;
    }
    if (totalPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) total = parsePrice(match[1]);
      continue;
    }
    if (discountPatterns.test(line)) continue;

    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const nextLineIsQtyPrice = qtyLineRegex.test(nextLine);

    if (nextLineIsQtyPrice && !isOnlyNumbers.test(line) && !isQtyPriceLine.test(line)) {
      const qtyMatch = nextLine.match(qtyLineRegex);
      const priceMatch = nextLine.match(priceAtEnd);

      if (qtyMatch && priceMatch) {
        const unitPrice = parsePrice(qtyMatch[2]);
        const totalPrice = parsePrice(priceMatch[1]);
        const price = totalPrice > unitPrice ? totalPrice : unitPrice;
        const itemName = cleanItemName(line);

        if (itemName.length > 1 && price > 0 && price < 100000000 && !isNonItem(itemName)) {
          items.push({ name: itemName, price, quantity: 1 });
        }
        consumed.add(i + 1);
        continue;
      }
    }

    const priceMatch = line.match(priceAtEnd);
    if (priceMatch) {
      const price = parsePrice(priceMatch[1]);
      if (price <= 0 || price > 100000000) continue;

      let itemName = line.slice(0, priceMatch.index).trim();
      if (isQtyPriceLine.test(line) || isOnlyNumbers.test(itemName)) continue;

      const qtyPrefix = itemName.match(/^(\d+)\s*[xX×]\s*/);
      let quantity = 1;
      if (qtyPrefix) {
        quantity = parseInt(qtyPrefix[1], 10);
        itemName = itemName.slice(qtyPrefix[0].length).trim();
      }

      itemName = cleanItemName(itemName);
      if (itemName.length > 1 && !isNonItem(itemName)) {
        items.push({ name: itemName, price, quantity });
      }
    }
  }

  if (subtotal === null && items.length > 0) {
    subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  return { items, subtotal, tax, service_charge: serviceCharge, total, raw_text: rawText };
}

function cleanItemName(name: string): string {
  return name
    .replace(/[.\-_=]+$/, '')
    .replace(/^\*+\s*/, '')
    .replace(/^[0@\s]+/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export async function terminateOCR(): Promise<void> {
  if (worker && workerReady) {
    const id = 'terminate';
    worker.postMessage({ type: 'terminate', id });
    worker.terminate();
    worker = null;
    workerReady = false;
  }
}
