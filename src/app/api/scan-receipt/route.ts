import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route: POST /api/scan-receipt
 * 
 * Receives a receipt image (base64) and uses Gemini API to extract items.
 * Returns structured JSON with item names, prices, quantities, tax, and service charge.
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

Dari foto nota ini, extract SEMUA item makanan/minuman beserta harganya.

ATURAN:
1. Hanya extract ITEM yang dibeli (makanan, minuman, barang)
2. ABAIKAN baris yang bukan item: Total, Subtotal, Grand Total, Pembulatan, Rounding, Kembalian, Change, Tunai, Cash, QRIS, Debit, Kredit, Tax, Pajak, PPN, PB1, Service Charge, Discount, Diskon
3. Untuk quantity: jika tertulis "2x" atau "x2", quantity = 2. Jika tidak ada, quantity = 1
4. Untuk price: gunakan harga SATUAN (per item), bukan total
5. Bersihkan nama item dari karakter aneh, nomor urut, atau simbol
6. Jika ada tax/pajak, masukkan di field "tax" (angka saja)
7. Jika ada service charge, masukkan di field "serviceCharge" (angka saja)

RESPOND HANYA dengan JSON valid (tanpa markdown, tanpa backtick, tanpa penjelasan):
{
  "items": [
    {"name": "Nama Item", "price": 25000, "quantity": 1}
  ],
  "tax": 0,
  "serviceCharge": 0,
  "subtotal": 0
}`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Gemini API error:', response.status, errText);
      return NextResponse.json(
        { error: `Gemini API error: ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    // Parse JSON from response (remove any markdown code fences if present)
    const jsonStr = text
      .replace(/```json\s*/gi, '')
      .replace(/```\s*/gi, '')
      .trim();

    try {
      const parsed = JSON.parse(jsonStr);
      return NextResponse.json({
        success: true,
        items: parsed.items || [],
        tax: parsed.tax || 0,
        serviceCharge: parsed.serviceCharge || 0,
        subtotal: parsed.subtotal || 0,
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
