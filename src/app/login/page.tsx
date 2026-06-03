'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || !pin.trim()) return;
    if (mode === 'register' && !displayName.trim()) return;

    setLoading(true);
    setError(null);

    if (mode === 'login') {
      const result = await login(username, pin);
      if (result.success) router.push('/');
      else setError(result.error || 'Gagal login');
    } else {
      if (pin.length < 4) {
        setError('PIN minimal 4 digit');
        setLoading(false);
        return;
      }
      const result = await register(username, pin, displayName);
      if (result.success) router.push('/');
      else setError(result.error || 'Gagal register');
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'var(--bg)' }}>
      {/* Background decorations */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full blur-3xl" style={{ background: 'rgba(108,63,212,0.15)' }} />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full blur-3xl" style={{ background: 'rgba(200,241,53,0.08)' }} />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4 rotate-neg"
            style={{ background: 'var(--lime)', border: '2px solid var(--navy)' }}
          >
            <span className="material-symbols-outlined text-3xl" style={{ color: '#000', fontVariationSettings: "'FILL' 1" }}>payments</span>
          </div>
          <h1 style={{ fontFamily: 'var(--font-headline)', fontSize: '32px', fontWeight: 800, color: 'var(--lime)' }}>SimpleSplit</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--outline)' }}>Split bill, cepat & tanpa ribet.</p>
        </div>

        <div className="neo-card p-6 animate-slide-up" style={{ borderColor: 'var(--lime)', borderWidth: '2px' }}>
          {/* Tab switcher */}
          <div className="flex gap-1 rounded-xl p-1 mb-6" style={{ background: 'var(--surface-container)' }}>
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all btn-press`}
                style={{
                  background: mode === m ? 'var(--lime)' : 'transparent',
                  color: mode === m ? '#000' : 'var(--outline)',
                }}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm mb-4 animate-shake" style={{ background: 'rgba(255,92,92,0.15)', color: 'var(--red)', border: '1px solid var(--red)' }}>
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-bold mb-1.5 label-caps" style={{ color: 'var(--outline)' }}>Nama Tampilan</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Nama kamu"
                  className="neo-input w-full px-4 py-3 text-sm"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-bold mb-1.5 label-caps" style={{ color: 'var(--outline)' }}>Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="contoh: faiz"
                className="neo-input w-full px-4 py-3 text-sm"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-bold mb-1.5 label-caps" style={{ color: 'var(--outline)' }}>PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4-6 digit angka"
                inputMode="numeric"
                className="neo-input w-full px-4 py-3 text-sm tracking-[0.2em] tabular-nums"
                style={{ fontFamily: 'var(--font-mono)' }}
                required
                minLength={4}
                maxLength={6}
              />
              <p className="text-[10px] mt-1" style={{ color: 'var(--outline)' }}>Minimal 4 digit, maksimal 6 digit</p>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !pin.trim() || (mode === 'register' && !displayName.trim())}
              className="w-full py-3.5 btn-primary text-sm disabled:opacity-50"
            >
              {loading ? 'Memproses...' : mode === 'login' ? '→ Masuk' : '→ Daftar & Masuk'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--outline)' }}>SimpleSplit v3.0 • Neo-Fin • 2026</p>
      </div>
    </div>
  );
}
