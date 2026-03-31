import { createWorker, Worker } from 'tesseract.js';
import { ParsedReceipt, ParsedReceiptItem } from './types';
import { parsePrice } from './formatters';

let worker: Worker | null = null;

async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('ind+eng', undefined, {});
  }
  return worker;
}

/**
 * Preprocess image for better OCR results.
 */
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
  const ocrWorker = await getWorker();
  const result = await ocrWorker.recognize(processedImage);
  const rawText = result.data.text;
  return parseReceiptText(rawText);
}

/**
 * Parse OCR raw text into structured receipt data.
 * Improved: handles multi-line item format common in Indonesian receipts.
 * 
 * Receipt format:
 *   Item Name                    <- line N (item name)
 *   1x  @34.000         34.000  <- line N+1 (qty, unit price, total price)
 * 
 * OR single-line:
 *   Item Name   2x   34.000
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  const items: ParsedReceiptItem[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let serviceCharge: number | null = null;
  let total: number | null = null;

  // --- PATTERNS ---

  // Lines that indicate tax/service/total — extract value, don't treat as items
  const taxPatterns = /^(?:tax|pajak|ppn|pb1|pbr|pbi|vat)\s*:?\s*/i;
  const servicePatterns = /^(?:service|servis|sc|svc|service\s*charge)\s*:?\s*/i;
  const totalPatterns = /^(?:total|grand\s*total|jumlah|g\.?\s*total|amount)\s*:?\s*/i;
  const subtotalPatterns = /^(?:sub\s*total|subtotal|sub\.?\s*total)\s*:?\s*/i;

  // Lines to COMPLETELY SKIP (not items, not financial)
  const skipPatterns = /^(---|===|\*\*\*|#{2,}|tanggal|date|kasir|cashier|no\.|receipt|invoice|struk|nota|thank|terima|member|telp|phone|alamat|address|table|meja|mode|info|dine|take\s*away|delivery|instagram|@\w|www\.|http|\d+\s*item)/i;

  // Non-item financial lines to skip
  const nonItemPatterns = /^(pembulatan|rounding|kembalian|change|tunai|cash|debit|kredit|credit|qris|qr\s*is|ovo|gopay|dana|shopeepay|linkaja|card|kartu|visa|master|bca|mandiri|bni|bri|cimb|grand\s*total)\s*:?\s*/i;

  // Discount (skip)
  const discountPatterns = /^(?:discount|diskon|disc|potongan)\s*:?\s*/i;

  // Price at end of line
  const priceAtEnd = /(\d[\d.,]*\d|\d+)\s*$/;

  // Quantity line: "1x @34.000   34.000" or "2x @15.000   30.000" or "1x  34.000  34.000"
  const qtyLineRegex = /^(\d+)\s*[xX×]\s*@?\s*([\d.,]+)/;

  // Check if a line is ONLY a qty/price line (no real item name)
  const isQtyPriceLine = /^\d+\s*[xX×]\s*@?\s*[\d.,]+/;

  // Check if a line looks like just numbers/prices (no text)
  const isOnlyNumbers = /^[0@\s.,\d]+$/;

  // --- PARSING (multi-line aware) ---

  // Track which lines have been consumed as qty/price for a previous name line
  const consumed = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const line = lines[i];

    // Skip irrelevant lines
    if (skipPatterns.test(line)) continue;
    if (line.length < 3) continue;
    if (/^-+$/.test(line) || /^=+$/.test(line)) continue;

    // Check for non-item financial lines (pembulatan, QRIS, etc.)
    if (nonItemPatterns.test(line)) continue;

    // Check for tax
    if (taxPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) tax = parsePrice(match[1]);
      continue;
    }

    // Check for service charge
    if (servicePatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) serviceCharge = parsePrice(match[1]);
      continue;
    }

    // Check for subtotal
    if (subtotalPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) subtotal = parsePrice(match[1]);
      continue;
    }

    // Check for total
    if (totalPatterns.test(line)) {
      const match = line.match(priceAtEnd);
      if (match) total = parsePrice(match[1]);
      continue;
    }

    // Check for discount (skip)
    if (discountPatterns.test(line)) continue;

    // --- MULTI-LINE ITEM DETECTION ---
    // Pattern: line N = item name, line N+1 = "1x @price   price"
    const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
    const nextLineIsQtyPrice = qtyLineRegex.test(nextLine);

    if (nextLineIsQtyPrice && !isOnlyNumbers.test(line) && !isQtyPriceLine.test(line)) {
      // Current line is item name, next line is qty/price
      const qtyMatch = nextLine.match(qtyLineRegex);
      const priceMatch = nextLine.match(priceAtEnd);

      if (qtyMatch && priceMatch) {
        const quantity = parseInt(qtyMatch[1], 10) || 1;
        const unitPrice = parsePrice(qtyMatch[2]);
        const totalPrice = parsePrice(priceMatch[1]);

        // Use total price if available and differs from unit price, else use unit price
        const price = totalPrice > unitPrice ? totalPrice : unitPrice;

        let itemName = cleanItemName(line);

        if (itemName.length > 1 && price > 0 && price < 100000000) {
          items.push({ name: itemName, price, quantity: 1 });
          // Mark qty line as consumed (price already represents total for this item)
        }

        consumed.add(i + 1);
        continue;
      }
    }

    // --- SINGLE-LINE ITEM DETECTION ---
    // "Item Name   34.000"
    const priceMatch = line.match(priceAtEnd);
    if (priceMatch) {
      const price = parsePrice(priceMatch[1]);
      if (price <= 0 || price > 100000000) continue;

      let itemName = line.slice(0, priceMatch.index).trim();

      // If the "name" part is just qty info like "1x @34.000", skip — it was a price line
      if (isQtyPriceLine.test(line) || isOnlyNumbers.test(itemName)) continue;

      // Check for qty prefix
      const qtyPrefix = itemName.match(/^(\d+)\s*[xX×]\s*/);
      let quantity = 1;
      if (qtyPrefix) {
        quantity = parseInt(qtyPrefix[1], 10);
        itemName = itemName.slice(qtyPrefix[0].length).trim();
      }

      itemName = cleanItemName(itemName);

      if (itemName.length > 1) {
        items.push({ name: itemName, price, quantity });
      }
    }
  }

  // If no subtotal found, calculate from items
  if (subtotal === null && items.length > 0) {
    subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  return { items, subtotal, tax, service_charge: serviceCharge, total, raw_text: rawText };
}

/**
 * Clean up an item name extracted from OCR
 */
function cleanItemName(name: string): string {
  return name
    .replace(/[.\-_=]+$/, '')       // trailing dots/dashes
    .replace(/^\*+\s*/, '')          // leading asterisks (modifiers like "* do hot less sug")
    .replace(/^[0@\s]+/, '')         // leading zeros/@ symbols
    .replace(/\s{2,}/g, ' ')        // collapse multiple spaces
    .trim();
}

export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
