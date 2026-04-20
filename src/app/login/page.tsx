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
      if (result.success) {
        router.push('/');
      } else {
        setError(result.error || 'Gagal login');
      }
    } else {
      if (pin.length < 4) {
        setError('PIN minimal 4 digit');
        setLoading(false);
        return;
      }
      const result = await register(username, pin, displayName);
      if (result.success) {
        router.push('/');
      } else {
        setError(result.error || 'Gagal register');
      }
    }

    setLoading(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0a0a12 0%, #12111f 50%, #0f0e1a 100%)' }}>
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-amber-500/8 blur-[100px]" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-orange-500/6 blur-[80px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] rounded-full bg-amber-600/3 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-xl shadow-amber-500/20 mb-4">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">SimpleSplit</h1>
          <p className="text-white/40 text-sm mt-1">Split bill, tanpa ribet.</p>
        </div>

        {/* Form Card */}
        <div className="glass rounded-3xl p-6 shadow-2xl shadow-black/30 animate-slide-up">
          {/* Mode Toggle */}
          <div className="flex gap-1 bg-white/5 rounded-2xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-lg shadow-amber-500/20'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-black shadow-lg shadow-amber-500/20'
                  : 'text-white/50 hover:text-white/70'
              }`}
            >
              Daftar
            </button>
          </div>

          {error && (
            <div className="bg-red-500/15 border border-red-400/20 rounded-xl px-4 py-3 text-sm text-red-300 mb-4 animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="animate-fade-in">
                <label className="block text-xs font-medium text-white/40 mb-1.5 ml-1">Nama Tampilan</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Nama kamu"
                  className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 ml-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="contoh: faiz"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/40 mb-1.5 ml-1">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4-6 digit angka"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full px-4 py-3 rounded-xl glass-input text-sm tracking-[0.3em] font-mono"
                required
                minLength={4}
                maxLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <p className="text-[10px] text-white/25 mt-1 ml-1">Minimal 4 digit, maksimal 6 digit</p>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !pin.trim() || (mode === 'register' && !displayName.trim())}
              className="w-full py-3.5 rounded-xl btn-glow text-sm disabled:opacity-50 active:scale-[0.98] transition-all"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  {mode === 'login' ? 'Masuk...' : 'Mendaftar...'}
                </span>
              ) : (
                mode === 'login' ? '→ Masuk' : '→ Daftar & Masuk'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-white/15 text-xs mt-6">SimpleSplit v2 • 2024</p>
      </div>
    </div>
  );
}
