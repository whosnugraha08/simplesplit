import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60; // Set Vercel execution limit up to 60 seconds (useful for heavy AI tasks)

/**
 * API Route: POST /api/scan-receipt
 * 
 * Receives a receipt image (base64) and uses Gemini API to extract items.
 * Returns structured JSON with item names, prices, quantities, tax, service charge,
 * store name, date, rounding, and total for verification.
 */
export async function POST(req: NextRequest) {
  try {
    const { image, mimeType } = await req.json();

    if (!image) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Remove data URL prefix if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, '');
    const imgMimeType = mimeType || 'image/jpeg';

    const prompt = `Kamu adalah AI yang ahli membaca nota/struk belanja Indonesia.

Dari foto nota ini, extract SEMUA informasi berikut:

ATURAN ITEM:
1. Hanya extract ITEM yang dibeli (makanan, minuman, barang)
2. ABAIKAN baris yang bukan item: Total, Subtotal, Grand Total, Rounding, Kembalian, Change, Tunai, Cash, QRIS, Debit, Kredit, Tax, Pajak, PPN, PB1, Service Charge, Discount, Diskon
3. Untuk quantity: jika tertulis "2x" atau "x2", quantity = 2. Jika tidak ada, quantity = 1
4. Untuk price: gunakan harga SATUAN (per item), bukan total
5. Bersihkan nama item dari karakter aneh, nomor urut, atau simbol

ATURAN INFORMASI TAMBAHAN:
6. "storeName": Nama toko/restoran/warung yang tertulis di bagian ATAS nota (biasanya nama terbesar). Kalau tidak ada, kosongkan.
7. "date": Tanggal transaksi dalam format "YYYY-MM-DD". Cari tanggal di nota (biasa format DD/MM/YYYY, DD-MM-YYYY, atau lainnya). Konversi ke YYYY-MM-DD. Jika tidak ada, kosongkan.
8. "tax": Pajak/PPN/PB1 yang tertulis di nota (angka saja, tanpa %). Jika tidak ada, 0.
9. "serviceCharge": Service charge/biaya layanan yang tertulis. Jika tidak ada, 0.
10. "rounding": Pembulatan (bisa positif atau negatif). Cari baris "Rounding", "Pembulatan", atau "Adj". Jika tidak ada baris pembulatan TAPI total di nota TIDAK sama dengan subtotal + tax + service, maka hitung selisihnya sebagai rounding.
11. "totalOnReceipt": Total/Grand Total yang tertulis di nota (angka yang paling bawah/final). Ini untuk verifikasi.
12. "subtotal": Total harga item saja (sebelum tax, service, rounding).

RESPOND HANYA dengan JSON valid (tanpa markdown, tanpa backtick, tanpa penjelasan):
{
  "storeName": "Nama Toko",
  "date": "2024-01-15",
  "items": [
    {"name": "Nama Item", "price": 25000, "quantity": 1}
  ],
  "subtotal": 0,
  "tax": 0,
  "serviceCharge": 0,
  "rounding": 0,
  "totalOnReceipt": 0
}`;

    // Model fallback — sesuai yang tersedia di Free Tier
    const FALLBACK_MODELS = [
      'gemini-2.5-flash',       // 5 RPM, 20 RPD
      'gemini-3.5-flash',       // 5 RPM, 20 RPD
      'gemini-3-flash',         // 5 RPM, 20 RPD
      'gemini-3.1-flash-lite',  // 15 RPM, 500 RPD (safety net)
      'gemini-2.5-flash-lite',  // 10 RPM, 20 RPD
    ];

    let lastErrorStatus = 502;
    let lastErrorText = 'All fallback models failed';
    let data = null;

    for (const model of FALLBACK_MODELS) {
      console.log(`Trying model: ${model}...`);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inlineData: {
                      mimeType: imgMimeType,
                      data: base64Data,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 2048,
            },
          }),
        }
      );

      if (response.ok) {
        data = await response.json();
        console.log(`Model ${model} succeeded!`);
        break; // Success! Stop trying other models.
      }

      const errText = await response.text();
      console.warn(`Model ${model} failed:`, response.status, errText);
      lastErrorStatus = response.status;
      lastErrorText = errText;
      
      // If it's not a rate limit (429), not found (404), or unavailable (503), it might be a payload 
      // or API Key issue. But to be safe, we will just continue to the next fallback anyway.
    }

    if (!data) {
      console.error('All Gemini API models failed. Last error:', lastErrorStatus, lastErrorText);
      return NextResponse.json(
        { error: `Gemini API fallback failed. Last error: ${lastErrorStatus}` },
        { status: lastErrorStatus }
      );
    }

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (remove any markdown code fences if present)
    const jsonStr = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    try {
      const parsed = JSON.parse(jsonStr);
      
      // Calculate verification
      const itemsSubtotal = (parsed.items || []).reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      const calculatedTotal = itemsSubtotal + (parsed.tax || 0) + (parsed.serviceCharge || 0) + (parsed.rounding || 0);
      const receiptTotal = parsed.totalOnReceipt || 0;
      
      // If there's a mismatch and no rounding was detected, calculate it
      let rounding = parsed.rounding || 0;
      if (receiptTotal > 0 && rounding === 0) {
        const diff = receiptTotal - (itemsSubtotal + (parsed.tax || 0) + (parsed.serviceCharge || 0));
        if (Math.abs(diff) > 0 && Math.abs(diff) < itemsSubtotal * 0.05) { // Max 5% difference as rounding
          rounding = diff;
        }
      }

      return NextResponse.json({
        success: true,
        storeName: parsed.storeName || '',
        date: parsed.date || '',
        items: parsed.items || [],
        subtotal: parsed.subtotal || itemsSubtotal,
        tax: parsed.tax || 0,
        serviceCharge: parsed.serviceCharge || 0,
        rounding: rounding,
        totalOnReceipt: receiptTotal,
        calculatedTotal: itemsSubtotal + (parsed.tax || 0) + (parsed.serviceCharge || 0) + rounding,
        source: 'gemini',
      });
    } catch (parseErr) {
      console.error('Failed to parse Gemini response:', jsonStr);
      return NextResponse.json(
        { error: 'Failed to parse AI response', raw: jsonStr },
        { status: 422 }
      );
    }
  } catch (err: any) {
    console.error('Scan receipt error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
