'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Friend, ParsedReceiptItem } from '@/lib/types';
import { scanReceipt } from '@/lib/ocr';
import { formatRupiah } from '@/lib/formatters';
import { getInitials, getAvatarColor } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';

type Step = 'upload' | 'scanning' | 'edit' | 'payer';

export default function NewBillPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanSource, setScanSource] = useState<'gemini' | 'tesseract' | null>(null);

  const [items, setItems] = useState<ParsedReceiptItem[]>([]);
  const [tax, setTax] = useState<number>(0);
  const [serviceCharge, setServiceCharge] = useState<number>(0);
  const [title, setTitle] = useState('');

  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('friends').select('*').order('is_admin', { ascending: false }).order('name').then(({ data }) => {
      setFriends(data || []);
      // Auto-select user's friend record as payer
      if (user?.friend_id && data) {
        const myFriend = data.find(f => f.id === user.friend_id);
        if (myFriend) setSelectedPayer(myFriend.id);
      }
    });
  }, [user]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  async function handleScan() {
    if (!imageFile) return;
    setStep('scanning');
    setScanProgress(0);
    setScanError(null);
    setScanSource('gemini');

    const compressImageToBase64 = (file: File): Promise<string> => {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (e) => {
          const img = new Image();
          img.src = e.target?.result as string;
          img.onload = () => {
            const canvas = document.createElement('canvas');
            const MAX_WIDTH = 1200;
            const MAX_HEIGHT = 1600;
            let width = img.width;
            let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } }
            else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
          };
          img.onerror = (err) => reject(err);
        };
        reader.onerror = error => reject(error);
      });
    };

    try {
      const progressInterval = setInterval(() => {
        setScanProgress(prev => Math.min(prev + Math.random() * 10, 85));
      }, 500);

      try {
        const base64Image = await compressImageToBase64(imageFile);
        const response = await fetch('/api/scan-receipt', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image, mimeType: 'image/jpeg' }),
        });
        if (!response.ok) throw new Error('Gemini API failed');
        const result = await response.json();
        clearInterval(progressInterval);
        setScanProgress(100);
        setItems(result.items || []);
        setTax(Number(result.tax) || 0);
        setServiceCharge(Number(result.serviceCharge) || 0);
        setTitle('');
        setTimeout(() => setStep('edit'), 300);
      } catch (geminiErr) {
        console.warn('Gemini failed, fallback to Tesseract...', geminiErr);
        setScanSource('tesseract');
        const result = await scanReceipt(imageFile);
        clearInterval(progressInterval);
        setScanProgress(100);
        setItems(result.items || []);
        setTax(Number(result.tax) || 0);
        setServiceCharge(Number(result.service_charge) || 0);
        setTitle('');
        setTimeout(() => setStep('edit'), 300);
      }
    } catch (err) {
      console.error('OCR Error:', err);
      setScanError('Gagal membaca nota. Coba lagi atau input manual.');
      setStep('upload');
    }
  }

  function handleManualInput() {
    setScanSource(null);
    setItems([{ name: '', price: 0, quantity: 1 }]);
    setTax(0);
    setServiceCharge(0);
    setTitle('');
    setStep('edit');
  }

  function updateItem(index: number, field: keyof ParsedReceiptItem, value: string | number) {
    const updated = [...items];
    if (field === 'name') updated[index].name = value as string;
    else if (field === 'price') updated[index].price = typeof value === 'string' ? parseFloat(value) || 0 : value;
    else if (field === 'quantity') updated[index].quantity = typeof value === 'string' ? parseInt(value) || 1 : value;
    setItems(updated);
  }

  function addItem() { setItems([...items, { name: '', price: 0, quantity: 1 }]); }
  function removeItem(index: number) { setItems(items.filter((_, i) => i !== index)); }

  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const grandTotal = subtotal + tax + serviceCharge;

  async function handleSave() {
    if (!selectedPayer || items.length === 0 || !title.trim()) return;
    setSaving(true);

    try {
      let receiptUrl: string | null = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `receipt_${Date.now()}.${fileExt}`;
        await supabase.storage.from('receipts').upload(fileName, imageFile, { upsert: true });
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
        receiptUrl = urlData.publicUrl;
      }

      const { data: billData, error: billError } = await supabase
        .from('bills')
        .insert({
          title: title.trim(),
          paid_by: selectedPayer,
          created_by: user?.id || null,
          receipt_image_url: receiptUrl,
          subtotal,
          tax_amount: tax,
          service_charge_amount: serviceCharge,
          total_amount: grandTotal,
          status: 'draft',
          bill_date: new Date().toISOString(),
        })
        .select().single();

      if (billError) throw billError;

      const itemsToInsert = items.filter(item => item.name.trim() && item.price > 0).map(item => ({
        bill_id: billData.id,
        item_name: item.name.trim(),
        item_price: item.price,
        quantity: item.quantity,
      }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('bill_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      showToast('Bill berhasil disimpan!', 'success');
      router.push(`/bills/${billData.id}/assign`);
    } catch (err) {
      console.error('Error saving bill:', err);
      showToast('Gagal menyimpan bill', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="content-padding pt-6 pb-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-xl text-white/50 p-1">←</button>
        <div>
          <h1 className="text-xl font-bold">Bill Baru</h1>
          <p className="text-xs text-white/50">
            {step === 'upload' && 'Upload foto nota'}
            {step === 'scanning' && 'Memproses nota...'}
            {step === 'edit' && 'Review & edit item'}
            {step === 'payer' && 'Pilih yang menalangi'}
          </p>
        </div>
      </div>

      {/* Step: Upload */}
      {step === 'upload' && (
        <div className="animate-fade-in">
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          {!imagePreview ? (
            <button onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-white/8 hover:border-amber-500/30 transition-colors flex flex-col items-center justify-center gap-3 bg-white">
              <span className="text-5xl">📸</span>
              <span className="text-sm font-semibold text-white">Ambil Foto Nota</span>
              <span className="text-xs text-white/50">atau pilih dari galeri</span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-white/8 bg-white">
                <img src={imagePreview} alt="Receipt" className="w-full max-h-[60vh] object-contain" />
                <button onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-3 right-3 bg-white/10 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center shadow text-sm">✕</button>
              </div>
              <button onClick={handleScan}
                className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm active:scale-[0.98] transition-transform shadow-lg shadow-amber-500/20">
                🔍 Scan & Baca Nota
              </button>
            </div>
          )}
          {scanError && <div className="mt-4 bg-red-500/100/10 text-danger rounded-xl p-3 text-sm">{scanError}</div>}
          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" /><span className="text-xs text-white/50">atau</span><div className="flex-1 h-px bg-border" />
          </div>
          <button onClick={handleManualInput}
            className="w-full mt-4 py-3.5 rounded-xl border border-white/8 bg-white/5 font-semibold text-sm text-white active:scale-[0.98] transition-transform">
            ✍️ Input Manual
          </button>
        </div>
      )}

      {/* Step: Scanning */}
      {step === 'scanning' && (
        <div className="animate-fade-in flex flex-col items-center justify-center py-16">
          <div className="w-16 h-16 border-4 border-blue-100 border-t-blue-500 rounded-full animate-spin mb-6" />
          <p className="text-lg font-semibold mb-2">Membaca Nota...</p>
          <p className="text-sm pb-1 font-medium gradient-text">
            {scanSource === 'gemini' ? '✨ AI Gemini' : 'Tesseract.js OCR'}
          </p>
          <div className="w-48 h-2 bg-border rounded-full overflow-hidden mt-2">
            <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300" style={{ width: `${scanProgress}%` }} />
          </div>
          <p className="text-xs text-white/50 mt-2">{Math.round(scanProgress)}%</p>
        </div>
      )}

      {/* Step: Edit */}
      {step === 'edit' && (
        <div className="animate-fade-in space-y-4">
          {scanSource && (
            <div className="flex justify-between items-center bg-blue-500/100/10/50 border border-blue-100 rounded-xl p-3">
              <span className="text-xs text-white/50 font-medium">Scan:</span>
              <span className="text-xs font-bold gradient-text">
                {scanSource === 'gemini' ? '✨ Gemini AI' : '📸 Tesseract.js'}
              </span>
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-white/50 mb-1.5">Judul Bill</label>
            <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Makan di Warung Pak Joko"
              className="w-full px-4 py-3 rounded-xl border border-white/8 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/50">Daftar Item</label>
              <button onClick={addItem} className="text-sm text-amber-400 font-semibold">+ Tambah</button>
            </div>
            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="bg-white/5 rounded-xl border border-white/8 p-3 animate-fade-in">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input type="text" value={item.name} onChange={e => updateItem(idx, 'name', e.target.value)} placeholder="Nama item"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input type="number" value={item.price || ''} onChange={e => updateItem(idx, 'price', e.target.value)} placeholder="Harga"
                            className="w-full px-3 py-2 rounded-lg bg-white/5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                        </div>
                        <div className="w-16">
                          <input type="number" value={item.quantity} onChange={e => updateItem(idx, 'quantity', e.target.value)} min="1"
                            className="w-full px-3 py-2 rounded-lg bg-white/5 text-sm text-center focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                        </div>
                      </div>
                    </div>
                    <button onClick={() => removeItem(idx)} className="p-2 text-white/50 hover:text-danger transition-colors shrink-0">🗑️</button>
                  </div>
                  {item.price > 0 && item.quantity > 1 && (
                    <p className="text-xs text-white/50 mt-1.5 text-right">= {formatRupiah(item.price * item.quantity)}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">Pajak (Tax)</label>
              <input type="number" value={tax || ''} onChange={e => setTax(parseFloat(e.target.value) || 0)} placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-white/8 bg-white/5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">Service Charge</label>
              <input type="number" value={serviceCharge || ''} onChange={e => setServiceCharge(parseFloat(e.target.value) || 0)} placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-white/8 bg-white/5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
            </div>
          </div>
          <div className="glass-card p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between"><span className="text-white/50">Subtotal ({items.length} item)</span><span className="money">{formatRupiah(subtotal)}</span></div>
              {tax > 0 && <div className="flex justify-between"><span className="text-white/50">Pajak</span><span className="money">{formatRupiah(tax)}</span></div>}
              {serviceCharge > 0 && <div className="flex justify-between"><span className="text-white/50">Service</span><span className="money">{formatRupiah(serviceCharge)}</span></div>}
              <div className="border-t border-white/8 pt-2 flex justify-between">
                <span className="font-semibold">Total</span><span className="money text-lg">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </div>
          <button onClick={() => setStep('payer')} disabled={items.length === 0 || subtotal <= 0}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition shadow-lg shadow-amber-500/20">
            Lanjut — Pilih Payer →
          </button>
        </div>
      )}

      {/* Step: Select Payer */}
      {step === 'payer' && (
        <div className="animate-fade-in">
          <p className="text-sm text-white/50 mb-4">Siapa yang menalangi (membayar) bill ini?</p>
          <div className="space-y-2 mb-6">
            {friends.map(friend => (
              <button
                key={friend.id}
                onClick={() => setSelectedPayer(friend.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                  selectedPayer === friend.id
                    ? 'border-primary bg-blue-500/100/10 ring-2 ring-primary'
                    : 'border-white/8 bg-white/5 hover:border-amber-500/30/50'
                }`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: getAvatarColor(friend.name) }}>
                  {getInitials(friend.name)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{friend.name}</p>
                  {friend.id === user?.friend_id && <p className="text-[10px] text-amber-400 font-bold">KAMU</p>}
                </div>
                {selectedPayer === friend.id && <span className="text-amber-400 text-lg">✓</span>}
              </button>
            ))}
          </div>
          {friends.length === 0 && (
            <div className="text-center py-8 text-sm text-white/50">
              Belum ada teman. <a href="/friends" className="text-amber-400 font-semibold">Tambah dulu →</a>
            </div>
          )}
          <div className="glass-card p-4 mb-4">
            <p className="text-xs text-white/50 mb-1">{title}</p>
            <p className="money text-xl">{formatRupiah(grandTotal)}</p>
            <p className="text-xs text-white/50 mt-1">{items.length} item</p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setStep('edit')} className="flex-1 py-3.5 rounded-xl border border-white/8 bg-white/5 font-semibold text-sm">← Kembali</button>
            <button onClick={handleSave} disabled={!selectedPayer || saving}
              className="flex-1 py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition shadow-lg shadow-amber-500/20">
              {saving ? 'Menyimpan...' : 'Simpan & Bagi →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
