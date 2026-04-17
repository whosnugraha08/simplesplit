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
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-blue-600/5 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 animate-fade-in">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-xl shadow-blue-500/20 mb-4">
            <span className="text-3xl">💰</span>
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">SimpleSplit</h1>
          <p className="text-blue-200/60 text-sm mt-1">Split bill, tanpa ribet.</p>
        </div>

        {/* Form Card */}
        <div className="bg-white/10 backdrop-blur-xl rounded-3xl border border-white/10 p-6 shadow-2xl animate-slide-up">
          {/* Mode Toggle */}
          <div className="flex gap-1 bg-white/5 rounded-2xl p-1 mb-6">
            <button
              type="button"
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'login'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Masuk
            </button>
            <button
              type="button"
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                mode === 'register'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-white/60 hover:text-white/80'
              }`}
            >
              Daftar
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-400/20 rounded-xl px-4 py-3 text-sm text-red-200 mb-4 animate-fade-in">
              ⚠️ {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div className="animate-fade-in">
                <label className="block text-xs font-medium text-blue-200/60 mb-1.5 ml-1">Nama Tampilan</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Nama kamu"
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition"
                  required
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-blue-200/60 mb-1.5 ml-1">Username</label>
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="contoh: faiz"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition"
                required
                autoComplete="username"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-blue-200/60 mb-1.5 ml-1">PIN</label>
              <input
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="4-6 digit angka"
                inputMode="numeric"
                pattern="[0-9]*"
                className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 text-sm tracking-[0.3em] font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-transparent transition"
                required
                minLength={4}
                maxLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              />
              <p className="text-[10px] text-white/30 mt-1 ml-1">Minimal 4 digit, maksimal 6 digit</p>
            </div>

            <button
              type="submit"
              disabled={loading || !username.trim() || !pin.trim() || (mode === 'register' && !displayName.trim())}
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-blue-500 to-indigo-600 text-white font-semibold text-sm shadow-lg shadow-blue-500/25 disabled:opacity-50 hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.98] transition-all"
            >
              {loading ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  {mode === 'login' ? 'Masuk...' : 'Mendaftar...'}
                </span>
              ) : (
                mode === 'login' ? '→ Masuk' : '→ Daftar & Masuk'
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-white/20 text-xs mt-6">SimpleSplit v2 • 2024</p>
      </div>
    </div>
  );
}
