'use client';

import { useState, useRef, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Friend, ParsedReceipt, ParsedReceiptItem } from '@/lib/types';
import { scanReceipt, parseReceiptText } from '@/lib/ocr';
import { formatRupiah, parsePrice } from '@/lib/formatters';
import { getInitials, getAvatarColor } from '@/lib/formatters';
import { useRouter } from 'next/navigation';

type Step = 'upload' | 'scanning' | 'edit' | 'payer';

export default function NewBillPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [scanProgress, setScanProgress] = useState(0);
  const [scanError, setScanError] = useState<string | null>(null);

  // Parsed receipt data (editable)
  const [items, setItems] = useState<ParsedReceiptItem[]>([]);
  const [tax, setTax] = useState<number>(0);
  const [serviceCharge, setServiceCharge] = useState<number>(0);
  const [title, setTitle] = useState('');

  // Payer selection
  const [friends, setFriends] = useState<Friend[]>([]);
  const [selectedPayer, setSelectedPayer] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('friends').select('*').order('is_admin', { ascending: false }).order('name').then(({ data }) => {
      setFriends(data || []);
    });
  }, []);

  // Handle file selection
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  }

  // Run OCR scan
  async function handleScan() {
    if (!imageFile) return;
    setStep('scanning');
    setScanProgress(0);
    setScanError(null);

    try {
      // Simulate progress (Tesseract.js progress is not reliable)
      const progressInterval = setInterval(() => {
        setScanProgress(prev => Math.min(prev + Math.random() * 15, 90));
      }, 500);

      const result = await scanReceipt(imageFile);
      
      clearInterval(progressInterval);
      setScanProgress(100);

      setItems(result.items);
      setTax(result.tax || 0);
      setServiceCharge(result.service_charge || 0);
      
      // Auto-generate title from date
      const today = new Date();
      setTitle(`Bill ${today.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`);

      setTimeout(() => setStep('edit'), 300);
    } catch (err) {
      console.error('OCR Error:', err);
      setScanError('Gagal membaca nota. Coba lagi atau input manual.');
      setStep('upload');
    }
  }

  // Skip OCR and input manually
  function handleManualInput() {
    setItems([{ name: '', price: 0, quantity: 1 }]);
    setTax(0);
    setServiceCharge(0);
    const today = new Date();
    setTitle(`Bill ${today.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`);
    setStep('edit');
  }

  // Edit items
  function updateItem(index: number, field: keyof ParsedReceiptItem, value: string | number) {
    const updated = [...items];
    if (field === 'name') {
      updated[index].name = value as string;
    } else if (field === 'price') {
      updated[index].price = typeof value === 'string' ? parseFloat(value) || 0 : value;
    } else if (field === 'quantity') {
      updated[index].quantity = typeof value === 'string' ? parseInt(value) || 1 : value;
    }
    setItems(updated);
  }

  function addItem() {
    setItems([...items, { name: '', price: 0, quantity: 1 }]);
  }

  function removeItem(index: number) {
    setItems(items.filter((_, i) => i !== index));
  }

  // Calculate totals
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const grandTotal = subtotal + tax + serviceCharge;

  // Save bill and proceed to assignment
  async function handleSave() {
    if (!selectedPayer || items.length === 0 || !title.trim()) return;
    setSaving(true);

    try {
      // Upload receipt image
      let receiptUrl: string | null = null;
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop();
        const fileName = `receipt_${Date.now()}.${fileExt}`;
        await supabase.storage.from('receipts').upload(fileName, imageFile, { upsert: true });
        const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
        receiptUrl = urlData.publicUrl;
      }

      // Insert bill
      const { data: billData, error: billError } = await supabase
        .from('bills')
        .insert({
          title: title.trim(),
          paid_by: selectedPayer,
          receipt_image_url: receiptUrl,
          subtotal,
          tax_amount: tax,
          service_charge_amount: serviceCharge,
          total_amount: grandTotal,
          status: 'draft',
          bill_date: new Date().toISOString(),
        })
        .select()
        .single();

      if (billError) throw billError;

      // Insert bill items
      const itemsToInsert = items
        .filter(item => item.name.trim() && item.price > 0)
        .map(item => ({
          bill_id: billData.id,
          item_name: item.name.trim(),
          item_price: item.price,
          quantity: item.quantity,
        }));

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from('bill_items').insert(itemsToInsert);
        if (itemsError) throw itemsError;
      }

      // Navigate to assignment page
      router.push(`/bills/${billData.id}/assign`);
    } catch (err) {
      console.error('Error saving bill:', err);
      alert('Gagal menyimpan bill. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 pt-6 pb-4 min-h-screen">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="text-xl text-text-secondary p-1">
          ←
        </button>
        <div>
          <h1 className="text-xl font-bold">Bill Baru</h1>
          <p className="text-xs text-text-secondary">
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handleFileSelect}
            className="hidden"
          />

          {!imagePreview ? (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full aspect-[3/4] rounded-2xl border-2 border-dashed border-border hover:border-primary transition-colors flex flex-col items-center justify-center gap-3 bg-white"
            >
              <span className="text-5xl">📸</span>
              <span className="text-sm font-semibold text-text-primary">Ambil Foto Nota</span>
              <span className="text-xs text-text-secondary">atau pilih dari galeri</span>
            </button>
          ) : (
            <div className="space-y-4">
              <div className="relative rounded-2xl overflow-hidden border border-border bg-white">
                <img src={imagePreview} alt="Receipt" className="w-full max-h-[60vh] object-contain" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview(null); }}
                  className="absolute top-3 right-3 bg-white/90 backdrop-blur rounded-full w-8 h-8 flex items-center justify-center shadow text-sm"
                >
                  ✕
                </button>
              </div>
              <button
                onClick={handleScan}
                className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm active:scale-[0.98] transition-transform"
              >
                🔍 Scan & Baca Nota
              </button>
            </div>
          )}

          {scanError && (
            <div className="mt-4 bg-danger-light text-danger rounded-xl p-3 text-sm">
              {scanError}
            </div>
          )}

          <div className="mt-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-secondary">atau</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <button
            onClick={handleManualInput}
            className="w-full mt-4 py-3.5 rounded-xl border border-border bg-white font-semibold text-sm text-text-primary active:scale-[0.98] transition-transform"
          >
            ✍️ Input Manual
          </button>
        </div>
      )}

      {/* Step: Scanning */}
      {step === 'scanning' && (
        <div className="animate-fade-in flex flex-col items-center justify-center py-16">
          <div className="w-20 h-20 mb-6 relative">
            <div className="absolute inset-0 rounded-full border-4 border-border" />
            <div
              className="absolute inset-0 rounded-full border-4 border-primary transition-all duration-300"
              style={{
                clipPath: `polygon(50% 50%, 50% 0%, ${50 + 50 * Math.sin(scanProgress / 100 * 2 * Math.PI)}% ${50 - 50 * Math.cos(scanProgress / 100 * 2 * Math.PI)}%${scanProgress > 25 ? ', 100% 0%, 100% 100%, 0% 100%, 0% 0%' : ''})`
              }}
            />
            <span className="absolute inset-0 flex items-center justify-center text-2xl">🔍</span>
          </div>
          <p className="text-lg font-semibold mb-2">Membaca Nota...</p>
          <p className="text-sm text-text-secondary mb-4">Menggunakan Tesseract.js OCR</p>
          <div className="w-48 h-2 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${scanProgress}%` }}
            />
          </div>
          <p className="text-xs text-text-secondary mt-2">{Math.round(scanProgress)}%</p>
        </div>
      )}

      {/* Step: Edit Items */}
      {step === 'edit' && (
        <div className="animate-fade-in space-y-4">
          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Judul Bill</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Contoh: Makan di Warung Pak Joko"
              className="w-full px-4 py-3 rounded-xl border border-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-secondary">Daftar Item</label>
              <button onClick={addItem} className="text-sm text-primary font-semibold">+ Tambah</button>
            </div>

            <div className="space-y-2">
              {items.map((item, idx) => (
                <div key={idx} className="bg-white rounded-xl border border-border p-3 animate-fade-in">
                  <div className="flex gap-2 items-start">
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={item.name}
                        onChange={e => updateItem(idx, 'name', e.target.value)}
                        placeholder="Nama item"
                        className="w-full px-3 py-2 rounded-lg bg-page text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <input
                            type="number"
                            value={item.price || ''}
                            onChange={e => updateItem(idx, 'price', e.target.value)}
                            placeholder="Harga"
                            className="w-full px-3 py-2 rounded-lg bg-page text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                        <div className="w-16">
                          <input
                            type="number"
                            value={item.quantity}
                            onChange={e => updateItem(idx, 'quantity', e.target.value)}
                            min="1"
                            className="w-full px-3 py-2 rounded-lg bg-page text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => removeItem(idx)}
                      className="p-2 text-text-secondary hover:text-danger transition-colors shrink-0"
                    >
                      🗑️
                    </button>
                  </div>
                  {item.price > 0 && item.quantity > 1 && (
                    <p className="text-xs text-text-secondary mt-1.5 text-right">
                      = {formatRupiah(item.price * item.quantity)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Tax & Service */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Pajak (Tax)</label>
              <input
                type="number"
                value={tax || ''}
                onChange={e => setTax(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-text-secondary mb-1">Service Charge</label>
              <input
                type="number"
                value={serviceCharge || ''}
                onChange={e => setServiceCharge(parseFloat(e.target.value) || 0)}
                placeholder="0"
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          {/* Summary */}
          <div className="bg-white rounded-2xl border border-border p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-secondary">Subtotal ({items.length} item)</span>
                <span className="money">{formatRupiah(subtotal)}</span>
              </div>
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Pajak</span>
                  <span className="money">{formatRupiah(tax)}</span>
                </div>
              )}
              {serviceCharge > 0 && (
                <div className="flex justify-between">
                  <span className="text-text-secondary">Service Charge</span>
                  <span className="money">{formatRupiah(serviceCharge)}</span>
                </div>
              )}
              <div className="border-t border-border pt-2 flex justify-between">
                <span className="font-semibold">Total</span>
                <span className="money text-lg">{formatRupiah(grandTotal)}</span>
              </div>
            </div>
          </div>

          {/* Next Button */}
          <button
            onClick={() => setStep('payer')}
            disabled={items.length === 0 || subtotal <= 0}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
          >
            Lanjut — Pilih yang Menalangi →
          </button>
        </div>
      )}

      {/* Step: Select Payer */}
      {step === 'payer' && (
        <div className="animate-fade-in">
          <p className="text-sm text-text-secondary mb-4">Siapa yang menalangi (membayar) bill ini?</p>

          <div className="space-y-2 mb-6">
            {friends.map(friend => (
              <button
                key={friend.id}
                onClick={() => setSelectedPayer(friend.id)}
                className={`w-full flex items-center gap-3 p-4 rounded-2xl border transition-all text-left ${
                  selectedPayer === friend.id
                    ? 'border-primary bg-primary-light ring-2 ring-primary'
                    : 'border-border bg-white hover:border-primary/50'
                }`}
              >
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                  style={{ backgroundColor: getAvatarColor(friend.name) }}
                >
                  {getInitials(friend.name)}
                </div>
                <div className="flex-1">
                  <p className="font-semibold text-sm">{friend.name}</p>
                  {friend.is_admin && <p className="text-[10px] text-primary font-bold">ADMIN</p>}
                </div>
                {selectedPayer === friend.id && (
                  <span className="text-primary text-lg">✓</span>
                )}
              </button>
            ))}
          </div>

          {friends.length === 0 && (
            <div className="text-center py-8 text-sm text-text-secondary">
              Belum ada teman. <a href="/friends" className="text-primary font-semibold">Tambah dulu →</a>
            </div>
          )}

          {/* Summary Bar */}
          <div className="bg-white rounded-2xl border border-border p-4 mb-4">
            <p className="text-xs text-text-secondary mb-1">{title}</p>
            <p className="money text-xl">{formatRupiah(grandTotal)}</p>
            <p className="text-xs text-text-secondary mt-1">{items.length} item</p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep('edit')}
              className="flex-1 py-3.5 rounded-xl border border-border bg-white font-semibold text-sm"
            >
              ← Kembali
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedPayer || saving}
              className="flex-1 py-3.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition"
            >
              {saving ? 'Menyimpan...' : 'Simpan & Bagi →'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
