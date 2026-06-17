"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, LogOut, Settings, Calendar, Clock } from "lucide-react";

type TeeTime = {
  id: string;
  date: string;
  time: string;
  holes: number;
  playersAvailable: number;
  greenFee: number;
  cartFee: number;
  walkingAllowed: boolean;
  status: string;
};

function today() { return new Date().toISOString().split("T")[0]; }
function addDays(d: string, n: number) {
  const dt = new Date(d + "T12:00:00");
  dt.setDate(dt.getDate() + n);
  return dt.toISOString().split("T")[0];
}
function fmtDate(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export default function DashboardPage() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(today());
  const [teeTimes, setTeeTimes] = useState<TeeTime[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const dates = Array.from({ length: 14 }, (_, i) => addDays(today(), i));

  // Add tee time form state
  const [time, setTime] = useState("08:00");
  const [greenFee, setGreenFee] = useState("45");
  const [cartFee, setCartFee] = useState("18");
  const [players, setPlayers] = useState("4");
  const [walking, setWalking] = useState(true);
  const [saving, setSaving] = useState(false);

  async function fetchTeeTimes(date: string) {
    setLoading(true);
    const res = await fetch(`/api/operator/tee-times?date=${date}`);
    if (res.status === 401) { router.push("/dashboard/login"); return; }
    setTeeTimes(await res.json());
    setLoading(false);
  }

  useEffect(() => { fetchTeeTimes(selectedDate); }, [selectedDate]);

  async function addTeeTime(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/operator/tee-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date: selectedDate,
        time,
        greenFee: parseFloat(greenFee),
        cartFee: parseFloat(cartFee),
        playersAvailable: parseInt(players),
        walkingAllowed: walking,
      }),
    });
    setShowAdd(false);
    setSaving(false);
    fetchTeeTimes(selectedDate);
  }

  async function deleteTeeTime(id: string) {
    await fetch("/api/operator/tee-times", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setTeeTimes(t => t.filter(x => x.id !== id));
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/dashboard/login");
  }

  return (
    <div className="min-h-screen bg-[#f8faf9]">
      {/* Top nav */}
      <nav className="bg-[#0f2218] border-b border-white/10 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-[#c9a84c] flex items-center justify-center">
            <span className="text-white font-black text-xs">GR</span>
          </div>
          <span className="text-white font-bold">Operator Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push("/dashboard/settings")}
            className="text-white/50 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
            <Settings size={15} /> Settings
          </button>
          <button onClick={logout}
            className="text-white/50 hover:text-white flex items-center gap-1.5 text-sm transition-colors">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </nav>

      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-black text-gray-900">Tee Sheet</h1>
            <p className="text-gray-500 text-sm">Manage your live tee times — they appear instantly on Green Reserve.</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-sm text-white"
            style={{ background: "#1b4332" }}>
            <Plus size={15} /> Add Tee Time
          </button>
        </div>

        {/* Date strip */}
        <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
          {dates.map(d => (
            <button key={d} onClick={() => setSelectedDate(d)}
              className={`flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                selectedDate === d ? "bg-[#1b4332] text-white shadow-sm" : "bg-white border border-gray-100 text-gray-600 hover:border-[#1b4332]"
              }`}>
              {fmtDate(d)}
            </button>
          ))}
        </div>

        {/* Tee time list */}
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
            <div className="flex items-center gap-2 text-gray-700 font-semibold">
              <Calendar size={16} />
              {fmtDate(selectedDate)}
            </div>
            <span className="text-gray-400 text-sm">{teeTimes.length} tee times</span>
          </div>

          {loading ? (
            <div className="p-10 text-center text-gray-400 text-sm">Loading…</div>
          ) : teeTimes.length === 0 ? (
            <div className="p-10 text-center">
              <Clock size={32} className="text-gray-200 mx-auto mb-3" />
              <p className="text-gray-500 font-medium">No tee times for this day</p>
              <p className="text-gray-400 text-sm mt-1">Click "Add Tee Time" to add availability.</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-50">
              {teeTimes.map(tt => (
                <div key={tt.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-center gap-6">
                    <span className="font-black text-gray-900 text-lg w-20">{tt.time}</span>
                    <div className="text-sm">
                      <span className="font-semibold text-[#1b4332]">${tt.greenFee}</span>
                      <span className="text-gray-400"> green fee</span>
                      {tt.cartFee > 0 && <span className="text-gray-400"> · ${tt.cartFee} cart</span>}
                    </div>
                    <div className="text-sm text-gray-500">{tt.playersAvailable} spots</div>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${
                      tt.status === "available" ? "bg-emerald-50 text-emerald-700" :
                      tt.status === "limited" ? "bg-amber-50 text-amber-700" : "bg-red-50 text-red-600"
                    }`}>{tt.status}</span>
                  </div>
                  <button onClick={() => deleteTeeTime(tt.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors p-1">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Tee Time Modal */}
        {showAdd && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
            <div className="bg-white rounded-2xl p-8 w-full max-w-md shadow-2xl">
              <h2 className="text-xl font-black text-gray-900 mb-6">Add Tee Time — {fmtDate(selectedDate)}</h2>
              <form onSubmit={addTeeTime} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Time</label>
                    <input type="time" value={time} onChange={e => setTime(e.target.value)} required
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Spots</label>
                    <select value={players} onChange={e => setPlayers(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none">
                      {[1,2,3,4].map(n => <option key={n} value={n}>{n} player{n>1?"s":""}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Green Fee ($)</label>
                    <input type="number" value={greenFee} onChange={e => setGreenFee(e.target.value)} required min="0"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Cart Fee ($)</label>
                    <input type="number" value={cartFee} onChange={e => setCartFee(e.target.value)} min="0"
                      className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm outline-none focus:border-[#1b4332]" />
                  </div>
                </div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input type="checkbox" checked={walking} onChange={e => setWalking(e.target.checked)}
                    className="w-4 h-4 rounded" />
                  <span className="text-sm text-gray-700 font-medium">Walking allowed</span>
                </label>
                <div className="flex gap-3 pt-2">
                  <button type="button" onClick={() => setShowAdd(false)}
                    className="flex-1 py-3 rounded-xl font-semibold text-sm text-gray-600 border border-gray-200">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving}
                    className="flex-1 py-3 rounded-xl font-bold text-sm text-white disabled:opacity-70"
                    style={{ background: "#1b4332" }}>
                    {saving ? "Saving…" : "Add Tee Time"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
