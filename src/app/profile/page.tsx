'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PaymentMethod } from '@/lib/types';
import { getInitials, getAvatarColor } from '@/lib/formatters';
import { useToast } from '@/components/Toast';
import { getSoundEnabled, setSoundEnabled } from '@/lib/settings';
import { FormHelper } from '@/components/ui/FormHelper';
import Link from 'next/link';

interface LocalPM {
  id?: string;
  label: string;
  bank_name: string;
  account_number: string;
  qris_image_url: string | null;
  qris_file: File | null;
  _deleted?: boolean;
}

export default function ProfilePage() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();

  const [displayName, setDisplayName] = useState('');
  const [whatsappNumber, setWhatsappNumber] = useState('');
  const [paymentMethods, setPaymentMethods] = useState<LocalPM[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [waGroupJid, setWaGroupJid] = useState('');
  const [waGroupName, setWaGroupName] = useState('');
  const [linkingGroup, setLinkingGroup] = useState(false);

  useEffect(() => {
    setSoundOn(getSoundEnabled());
    loadWaGroup();
    if (user?.friend_id) loadProfile();
  }, [user?.friend_id]);

  async function loadWaGroup() {
    try {
      const res = await fetch('/api/wa-group');
      const data = await res.json();
      if (data.group) {
        setWaGroupJid(data.group.group_jid || '');
        setWaGroupName(data.group.group_name || '');
      }
    } catch {
      /* optional */
    }
  }

  async function handleLinkWaGroup() {
    if (!waGroupJid.trim()) {
      showToast('Isi Group JID dulu (dari bot setelah scan)', 'error');
      return;
    }
    setLinkingGroup(true);
    try {
      const res = await fetch('/api/wa-group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group_jid: waGroupJid.trim(), group_name: waGroupName.trim() }),
      });
      if (!res.ok) throw new Error('Gagal menghubungkan');
      showToast('Grup WA berhasil dihubungkan!', 'success');
    } catch {
      showToast('Gagal hubungkan grup WA', 'error');
    }
    setLinkingGroup(false);
  }

  async function handleUnlinkWaGroup() {
    await fetch('/api/wa-group', { method: 'DELETE' });
    setWaGroupJid('');
    setWaGroupName('');
    showToast('Grup WA diputus', 'success');
  }

  async function loadProfile() {
    if (!user?.friend_id) return;

    const { data: friend } = await supabase
      .from('friends')
      .select('*')
      .eq('id', user.friend_id)
      .single();

    if (friend) {
      setDisplayName(friend.name || '');
      setWhatsappNumber(friend.whatsapp_number || '');
    }

    const { data: pms } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('friend_id', user.friend_id)
      .order('created_at');

    if (pms) {
      setPaymentMethods(pms.map(pm => ({
        id: pm.id, label: pm.label, bank_name: pm.bank_name,
        account_number: pm.account_number || '', qris_image_url: pm.qris_image_url, qris_file: null,
      })));
    }

    setLoading(false);
  }

  function addPaymentMethod() {
    setPaymentMethods([...paymentMethods, { label: '', bank_name: '', account_number: '', qris_image_url: null, qris_file: null }]);
    setEditMode(true);
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

  async function handleSave() {
    if (!user?.friend_id) return;
    setSaving(true);

    try {
      // Update friend record
      await supabase.from('friends').update({
        name: displayName.trim(),
        whatsapp_number: whatsappNumber.trim() || null,
      }).eq('id', user.friend_id);

      // Update user display_name too
      await supabase.from('users').update({
        display_name: displayName.trim(),
      }).eq('id', user.id);

      // Save payment methods
      for (const pm of paymentMethods) {
        if (pm._deleted && pm.id) { await supabase.from('payment_methods').delete().eq('id', pm.id); continue; }
        if (pm._deleted || !pm.bank_name.trim()) continue;

        let qrisUrl = pm.qris_image_url;
        if (pm.qris_file) {
          const fileExt = pm.qris_file.name.split('.').pop();
          const fileName = `qris_${user.friend_id}_${Date.now()}.${fileExt}`;
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
          friend_id: user.friend_id,
          label: pm.label.trim() || pm.bank_name.trim(),
          bank_name: pm.bank_name.trim(),
          account_number: pm.account_number.trim() || null,
          qris_image_url: qrisUrl,
        };

        if (pm.id) await supabase.from('payment_methods').update(pmData).eq('id', pm.id);
        else await supabase.from('payment_methods').insert(pmData);
      }

      showToast('Profil berhasil disimpan!', 'success');
      setEditMode(false);
      loadProfile();
    } catch (err: any) {
      showToast(err?.message || 'Gagal menyimpan', 'error');
    } finally {
      setSaving(false);
    }
  }

  const activePMs = paymentMethods.filter(pm => !pm._deleted);

  if (loading) {
    return (
      <div className="content-padding pt-6">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-32 w-full mb-4" />
        <div className="skeleton h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="content-padding pt-6 pb-4">
      {/* Header with avatar */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-full mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg"
          style={{ backgroundColor: getAvatarColor(displayName || 'U') }}>
          {getInitials(displayName || 'User')}
        </div>
        <h1 className="font-display text-xl font-bold mt-3 text-espresso">{displayName}</h1>
        <p className="text-xs text-warm-muted">@{user?.username}</p>
      </div>

      <div className="warm-card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-warm-muted">Informasi Profil</h2>
          {!editMode && (
            <button onClick={() => setEditMode(true)} className="text-xs text-primary font-semibold">
              ✏️ Edit
            </button>
          )}
        </div>

        {editMode ? (
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">Nama</label>
              <input type="text" value={displayName} onChange={e => setDisplayName(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-white/8 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/30 transition" />
            </div>
            <div>
              <label className="block text-xs font-medium text-white/50 mb-1">No. WhatsApp</label>
              <input type="tel" value={whatsappNumber} onChange={e => setWhatsappNumber(e.target.value)} placeholder="081234567890"
                className="w-full px-4 py-3 rounded-xl border border-white/8 bg-white/5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-500/30 transition" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-white/50">Nama</span>
              <span className="text-sm font-medium">{displayName}</span>
            </div>
            <div className="border-t border-white/8" />
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-white/50">WhatsApp</span>
              <span className="text-sm font-medium">{whatsappNumber || <span className="text-white/30 italic">Belum diisi</span>}</span>
            </div>
            <div className="border-t border-white/8" />
            <div className="flex items-center justify-between py-2">
              <span className="text-xs text-white/50">Username</span>
              <span className="text-sm font-medium text-white/50">@{user?.username}</span>
            </div>
          </div>
        )}
      </div>

      {/* Payment Methods */}
      <div className="warm-card p-5 mb-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-warm-muted">💳 Rekening / E-Wallet</h2>
          <button type="button" onClick={addPaymentMethod} className="text-xs text-primary font-semibold">
            + Tambah
          </button>
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
                  {editMode && (
                    <button type="button" onClick={() => removePM(idx)} className="absolute top-2 right-2 text-white/50 hover:text-danger text-sm p-1">✕</button>
                  )}
                  {editMode ? (
                    <>
                      <input type="text" value={pm.label} onChange={e => updatePM(idx, 'label', e.target.value)} placeholder="Label (cth: BCA Utama)"
                        className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                      <div className="grid grid-cols-2 gap-2">
                        <input type="text" value={pm.bank_name} onChange={e => updatePM(idx, 'bank_name', e.target.value)} placeholder="Bank *"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                        <input type="text" value={pm.account_number} onChange={e => updatePM(idx, 'account_number', e.target.value)} placeholder="No. Rekening"
                          className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/8 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50" />
                      </div>
                      <div>
                        <input type="file" accept="image/*" onChange={e => { const file = e.target.files?.[0]; if (file) handleQrisFile(idx, file); }} className="hidden" id={`qris-profile-${idx}`} />
                        {pm.qris_image_url ? (
                          <div className="relative">
                            <img src={pm.qris_image_url} alt="QRIS" className="w-full max-h-32 object-contain rounded-lg border border-white/8 bg-white" />
                            <button type="button" onClick={() => { const updated = [...paymentMethods]; updated[idx].qris_image_url = null; updated[idx].qris_file = null; setPaymentMethods(updated); }}
                              className="absolute top-1 right-1 bg-white/5 rounded-full w-6 h-6 flex items-center justify-center shadow text-xs">✕</button>
                          </div>
                        ) : (
                          <label htmlFor={`qris-profile-${idx}`}
                            className="block w-full py-3 rounded-lg border border-dashed border-white/8 hover:border-amber-500/30 transition-colors text-white/50 text-xs text-center cursor-pointer">
                            📷 Upload QRIS (opsional)
                          </label>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center text-lg shrink-0">🏦</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{pm.label || pm.bank_name}</p>
                        {pm.account_number && <p className="text-xs text-white/50">{pm.bank_name} • {pm.account_number}</p>}
                        {pm.qris_image_url && <p className="text-[10px] text-emerald-400 font-medium">✓ QRIS tersedia</p>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Save button (only in edit mode) */}
      {editMode && (
        <div className="flex gap-3 mb-4">
          <button onClick={() => { setEditMode(false); loadProfile(); }}
            className="flex-1 py-3 rounded-xl border border-white/8 font-semibold text-sm">
            Batal
          </button>
          <button onClick={handleSave} disabled={saving || !displayName.trim()}
            className="flex-1 py-3 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-semibold text-sm disabled:opacity-50 active:scale-[0.98] transition shadow-lg shadow-amber-500/20">
            {saving ? 'Menyimpan...' : '✓ Simpan'}
          </button>
        </div>
      )}

      {/* Settings v2 */}
      <div className="warm-card p-5 mb-4">
        <h2 className="text-sm font-semibold text-warm-muted mb-4">⚙️ Pengaturan</h2>

        <label className="flex items-center justify-between py-2 mb-3">
          <span className="text-sm text-espresso">Suara Interaksi</span>
          <input
            type="checkbox"
            checked={soundOn}
            onChange={e => {
              setSoundOn(e.target.checked);
              setSoundEnabled(e.target.checked);
            }}
          />
        </label>

        <div className="border-t border-warm-border pt-4">
          <p className="text-sm font-semibold text-espresso mb-1">Hubungkan Grup WA</p>
          <FormHelper text="Scan QR bot di VPS, lalu salin Group JID dari log bot saat bot join grup." />
          <input
            type="text"
            value={waGroupName}
            onChange={e => setWaGroupName(e.target.value)}
            placeholder="Nama grup (opsional)"
            className="warm-input w-full px-3 py-2 text-sm mt-2"
          />
          <input
            type="text"
            value={waGroupJid}
            onChange={e => setWaGroupJid(e.target.value)}
            placeholder="120363...@g.us"
            className="warm-input w-full px-3 py-2 text-sm mt-2 font-mono text-xs"
          />
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleLinkWaGroup}
              disabled={linkingGroup}
              className="flex-1 py-2.5 btn-primary text-sm disabled:opacity-50"
            >
              {linkingGroup ? 'Menghubungkan...' : '🔗 Hubungkan'}
            </button>
            {waGroupJid && (
              <button
                type="button"
                onClick={handleUnlinkWaGroup}
                className="px-4 py-2.5 btn-secondary text-sm"
              >
                Putus
              </button>
            )}
          </div>
        </div>
      </div>

      <Link href="/friends"
        className="flex items-center justify-between w-full py-3.5 px-4 rounded-card warm-card text-sm font-semibold mb-3 card-hover">
        <span>👥 Kelola Teman</span>
        <span className="text-warm-muted">→</span>
      </Link>

      {/* Logout */}
      <button onClick={() => setShowLogoutConfirm(true)}
        className="w-full py-3.5 rounded-xl border border-red-500/20 text-danger font-semibold text-sm hover:bg-red-600/10 transition">
        ← Keluar dari Akun
      </button>

      {/* Logout Confirm */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 overlay z-50 flex items-center justify-center p-4" onClick={() => setShowLogoutConfirm(false)}>
          <div className="bg-[#1a1a2e] border border-white/10 w-full max-w-sm rounded-3xl p-6 animate-slide-up" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold mb-2">Keluar?</h3>
            <p className="text-sm text-white/50 mb-6">Kamu akan keluar dari akun SimpleSplit ini.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowLogoutConfirm(false)} className="flex-1 py-3 rounded-xl border border-white/8 font-semibold text-sm">Batal</button>
              <button onClick={logout} className="flex-1 py-3 rounded-xl bg-danger text-white font-semibold text-sm">Ya, Keluar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
