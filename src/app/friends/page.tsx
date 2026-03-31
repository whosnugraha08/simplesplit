'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { Friend } from '@/lib/types';
import { getInitials, getAvatarColor } from '@/lib/formatters';

export default function FriendsPage() {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadFriends();
  }, []);

  async function loadFriends() {
    const { data } = await supabase.from('friends').select('*').order('is_admin', { ascending: false }).order('name');
    setFriends(data || []);
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
          {friends.map((friend, idx) => (
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
                  {friend.bank_name && (
                    <p className="text-xs text-text-secondary mt-0.5">
                      {friend.bank_name} • {friend.bank_account_number || '-'}
                    </p>
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
            </div>
          ))}
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

function FriendFormModal({
  friend,
  onClose,
  onSaved,
}: {
  friend: Friend | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(friend?.name || '');
  const [bankName, setBankName] = useState(friend?.bank_name || '');
  const [bankAccount, setBankAccount] = useState(friend?.bank_account_number || '');
  const [isAdmin, setIsAdmin] = useState(friend?.is_admin || false);
  const [qrisFile, setQrisFile] = useState<File | null>(null);
  const [qrisPreview, setQrisPreview] = useState<string | null>(friend?.qris_image_url || null);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function handleQrisSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setQrisFile(file);
      setQrisPreview(URL.createObjectURL(file));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);

    try {
      let qrisUrl = friend?.qris_image_url || null;

      // Upload QRIS image if new file selected
      if (qrisFile) {
        const fileExt = qrisFile.name.split('.').pop();
        const fileName = `qris_${Date.now()}.${fileExt}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('qris')
          .upload(fileName, qrisFile, { upsert: true });
        
        if (uploadError) throw uploadError;
        
        const { data: urlData } = supabase.storage.from('qris').getPublicUrl(fileName);
        qrisUrl = urlData.publicUrl;
      }

      const friendData = {
        name: name.trim(),
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccount.trim() || null,
        qris_image_url: qrisUrl,
        is_admin: isAdmin,
      };

      if (friend) {
        await supabase.from('friends').update(friendData).eq('id', friend.id);
      } else {
        await supabase.from('friends').insert(friendData);
      }

      onSaved();
    } catch (err) {
      console.error('Error saving friend:', err);
      alert('Gagal menyimpan. Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 overlay z-50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-white w-full max-w-lg rounded-t-3xl p-6 animate-slide-up max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold">{friend ? 'Edit Teman' : 'Tambah Teman'}</h3>
          <button onClick={onClose} className="text-text-secondary text-xl p-1">✕</button>
        </div>

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

          {/* Bank Name */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nama Bank</label>
            <input
              type="text"
              value={bankName}
              onChange={e => setBankName(e.target.value)}
              placeholder="Contoh: BCA, Mandiri, GoPay"
              className="w-full px-4 py-3 rounded-xl border border-border bg-page text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          {/* Bank Account */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Nomor Rekening</label>
            <input
              type="text"
              value={bankAccount}
              onChange={e => setBankAccount(e.target.value)}
              placeholder="Contoh: 1234567890"
              className="w-full px-4 py-3 rounded-xl border border-border bg-page text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition"
            />
          </div>

          {/* Admin Checkbox */}
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={e => setIsAdmin(e.target.checked)}
            />
            <span className="text-sm font-medium">Tandai sebagai Admin (saya sendiri)</span>
          </label>

          {/* QRIS Upload */}
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">Foto QRIS</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              onChange={handleQrisSelect}
              className="hidden"
            />
            {qrisPreview ? (
              <div className="relative">
                <img
                  src={qrisPreview}
                  alt="QRIS Preview"
                  className="w-full max-h-48 object-contain rounded-xl border border-border bg-page"
                />
                <button
                  type="button"
                  onClick={() => { setQrisFile(null); setQrisPreview(null); }}
                  className="absolute top-2 right-2 bg-white rounded-full w-7 h-7 flex items-center justify-center shadow text-sm"
                >
                  ✕
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-full py-8 rounded-xl border-2 border-dashed border-border hover:border-primary transition-colors text-text-secondary text-sm text-center"
              >
                📷 Tap untuk upload foto QRIS
              </button>
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
