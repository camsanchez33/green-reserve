'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, Plus, Trash2, CalendarX, ArrowLeft, Zap } from 'lucide-react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface Schedule {
  id: string;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  intervalMinutes: number;
  greenFeeWeekday: number;
  greenFeeWeekend: number;
  cartFee: number;
  walkingAllowed: boolean;
  active: boolean;
}

interface Blackout {
  id: string;
  date: string;
  reason: string;
}

const defaultForm = {
  daysOfWeek: [] as number[],
  startTime: '06:00',
  endTime: '18:00',
  intervalMinutes: 8,
  greenFeeWeekday: 65,
  greenFeeWeekend: 85,
  cartFee: 18,
  walkingAllowed: true,
};

export default function SchedulePage() {
  const router = useRouter();
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [blackouts, setBlackouts] = useState<Blackout[]>([]);
  const [form, setForm] = useState(defaultForm);
  const [blackoutDate, setBlackoutDate] = useState('');
  const [blackoutReason, setBlackoutReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    const [s, b] = await Promise.all([
      fetch('/api/operator/schedule').then(r => r.json()),
      fetch('/api/operator/blackouts').then(r => r.json()),
    ]);
    setSchedules(Array.isArray(s) ? s : []);
    setBlackouts(Array.isArray(b) ? b : []);
  }, []);

  useEffect(() => { load(); }, [load]);

  const toggleDay = (d: number) => {
    setForm(f => ({
      ...f,
      daysOfWeek: f.daysOfWeek.includes(d)
        ? f.daysOfWeek.filter(x => x !== d)
        : [...f.daysOfWeek, d],
    }));
  };

  const saveSchedule = async () => {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch('/api/operator/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setMsg('✅ Schedule saved & tee times generated for next 8 days!');
        setForm(defaultForm);
        load();
      } else {
        setMsg('❌ Error saving schedule');
      }
    } finally {
      setSaving(false);
    }
  };

  const deleteSchedule = async (id: string) => {
    await fetch('/api/operator/schedule', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const addBlackout = async () => {
    if (!blackoutDate) return;
    await fetch('/api/operator/blackouts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: blackoutDate, reason: blackoutReason }),
    });
    setBlackoutDate('');
    setBlackoutReason('');
    load();
  };

  const deleteBlackout = async (id: string) => {
    await fetch('/api/operator/blackouts', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });
    load();
  };

  const manualGenerate = async () => {
    setGenerating(true);
    await fetch('/api/cron/generate-tee-times');
    setGenerating(false);
    setMsg('✅ Tee times regenerated for all active schedules!');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')} className="text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Clock className="w-5 h-5 text-green-600" />
          <h1 className="text-xl font-semibold text-gray-900">Tee Sheet Setup</h1>
        </div>
        <button
          onClick={manualGenerate}
          disabled={generating}
          className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          <Zap className="w-4 h-4" />
          {generating ? 'Generating...' : 'Regenerate Now'}
        </button>
      </div>

      <div className="max-w-4xl mx-auto p-6 space-y-8">
        {msg && (
          <div className="bg-green-50 border border-green-200 text-green-800 rounded-lg px-4 py-3 text-sm">
            {msg}
          </div>
        )}

        {/* Add Schedule */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-5 flex items-center gap-2">
            <Plus className="w-5 h-5 text-green-600" />
            Add Tee Time Schedule
          </h2>

          <div className="space-y-5">
            {/* Days */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Days of Week <span className="text-gray-400 font-normal">(leave all unselected = every day)</span>
              </label>
              <div className="flex gap-2">
                {DAYS.map((day, i) => (
                  <button
                    key={day}
                    onClick={() => toggleDay(i)}
                    className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                      form.daysOfWeek.includes(i)
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {day}
                  </button>
                ))}
              </div>
            </div>

            {/* Times */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                <input
                  type="time"
                  value={form.startTime}
                  onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                <input
                  type="time"
                  value={form.endTime}
                  onChange={e => setForm(f => ({ ...f, endTime: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 focus:border-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Interval (minutes)</label>
                <select
                  value={form.intervalMinutes}
                  onChange={e => setForm(f => ({ ...f, intervalMinutes: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                >
                  {[7, 8, 9, 10, 12, 15].map(v => (
                    <option key={v} value={v}>{v} min</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Fees */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Green Fee (Weekday) $</label>
                <input
                  type="number"
                  value={form.greenFeeWeekday}
                  onChange={e => setForm(f => ({ ...f, greenFeeWeekday: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Green Fee (Weekend) $</label>
                <input
                  type="number"
                  value={form.greenFeeWeekend}
                  onChange={e => setForm(f => ({ ...f, greenFeeWeekend: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Cart Fee $</label>
                <input
                  type="number"
                  value={form.cartFee}
                  onChange={e => setForm(f => ({ ...f, cartFee: Number(e.target.value) }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="walking"
                checked={form.walkingAllowed}
                onChange={e => setForm(f => ({ ...f, walkingAllowed: e.target.checked }))}
                className="w-4 h-4 text-green-600 rounded"
              />
              <label htmlFor="walking" className="text-sm text-gray-700">Walking allowed</label>
            </div>

            <button
              onClick={saveSchedule}
              disabled={saving}
              className="w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? 'Saving & Generating...' : 'Save Schedule & Generate Tee Times'}
            </button>
          </div>
        </div>

        {/* Existing Schedules */}
        {schedules.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Active Schedules</h2>
            <div className="space-y-3">
              {schedules.map(s => (
                <div key={s.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm">
                    <div className="font-medium text-gray-900">
                      {s.daysOfWeek.length === 0 ? 'Every day' : s.daysOfWeek.map(d => DAYS[d]).join(', ')}
                      {' — '}
                      {s.startTime} to {s.endTime}, every {s.intervalMinutes} min
                    </div>
                    <div className="text-gray-500 mt-1">
                      Weekday ${s.greenFeeWeekday} / Weekend ${s.greenFeeWeekend} · Cart ${s.cartFee}
                      {s.walkingAllowed ? ' · Walking OK' : ''}
                    </div>
                  </div>
                  <button onClick={() => deleteSchedule(s.id)} className="text-red-400 hover:text-red-600 ml-4">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Blackout Dates */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <CalendarX className="w-5 h-5 text-red-500" />
            Closed Dates (Blackouts)
          </h2>
          <div className="flex gap-3 mb-4">
            <input
              type="date"
              value={blackoutDate}
              onChange={e => setBlackoutDate(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
            <input
              type="text"
              placeholder="Reason (optional)"
              value={blackoutReason}
              onChange={e => setBlackoutReason(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={addBlackout}
              className="bg-red-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-600"
            >
              Close Date
            </button>
          </div>
          {blackouts.length > 0 && (
            <div className="space-y-2">
              {blackouts.map(b => (
                <div key={b.id} className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
                  <span className="text-sm text-gray-700">
                    <span className="font-medium">{b.date}</span>
                    {b.reason && <span className="text-gray-500"> — {b.reason}</span>}
                  </span>
                  <button onClick={() => deleteBlackout(b.id)} className="text-red-400 hover:text-red-600">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {blackouts.length === 0 && (
            <p className="text-sm text-gray-400">No closed dates set.</p>
          )}
        </div>
      </div>
    </div>
  );
}
