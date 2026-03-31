/**
 * QRIS Dynamic Generator
 * 
 * Parses static QRIS (EMVCo QR Code format), injects transaction amount,
 * and generates a new dynamic QRIS QR code.
 * 
 * Money flows to the SAME recipient — we only add the amount field.
 * 
 * EMVCo TLV format: [2-digit tag][2-digit length][value]
 * Key fields:
 *   00 = Payload Format Indicator ("01")
 *   01 = Point of Initiation ("11"=static, "12"=dynamic)
 *   54 = Transaction Amount
 *   63 = CRC-16/CCITT checksum
 */

import jsQR from 'jsqr';
import QRCode from 'qrcode';

// ======= EMVCo TLV Parser =======

interface TLVField {
  tag: string;
  length: number;
  value: string;
}

/**
 * Parse EMVCo TLV string into array of fields
 */
function parseTLV(data: string): TLVField[] {
  const fields: TLVField[] = [];
  let pos = 0;

  while (pos < data.length) {
    if (pos + 4 > data.length) break;

    const tag = data.substring(pos, pos + 2);
    const length = parseInt(data.substring(pos + 2, pos + 4), 10);
    const value = data.substring(pos + 4, pos + 4 + length);

    fields.push({ tag, length, value });
    pos += 4 + length;
  }

  return fields;
}

/**
 * Serialize TLV fields back to string
 */
function serializeTLV(fields: TLVField[]): string {
  return fields.map(f => {
    const len = f.value.length.toString().padStart(2, '0');
    return `${f.tag}${len}${f.value}`;
  }).join('');
}

/**
 * Calculate CRC-16/CCITT (0xFFFF) checksum
 * Used for field 63 in QRIS
 */
function calculateCRC16(data: string): string {
  let crc = 0xFFFF;

  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
    crc &= 0xFFFF;
  }

  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Modify QRIS payload to include transaction amount (making it dynamic)
 * 
 * @param payload - Original static QRIS payload string
 * @param amount - Amount in rupiah (integer, e.g. 35400)
 * @returns Modified dynamic QRIS payload
 */
export function injectAmount(payload: string, amount: number): string {
  const fields = parseTLV(payload);

  // Remove existing CRC (field 63) — we'll recalculate
  const withoutCRC = fields.filter(f => f.tag !== '63');

  // Update Point of Initiation to "12" (dynamic)
  const poiIndex = withoutCRC.findIndex(f => f.tag === '01');
  if (poiIndex >= 0) {
    withoutCRC[poiIndex].value = '12';
  }

  // Remove existing amount field (54) if present
  const filtered = withoutCRC.filter(f => f.tag !== '54');

  // Find where to insert amount (after tag 53 = currency, or before 58 = country)
  let insertPos = filtered.findIndex(f => f.tag === '53');
  if (insertPos >= 0) {
    insertPos += 1; // insert after currency
  } else {
    insertPos = filtered.findIndex(f => f.tag === '58');
    if (insertPos < 0) insertPos = filtered.length;
  }

  // Insert amount field (tag 54)
  const amountStr = amount.toString();
  filtered.splice(insertPos, 0, {
    tag: '54',
    length: amountStr.length,
    value: amountStr,
  });

  // Serialize without CRC
  const serialized = serializeTLV(filtered);

  // Add CRC placeholder and calculate
  const withCRCPlaceholder = serialized + '6304';
  const crc = calculateCRC16(withCRCPlaceholder);

  return withCRCPlaceholder + crc;
}

/**
 * Decode QR code from an image URL
 * Downloads the image, draws it on canvas, and uses jsQR to decode
 * 
 * @param imageUrl - URL of the QRIS image
 * @returns Decoded QR payload string, or null if failed
 */
export async function decodeQRFromImage(imageUrl: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(null); return; }

      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);

      if (code) {
        resolve(code.data);
      } else {
        // Try with enhanced contrast
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
          const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const bw = gray > 128 ? 255 : 0;
          data[i] = bw;
          data[i + 1] = bw;
          data[i + 2] = bw;
        }
        ctx.putImageData(imageData, 0, 0);
        const contrastData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const retryCode = jsQR(contrastData.data, contrastData.width, contrastData.height);
        resolve(retryCode ? retryCode.data : null);
      }
    };

    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
}

/**
 * Generate a dynamic QRIS QR code image as a data URL
 * 
 * @param staticQrisUrl - URL of the static QRIS image
 * @param amount - Amount in rupiah (integer)
 * @returns Data URL of the dynamic QRIS QR code, or null if failed
 */
export async function generateDynamicQRIS(
  staticQrisUrl: string,
  amount: number,
): Promise<{ dataUrl: string; payload: string } | null> {
  try {
    // Step 1: Decode the static QRIS image to get the payload
    const payload = await decodeQRFromImage(staticQrisUrl);
    if (!payload) {
      console.warn('Could not decode QRIS from image');
      return null;
    }

    // Validate it looks like a QRIS (starts with "000201")
    if (!payload.startsWith('000201')) {
      console.warn('Decoded data does not look like QRIS:', payload.substring(0, 20));
      return null;
    }

    // Step 2: Inject the amount
    const dynamicPayload = injectAmount(payload, amount);

    // Step 3: Generate QR code image
    const dataUrl = await QRCode.toDataURL(dynamicPayload, {
      width: 400,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'M',
    });

    return { dataUrl, payload: dynamicPayload };
  } catch (err) {
    console.error('Failed to generate dynamic QRIS:', err);
    return null;
  }
}

/**
 * Validate a QRIS payload by checking the CRC
 */
export function validateQRIS(payload: string): boolean {
  if (!payload || payload.length < 8) return false;
  if (!payload.startsWith('000201')) return false;

  // Extract CRC
  const crcField = payload.slice(-4);
  const dataWithoutCRC = payload.slice(0, -4);

  const calculated = calculateCRC16(dataWithoutCRC);
  return calculated === crcField;
}
