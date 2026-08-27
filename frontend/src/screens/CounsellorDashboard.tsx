import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
  Area,
  AreaChart,
} from "recharts";

interface Props {
  onLogout: () => void;
}

const trendData = [
  { day: "Aug 18", distress: 44, checkins: 2 },
  { day: "Aug 19", distress: 48, checkins: 1 },
  { day: "Aug 20", distress: 52, checkins: 2 },
  { day: "Aug 21", distress: 55, checkins: 1 },
  { day: "Aug 22", distress: 63, checkins: 2 },
  { day: "Aug 23", distress: 71, checkins: 1 },
  { day: "Aug 24", distress: 82, checkins: 2 },
];

const cases = [
  { id: "V-1024", district: "Chennai", score: 82, trend: "+27%", trendUp: true, lastCheckin: "2 hrs ago", risk: "High" as const, action: "Review" },
  { id: "V-0872", district: "Madurai", score: 64, trend: "+11%", trendUp: true, lastCheckin: "Yesterday", risk: "Moderate" as const, action: "Check in" },
  { id: "V-1138", district: "Coimbatore", score: 31, trend: "Stable", trendUp: false, lastCheckin: "Today", risk: "Stable" as const, action: "View" },
  { id: "V-0995", district: "Trichy", score: 58, trend: "+6%", trendUp: true, lastCheckin: "3 hrs ago", risk: "Moderate" as const, action: "Check in" },
  { id: "V-1201", district: "Salem", score: 22, trend: "Stable", trendUp: false, lastCheckin: "Today", risk: "Stable" as const, action: "View" },
];

const attentionCards = [
  { label: "Rising distress", count: 8, icon: "📈", color: "#fef2f2", border: "#fecaca", text: "#dc2626" },
  { label: "Missed check-ins", count: 5, icon: "🔔", color: "#fffbeb", border: "#fde68a", text: "#d97706" },
  { label: "Threat indicators", count: 2, icon: "⚠️", color: "#fef2f2", border: "#fecaca", text: "#dc2626" },
  { label: "Reduced engagement", count: 11, icon: "📉", color: "#fffbeb", border: "#fde68a", text: "#d97706" },
  { label: "Critical events upcoming", count: 3, icon: "📅", color: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
];

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  High: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  Moderate: { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  Stable: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
};

export default function CounsellorDashboard({ onLogout }: Props) {
  const [showExplain, setShowExplain] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");

  const navItems = ["Dashboard", "Cases", "Analytics", "Alerts", "Settings"];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f7f8fb" }}>
      {/* TOP NAV */}
      <header
        className="flex items-center justify-between px-6 py-3.5"
        style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 40 }}
      >
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#1e3a8a" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
                <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
              </svg>
            </div>
            <span className="font-bold text-[#1e3a8a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => setActiveNav(item)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeNav === item ? "#f0fdfa" : "transparent",
                  color: activeNav === item ? "#0d9488" : "#64748b",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                {item}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <button className="relative p-2 rounded-lg hover:bg-[#f8fafc] transition-colors text-[#64748b]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
            </svg>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500" />
          </button>
          <button className="p-2 rounded-lg hover:bg-[#f8fafc] transition-colors text-[#64748b]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </button>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ background: "#f1f5f9", color: "#1e3a8a", fontFamily: "Manrope, sans-serif" }}
          >
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
              style={{ background: "#1e3a8a" }}
            >
              A
            </div>
            Ananya
          </button>
        </div>
      </header>

      <main className="flex-1 px-6 py-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* GREETING */}
        <div>
          <h1 className="text-2xl font-bold text-[#0f172a]" style={{ fontFamily: "Manrope, sans-serif" }}>Good morning, Ananya</h1>
          <p className="text-sm text-[#64748b] mt-0.5">Here's your well-being overview for today — 25 August 2026</p>
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active Cases", value: "93", bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", icon: "👥" },
            { label: "High Risk", value: "8", bg: "#fef2f2", border: "#fecaca", text: "#dc2626", icon: "🔴" },
            { label: "Moderate Risk", value: "21", bg: "#fffbeb", border: "#fde68a", text: "#d97706", icon: "🟡" },
            { label: "Stable", value: "64", bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", icon: "🟢" },
          ].map((card) => (
            <div
              key={card.label}
              className="p-5 rounded-2xl"
              style={{ background: card.bg, border: `1.5px solid ${card.border}` }}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-[#64748b] mb-1">{card.label}</p>
                  <p className="text-3xl font-bold" style={{ color: card.text, fontFamily: "Manrope, sans-serif" }}>{card.value}</p>
                </div>
                <span className="text-2xl">{card.icon}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* PRIORITY CASES TABLE */}
          <div className="xl:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Priority Cases</h2>
              <div className="flex gap-2">
                {["District", "Risk Level", "Last Check-in"].map((f) => (
                  <button
                    key={f}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium text-[#64748b] hover:bg-white transition-colors"
                    style={{ border: "1px solid #e2e8f0", background: "#f8fafc" }}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl overflow-hidden" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: "1px solid #f1f5f9", background: "#f8fafc" }}>
                    {["Case ID", "District", "Distress Score", "Trend", "Last Check-in", "Risk", "Action"].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]" style={{ fontFamily: "Manrope, sans-serif" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cases.map((c, i) => {
                    const rc = riskColors[c.risk];
                    return (
                      <tr
                        key={c.id}
                        className="transition-colors hover:bg-[#f8fafc]"
                        style={{ borderBottom: i < cases.length - 1 ? "1px solid #f1f5f9" : "none" }}
                      >
                        <td className="px-4 py-3 font-semibold text-[#1e3a8a]" style={{ fontFamily: "Manrope, sans-serif" }}>{c.id}</td>
                        <td className="px-4 py-3 text-[#475569]">{c.district}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#f1f5f9", maxWidth: "60px" }}>
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${c.score}%`,
                                  background: c.risk === "High" ? "#dc2626" : c.risk === "Moderate" ? "#d97706" : "#16a34a",
                                }}
                              />
                            </div>
                            <span className="font-semibold text-[#0f172a]">{c.score}/100</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-medium flex items-center gap-1 ${c.trendUp ? "text-red-500" : "text-green-600"}`}>
                            {c.trendUp ? "↑" : "→"} {c.trend}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-[#64748b] text-xs">{c.lastCheckin}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2.5 py-1 rounded-full text-xs font-semibold"
                            style={{ background: rc.bg, color: rc.text, border: `1px solid ${rc.border}` }}
                          >
                            {c.risk}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <button
                            className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.03]"
                            style={{
                              background: c.risk === "High" ? "#1e3a8a" : "#f0fdfa",
                              color: c.risk === "High" ? "#ffffff" : "#0d9488",
                              border: c.risk === "High" ? "none" : "1.5px solid #99f6e4",
                              fontFamily: "Manrope, sans-serif",
                            }}
                          >
                            {c.action}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* RIGHT COLUMN */}
          <div className="space-y-4">
            {/* AI RISK INSIGHT */}
            <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1.5px solid #fecaca" }}>
              <div className="flex items-start gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#fef2f2" }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2" strokeLinecap="round">
                    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                    <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                  </svg>
                </div>
                <div>
                  <h3 className="font-bold text-[#dc2626] text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Distress escalation detected</h3>
                  <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">Case V-1024 has shown a 27% increase in distress indicators across the last 3 interactions.</p>
                </div>
              </div>

              <div className="space-y-2 mb-4">
                <p className="text-xs font-semibold text-[#475569]" style={{ fontFamily: "Manrope, sans-serif" }}>Contributing signals</p>
                {[
                  "Increased negative sentiment",
                  "Reduced engagement",
                  "Mentions of intimidation",
                  "Sleep-related distress",
                ].map((s) => (
                  <div key={s} className="flex items-center gap-2 text-xs text-[#64748b]">
                    <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: "#dc2626" }} />
                    {s}
                  </div>
                ))}
              </div>

              <button
                onClick={() => setShowExplain(!showExplain)}
                className="text-xs font-medium flex items-center gap-1.5 transition-colors"
                style={{ color: "#1e3a8a" }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
                {showExplain ? "Hide explanation" : "Why this alert?"}
              </button>

              {showExplain && (
                <div
                  className="mt-3 p-3 rounded-xl text-xs text-[#475569] leading-relaxed"
                  style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                >
                  This alert was generated because the AI detected a consistent upward trend in distress indicators over 3 consecutive check-in sessions. The model weighs sentiment scores, engagement rate, and keyword frequency together. This is a decision-support signal — please consult with the assigned counsellor before acting.
                </div>
              )}
            </div>

            {/* RECOMMENDED INTERVENTION */}
            <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1.5px solid #bfdbfe" }}>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#eff6ff" }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#1d4ed8" strokeWidth="2" strokeLinecap="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
                  </svg>
                </div>
                <h3 className="font-bold text-[#1e3a8a] text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Counselling follow-up</h3>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                AI recommends a counsellor check-in within 24 hours based on recent distress trends.
              </p>
              <div className="flex gap-2">
                <button
                  className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all"
                  style={{ background: "#1e3a8a", fontFamily: "Manrope, sans-serif" }}
                >
                  Review Case
                </button>
                <button
                  className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all"
                  style={{ background: "#f0fdfa", color: "#0d9488", border: "1.5px solid #99f6e4", fontFamily: "Manrope, sans-serif" }}
                >
                  Assign Counsellor
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* WELL-BEING TREND CHART */}
        <div className="rounded-2xl p-6" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Well-being Trends — Case V-1024</h2>
              <p className="text-xs text-[#64748b] mt-0.5">Distress score over last 7 days</p>
            </div>
            <div className="flex gap-4 text-xs">
              {[
                { color: "#1e3a8a", label: "Distress score" },
                { color: "#dc2626", label: "Risk threshold (70)", dashed: true },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-1.5">
                  <div
                    className="w-6 h-0.5"
                    style={{
                      background: l.color,
                      borderTop: l.dashed ? `2px dashed ${l.color}` : undefined,
                      height: l.dashed ? 0 : undefined,
                    }}
                  />
                  <span className="text-[#64748b]">{l.label}</span>
                </div>
              ))}
            </div>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={trendData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="distressGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e3a8a" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#1e3a8a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ borderRadius: "10px", border: "1px solid #e2e8f0", fontSize: "12px" }}
                labelStyle={{ fontWeight: 600, fontFamily: "Manrope, sans-serif" }}
              />
              <ReferenceLine y={70} stroke="#dc2626" strokeDasharray="4 3" strokeWidth={1.5} />
              <Area
                type="monotone"
                dataKey="distress"
                stroke="#1e3a8a"
                strokeWidth={2}
                fill="url(#distressGrad)"
                dot={{ fill: "#1e3a8a", r: 3 }}
                activeDot={{ r: 5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* CASES REQUIRING ATTENTION */}
        <div>
          <h2 className="font-bold text-[#0f172a] text-base mb-4" style={{ fontFamily: "Manrope, sans-serif" }}>Cases Requiring Attention</h2>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {attentionCards.map((card) => (
              <button
                key={card.label}
                className="p-4 rounded-2xl text-left hover:scale-[1.02] transition-transform"
                style={{ background: card.color, border: `1.5px solid ${card.border}` }}
              >
                <div className="text-xl mb-2">{card.icon}</div>
                <p className="text-2xl font-bold" style={{ color: card.text, fontFamily: "Manrope, sans-serif" }}>{card.count}</p>
                <p className="text-xs text-[#64748b] mt-0.5 leading-snug">{card.label}</p>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
