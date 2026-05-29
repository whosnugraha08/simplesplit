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
    <div className="min-h-screen flex items-center justify-center p-4 bg-cream relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-32 -right-32 w-80 h-80 rounded-full bg-blush/60 blur-3xl" />
        <div className="absolute -bottom-32 -left-32 w-72 h-72 rounded-full bg-primary/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-card bg-gradient-to-br from-primary to-accent shadow-warm mb-4">
            <span className="text-3xl">🍞</span>
          </div>
          <h1 className="font-display text-3xl font-bold text-espresso">SimpleSplit</h1>
          <p className="text-warm-muted text-sm mt-1">Split bill, hangat & tanpa ribet.</p>
        </div>

        <div className="warm-card p-6 shadow-warm-lg animate-slide-up">
          <div className="flex gap-1 bg-blush/50 rounded-card p-1 mb-6">
            {(['login', 'register'] as const).map(m => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null); }}
                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all btn-press ${
                  mode === m ? 'btn-primary text-white' : 'text-warm-muted'
                }`}
              >
                {m === 'login' ? 'Masuk' : 'Daftar'}
              </button>
            ))}
          </div>

          {error && (
            <div className="bg-ruby-light text-ruby rounded-card px-4 py-3 text-sm mb-4 animate-shake">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-xs font-medium text-warm-muted mb-1.5">Nama Tampilan</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Nama kamu"
                  className="warm-input w-full px-4 py-3 text-sm"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-warm-muted mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="contoh: faiz"
                className="warm-input w-full px-4 py-3 text-sm"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-warm-muted mb-1.5">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4-6 digit angka"
                inputMode="numeric"
                className="warm-input w-full px-4 py-3 text-sm tracking-[0.3em] font-mono"
                required
                minLength={4}
                maxLength={6}
              />
              <p className="text-[10px] text-warm-muted mt-1">Minimal 4 digit, maksimal 6 digit</p>
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

        <p className="text-center text-warm-muted text-xs mt-6">SimpleSplit v2.0 • 2026</p>
      </div>
    </div>
  );
}
