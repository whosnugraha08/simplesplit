import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const { proofUrl, expectedAmount, expectedCreditor } = await req.json();

    if (!proofUrl) {
      return NextResponse.json({ error: 'No proof URL provided' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
    }

    // Fetch the image from URL and convert to base64
    const imgRes = await fetch(proofUrl);
    const arrayBuffer = await imgRes.arrayBuffer();
    const base64Data = Buffer.from(arrayBuffer).toString('base64');
    const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

    const systemPrompt = `Kamu adalah AI auditor verifikasi transfer bank/e-wallet Indonesia.
Tugasmu adalah membaca gambar struk transfer ini dan memverifikasi dua hal:
1. Apakah ini benar-benar gambar struk transfer/pembayaran yang valid? (Bukan meme, selfie, atau gambar random).
2. Apakah nominal transfer yang tertera di struk SAMA ATAU LEBIH BESAR dari Rp ${expectedAmount}?
3. Opsional: Apakah nama penerima di struk mirip/mengandung kata "${expectedCreditor}"? (Toleransi tinggi, karena nama bank bisa berbeda).

Jika struk valid dan nominalnya cocok/cukup, kembalikan JSON:
{"valid": true, "reason": "Sesuai"}

Jika ini JELAS BUKAN struk transfer, atau nominalnya KURANG dari Rp ${expectedAmount}, kembalikan JSON:
{"valid": false, "reason": "Alasan kenapa ditolak (misal: Nominal kurang, atau Gambar bukan struk)"}

Keluarkan HANYA JSON tanpa markdown.`;

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [
              { text: systemPrompt },
              { inline_data: { mime_type: mimeType, data: base64Data } }
            ]
          }
        ]
      })
    });

    const aiData = await response.json();
    let aiText = aiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
    aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();

    try {
      const result = JSON.parse(aiText);
      return NextResponse.json(result);
    } catch (e) {
      // Fallback if AI fails to return proper JSON
      console.error("AI Verify Parse Error:", aiText);
      return NextResponse.json({ valid: true, reason: "Bypass (AI Error)" });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
