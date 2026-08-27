import { useState, useEffect, useRef } from "react";
import {
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

interface PrioritizedCase {
  case_id: string;
  priority: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  priority_score: number;
  reason: string;
  trend?: "rising" | "falling" | "stable";
  days_since_last_checkin?: number;
  risk_level?: string;
  safety_attention?: boolean;
}

const districts = ["Chennai", "Madurai", "Coimbatore", "Trichy", "Salem"];
function getDistrict(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % districts.length;
  return districts[idx];
}

function formatCheckinTime(days: number | undefined) {
  if (days === undefined || days === null) return "Today";
  if (days < 0.04) return "Just now";
  if (days < 0.1) return "1 hr ago";
  if (days < 1) {
    const hrs = Math.max(1, Math.round(days * 24));
    return `${hrs} hrs ago`;
  }
  if (days < 2) return "Yesterday";
  const roundedDays = Math.round(days);
  return `${roundedDays} days ago`;
}

function mapPriorityToRisk(priority: string): "High" | "Moderate" | "Stable" {
  if (priority === "CRITICAL" || priority === "HIGH") return "High";
  if (priority === "MEDIUM") return "Moderate";
  return "Stable";
}

const riskColors: Record<string, { bg: string; text: string; border: string }> = {
  High: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
  Moderate: { bg: "#fffbeb", text: "#d97706", border: "#fde68a" },
  Stable: { bg: "#f0fdf4", text: "#16a34a", border: "#bbf7d0" },
};

function getContributingSignals(history: any[] | undefined) {
  if (!history || history.length === 0) return ["No check-in turns recorded yet."];
  const latest = history[history.length - 1];
  const internal = latest.internal_analysis || {};
  const textEm = internal.text_emotions || {};
  const voiceEm = internal.voice_emotions || {};
  const feats = internal.conversational_features || {};
  
  const signals: string[] = [];
  if (latest.safety_attention) {
    signals.push("Active crisis: self-harm keywords detected");
  }
  if (feats.filler_count > 3) {
    signals.push(`High hesitation: ${feats.filler_count} filler words detected`);
  }
  if (feats.uncertainty_count > 2) {
    signals.push(`Frequent uncertainty terms: ${feats.uncertainty_count} detected`);
  }
  if (feats.pause_duration > 2.0) {
    signals.push("Extended conversational pauses");
  }
  
  const sortedTextEm = Object.entries(textEm).sort((a: any, b: any) => b[1] - a[1]);
  if (sortedTextEm.length > 0 && (sortedTextEm[0][1] as number) > 0.3) {
    signals.push(`Primary text emotion: ${sortedTextEm[0][0]} (${Math.round((sortedTextEm[0][1] as number) * 100)}%)`);
  }

  const sortedVoiceEm = Object.entries(voiceEm).sort((a: any, b: any) => b[1] - a[1]);
  if (sortedVoiceEm.length > 0 && (sortedVoiceEm[0][1] as number) > 0.3) {
    signals.push(`Primary voice emotion: ${sortedVoiceEm[0][0]} (${Math.round((sortedVoiceEm[0][1] as number) * 100)}%)`);
  }
  
  if (signals.length === 0) {
    signals.push("Standard stable check-in indicators");
  }
  return signals;
}

export default function CounsellorDashboard({ onLogout }: Props) {
  const [showExplain, setShowExplain] = useState(false);
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [prioritizedCases, setPrioritizedCases] = useState<PrioritizedCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCaseDetails, setSelectedCaseDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navItems = ["Dashboard", "Cases", "Analytics", "Alerts", "Settings"];

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("http://localhost:8000/api/cases/prioritize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error("Failed to prioritize cases");
      const data = await res.json();
      const list = data.prioritized_cases || [];
      setPrioritizedCases(list);
      
      if (list.length > 0) {
        if (!selectedCaseId || !list.some((c: any) => c.case_id === selectedCaseId)) {
          setSelectedCaseId(list[0].case_id);
        }
      } else {
        setSelectedCaseId(null);
        setSelectedCaseDetails(null);
      }
    } catch (err) {
      console.error("Failed to load prioritization details:", err);
      setError("Backend server is offline or unreachable.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    if (!selectedCaseId) {
      setSelectedCaseDetails(null);
      return;
    }
    
    async function fetchCaseDetails() {
      try {
        const res = await fetch(`http://localhost:8000/api/conversation/${selectedCaseId}`);
        if (!res.ok) throw new Error("Failed to fetch case details");
        const data = await res.json();
        setSelectedCaseDetails(data);
      } catch (err) {
        console.error("Error loading case details:", err);
      }
    }
    
    fetchCaseDetails();
  }, [selectedCaseId]);

  const totalCases = prioritizedCases.length;
  const highRiskCount = prioritizedCases.filter(c => c.priority === "CRITICAL" || c.priority === "HIGH").length;
  const moderateRiskCount = prioritizedCases.filter(c => c.priority === "MEDIUM").length;
  const stableCount = prioritizedCases.filter(c => c.priority === "LOW").length;

  const risingDistressCount = prioritizedCases.filter(c => c.trend === "rising").length;
  const criticalEventsCount = prioritizedCases.filter(c => c.priority === "CRITICAL" || c.safety_attention).length;
  const threatIndicatorsCount = prioritizedCases.filter(c => c.safety_attention).length;
  
  const attentionCards = [
    { label: "Rising distress", count: risingDistressCount, icon: "📈", color: "#fef2f2", border: "#fecaca", text: "#dc2626" },
    { label: "Missed check-ins", count: prioritizedCases.filter(c => c.days_since_last_checkin && c.days_since_last_checkin > 3.0).length, icon: "🔔", color: "#fffbeb", border: "#fde68a", text: "#d97706" },
    { label: "Threat indicators", count: threatIndicatorsCount, icon: "⚠️", color: "#fef2f2", border: "#fecaca", text: "#dc2626" },
    { label: "Reduced engagement", count: prioritizedCases.filter(c => c.days_since_last_checkin && c.days_since_last_checkin > 5.0).length, icon: "📉", color: "#fffbeb", border: "#fde68a", text: "#d97706" },
    { label: "Critical cases active", count: criticalEventsCount, icon: "📅", color: "#eff6ff", border: "#bfdbfe", text: "#1d4ed8" },
  ];

  const chartData = selectedCaseDetails?.history && selectedCaseDetails.history.length > 0
    ? selectedCaseDetails.history.map((turn: any, index: number) => {
        const timeVal = turn.timestamp || (Date.now() / 1000);
        const dateObj = new Date(timeVal * 1000);
        const dayStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric" });
        
        let distressScore = turn.distress_score;
        if (typeof distressScore === "string" || distressScore === undefined || distressScore === null) {
          distressScore = 0.0;
        }
        
        return {
          day: dayStr || `Turn ${index + 1}`,
          distress: Math.round(distressScore * 100),
          checkins: 1
        };
      })
    : [];

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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]" style={{ fontFamily: "Manrope, sans-serif" }}>Good morning, Ananya</h1>
            <p className="text-sm text-[#64748b] mt-0.5">Here's your well-being overview for today — {new Date().toLocaleDateString("en-US", { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          </div>
          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-[#dc2626] text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* KPI CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: "Active Cases", value: totalCases.toString(), bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", icon: "👥" },
            { label: "High Risk", value: highRiskCount.toString(), bg: "#fef2f2", border: "#fecaca", text: "#dc2626", icon: "🔴" },
            { label: "Moderate Risk", value: moderateRiskCount.toString(), bg: "#fffbeb", border: "#fde68a", text: "#d97706", icon: "🟡" },
            { label: "Stable", value: stableCount.toString(), bg: "#f0fdf4", border: "#bbf7d0", text: "#16a34a", icon: "🟢" },
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
                <button
                  onClick={fetchDashboardData}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4] hover:bg-[#e6fbf7] transition-all disabled:opacity-50"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {loading ? "Refreshing..." : "🔄 Refresh"}
                </button>
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
                  {prioritizedCases.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-[#64748b] text-sm">
                        {loading ? "Loading active sessions..." : "No active check-in sessions recorded today."}
                      </td>
                    </tr>
                  ) : (
                    prioritizedCases.map((c, i) => {
                      const risk = mapPriorityToRisk(c.priority);
                      const rc = riskColors[risk];
                      const score = Math.round(c.priority_score);
                      const action = risk === "High" ? "Review" : risk === "Moderate" ? "Check in" : "View";
                      
                      return (
                        <tr
                          key={c.case_id}
                          onClick={() => setSelectedCaseId(c.case_id)}
                          className={`transition-colors hover:bg-[#f8fafc] cursor-pointer ${
                            selectedCaseId === c.case_id ? "bg-[#f0fdfa]" : ""
                          }`}
                          style={{ borderBottom: i < prioritizedCases.length - 1 ? "1px solid #f1f5f9" : "none" }}
                        >
                          <td className="px-4 py-3 font-semibold text-[#1e3a8a]" style={{ fontFamily: "Manrope, sans-serif" }}>
                            {c.case_id.substring(0, 8)}
                          </td>
                          <td className="px-4 py-3 text-[#475569]">{getDistrict(c.case_id)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "#f1f5f9", maxWidth: "60px" }}>
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${score}%`,
                                    background: risk === "High" ? "#dc2626" : risk === "Moderate" ? "#d97706" : "#16a34a",
                                  }}
                                />
                              </div>
                              <span className="font-semibold text-[#0f172a]">{score}/100</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-medium flex items-center gap-1 ${c.trend === "rising" ? "text-red-500" : "text-green-600"}`}>
                              {c.trend === "rising" ? "↑" : c.trend === "falling" ? "↓" : "→"} {c.trend || "stable"}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-[#64748b] text-xs">{formatCheckinTime(c.days_since_last_checkin)}</td>
                          <td className="px-4 py-3">
                            <span
                              className="px-2.5 py-1 rounded-full text-xs font-semibold"
                              style={{ background: rc?.bg, color: rc?.text, border: `1px solid ${rc?.border}` }}
                            >
                              {risk}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <button
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-[1.03]"
                              style={{
                                background: risk === "High" ? "#1e3a8a" : "#f0fdfa",
                                color: risk === "High" ? "#ffffff" : "#0d9488",
                                border: risk === "High" ? "none" : "1.5px solid #99f6e4",
                                fontFamily: "Manrope, sans-serif",
                              }}
                            >
                              {action}
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
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
                  <h3 className="font-bold text-[#dc2626] text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {selectedCaseId ? `Analysis: Case ${selectedCaseId.substring(0, 8)}` : "Select a case"}
                  </h3>
                  <p className="text-xs text-[#64748b] mt-0.5 leading-relaxed">
                    {selectedCaseId 
                      ? `Triaged with risk category "${mapPriorityToRisk(prioritizedCases.find(c => c.case_id === selectedCaseId)?.priority || 'LOW')}".`
                      : "Click on a prioritized case row to view alert details."}
                  </p>
                </div>
              </div>

              {selectedCaseId && (
                <>
                  <div className="space-y-2 mb-4">
                    <p className="text-xs font-semibold text-[#475569]" style={{ fontFamily: "Manrope, sans-serif" }}>Contributing signals</p>
                    {getContributingSignals(selectedCaseDetails?.history).map((s) => (
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
                      {prioritizedCases.find(c => c.case_id === selectedCaseId)?.reason || "This case is monitored for check-in safety."}
                    </div>
                  )}
                </>
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
                <h3 className="font-bold text-[#1e3a8a] text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {selectedCaseId ? "Recommended Action" : "Intervention status"}
                </h3>
              </div>
              <p className="text-xs text-[#64748b] leading-relaxed mb-4">
                {selectedCaseId ? (
                  (() => {
                    const c = prioritizedCases.find(c => c.case_id === selectedCaseId);
                    if (c?.priority === "CRITICAL") return "Immediate crisis response. High priority review and wellness check recommended within 2 hours.";
                    if (c?.priority === "HIGH") return "AI recommends a counsellor check-in within 24 hours based on recent distress trends.";
                    if (c?.priority === "MEDIUM") return "Routine wellness check recommended within 48 hours.";
                    return "Stable well-being. Regular monitoring remains active.";
                  })()
                ) : "No active case selected."}
              </p>
              {selectedCaseId && (
                <div className="flex gap-2">
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-white transition-all hover:scale-[1.02]"
                    style={{ background: "#1e3a8a", fontFamily: "Manrope, sans-serif" }}
                  >
                    Review Case
                  </button>
                  <button
                    className="flex-1 py-2 rounded-xl text-xs font-semibold transition-all hover:scale-[1.02]"
                    style={{ background: "#f0fdfa", color: "#0d9488", border: "1.5px solid #99f6e4", fontFamily: "Manrope, sans-serif" }}
                  >
                    Assign Counsellor
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* WELL-BEING TREND CHART */}
        <div className="rounded-2xl p-6" style={{ background: "#ffffff", border: "1px solid #e2e8f0" }}>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                Well-being Trends — {selectedCaseId ? `Case ${selectedCaseId.substring(0, 8)}` : "No Case Selected"}
              </h2>
              <p className="text-xs text-[#64748b] mt-0.5">Distress score over last check-ins</p>
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

          {chartData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-[#64748b] text-sm bg-[#f8fafc] rounded-2xl border border-dashed border-[#e2e8f0]">
              No historical trend data available for this check-in session yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
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
          )}
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
