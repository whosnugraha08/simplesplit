'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Friend, PaymentMethod } from '@/lib/types';
import { getInitials, getAvatarColor } from '@/lib/formatters';

type FriendWithPMs = Friend & { payment_methods?: PaymentMethod[] };

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendWithPMs[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFriend, setEditingFriend] = useState<FriendWithPMs | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    // Step 1: Always fetch friends first (this works with both old and new schema)
    const { data: friendsData, error: friendsError } = await supabase
      .from('friends')
      .select('*')
      .order('is_admin', { ascending: false })
      .order('name');

    if (friendsError) {
      console.error('Error loading friends:', friendsError);
      setLoading(false);
      return;
    }

    const friendsList = friendsData || [];

    // Step 2: Try to fetch payment methods (may not exist if old schema)
    let pmsData: PaymentMethod[] = [];
    try {
      const { data, error } = await supabase
        .from('payment_methods')
        .select('*')
        .order('created_at');
      if (!error && data) {
        pmsData = data;
      }
    } catch {
      // payment_methods table doesn't exist yet — that's fine
    }

    // Step 3: Merge payment methods into friends
    const friendsWithPMs: FriendWithPMs[] = friendsList.map(f => ({
      ...f,
      payment_methods: pmsData.filter(pm => pm.friend_id === f.id),
    }));

    setFriends(friendsWithPMs);
    setLoading(false);
  }

  async function deleteFriend(id: string) {
    await supabase.from('friends').delete().eq('id', id);
    setDeleteConfirm(null);
    loadFriends();
  }

  return (
    <div className="px-4 pt-6 pb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Teman</h1>
          <p className="text-sm text-text-secondary">Kelola sirkel kamu</p>
        </div>
        <button
          onClick={() => { setEditingFriend(null); setShowForm(true); }}
          className="bg-primary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-primary-dark transition-colors active:scale-95"
        >
          + Tambah
        </button>
      </div>

      {/* Friends List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="skeleton h-20 w-full" />)}
        </div>
      ) : friends.length === 0 ? (
        <div className="bg-white rounded-2xl border border-border p-10 text-center">
          <p className="text-4xl mb-3">👥</p>
          <p className="text-text-secondary mb-4">Belum ada teman. Tambahkan sirkel kamu!</p>
          <button
            onClick={() => setShowForm(true)}
            className="bg-primary text-white px-5 py-2.5 rounded-xl text-sm font-semibold"
          >
            + Tambah Teman
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {friends.map((friend, idx) => {
            const pmCount = friend.payment_methods?.length || 0;
            // Fallback: check old-schema fields
            const hasOldBankData = (friend as any).bank_name || (friend as any).bank_account_number;
            return (
              <div key={friend.id} className="bg-white rounded-2xl border border-border p-4 animate-fade-in" style={{ animationDelay: `${idx * 30}ms` }}>
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0"
                    style={{ backgroundColor: getAvatarColor(friend.name) }}
                  >
                    {getInitials(friend.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{friend.name}</p>
                      {friend.is_admin && (
                        <span className="bg-primary-light text-primary text-[10px] font-bold px-2 py-0.5 rounded-full">
                          ADMIN
                        </span>
                      )}
                    </div>
                    {pmCount > 0 ? (
                      <p className="text-xs text-text-secondary mt-0.5">
                        💳 {pmCount} metode pembayaran
                      </p>
                    ) : hasOldBankData ? (
                      <p className="text-xs text-text-secondary mt-0.5">
                        🏦 {(friend as any).bank_name} • {(friend as any).bank_account_number || '-'}
                      </p>
                    ) : (
                      <p className="text-xs text-text-muted mt-0.5 italic">Belum ada rekening</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditingFriend(friend); setShowForm(true); }}
                      className="p-2 rounded-lg hover:bg-page transition-colors text-text-secondary"
                      title="Edit"
                    >
                      ✏️
                    </button>
                    {!friend.is_admin && (
                      <button
                        onClick={() => setDeleteConfirm(friend.id)}
                        className="p-2 rounded-lg hover:bg-danger-light transition-colors text-text-secondary"
                        title="Hapus"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>

                {/* Payment methods preview */}
                {pmCount > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {friend.payment_methods!.map(pm => (
                      <span key={pm.id} className="bg-page text-text-secondary text-[10px] font-medium px-2 py-1 rounded-lg">
                        {pm.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-end justify-center" onClick={() => setDeleteConfirm(null)}>
          <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Hapus Teman?</h3>
            <p className="text-sm text-text-secondary mb-6">Semua data terkait teman ini akan ikut terhapus.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="flex-1 py-3 rounded-xl border border-border font-semibold text-sm"
              >
                Batal
              </button>
              <button
                onClick={() => deleteFriend(deleteConfirm)}
                className="flex-1 py-3 rounded-xl bg-danger text-white font-semibold text-sm"
              >
                Ya, Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showForm && (
        <FriendFormModal
          friend={editingFriend}
          onClose={() => { setShowForm(false); setEditingFriend(null); }}
          onSaved={() => { setShowForm(false); setEditingFriend(null); loadFriends(); }}
        />
      )}
    </div>
  );
}

// ---- Payment Method types for local state ----
interface LocalPM {
  id?: string;
  label: string;
  bank_name: string;
  account_number: string;
  qris_image_url: string | null;
  qris_file: File | null;
  _deleted?: boolean;
}

function FriendFormModal({
  friend,
  onClose,
  onSaved,
}: {
  friend: FriendWithPMs | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(friend?.name || '');
  const [isAdmin, setIsAdmin] = useState(friend?.is_admin || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Payment methods state — also check old-schema fields for backwards compat
  const [paymentMethods, setPaymentMethods] = useState<LocalPM[]>(() => {
    if (friend?.payment_methods && friend.payment_methods.length > 0) {
      return friend.payment_methods.map(pm => ({
        id: pm.id,
        label: pm.label,
        bank_name: pm.bank_name,
        account_number: pm.account_number || '',
        qris_image_url: pm.qris_image_url,
        qris_file: null,
      }));
    }
    // Backwards compat: if old schema had bank data on friend directly
    const oldFriend = friend as any;
    if (oldFriend?.bank_name) {
      return [{
        label: oldFriend.bank_name,
        bank_name: oldFriend.bank_name,
        account_number: oldFriend.bank_account_number || '',
        qris_image_url: oldFriend.qris_image_url || null,
        qris_file: null,
      }];
    }
    return [];
  });

  function addPaymentMethod() {
    setPaymentMethods([...paymentMethods, {
      label: '',
      bank_name: '',
      account_number: '',
      qris_image_url: null,
      qris_file: null,
    }]);
  }

  function updatePM(index: number, field: string, value: string) {
    const updated = [...paymentMethods];
    (updated[index] as any)[field] = value;
    setPaymentMethods(updated);
  }

  function removePM(index: number) {
    const updated = [...paymentMethods];
    if (updated[index].id) {
      updated[index]._deleted = true;
    } else {
      updated.splice(index, 1);
    }
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

      // Save friend record
      const friendData: any = { name: name.trim(), is_admin: isAdmin };

      if (friend) {
        const { error: updateErr } = await supabase.from('friends').update(friendData).eq('id', friend.id);
        if (updateErr) throw updateErr;
      } else {
        const { data, error: insertErr } = await supabase.from('friends').insert(friendData).select().single();
        if (insertErr) throw insertErr;
        friendId = data?.id;
      }

      if (!friendId) throw new Error('Friend ID missing');

      // Try to save payment methods to the new table
      const activePMs = paymentMethods.filter(pm => !pm._deleted && pm.bank_name.trim());
      
      // Check if payment_methods table exists by trying a query
      const { error: pmTableCheck } = await supabase
        .from('payment_methods')
        .select('id')
        .limit(1);

      if (!pmTableCheck) {
        // Table exists — save payment methods normally
        for (const pm of paymentMethods) {
          if (pm._deleted && pm.id) {
            await supabase.from('payment_methods').delete().eq('id', pm.id);
            continue;
          }
          if (pm._deleted || !pm.bank_name.trim()) continue;

          let qrisUrl = pm.qris_image_url;
          if (pm.qris_file) {
            const fileExt = pm.qris_file.name.split('.').pop();
            const fileName = `qris_${friendId}_${Date.now()}.${fileExt}`;
            const { error: uploadErr } = await supabase.storage
              .from('qris')
              .upload(fileName, pm.qris_file, { upsert: true });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('qris').getPublicUrl(fileName);
              qrisUrl = urlData.publicUrl;
            }
          }

          // Remove blob URLs before saving
          if (qrisUrl && qrisUrl.startsWith('blob:')) {
            qrisUrl = null;
          }

          const pmData = {
            friend_id: friendId,
            label: pm.label.trim() || pm.bank_name.trim(),
            bank_name: pm.bank_name.trim(),
            account_number: pm.account_number.trim() || null,
            qris_image_url: qrisUrl,
          };

          if (pm.id) {
            await supabase.from('payment_methods').update(pmData).eq('id', pm.id);
          } else {
            await supabase.from('payment_methods').insert(pmData);
          }
        }
      } else {
        // Table doesn't exist — fallback: save to old friend fields
        console.warn('payment_methods table not found, saving to friend record');
        if (activePMs.length > 0) {
          const firstPM = activePMs[0];
          let qrisUrl = firstPM.qris_image_url;
          if (firstPM.qris_file) {
            const fileExt = firstPM.qris_file.name.split('.').pop();
            const fileName = `qris_${friendId}_${Date.now()}.${fileExt}`;
            const { error: uploadErr } = await supabase.storage
              .from('qris')
              .upload(fileName, firstPM.qris_file, { upsert: true });
            if (!uploadErr) {
              const { data: urlData } = supabase.storage.from('qris').getPublicUrl(fileName);
              qrisUrl = urlData.publicUrl;
            }
          }
          if (qrisUrl && qrisUrl.startsWith('blob:')) qrisUrl = null;

          await supabase.from('friends').update({
            bank_name: firstPM.bank_name.trim(),
            bank_account_number: firstPM.account_number.trim() || null,
            qris_image_url: qrisUrl,
          }).eq('id', friendId);
        }
      }

      onSaved();
    } catch (err: any) {
      console.error('Error saving friend:', err);
      setError(err?.message || 'Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  const activePMs = paymentMethods.filter(pm => !pm._deleted);

  return (
    <div className="fixed inset-0 overlay z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{friend ? 'Edit Teman' : 'Tambah Teman'}</h3>
          <button onClick={onClose} className="text-text-secondary text-xl p-1">✕</button>
        </div>

        {error && (
          <div className="bg-danger-light text-danger rounded-xl p-3 text-sm mb-4">
            ⚠️ {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nama *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Contoh: Faiz"
              className="w-full px-4 py-3 rounded-xl border border-border bg-page text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
              required
            />
          </div>

          {/* Admin Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={isAdmin} onChange={e => setIsAdmin(e.target.checked)} />
            <span className="text-sm font-medium">Tandai sebagai Admin (saya sendiri)</span>
          </label>

          {/* Payment Methods */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-secondary">Rekening / E-Wallet</label>
              <button type="button" onClick={addPaymentMethod} className="text-sm text-primary font-semibold">
                + Tambah
              </button>
            </div>

            {activePMs.length === 0 ? (
              <button
                type="button"
                onClick={addPaymentMethod}
                className="w-full py-6 rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors text-text-secondary text-sm text-center"
              >
                💳 Tambah rekening / e-wallet
              </button>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map((pm, idx) => {
                  if (pm._deleted) return null;
                  return (
                    <div key={idx} className="bg-page rounded-xl p-3 space-y-2 relative animate-fade-in">
                      <button
                        type="button"
                        onClick={() => removePM(idx)}
                        className="absolute top-2 right-2 text-text-secondary hover:text-danger text-sm p-1"
                      >
                        ✕
                      </button>

                      <input
                        type="text"
                        value={pm.label}
                        onChange={e => updatePM(idx, 'label', e.target.value)}
                        placeholder="Label (cth: BCA Utama, GoPay)"
                        className="w-full px-3 py-2 rounded-lg bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                      />

                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={pm.bank_name}
                          onChange={e => updatePM(idx, 'bank_name', e.target.value)}
                          placeholder="Bank/E-Wallet *"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                        <input
                          type="text"
                          value={pm.account_number}
                          onChange={e => updatePM(idx, 'account_number', e.target.value)}
                          placeholder="No. Rekening"
                          className="w-full px-3 py-2 rounded-lg bg-white border border-border text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>

                      <div>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleQrisFile(idx, file);
                          }}
                          className="hidden"
                          id={`qris-${idx}`}
                        />
                        {pm.qris_image_url ? (
                          <div className="relative">
                            <img src={pm.qris_image_url} alt="QRIS" className="w-full max-h-32 object-contain rounded-lg border border-border bg-white" />
                            <button
                              type="button"
                              onClick={() => {
                                const updated = [...paymentMethods];
                                updated[idx].qris_image_url = null;
                                updated[idx].qris_file = null;
                                setPaymentMethods(updated);
                              }}
                              className="absolute top-1 right-1 bg-white rounded-full w-6 h-6 flex items-center justify-center shadow text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        ) : (
                          <label
                            htmlFor={`qris-${idx}`}
                            className="block w-full py-3 rounded-lg border border-dashed border-border hover:border-primary transition-colors text-text-secondary text-xs text-center cursor-pointer"
                          >
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

          {/* Submit */}
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full py-3.5 rounded-xl bg-primary text-white font-semibold text-sm disabled:opacity-50 transition-opacity active:scale-[0.98]"
          >
            {saving ? 'Menyimpan...' : friend ? 'Simpan Perubahan' : 'Tambah Teman'}
          </button>
        </form>
      </div>
    </div>
  );
}
