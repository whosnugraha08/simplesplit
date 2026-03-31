import { createWorker, Worker } from 'tesseract.js';
import { ParsedReceipt, ParsedReceiptItem } from './types';
import { parsePrice } from './formatters';

let worker: Worker | null = null;

/**
 * Initialize Tesseract.js worker (singleton)
 */
async function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = await createWorker('ind+eng', undefined, {
      // Logging disabled for production
    });
  }
  return worker;
}

/**
 * Preprocess image for better OCR results.
 * Increases contrast and converts to grayscale using Canvas API.
 */
function preprocessImage(imageFile: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    img.onload = () => {
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      canvas.width = img.width;
      canvas.height = img.height;

      // Draw original
      ctx.drawImage(img, 0, 0);

      // Get image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;

      // Convert to grayscale and increase contrast
      for (let i = 0; i < data.length; i += 4) {
        // Grayscale
        const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
        
        // Increase contrast (factor 1.5)
        const factor = 1.5;
        const adjusted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
        
        // Threshold for very clean text
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

/**
 * Run OCR on the image file using Tesseract.js
 */
export async function scanReceipt(
  imageFile: File,
  onProgress?: (progress: number) => void,
): Promise<ParsedReceipt> {
  // Pre-process the image
  const processedImage = await preprocessImage(imageFile);

  // Initialize worker
  const ocrWorker = await getWorker();
  
  // Recognize text
  const result = await ocrWorker.recognize(processedImage);
  const rawText = result.data.text;

  // Parse the raw text into structured data
  return parseReceiptText(rawText);
}

/**
 * Parse OCR raw text into structured receipt data.
 * Uses heuristics and regex patterns for Indonesian receipts.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  
  const items: ParsedReceiptItem[] = [];
  let subtotal: number | null = null;
  let tax: number | null = null;
  let serviceCharge: number | null = null;
  let total: number | null = null;

  // Patterns for identifying special lines
  const taxPatterns = /^(?:tax|pajak|ppn|pb1|pbr|vat)\s*:?\s*/i;
  const servicePatterns = /^(?:service|servis|sc|svc|service\s*charge)\s*:?\s*/i;
  const totalPatterns = /^(?:total|grand\s*total|jumlah|g\.?\s*total|amount)\s*:?\s*/i;
  const subtotalPatterns = /^(?:sub\s*total|subtotal|sub\.?\s*total)\s*:?\s*/i;
  const discountPatterns = /^(?:discount|diskon|disc|potongan)\s*:?\s*/i;
  
  // Skip patterns (lines to ignore)
  const skipPatterns = /^(---|===|\*\*\*|#{2,}|tanggal|date|kasir|cashier|no\.|receipt|invoice|struk|nota|thank|terima|member|telp|phone|alamat|address|table|meja)/i;

  // Price pattern: captures a number that looks like a price (with dots/commas as thousands separators)
  const priceRegex = /(\d[\d.,]*\d|\d+)\s*$/;
  
  // Quantity pattern: "2x", "2 x", "2 pcs", etc.
  const qtyRegex = /^(\d+)\s*[xX×]\s*/;

  for (const line of lines) {
    // Skip irrelevant lines
    if (skipPatterns.test(line)) continue;
    if (line.length < 3) continue;

    // Check for tax
    if (taxPatterns.test(line)) {
      const match = line.match(priceRegex);
      if (match) {
        tax = parsePrice(match[1]);
      }
      continue;
    }

    // Check for service charge
    if (servicePatterns.test(line)) {
      const match = line.match(priceRegex);
      if (match) {
        serviceCharge = parsePrice(match[1]);
      }
      continue;
    }

    // Check for subtotal
    if (subtotalPatterns.test(line)) {
      const match = line.match(priceRegex);
      if (match) {
        subtotal = parsePrice(match[1]);
      }
      continue;
    }

    // Check for total
    if (totalPatterns.test(line)) {
      const match = line.match(priceRegex);
      if (match) {
        total = parsePrice(match[1]);
      }
      continue;
    }

    // Check for discount (skip)
    if (discountPatterns.test(line)) continue;

    // Try to parse as an item line: "Item Name    Price"
    const priceMatch = line.match(priceRegex);
    if (priceMatch) {
      const price = parsePrice(priceMatch[1]);
      if (price <= 0 || price > 100000000) continue; // Sanity check
      
      let itemName = line.slice(0, priceMatch.index).trim();
      let quantity = 1;

      // Check for quantity prefix
      const qtyMatch = itemName.match(qtyRegex);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1], 10);
        itemName = itemName.slice(qtyMatch[0].length).trim();
      }

      // Clean up item name
      itemName = itemName.replace(/[.\-_=]+$/, '').trim();
      
      if (itemName.length > 1) {
        items.push({
          name: itemName,
          price: price,
          quantity: quantity,
        });
      }
    }
  }

  // If no subtotal found, calculate from items
  if (subtotal === null && items.length > 0) {
    subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  }

  return {
    items,
    subtotal,
    tax,
    service_charge: serviceCharge,
    total,
    raw_text: rawText,
  };
}

/**
 * Terminate the OCR worker to free memory
 */
export async function terminateOCR(): Promise<void> {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
