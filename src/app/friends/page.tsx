'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Friend, PaymentMethod } from '@/lib/types';
import { getInitials, getAvatarColor } from '@/lib/formatters';
import { useToast } from '@/components/Toast';

type FriendWithPMs = Friend & { payment_methods?: PaymentMethod[] };

export default function FriendsPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [friends, setFriends] = useState<FriendWithPMs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFriend, setEditingFriend] = useState<FriendWithPMs | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => { loadFriends(); }, []);

  async function loadFriends() {
    const { data: friendsData, error: friendsError } = await supabase
      .from('friends').select('*')
      .order('is_admin', { ascending: false }).order('name');

    if (friendsError) { console.error(friendsError); setLoading(false); return; }
    const friendsList = friendsData || [];

    let pmsData: PaymentMethod[] = [];
    try {
      const { data, error } = await supabase.from('payment_methods').select('*').order('created_at');
      if (!error && data) pmsData = data;
    } catch {}

    setFriends(friendsList.map(f => ({ ...f, payment_methods: pmsData.filter(pm => pm.friend_id === f.id) })));
    setLoading(false);
  }

  async function deleteFriend(id: string) {
    await supabase.from('friends').delete().eq('id', id);
    setDeleteConfirm(null);
    showToast('Teman berhasil dihapus', 'success');
    loadFriends();
  }

  return (
    <div className="content-padding pt-6 pb-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Teman</h1>
          <p className="text-sm text-white/50">Kelola sirkel kamu</p>
        </div>
        <button onClick={() => { setEditingFriend(null); setShowForm(true); }}
          className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-amber-500/20 active:scale-95 transition-all">
          + Tambah
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">{[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full" />)}</div>
      ) : friends.length === 0 ? (
        <div className="glass-card p-10 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-white/50 mb-4">Belum ada teman. Tambahkan sirkel kamu!</p>
          <button onClick={() => setShowForm(true)} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-amber-500/20">
            + Tambah Teman
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {friends.map((friend, idx) => {
            const pmCount = friend.payment_methods?.length || 0;
            const isMe = friend.id === user?.friend_id;
            return (
              <div key={friend.id} className="glass-card p-4 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(friend.name) }}>
                    {getInitials(friend.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{friend.name}</p>
                      {isMe && <span className="bg-blue-500/100/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">KAMU</span>}
                      {friend.is_admin && <span className="bg-amber-500/100/10 text-amber-400 text-[10px] font-bold px-2 py-0.5 rounded-full">ADMIN</span>}
                    </div>
                    {pmCount > 0 ? (
                      <p className="text-xs text-white/50 mt-0.5">💳 {pmCount} metode pembayaran</p>
                    ) : (
                      <p className="text-xs text-white/30 mt-0.5 italic">Belum ada rekening</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditingFriend(friend); setShowForm(true); }}
                      className="p-2 rounded-lg hover:bg-white/5 transition-colors text-white/50" title="Edit">✏️</button>
                    {!isMe && (
                      <button onClick={() => setDeleteConfirm(friend.id)}
                        className="p-2 rounded-lg hover:bg-red-500/100/100/100/10 transition-colors text-white/50" title="Hapus">🗑️</button>
                    )}
                  </div>
                </div>
                {pmCount > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {friend.payment_methods!.map(pm => (
                      <span key={pm.id} className="bg-white/5 text-white/50 text-[10px] font-medium px-2 py-1 rounded-lg">{pm.label}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirm */}
      {deleteConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white/5 w-full max-w-lg rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Hapus Teman?</h3>
            <p className="text-sm text-white/50 mb-6">Semua data terkait teman ini akan ikut terhapus.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 rounded-xl border border-white/8 font-semibold text-sm">Batal</button>
              <button onClick={() => deleteFriend(deleteConfirm)} className="flex-1 py-3 rounded-xl bg-danger text-white font-semibold text-sm">Ya, Hapus</button>
            </div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <FriendFormModal
          friend={editingFriend}
          onClose={() => { setShowForm(false); setEditingFriend(null); }}
          onSaved={() => { setShowForm(false); setEditingFriend(null); loadFriends(); showToast('Teman berhasil disimpan!', 'success'); }}
        />
      )}
    </div>
  );
}

interface LocalPM {
  id?: string;
  label: string;
  bank_name: string;
  account_number: string;
  qris_image_url: string | null;
  qris_file: File | null;
  _deleted?: boolean;
}

function FriendFormModal({ friend, onClose, onSaved }: { friend: FriendWithPMs | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(friend?.name || '');
  const [isAdmin, setIsAdmin] = useState(friend?.is_admin || false);
  const [whatsappNumber, setWhatsappNumber] = useState(friend?.whatsapp_number || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [paymentMethods, setPaymentMethods] = useState<LocalPM[]>(() => {
    if (friend?.payment_methods && friend.payment_methods.length > 0) {
      return friend.payment_methods.map(pm => ({
        id: pm.id, label: pm.label, bank_name: pm.bank_name,
        account_number: pm.account_number || '', qris_image_url: pm.qris_image_url, qris_file: null,
      }));
    }
    return [];
  });

  function addPaymentMethod() {
    setPaymentMethods([...paymentMethods, { label: '', bank_name: '', account_number: '', qris_image_url: null, qris_file: null }]);
  }

  function updatePM(index: number, field: string, value: string) {
    const updated = [...paymentMethods];
    (updated[index] as any)[field] = value;
    setPaymentMethods(updated);
  }

  function removePM(index: number) {
    const updated = [...paymentMethods];
    if (updated[index].id) updated[index]._deleted = true;
    else updated.splice(index, 1);
    setPaymentMethods(updated);
  }

  function handleQrisFile(index: number, file: File) {
    const updated = [...paymentMethods];
    updated[index].qris_file = file;
    updated[index].qris_image_url = URL.createObjectURL(file);
    setPaymentMethods(updated);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);

    try {
      let friendId = friend?.id;
      const friendData: any = { name: name.trim(), is_admin: isAdmin, whatsapp_number: whatsappNumber.trim() || null };

      if (friend) {
        const { error: updateErr } = await supabase.from('friends').update(friendData).eq('id', friend.id);
        if (updateErr) throw updateErr;
      } else {
        const { data, error: insertErr } = await supabase.from('friends').insert(friendData).select().single();
        if (insertErr) throw insertErr;
        friendId = data?.id;
      }

      if (!friendId) throw new Error('Friend ID missing');

      // Save payment methods
      for (const pm of paymentMethods) {
        if (pm._deleted && pm.id) { await supabase.from('payment_methods').delete().eq('id', pm.id); continue; }
        if (pm._deleted || !pm.bank_name.trim()) continue;

        let qrisUrl = pm.qris_image_url;
        if (pm.qris_file) {
          const fileExt = pm.qris_file.name.split('.').pop();
          const fileName = `qris_${friendId}_${Date.now()}.${fileExt}`;
          let uploaded = false;
          const { error: uploadErr } = await supabase.storage.from('qris').upload(fileName, pm.qris_file, { upsert: true });
          if (!uploadErr) {
            const { data: urlData } = supabase.storage.from('qris').getPublicUrl(fileName);
            qrisUrl = urlData.publicUrl; uploaded = true;
          } else {
            const { error: uploadErr2 } = await supabase.storage.from('receipts').upload(`qris/${fileName}`, pm.qris_file, { upsert: true });
            if (!uploadErr2) {
              const { data: urlData } = supabase.storage.from('receipts').getPublicUrl(`qris/${fileName}`);
              qrisUrl = urlData.publicUrl; uploaded = true;
            }
          }
          if (!uploaded) {
            try {
              const reader = new FileReader();
              const base64 = await new Promise<string>((resolve) => { reader.onload = () => resolve(reader.result as string); reader.readAsDataURL(pm.qris_file!); });
              qrisUrl = base64;
            } catch {}
          }
        }
        if (qrisUrl && qrisUrl.startsWith('blob:')) qrisUrl = null;

        const pmData = {
          friend_id: friendId,
          label: pm.label.trim() || pm.bank_name.trim(),
          bank_name: pm.bank_name.trim(),
          account_number: pm.account_number.trim() || null,
          qris_image_url: qrisUrl,
        };

        if (pm.id) await supabase.from('payment_methods').update(pmData).eq('id', pm.id);
        else await supabase.from('payment_methods').insert(pmData);
      }

      onSaved();
    } catch (err: any) {
      console.error('Error saving friend:', err);
      setError(err?.message || 'Gagal menyimpan.');
    } finally { setSaving(false); }
  }

  const activePMs = paymentMethods.filter(pm => !pm._deleted);

  return (
    <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white/5 w-full max-w-lg rounded-3xl p-6 animate-slide-up max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{friend ? 'Edit Teman' : 'Tambah Teman'}</h3>
          <button onClick={onClose} className="text-white/50 text-xl p-1">✕</button>
        </div>

        {error && <div className="bg-red-500/100/10 text-danger rounded-xl p-3 text-sm mb-4">⚠️ {error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/50 mb-1.5">Nama *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Contoh: Faiz"
              className="w-full px-4 py-3 rounded-xl border border-white/8 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/30 transition" required />
          </div>
          <div>
            <label className="block text-sm font-medium text-white/50 mb-1.5">No. WhatsApp</label>
            <input type="tel" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="081234567890"
              className="w-full px-4 py-3 rounded-xl border border-white/8 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/30 transition" />
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            <span className="text-sm font-medium">Tandai sebagai Admin</span>
          </label>

          {/* Payment Methods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-white/50">Rekening / E-Wallet</label>
              <button type="button" onClick={addPaymentMethod} className="text-sm text-amber-400 font-semibold">+ Tambah</button>
            </div>
            {activePMs.length === 0 ? (
              <button type="button" onClick={addPaymentMethod}
                className="w-full py-6 rounded-xl border-2 border-dashed border-white/8 hover:border-amber-500/30 transition-colors text-white/50 text-sm text-center">
                💳 Tambah rekening / e-wallet
              </button>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm, idx) => {
                  if (pm._deleted) return null;
                  return (
                    <div key={idx} className="bg-white/5 rounded-xl p-3 space-y-2 relative animate-fade-in">
                      <button type="button" onClick={() => removePM(idx)} className="absolute top-2 right-2 text-white/50 hover:text-danger text-sm p-1">✕</button>
                      <input type="text" value={pm.label} onChange={e => updatePM(idx, 'label', e.target.value)} placeholder="Label (cth: BCA Utama)"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={pm.bank_name} onChange={e => updatePM(idx, 'bank_name', e.target.value)} placeholder="Bank *"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                        <input type="text" value={pm.account_number} onChange={e => updatePM(idx, 'account_number', e.target.value)} placeholder="No. Rekening"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                      </div>
                      <div>
                        <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) handleQrisFile(idx, file); }} className="hidden" id={`qris-${idx}`} />
                        {pm.qris_image_url ? (
                          <div className="relative">
                            <img src={pm.qris_image_url} alt="QRIS" className="w-full max-h-32 object-contain rounded-lg border border-white/8 bg-white" />
                            <button type="button" onClick={() => { const updated = [...paymentMethods]; updated[idx].qris_image_url = null; updated[idx].qris_file = null; setPaymentMethods(updated); }}
                              className="absolute top-1 right-1 bg-white/5 rounded-full w-6 h-6 flex items-center justify-center shadow text-xs">✕</button>
                          </div>
                        ) : (
                          <label htmlFor={`qris-${idx}`}
                            className="block w-full py-3 rounded-lg border border-dashed border-white/8 hover:border-amber-500/30 transition-colors text-white/50 text-xs text-center cursor-pointer">
                            📷 Upload QRIS (opsional)
                          </label>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <button type="submit" disabled={saving || !name.trim()}
            className="w-full py-3.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm disabled:opacity-50 transition-opacity active:scale-[0.98] shadow-lg shadow-amber-500/20">
            {saving ? 'Menyimpan...' : friend ? 'Simpan Perubahan' : 'Tambah Teman'}
          </button>
        </form>
      </div>
    </div>
  );
}
