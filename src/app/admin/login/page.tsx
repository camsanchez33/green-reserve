'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Leaf } from 'lucide-react';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || 'Login failed'); return; }
      router.push('/admin');
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2.5 mb-8">
          <Leaf className="w-5 h-5 text-emerald-500" />
          <span className="text-white font-black tracking-tight text-lg">GreenReserve Admin</span>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-lg p-8">
          <h1 className="text-white font-black text-xl mb-1">Sign in</h1>
          <p className="text-gray-500 text-sm mb-6">Admin console access</p>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-md px-3 py-2 text-red-400 text-sm mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-gray-500 mb-1.5">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-md px-3 py-2.5 text-white text-sm placeholder-gray-600 focus:outline-none focus:border-emerald-600"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-sm py-2.5 rounded-md transition-colors mt-2"
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
