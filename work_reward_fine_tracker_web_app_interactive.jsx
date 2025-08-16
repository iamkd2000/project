import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, CartesianGrid, Legend } from "recharts";
import { Download, Upload, Trophy, Flag, CalendarDays, Settings as SettingsIcon, Plus, Trash2 } from "lucide-react";
import * as XLSX from "xlsx";

// -----------------------------
// Types
// -----------------------------
interface Entry {
  date: string; // yyyy-mm-dd
  dsaQs: number;
  dsaMin: number;
  aptQs: number;
  aptMin: number;
  webMin: number;
  engMin: number;
  note?: string;
}

interface Settings {
  dsaQTarget: number;
  aptQTarget: number;
  webMinTarget: number;
  engMinTarget: number;
  fineAmount: number;
  rewardText: string;
}

const defaultSettings: Settings = {
  dsaQTarget: 3,
  aptQTarget: 20,
  webMinTarget: 90,
  engMinTarget: 30,
  fineAmount: 50,
  rewardText: "30 min entertainment",
};

// -----------------------------
// Helpers
// -----------------------------
const KEY_ENTRIES = "wrf_entries_v1";
const KEY_SETTINGS = "wrf_settings_v1";

const fmt = (n: number) => (isNaN(n) ? 0 : Math.round(n));

function computeScores(e: Entry, s: Settings) {
  const dsaScore = Math.min(e.dsaQs / s.dsaQTarget, 1) || 0;
  const aptScore = Math.min(e.aptQs / s.aptQTarget, 1) || 0;
  const webScore = Math.min(e.webMin / s.webMinTarget, 1) || 0;
  const engScore = Math.min(e.engMin / s.engMinTarget, 1) || 0;
  const completion = Math.round(((dsaScore + aptScore + webScore + engScore) / 4) * 100);
  const outcome = completion === 100 ? "Reward" : completion === 0 ? "Missed" : "Fine";
  const fine = outcome === "Fine" ? s.fineAmount : 0;
  const autoNote = outcome === "Reward" ? s.rewardText : outcome === "Missed" ? `Fine ₹${s.fineAmount} + plan next day` : `Fine ₹${s.fineAmount}`;
  return { dsaScore, aptScore, webScore, engScore, completion, outcome, fine, autoNote };
}

function toDateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseMaybeNumber(v: any): number {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// -----------------------------
// UI
// -----------------------------
export default function WorkRewardFineApp() {
  const [entries, setEntries] = useState<Entry[]>(() => {
    try {
      const raw = localStorage.getItem(KEY_ENTRIES);
      return raw ? (JSON.parse(raw) as Entry[]) : [];
    } catch {
      return [];
    }
  });
  const [settings, setSettings] = useState<Settings>(() => {
    try {
      const raw = localStorage.getItem(KEY_SETTINGS);
      return raw ? (JSON.parse(raw) as Settings) : defaultSettings;
    } catch {
      return defaultSettings;
    }
  });
  const [tab, setTab] = useState<"dashboard" | "log" | "add" | "settings">("dashboard");

  useEffect(() => {
    localStorage.setItem(KEY_ENTRIES, JSON.stringify(entries));
  }, [entries]);
  useEffect(() => {
    localStorage.setItem(KEY_SETTINGS, JSON.stringify(settings));
  }, [settings]);

  // Derived data
  const enriched = useMemo(() => entries
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => ({ ...e, ...computeScores(e, settings) })), [entries, settings]);

  const totals = useMemo(() => {
    const t = enriched.reduce(
      (acc, e) => {
        acc.dsa += e.dsaQs;
        acc.apt += e.aptQs;
        acc.web += e.webMin;
        acc.eng += e.engMin;
        acc.rewards += e.outcome === "Reward" ? 1 : 0;
        acc.fines += e.outcome === "Fine" ? 1 : 0;
        acc.missed += e.outcome === "Missed" ? 1 : 0;
        acc.fineAmount += e.fine;
        return acc;
      },
      { dsa: 0, apt: 0, web: 0, eng: 0, rewards: 0, fines: 0, missed: 0, fineAmount: 0 }
    );
    const consistency = enriched.length
      ? Math.round((enriched.filter((e) => e.completion === 100).length / enriched.length) * 100)
      : 0;
    return { ...t, consistency };
  }, [enriched]);

  // Charts data
  const completionSeries = enriched.map((e) => ({ date: e.date.slice(5), completion: e.completion }));
  const timeSplit = [
    { name: "DSA Minutes", value: enriched.reduce((s, e) => s + e.dsaMin, 0) },
    { name: "Aptitude Minutes", value: enriched.reduce((s, e) => s + e.aptMin, 0) },
    { name: "Web Dev Minutes", value: enriched.reduce((s, e) => s + e.webMin, 0) },
    { name: "English Minutes", value: enriched.reduce((s, e) => s + e.engMin, 0) },
  ];
  const rfSeries = [
    { name: "Reward", value: totals.rewards },
    { name: "Fine", value: totals.fines },
    { name: "Missed", value: totals.missed },
  ];

  // Streaks
  const streaks = useMemo(() => {
    let curr = 0, best = 0;
    for (const e of enriched) {
      if (e.completion === 100) { curr++; best = Math.max(best, curr); } else { curr = 0; }
    }
    return { current: curr, best };
  }, [enriched]);

  // -----------------------------
  // Import / Export
  // -----------------------------
  function exportToExcel() {
    // Build worksheet like your Excel file
    const rows = [
      [
        "Date","DSA Qs","DSA Minutes","Aptitude Qs","Aptitude Minutes","Web Dev Minutes","English Minutes","Project Note","DSA Q Target","Apt Q Target","Web Min Target","Eng Min Target","DSA Score","Apt Score","Web Score","Eng Score","Daily Completion %","Outcome","Fine Amount (₹)","Auto Notes"
      ],
      ...enriched.map((e) => [
        e.date,
        e.dsaQs,
        e.dsaMin,
        e.aptQs,
        e.aptMin,
        e.webMin,
        e.engMin,
        e.note || "",
        settings.dsaQTarget,
        settings.aptQTarget,
        settings.webMinTarget,
        settings.engMinTarget,
        (e as any).dsaScore,
        (e as any).aptScore,
        (e as any).webScore,
        (e as any).engScore,
        e.completion,
        e.outcome,
        e.fine,
        (e as any).autoNote,
      ])
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Daily Log");

    const settingsSheet = XLSX.utils.aoa_to_sheet([
      ["Parameter","Value"],
      ["DSA Q Target per day", settings.dsaQTarget],
      ["Aptitude Q Target per day", settings.aptQTarget],
      ["Web Dev Minutes Target per day", settings.webMinTarget],
      ["English Minutes Target per day", settings.engMinTarget],
      ["Fine Amount (₹)", settings.fineAmount],
      ["Reward Text", settings.rewardText],
    ]);
    XLSX.utils.book_append_sheet(wb, settingsSheet, "Settings");

    XLSX.writeFile(wb, `WRF_Tracker_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function importFromExcel(file: File) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const data = new Uint8Array(ev.target?.result as ArrayBuffer);
      const wb = XLSX.read(data, { type: "array" });
      const s1 = wb.Sheets["Daily Log"] || wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json<any>(s1, { defval: "" });

      // Try to map columns by header names commonly used in your sheet
      const mapped: Entry[] = json.map((r: any) => ({
        date: (r.Date || r.date || r.DATE || "").toString().slice(0, 10),
        dsaQs: parseMaybeNumber(r["DSA Qs"] ?? r["DSA"] ?? r["dsa"] ?? 0),
        dsaMin: parseMaybeNumber(r["DSA Minutes"] ?? r["DSA Min"] ?? 0),
        aptQs: parseMaybeNumber(r["Aptitude Qs"] ?? r["Apt Qs"] ?? r["Aptitude"] ?? 0),
        aptMin: parseMaybeNumber(r["Aptitude Minutes"] ?? r["Apt Min"] ?? 0),
        webMin: parseMaybeNumber(r["Web Dev Minutes"] ?? r["Web Minutes"] ?? r["Web"] ?? 0),
        engMin: parseMaybeNumber(r["English Minutes"] ?? r["English"] ?? 0),
        note: r["Project Note"] ?? r["Note"] ?? "",
      })).filter((e) => e.date);

      setEntries(mapped);

      // Settings sheet
      const s2 = wb.Sheets["Settings"];
      if (s2) {
        const rows = XLSX.utils.sheet_to_json<any>(s2, { header: 1 });
        const lookup = new Map<string, any>();
        (rows as any[]).forEach((row) => lookup.set(String(row[0] || ""), row[1]));
        setSettings((prev) => ({
          dsaQTarget: parseMaybeNumber(lookup.get("DSA Q Target per day") ?? prev.dsaQTarget),
          aptQTarget: parseMaybeNumber(lookup.get("Aptitude Q Target per day") ?? prev.aptQTarget),
          webMinTarget: parseMaybeNumber(lookup.get("Web Dev Minutes Target per day") ?? prev.webMinTarget),
          engMinTarget: parseMaybeNumber(lookup.get("English Minutes Target per day") ?? prev.engMinTarget),
          fineAmount: parseMaybeNumber(lookup.get("Fine Amount (₹)") ?? prev.fineAmount),
          rewardText: String(lookup.get("Reward Text") ?? prev.rewardText),
        }));
      }
      setTab("dashboard");
    };
    reader.readAsArrayBuffer(file);
  }

  // -----------------------------
  // Add Entry Form
  // -----------------------------
  const [form, setForm] = useState<Entry>({
    date: toDateKey(new Date()),
    dsaQs: 0,
    dsaMin: 0,
    aptQs: 0,
    aptMin: 0,
    webMin: 0,
    engMin: 0,
    note: "",
  });

  function addOrUpdateEntry() {
    setEntries((curr) => {
      const idx = curr.findIndex((e) => e.date === form.date);
      if (idx >= 0) {
        const copy = curr.slice();
        copy[idx] = { ...form };
        return copy;
      }
      return [...curr, { ...form }];
    });
    setTab("dashboard");
  }

  function deleteEntry(date: string) {
    setEntries((curr) => curr.filter((e) => e.date !== date));
  }

  // Colors for charts (use default, but Cell requires some explicit values)
  const COLORS = ["#3366CC", "#DC3912", "#FF9900", "#109618", "#990099", "#0099C6"]; // used only for Pie cells

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Trophy className="w-6 h-6" />
          <h1 className="text-xl font-semibold">Work–Reward–Fine Tracker</h1>
          <div className="ml-auto flex gap-2">
            <label className="px-3 py-2 rounded-xl border bg-white cursor-pointer flex items-center gap-2"><Upload className="w-4 h-4"/> Import
              <input type="file" className="hidden" accept=".xlsx,.xls,.csv" onChange={(e) => e.target.files && importFromExcel(e.target.files[0])} />
            </label>
            <button onClick={exportToExcel} className="px-3 py-2 rounded-xl border bg-white hover:bg-slate-100 flex items-center gap-2"><Download className="w-4 h-4"/> Export</button>
          </div>
        </div>
        {/* Tabs */}
        <div className="max-w-6xl mx-auto px-4 pb-2 flex gap-2">
          {[
            { k: "dashboard", label: "Dashboard", icon: <Flag className="w-4 h-4"/> },
            { k: "log", label: "Daily Log", icon: <CalendarDays className="w-4 h-4"/> },
            { k: "add", label: "Add / Edit", icon: <Plus className="w-4 h-4"/> },
            { k: "settings", label: "Settings", icon: <SettingsIcon className="w-4 h-4"/> },
          ].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k as any)} className={`px-3 py-2 rounded-2xl border ${tab===t.k?"bg-slate-900 text-white":"bg-white hover:bg-slate-100"} flex items-center gap-2`}>
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {tab === "dashboard" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-3 gap-4">
            {/* KPI Cards */}
            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm text-slate-500">Consistency</div>
              <div className="text-3xl font-semibold">{totals.consistency}%</div>
              <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${totals.consistency}%` }} /></div>
              <div className="mt-2 text-xs text-slate-500">Reward days: {totals.rewards} · Fine days: {totals.fines} · Missed: {totals.missed}</div>
            </div>
            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm text-slate-500">Total Questions</div>
              <div className="text-3xl font-semibold">DSA {fmt(totals.dsa)} · Apt {fmt(totals.apt)}</div>
              <div className="mt-2 text-xs text-slate-500">Streak: {streaks.current} days (best {streaks.best})</div>
            </div>
            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm text-slate-500">Time Spent</div>
              <div className="text-3xl font-semibold">Web {fmt(totals.web)}m · Eng {fmt(totals.eng)}m</div>
              <div className="mt-2 text-xs text-slate-500">Total fine: ₹{fmt(totals.fineAmount)}</div>
            </div>

            {/* Charts */}
            <div className="md:col-span-2 rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm font-medium mb-2">Daily Completion %</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={completionSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" interval={Math.ceil(completionSeries.length / 10)} />
                    <YAxis domain={[0, 100]} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="completion" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm font-medium mb-2">Time Split (minutes)</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={timeSplit} dataKey="value" nameKey="name" outerRadius={90}>
                      {timeSplit.map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="rounded-2xl p-4 border bg-white shadow-sm md:col-span-3">
              <div className="text-sm font-medium mb-2">Rewards vs Fines</div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={rfSeries}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" />
                    <YAxis allowDecimals={false} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="value" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </motion.div>
        )}

        {tab === "log" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-medium">Daily Log</div>
                <div className="text-xs text-slate-500">Click a row to edit in the Add/Edit tab</div>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="bg-slate-100 text-slate-700">
                      {[
                        "Date","DSA Qs","DSA Min","Apt Qs","Apt Min","Web Min","Eng Min","Completion %","Outcome","Fine ₹","Note",""
                      ].map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {enriched.map((e) => (
                      <tr key={e.date} className="border-b hover:bg-slate-50 cursor-pointer" onClick={() => { setForm({
                        date: e.date,
                        dsaQs: e.dsaQs,
                        dsaMin: e.dsaMin,
                        aptQs: e.aptQs,
                        aptMin: e.aptMin,
                        webMin: e.webMin,
                        engMin: e.engMin,
                        note: e.note || "",
                      }); setTab("add"); }}>
                        <td className="px-3 py-2">{e.date}</td>
                        <td className="px-3 py-2">{e.dsaQs}</td>
                        <td className="px-3 py-2">{e.dsaMin}</td>
                        <td className="px-3 py-2">{e.aptQs}</td>
                        <td className="px-3 py-2">{e.aptMin}</td>
                        <td className="px-3 py-2">{e.webMin}</td>
                        <td className="px-3 py-2">{e.engMin}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2">
                            <span>{e.completion}%</span>
                            <div className="h-2 w-24 bg-slate-200 rounded-full overflow-hidden"><div className={`h-full ${e.completion===100?"bg-emerald-500":e.completion===0?"bg-rose-500":"bg-amber-500"}`} style={{ width: `${e.completion}%` }} /></div>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-1 rounded-full text-xs ${e.outcome==="Reward"?"bg-emerald-100 text-emerald-700": e.outcome==="Fine"?"bg-amber-100 text-amber-700":"bg-rose-100 text-rose-700"}`}>{e.outcome}</span>
                        </td>
                        <td className="px-3 py-2">{e.fine}</td>
                        <td className="px-3 py-2 max-w-[260px] truncate" title={e.note}>{e.note}</td>
                        <td className="px-3 py-2 text-right">
                          <button onClick={(ev) => { ev.stopPropagation(); deleteEntry(e.date); }} className="px-3 py-1 rounded-xl border hover:bg-red-50 text-red-600 inline-flex items-center gap-1"><Trash2 className="w-4 h-4"/> Delete</button>
                        </td>
                      </tr>
                    ))}
                    {enriched.length === 0 && (
                      <tr>
                        <td colSpan={12} className="px-3 py-6 text-center text-slate-500">No entries yet — add your first one in the Add/Edit tab or import from Excel.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>
        )}

        {tab === "add" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-4">
            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm font-medium mb-3">Add / Edit Entry</div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">Date<input type="date" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })}/></label>
                <label className="text-sm">DSA Qs<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.dsaQs} onChange={(e) => setForm({ ...form, dsaQs: Number(e.target.value) })}/></label>
                <label className="text-sm">DSA Minutes<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.dsaMin} onChange={(e) => setForm({ ...form, dsaMin: Number(e.target.value) })}/></label>
                <label className="text-sm">Aptitude Qs<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.aptQs} onChange={(e) => setForm({ ...form, aptQs: Number(e.target.value) })}/></label>
                <label className="text-sm">Aptitude Minutes<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.aptMin} onChange={(e) => setForm({ ...form, aptMin: Number(e.target.value) })}/></label>
                <label className="text-sm">Web Dev Minutes<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.webMin} onChange={(e) => setForm({ ...form, webMin: Number(e.target.value) })}/></label>
                <label className="text-sm">English Minutes<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={form.engMin} onChange={(e) => setForm({ ...form, engMin: Number(e.target.value) })}/></label>
                <label className="text-sm col-span-2">Note<textarea className="mt-1 w-full rounded-xl border px-3 py-2" rows={3} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })}/></label>
                <div className="col-span-2 flex gap-2">
                  <button onClick={addOrUpdateEntry} className="px-4 py-2 rounded-2xl border bg-slate-900 text-white hover:opacity-90">Save Entry</button>
                  <button onClick={() => setForm({ date: toDateKey(new Date()), dsaQs: 0, dsaMin: 0, aptQs: 0, aptMin: 0, webMin: 0, engMin: 0, note: "" })} className="px-4 py-2 rounded-2xl border bg-white hover:bg-slate-100">Reset</button>
                </div>
              </div>
            </div>

            <div className="rounded-2xl p-4 border bg-white shadow-sm">
              <div className="text-sm font-medium mb-3">Today’s Auto Evaluation</div>
              {(() => {
                const s = computeScores(form, settings);
                return (
                  <div className="space-y-3">
                    {[
                      { label: "DSA", score: s.dsaScore },
                      { label: "Aptitude", score: s.aptScore },
                      { label: "Web Dev", score: s.webScore },
                      { label: "English", score: s.engScore },
                    ].map((x) => (
                      <div key={x.label}>
                        <div className="text-xs text-slate-600 mb-1">{x.label} — {Math.round(x.score * 100)}%</div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${x.score * 100}%` }} /></div>
                      </div>
                    ))}
                    <div className="pt-2 text-sm">Completion: <span className="font-semibold">{s.completion}%</span> · Outcome: <span className={`px-2 py-1 rounded-full text-xs ${s.outcome==="Reward"?"bg-emerald-100 text-emerald-700": s.outcome==="Fine"?"bg-amber-100 text-amber-700":"bg-rose-100 text-rose-700"}`}>{s.outcome}</span></div>
                    <div className="text-xs text-slate-500">{s.autoNote}</div>
                  </div>
                );
              })()}
            </div>
          </motion.div>
        )}

        {tab === "settings" && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-2xl p-4 border bg-white shadow-sm">
            <div className="text-sm font-medium mb-3">Settings</div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
              <label className="text-sm">DSA Q Target<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.dsaQTarget} onChange={(e) => setSettings({ ...settings, dsaQTarget: Number(e.target.value) })}/></label>
              <label className="text-sm">Apt Q Target<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.aptQTarget} onChange={(e) => setSettings({ ...settings, aptQTarget: Number(e.target.value) })}/></label>
              <label className="text-sm">Web Minutes Target<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.webMinTarget} onChange={(e) => setSettings({ ...settings, webMinTarget: Number(e.target.value) })}/></label>
              <label className="text-sm">English Minutes Target<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.engMinTarget} onChange={(e) => setSettings({ ...settings, engMinTarget: Number(e.target.value) })}/></label>
              <label className="text-sm md:col-span-2 lg:col-span-3">Reward Text<input type="text" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.rewardText} onChange={(e) => setSettings({ ...settings, rewardText: e.target.value })}/></label>
              <label className="text-sm">Fine Amount (₹)<input type="number" className="mt-1 w-full rounded-xl border px-3 py-2" value={settings.fineAmount} onChange={(e) => setSettings({ ...settings, fineAmount: Number(e.target.value) })}/></label>
            </div>
            <div className="text-xs text-slate-500 mt-3">Settings are auto-saved to your browser. They will also be exported inside the Excel when you click Export.</div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
