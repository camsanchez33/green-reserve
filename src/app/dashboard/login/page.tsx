"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [courseName, setCourseName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    if (res.ok) {
      router.push("/dashboard");
    } else {
      const d = await res.json();
      setError(d.error ?? "Login failed");
    }
    setLoading(false);
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const res = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, name, courseName }),
    });
    if (res.ok) {
      router.push("/dashboard");
    } else {
      const d = await res.json();
      setError(d.error ?? "Registration failed");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#0f2218] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#c9a84c] flex items-center justify-center">
              <span className="text-white font-black text-sm">GR</span>
            </div>
            <span className="text-white font-bold text-xl">Green<span style={{ color: "#c9a84c" }}>Reserve</span></span>
          </div>
          <h1 className="text-white font-black text-2xl">Course Operator Portal</h1>
          <p className="text-white/50 text-sm mt-1">Manage your tee sheet and get discovered by thousands of golfers.</p>
        </div>

        <div className="bg-white rounded-2xl p-8 shadow-2xl">
          {/* Tabs */}
          <div className="flex rounded-xl overflow-hidden border border-gray-100 mb-6">
            {(["login", "register"] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={`flex-1 py-2.5 text-sm font-semibold transition-colors ${tab === t ? "bg-[#1b4332] text-white" : "text-gray-500 hover:text-gray-700"}`}>
                {t === "login" ? "Sign In" : "Get Listed"}
              </button>
            ))}
          </div>

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-70"
                style={{ background: "#1b4332" }}>
                {loading ? "Signing in…" : "Sign In"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Your Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="Pro shop manager, owner, etc."
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Course Name</label>
                <input type="text" value={courseName} onChange={e => setCourseName(e.target.value)} required placeholder="Darlington Golf Course"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Password</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-70"
                style={{ background: "#1b4332" }}>
                {loading ? "Creating account…" : "Get Listed Free"}
              </button>
              <p className="text-center text-xs text-gray-400">No commission. $0 to list. We charge golfers $1 — not you.</p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
