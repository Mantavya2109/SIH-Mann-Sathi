import { useState, useEffect } from "react";
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
  user: { id: string; name: string; email: string; role: string };
  onLogout: () => void;
}

interface PrioritizedCase {
  case_id: string;
  nhaa_ref: string;
  enrollment_date: string;
  stage: string;
  latest_distress_score: number;
  risk_tier: string;
  trend: "rising" | "falling" | "stable";
  user?: {
    name: string;
    email: string;
    role: string;
  };
}

interface Alert {
  id: string;
  case_id: string;
  distress_score_id: string;
  created_at: string;
  recommendation_text: string;
  cited_provisions: string[];
  status: "active" | "acknowledged";
  acknowledged_by?: string;
  acknowledged_at?: string;
  user_name?: string;
}

export default function CounsellorDashboard({ user, onLogout }: Props) {
  const [activeNav, setActiveNav] = useState("Dashboard");
  const [cases, setCases] = useState<PrioritizedCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);
  const [selectedCaseDetails, setSelectedCaseDetails] = useState<any>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showExplain, setShowExplain] = useState(false);
  const [stageFilter, setStageFilter] = useState<"active" | "all">("active");
  // Bump this to force case details to re-fetch after a Sync (so Today/Yesterday recalculates)
  const [caseDetailsRefreshKey, setCaseDetailsRefreshKey] = useState(0);

  const navItems = ["Dashboard", "Cases", "Analytics", "Alerts", "Settings"];

  const getApiUrl = (path: string) => {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
    return `${baseUrl}${path}`;
  };

  async function fetchDashboardData() {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch Cases
      const casesRes = await fetch(getApiUrl("/api/counsellor/cases"));
      if (!casesRes.ok) throw new Error("Failed to fetch cases");
      const casesData = await casesRes.json();
      setCases(casesData || []);
      
      // Auto select first case if none selected
      if (casesData && casesData.length > 0) {
        if (!selectedCaseId || !casesData.some((c: any) => c.case_id === selectedCaseId)) {
          setSelectedCaseId(casesData[0].case_id);
        }
      } else {
        setSelectedCaseId(null);
      }

      // 2. Fetch Alerts
      const alertsRes = await fetch(getApiUrl("/api/counsellor/alerts"));
      if (alertsRes.ok) {
        const alertsData = await alertsRes.json();
        setAlerts(alertsData || []);
      }
    } catch (err: any) {
      console.error("Dashboard fetch error:", err);
      setError("Backend server is offline or unreachable.");
    } finally {
      setLoading(false);
      // Bump refresh key so that the currently-selected case details/history re-fetches
      setCaseDetailsRefreshKey(k => k + 1);
    }
  }

  useEffect(() => {
    fetchDashboardData();
  }, []);

  useEffect(() => {
    // Clear details during case transition (not on refresh — avoid flicker)
    if (!selectedCaseId) {
      setSelectedCaseDetails(null);
      return;
    }

    async function fetchCaseDetails() {
      try {
        // Use persistent Supabase history endpoint (not in-memory /api/conversation/)
        const detailsRes = await fetch(getApiUrl(`/api/counsellor/cases/${selectedCaseId}`));
        const historyRes = await fetch(getApiUrl(`/api/counsellor/cases/${selectedCaseId}/history`));
        
        if (detailsRes.ok && historyRes.ok) {
          const detailsData = await detailsRes.json();
          const historyData = await historyRes.json();
          // historyData is a direct array from the /history endpoint
          setSelectedCaseDetails({
            ...detailsData,
            history: Array.isArray(historyData) ? historyData : (historyData.history || [])
          });
        }
      } catch (err) {
        console.error("Failed to load details for case:", selectedCaseId, err);
      }
    }

    fetchCaseDetails();
  // caseDetailsRefreshKey bumps whenever fetchDashboardData (Sync) completes
  }, [selectedCaseId, caseDetailsRefreshKey]);

  async function acknowledgeAlert(alertId: string) {
    try {
      const res = await fetch(getApiUrl(`/api/alerts/${alertId}/acknowledge`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acknowledged_by: user.name })
      });
      if (!res.ok) throw new Error("Failed to acknowledge alert");
      
      // Refresh
      fetchDashboardData();
    } catch (err: any) {
      alert(`Error acknowledging alert: ${err.message}`);
    }
  }

  const activeCasesCount = cases.filter(c => c.stage === "active").length;
  const highRiskCount = cases.filter(c => c.risk_tier === "SEVERE" || c.risk_tier === "HIGH").length;
  const moderateRiskCount = cases.filter(c => c.risk_tier === "MODERATE").length;
  const stableCount = cases.filter(c => c.risk_tier === "LOW").length;

  const activeAlerts = alerts.filter(a => a.status === "active");

  const chartData = selectedCaseDetails?.history && selectedCaseDetails.history.length > 0
    ? selectedCaseDetails.history.map((turn: any, index: number) => {
        const dateObj = turn.timestamp ? new Date(turn.timestamp * 1000) : new Date();
        const dayStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
        return {
          day: dayStr,
          distress: Math.round((turn.distress_score || 0.0) * 100),
        };
      })
    : [];

  const selectedCase = cases.find(c => c.case_id === selectedCaseId);
  const latestTurn = selectedCaseDetails?.history && selectedCaseDetails.history.length > 0
    ? selectedCaseDetails.history[selectedCaseDetails.history.length - 1]
    : null;

  // Helper to split history into yesterday vs today
  const history = selectedCaseDetails?.history || [];
  
  const getDailyBreakdown = () => {
    if (history.length === 0) return null;
    
    const now = new Date();
    
    // Today boundary (00:00:00 local time)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 1000;
    // Yesterday boundary (00:00:00 yesterday local time to todayStart)
    const yesterdayStart = todayStart - 86400;
    
    const todayTurns = history.filter((t: any) => t.timestamp >= todayStart);
    const yesterdayTurns = history.filter((t: any) => t.timestamp >= yesterdayStart && t.timestamp < todayStart);
    
    const getTurnMetrics = (turns: any[]) => {
      if (turns.length === 0) return null;
      const latest = turns[turns.length - 1];
      const hasVoice = turns.some((t: any) => t.internal_analysis?.voice_emotions !== undefined && t.internal_analysis?.voice_emotions !== null);
      const hasText = turns.some((t: any) => t.internal_analysis?.text_emotions !== undefined && t.internal_analysis?.text_emotions !== null);
      
      const distressScore = Math.round(latest.distress_score * 100);
      let riskTier = "LOW";
      if (distressScore > 85) riskTier = "SEVERE";
      else if (distressScore > 60) riskTier = "HIGH";
      else if (distressScore > 30) riskTier = "MODERATE";
      
      return {
        latestTurn: latest,
        distressScore,
        riskTier,
        hasVoice,
        hasText,
        turnsCount: turns.length
      };
    };
    
    const todayMetrics = getTurnMetrics(todayTurns);
    const yesterdayMetrics = getTurnMetrics(yesterdayTurns);
    
    let changeStatus = "INSUFFICIENT_DATA";
    let changeValue = 0;
    
    if (todayMetrics && yesterdayMetrics) {
      changeValue = todayMetrics.distressScore - yesterdayMetrics.distressScore;
      if (changeValue > 5) {
        changeStatus = "WORSENING";
      } else if (changeValue < -5) {
        changeStatus = "IMPROVING";
      } else {
        changeStatus = "STABLE";
      }
    }
    
    return {
      todayTurns,
      yesterdayTurns,
      todayMetrics,
      yesterdayMetrics,
      changeStatus,
      changeValue
    };
  };

  const dailyBreakdown = getDailyBreakdown();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f8fafc", fontFamily: "Inter, sans-serif" }}>
      {/* TOP HEADER */}
      <header
        className="flex items-center justify-between px-6 py-4 shadow-sm"
        style={{ background: "#ffffff", borderBottom: "1px solid #e2e8f0", position: "sticky", top: 0, zIndex: 40 }}
      >
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "#0f172a" }}>
              <span className="text-white font-bold">NM</span>
            </div>
            <span className="font-bold text-[#0f172a] text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Nirbhaya Mitra</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => setActiveNav(item)}
                className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background: activeNav === item ? "#f0fdfa" : "transparent",
                  color: activeNav === item ? "#0d9488" : "#475569",
                  fontFamily: "Manrope, sans-serif",
                }}
              >
                {item}
                {item === "Alerts" && activeAlerts.length > 0 && (
                  <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {activeAlerts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-[#475569]">
            <span className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse" />
            Live Monitor Active
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors hover:bg-red-50 text-red-600 border border-transparent hover:border-red-200"
            style={{ background: "#f1f5f9", fontFamily: "Manrope, sans-serif" }}
          >
            Logout ({user.name})
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="flex-1 px-6 py-6 max-w-7xl mx-auto w-full space-y-6">
        {/* WELCOME */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[#0f172a]" style={{ fontFamily: "Manrope, sans-serif" }}>Welcome, {user.name}</h1>
            <p className="text-sm text-[#64748b] mt-0.5">Role: Counsellor / Case Officer — Authorized Access Only</p>
          </div>
          {error && (
            <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold">
              ⚠️ {error}
            </div>
          )}
        </div>

        {/* 1. DASHBOARD NAVIGATION TABS VIEW */}
        {activeNav === "Dashboard" && (
          <>
            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Assigned Cases", value: activeCasesCount.toString(), bg: "#eff6ff", border: "#bfdbfe", text: "#1e40af", icon: "👥" },
                { label: "High / Severe Risk", value: highRiskCount.toString(), bg: "#fef2f2", border: "#fecaca", text: "#dc2626", icon: "🚨" },
                { label: "Moderate Risk", value: moderateRiskCount.toString(), bg: "#fffbeb", border: "#fde68a", text: "#d97706", icon: "⚠️" },
                { label: "Active Alerts", value: activeAlerts.length.toString(), bg: "#fdf2f8", border: "#fbcfe8", text: "#db2777", icon: "🔔" },
              ].map((card) => (
                <div
                  key={card.label}
                  className="p-5 rounded-2xl border"
                  style={{ background: card.bg, borderColor: card.border }}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-xs font-semibold text-[#64748b] mb-1">{card.label}</p>
                      <p className="text-3xl font-bold" style={{ color: card.text, fontFamily: "Manrope, sans-serif" }}>{card.value}</p>
                    </div>
                    <span className="text-2xl">{card.icon}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* CASES GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* CASES LIST PANE */}
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="font-bold text-[#0f172a] text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Priority Triage List</h2>
                  <div className="flex items-center gap-2">
                    <div className="flex bg-[#f1f5f9] p-0.5 rounded-lg border border-[#e2e8f0]">
                      <button
                        onClick={() => setStageFilter("active")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${stageFilter === "active" ? "bg-white text-teal-600 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                      >
                        Active Cases
                      </button>
                      <button
                        onClick={() => setStageFilter("all")}
                        className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${stageFilter === "all" ? "bg-white text-teal-600 shadow-xs" : "text-slate-600 hover:text-slate-900"}`}
                      >
                        All Cases
                      </button>
                    </div>
                    <button
                      onClick={fetchDashboardData}
                      disabled={loading}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4] hover:bg-[#e6fbf7] transition-all disabled:opacity-50"
                    >
                      {loading ? "Syncing..." : "🔄 Sync"}
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl overflow-hidden border border-[#e2e8f0]" style={{ background: "#ffffff" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f8fafc]" style={{ borderBottom: "1px solid #f1f5f9" }}>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Case / Patient</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Latest Distress / Priority Score</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Trend</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Priority Level</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Last Check-in</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748b]">Stage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cases.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="px-4 py-8 text-center text-[#64748b] text-sm">
                            No patient cases found. Click Sync to fetch database.
                          </td>
                        </tr>
                      ) : (
                        cases.filter(c => stageFilter === "all" || c.stage === "active").map((c: any) => {
                          const isSelected = selectedCaseId === c.case_id;
                          return (
                            <tr
                              key={c.case_id}
                              onClick={() => setSelectedCaseId(c.case_id)}
                              className={`transition-colors hover:bg-slate-50 cursor-pointer ${isSelected ? "bg-teal-50/50" : ""}`}
                              style={{ borderBottom: "1px solid #f1f5f9" }}
                            >
                              <td className="px-4 py-4">
                                <div className="font-semibold text-[#0f172a]">{c.user?.name || "Anonymous Patient"}</div>
                                <div className="text-[10px] text-[#64748b] font-medium flex items-center gap-1.5 mt-0.5">
                                  <span className="px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-700 font-bold uppercase">{c.nhaa_ref || "N/A"}</span>
                                  <span>{c.user?.email || "N/A"}</span>
                                </div>
                              </td>
                              <td className="px-4 py-4">
                                <div className="font-bold text-slate-800 text-sm">{c.latest_distress_score}%</div>
                                <div className="text-[10px] text-teal-600 font-semibold mt-0.5">Rank P: {c.priority_score ? c.priority_score.toFixed(1) : "0.0"}</div>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`text-xs font-semibold ${c.trend === "rising" ? "text-red-600" : c.trend === "falling" ? "text-green-600" : "text-slate-500"}`}>
                                  {c.trend === "rising" ? "↑ Rising" : c.trend === "falling" ? "↓ Falling" : "→ Stable"}
                                </span>
                              </td>
                              <td className="px-4 py-4">
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                                  c.priority_level === "CRITICAL" ? "bg-red-100 text-red-700 border border-red-200" :
                                  c.priority_level === "HIGH" ? "bg-orange-100 text-orange-700 border border-orange-200" :
                                  c.priority_level === "MEDIUM" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-green-100 text-green-700 border border-green-200"
                                }`}>
                                  {c.priority_level || c.risk_tier}
                                </span>
                              </td>
                              <td className="px-4 py-4 text-slate-700 text-xs font-medium">
                                {c.days_since_last_checkin !== undefined ? (
                                  c.days_since_last_checkin < 0.1 ? "Just now" :
                                  c.days_since_last_checkin < 1.0 ? `${(c.days_since_last_checkin * 24).toFixed(0)} hours ago` :
                                  `${c.days_since_last_checkin.toFixed(1)} days ago`
                                ) : "N/A"}
                              </td>
                              <td className="px-4 py-4">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${c.stage === "active" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>
                                  {c.stage}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* SIDEBAR VIEW CARD */}
              <div className="space-y-4">
                {/* PATIENT BRIEF PROFILE */}
                <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-xs">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
                    <span>AI Case Insight</span>
                    {selectedCase?.priority_level === "CRITICAL" && (
                      <span className="animate-ping w-2 h-2 rounded-full bg-red-600 border border-red-700" />
                    )}
                  </h3>
                  {selectedCase ? (
                    <div className="space-y-4">
                      <div>
                        <div className="text-xs text-[#64748b]">Patient Name</div>
                        <div className="font-bold text-slate-900 text-base">{selectedCase.user?.name}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#64748b]">Email / Nha Ref</div>
                        <div className="text-xs text-slate-800 font-semibold">{selectedCase.user?.email} • {selectedCase.nhaa_ref}</div>
                      </div>
                      <div>
                        <div className="text-xs text-[#64748b]">Latest Distress / Priority Score</div>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-xl font-extrabold text-red-600">{selectedCase.latest_distress_score}%</span>
                          <span className="text-xs text-slate-500 font-medium">(Priority Rank: {selectedCase.priority_score ? selectedCase.priority_score.toFixed(1) : "0.0"})</span>
                        </div>
                      </div>

                      {selectedCase.priority_reason && (
                        <div>
                          <div className="text-xs text-[#64748b] mb-1 font-bold">Triage Reason</div>
                          <p className="text-xs text-slate-700 bg-teal-50/10 p-2.5 rounded-xl border border-teal-100/50 leading-relaxed italic">
                            "{selectedCase.priority_reason}"
                          </p>
                        </div>
                      )}

                      {latestTurn && (
                        <div>
                          <div className="text-xs text-[#64748b] mb-1.5 font-bold">Contributing Distress Indicators</div>
                          <div className="space-y-1">
                            {latestTurn.safety_attention && (
                              <div className="text-xs text-red-600 font-semibold bg-red-50 p-1.5 rounded-lg border border-red-100">
                                ⚠️ Crisis flag: High distress indicators flagged in text.
                              </div>
                            )}
                            {latestTurn.internal_analysis?.conversational_features?.filler_count > 0 && (
                              <div className="text-xs text-slate-600 font-medium">
                                • High speech hesitation ({latestTurn.internal_analysis.conversational_features.filler_count} fillers)
                              </div>
                            )}
                            {latestTurn.internal_analysis?.text_analysis_output?.emotion_category && (
                              <div className="text-xs text-slate-600 font-medium">
                                • Emotion categorized as "{latestTurn.internal_analysis.text_analysis_output.emotion_category}"
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      <button
                        onClick={() => setShowExplain(!showExplain)}
                        className="text-xs font-semibold text-teal-600 hover:underline flex items-center gap-1"
                      >
                        {showExplain ? "Hide reasoning" : "Why did the system flag this?"}
                      </button>

                      {showExplain && (
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed">
                          {selectedCaseDetails?.summary?.explanation_text || latestTurn?.explanation_text || "Patient is showing high distress emotion metrics. Text analysis predicts high sadness/anxiety indices, bypassing baseline parameters."}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-xs text-[#64748b]">Select a patient from the list to display details.</div>
                  )}
                </div>
              </div>
            </div>

            {/* Dynamic Today vs Yesterday & Modality assessment breakdown */}
            {dailyBreakdown ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Today vs Yesterday Card */}
                <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-xs">
                  <h3 className="font-bold text-slate-900 text-sm mb-3 flex items-center justify-between">
                    <span>Today vs Yesterday Assessment</span>
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${
                      dailyBreakdown.changeStatus === "WORSENING" ? "bg-red-100 text-red-700 border-red-200" :
                      dailyBreakdown.changeStatus === "IMPROVING" ? "bg-green-100 text-green-700 border-green-200" :
                      dailyBreakdown.changeStatus === "STABLE" ? "bg-slate-100 text-slate-700 border-slate-200" : "bg-blue-50 text-blue-700 border-blue-100"
                    }`}>
                      {dailyBreakdown.changeStatus.replace("_", " ")}
                    </span>
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-2">
                      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Yesterday</div>
                      {dailyBreakdown.yesterdayMetrics ? (
                        <div className="space-y-1">
                          <div className="text-2xl font-black text-slate-800">{dailyBreakdown.yesterdayMetrics.distressScore}%</div>
                          <div className="text-xs font-semibold">Risk: <span className="text-red-600">{dailyBreakdown.yesterdayMetrics.riskTier}</span></div>
                          <div className="text-[10px] text-slate-500">{dailyBreakdown.yesterdayMetrics.turnsCount} turns / {dailyBreakdown.yesterdayMetrics.hasVoice ? "Multimodal" : "Text-only"}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">No yesterday check-ins.</div>
                      )}
                    </div>

                    <div className="p-4 bg-teal-50/20 border border-teal-100 rounded-xl space-y-2">
                      <div className="text-xs text-teal-600 font-bold uppercase tracking-wider">Today</div>
                      {dailyBreakdown.todayMetrics ? (
                        <div className="space-y-1">
                          <div className="text-2xl font-black text-teal-800">{dailyBreakdown.todayMetrics.distressScore}%</div>
                          <div className="text-xs font-semibold">Risk: <span className="text-red-600">{dailyBreakdown.todayMetrics.riskTier}</span></div>
                          <div className="text-[10px] text-slate-500">{dailyBreakdown.todayMetrics.turnsCount} turns / {dailyBreakdown.todayMetrics.hasVoice ? "Multimodal" : "Text-only"}</div>
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 italic">No check-ins today.</div>
                      )}
                    </div>
                  </div>
                  
                  {dailyBreakdown.yesterdayMetrics && dailyBreakdown.todayMetrics && (
                    <div className="mt-4 pt-3 border-t border-slate-100 text-xs text-slate-600 font-medium">
                      💡 Distress score changed by <span className={`font-bold ${dailyBreakdown.changeValue > 0 ? "text-red-600" : "text-green-600"}`}>
                        {dailyBreakdown.changeValue > 0 ? `+${dailyBreakdown.changeValue}` : dailyBreakdown.changeValue}%
                      </span>.
                    </div>
                  )}
                </div>

                {/* Mental Status & Modality Details Card */}
                <div className="rounded-2xl p-5 border border-slate-200 bg-white shadow-xs space-y-4">
                  <h3 className="font-bold text-slate-900 text-sm">Contributing Modality Signals</h3>
                  
                  <div className="space-y-3">
                    {/* Text Modality Signal */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Text Sentiment / Emotions</span>
                        <span className="text-slate-900">
                          {latestTurn?.internal_analysis?.text_analysis_output?.emotion_category 
                            ? `Category: ${latestTurn.internal_analysis.text_analysis_output.emotion_category} (${latestTurn.internal_analysis.text_analysis_output.emotion_intensity})`
                            : "N/A"}
                        </span>
                      </div>
                      {latestTurn?.internal_analysis?.text_emotions && (
                        <div className="flex gap-2 flex-wrap mt-1">
                          {Object.entries(latestTurn.internal_analysis.text_emotions).map(([em, val]: any) => (
                            <span key={em} className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 font-semibold uppercase">
                              {em}: {Math.round(val * 100)}%
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {/* Voice Modality Signal */}
                    <div className="space-y-1 text-xs border-t border-slate-100 pt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Voice Acoustic Features</span>
                        <span className="text-slate-900">
                          {latestTurn?.internal_analysis?.voice_emotions 
                            ? "Acoustic data active"
                            : "No voice features (text check-in)"}
                        </span>
                      </div>
                      {latestTurn?.internal_analysis?.voice_emotions ? (
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 font-medium mt-1">
                          <div>• Fillers: {latestTurn.internal_analysis.conversational_features?.filler_count || 0}</div>
                          <div>• Pauses: {(latestTurn.internal_analysis.conversational_features?.pause_duration || 0).toFixed(2)}s</div>
                          <div>• Pitch mean: {(latestTurn.internal_analysis.conversational_features?.pitch_mean_hz ?? latestTurn.internal_analysis.conversational_features?.pitch_mean ?? latestTurn.internal_analysis.conversational_features?.pitch_variability_hz ?? 0).toFixed(1)} Hz</div>
                          <div>• Tone: {Object.entries(latestTurn.internal_analysis.voice_emotions).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]}</div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic mt-1">No acoustic logs available for the last interaction.</div>
                      )}
                    </div>
                    
                    {/* Fusion Signal */}
                    {latestTurn?.internal_analysis?.fusion_metrics && (
                      <div className="space-y-1 text-xs border-t border-slate-100 pt-2">
                        <div className="flex justify-between font-semibold">
                          <span className="text-slate-700">Multimodal Fusion Details</span>
                          <span className="text-red-600 font-bold">
                            {latestTurn.internal_analysis.fusion_metrics.tier} Risk Tier
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-600 leading-relaxed mt-1">
                          Combined distress rating is computed via {latestTurn.internal_analysis.voice_emotions ? "acoustic and text fusion analysis" : "text sentiment baseline"}.
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : null}

            {/* CHART */}
            <div className="rounded-2xl p-6 border border-[#e2e8f0]" style={{ background: "#ffffff" }}>
              <div className="mb-4">
                <h3 className="font-bold text-slate-900 text-sm">Well-being Score Trend Timeline</h3>
                <p className="text-xs text-[#64748b] mt-0.5">Historical trend mapping patient's distress ratings across active turns</p>
              </div>

              {chartData.length === 0 ? (
                <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm border border-dashed border-slate-200 rounded-xl bg-slate-50">
                  Select a case with active turns to display timeline trends.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0d9488" stopOpacity={0.2} />
                        <stop offset="95%" stopColor="#0d9488" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#64748b" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#64748b" }} />
                    <Tooltip />
                    <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Severe Distress", fill: "#ef4444", fontSize: 10 }} />
                    <Area type="monotone" dataKey="distress" stroke="#0d9488" strokeWidth={2} fill="url(#chartGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </>
        )}

        {/* 2. CASES VIEW DETAILED INSPECT */}
        {activeNav === "Cases" && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Cases Sidebar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-1.5">
                <h3 className="font-bold text-slate-900 text-sm">Select Patient Case</h3>
                <div className="flex bg-[#f1f5f9] p-0.5 rounded border border-[#e2e8f0] scale-90 origin-right">
                  <button
                    onClick={() => setStageFilter("active")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${stageFilter === "active" ? "bg-white text-teal-600 shadow-xs" : "text-slate-600"}`}
                  >
                    Active
                  </button>
                  <button
                    onClick={() => setStageFilter("all")}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-all ${stageFilter === "all" ? "bg-white text-teal-600 shadow-xs" : "text-slate-600"}`}
                  >
                    All
                  </button>
                </div>
              </div>
              {cases.filter(c => stageFilter === "all" || c.stage === "active").map((c: any) => (
                <button
                  key={c.case_id}
                  onClick={() => setSelectedCaseId(c.case_id)}
                  className={`w-full p-4 rounded-xl border text-left flex flex-col transition-all ${
                    selectedCaseId === c.case_id ? "border-teal-500 bg-teal-50/30" : "border-slate-200 bg-white"
                  }`}
                >
                  <span className="font-bold text-[#0f172a] text-sm">{c.user?.name}</span>
                  <span className="text-[10px] text-[#64748b] mt-0.5">{c.user?.email} • {c.nhaa_ref}</span>
                  <div className="flex items-center justify-between w-full mt-3">
                    <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold border ${c.stage === "active" ? "bg-teal-50 text-teal-700 border-teal-200" : "bg-slate-50 text-slate-500 border-slate-200"}`}>{c.stage}</span>
                    <span className="font-bold text-xs text-red-600">Distress: {c.latest_distress_score}%</span>
                  </div>
                </button>
              ))}
            </div>

            {/* Case Details Details Panel */}
            <div className="lg:col-span-2 space-y-6">
              {selectedCaseDetails ? (() => {
                const renderHistoryTurn = (turn: any) => {
                  const dateLabel = new Date(turn.timestamp * 1000).toLocaleString();
                  const isVoice = turn.internal_analysis?.voice_emotions !== undefined && turn.internal_analysis?.voice_emotions !== null;
                  
                  return (
                    <div key={turn.turn_number} className="rounded-2xl p-5 border border-slate-200 bg-white space-y-4 shadow-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-xs font-semibold text-[#64748b]">{dateLabel} (Turn {turn.turn_number})</span>
                        <div className="flex gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isVoice ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            Channel: {isVoice ? "Voice" : "Text"}
                          </span>
                          <span className="text-xs font-bold text-red-600">Score: {Math.round(turn.distress_score * 100)}%</span>
                        </div>
                      </div>

                      {/* Message / Transcript */}
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Message Content</div>
                        <p className="text-slate-800 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100 italic">
                          "{turn.transcript}"
                        </p>
                      </div>

                      {/* Response */}
                      <div>
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">AI Response</div>
                        <p className="text-slate-800 text-sm bg-teal-50/20 p-3 rounded-xl border border-teal-100">
                          {turn.response_text}
                        </p>
                      </div>

                      {/* Modality Breakdowns */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                        {/* Text side */}
                        <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                          <div className="text-xs font-bold text-[#64748b] uppercase">Text Emotions & Terms</div>
                          {turn.internal_analysis?.text_emotions ? (
                            <div className="space-y-1.5">
                              {Object.entries(turn.internal_analysis.text_emotions).map(([em, val]: any) => (
                                <div key={em} className="flex justify-between items-center text-xs">
                                  <span className="text-slate-700 capitalize">{em}</span>
                                  <span className="font-semibold text-slate-800">{Math.round(val * 100)}%</span>
                                </div>
                              ))}
                              {turn.internal_analysis?.text_analysis_output?.distress_indicators && (
                                <div className="pt-2 border-t border-slate-200 mt-2">
                                  <div className="text-[10px] font-bold text-[#64748b] uppercase">Distress Key terms</div>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {turn.internal_analysis.text_analysis_output.distress_indicators.map((ind: string) => (
                                      <span key={ind} className="px-1.5 py-0.5 rounded-lg bg-orange-50 border border-orange-200 text-orange-700 text-[10px] font-medium">
                                        {ind}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">No text emotion logs.</div>
                          )}
                        </div>

                        {/* Voice side */}
                        <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 space-y-2">
                          <div className="text-xs font-bold text-[#64748b] uppercase">Voice / Acoustic metrics</div>
                          {isVoice ? (
                            <div className="space-y-1.5 text-xs text-slate-700">
                              <div className="flex justify-between">
                                <span>Primary Vocal Tone</span>
                                <span className="font-semibold text-slate-900 capitalize">
                                  {Object.entries(turn.internal_analysis.voice_emotions || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "Neutral"}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Filler Words Flagged</span>
                                <span className="font-semibold text-slate-900">{turn.internal_analysis.conversational_features?.filler_count || 0}</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Conversational Pauses</span>
                                <span className="font-semibold text-slate-900">{(turn.internal_analysis.conversational_features?.pause_duration || 0).toFixed(2)}s</span>
                              </div>
                              <div className="flex justify-between">
                                <span>Pitch Mean / Variance</span>
                                <span className="font-semibold text-slate-900">
                                  {(turn.internal_analysis.conversational_features?.pitch_mean_hz ?? turn.internal_analysis.conversational_features?.pitch_mean ?? 0).toFixed(1)} / {(turn.internal_analysis.conversational_features?.pitch_variability_hz ?? turn.internal_analysis.conversational_features?.pitch_variance ?? 0).toFixed(1)} Hz
                                </span>
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs text-slate-500 italic">Modality voice features omitted for text turn check-in.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                };

                return (
                  <>
                    {/* Summary Profile Header */}
                    <div className="rounded-2xl p-6 border bg-white border-slate-200 space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="text-xl font-bold text-slate-900">{selectedCaseDetails.user?.name}</h2>
                          <p className="text-xs text-[#64748b]">{selectedCaseDetails.user?.email} • ID: {selectedCaseDetails.case?.id}</p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${
                          selectedCaseDetails.summary?.risk_tier === "SEVERE" ? "bg-red-100 text-red-700 border border-red-200" :
                          selectedCaseDetails.summary?.risk_tier === "HIGH" ? "bg-orange-100 text-orange-700 border border-orange-200" :
                          "bg-green-100 text-green-700 border border-green-200"
                        }`}>
                          {selectedCaseDetails.summary?.risk_tier} RISK TIER
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-slate-100">
                        <div>
                          <div className="text-xs text-[#64748b]">Total Check-ins</div>
                          <div className="font-bold text-lg text-slate-800">{selectedCaseDetails.summary?.total_check_ins} turns</div>
                        </div>
                        <div>
                          <div className="text-xs text-[#64748b]">Last Interaction</div>
                          <div className="font-bold text-sm text-slate-800 mt-1">
                            {selectedCaseDetails.summary?.last_interaction ? new Date(selectedCaseDetails.summary.last_interaction).toLocaleDateString() : "Never"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-[#64748b]">Enrollment Date</div>
                          <div className="font-bold text-sm text-slate-800 mt-1">
                            {new Date(selectedCaseDetails.case?.enrollment_date).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Today vs Yesterday History Timeline Segments */}
                    {dailyBreakdown && (
                      <div className="space-y-4 border-t border-slate-200 pt-4">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-slate-900 text-base">Mental Status Progress Overview</h3>
                          <div className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                            dailyBreakdown.changeStatus === "WORSENING" ? "bg-red-100 text-red-700 border border-red-200" :
                            dailyBreakdown.changeStatus === "IMPROVING" ? "bg-green-100 text-green-700 border-green-200" :
                            "bg-slate-100 text-slate-700 border border-slate-200"
                          }`}>
                            Trend: {dailyBreakdown.changeStatus.replace("_", " ")}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {/* Yesterday's Turns */}
                          <div className="space-y-3">
                            <h4 className="font-semibold text-slate-700 text-sm flex items-center justify-between">
                              <span>Yesterday's Conversations</span>
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-full text-[10px] font-bold">
                                {dailyBreakdown.yesterdayTurns.length} turns
                              </span>
                            </h4>
                            {dailyBreakdown.yesterdayTurns.length > 0 ? (
                              dailyBreakdown.yesterdayTurns.map(turn => renderHistoryTurn(turn))
                            ) : (
                              <div className="p-6 text-center border border-dashed rounded-xl bg-slate-50 text-xs text-slate-400 font-medium">
                                No turns recorded yesterday.
                              </div>
                            )}
                          </div>

                          {/* Today's Turns */}
                          <div className="space-y-3">
                            <h4 className="font-semibold text-teal-700 text-sm flex items-center justify-between">
                              <span>Today's Conversations</span>
                              <span className="px-2 py-0.5 bg-teal-50 text-teal-700 rounded-full text-[10px] font-bold">
                                {dailyBreakdown.todayTurns.length} turns
                              </span>
                            </h4>
                            {dailyBreakdown.todayTurns.length > 0 ? (
                              dailyBreakdown.todayTurns.map(turn => renderHistoryTurn(turn))
                            ) : (
                              <div className="p-6 text-center border border-dashed rounded-xl bg-slate-50 text-xs text-slate-400 font-medium">
                                No turns recorded today.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Turn Analysis details (Entire History) */}
                    <div className="space-y-4 border-t border-slate-200 pt-6">
                      <h3 className="font-bold text-slate-900 text-base">All Check-in History Logs</h3>
                      {selectedCaseDetails.history && selectedCaseDetails.history.length > 0 ? (
                        selectedCaseDetails.history.map((turn: any) => renderHistoryTurn(turn))
                      ) : (
                        <div className="text-sm text-[#64748b] text-center p-8 bg-white border border-dashed rounded-2xl">No history turns recorded.</div>
                      )}
                    </div>
                  </>
                );
              })() : (
                <div className="text-sm text-[#64748b] text-center p-12 bg-white border border-dashed rounded-2xl">
                  Select a case from the sidebar to inspect complete patient history details.
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. ALERTS VIEW */}
        {activeNav === "Alerts" && (
          <div className="rounded-2xl p-6 border border-[#e2e8f0]" style={{ background: "#ffffff" }}>
            <div className="mb-4">
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Distress Alert Logs</h2>
              <p className="text-xs text-[#64748b] mt-0.5">Critical risk alerts generated by the distress scorer, including recommended legal relief provisions</p>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-[#64748b]">
                    <th className="px-4 py-3 text-left">Patient Name</th>
                    <th className="px-4 py-3 text-left">Generated At</th>
                    <th className="px-4 py-3 text-left">Legal Provisions</th>
                    <th className="px-4 py-3 text-left">Intervention Action Text</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Review</th>
                  </tr>
                </thead>
                <tbody>
                  {alerts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-[#64748b]">
                        No system alerts found in database.
                      </td>
                    </tr>
                  ) : (
                    alerts.map((alert) => {
                      const isActive = alert.status === "active";
                      return (
                        <tr key={alert.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                          <td className="px-4 py-4 font-bold text-slate-900">{alert.user_name || "Rohan"}</td>
                          <td className="px-4 py-4 text-xs text-[#64748b]">
                            {new Date(alert.created_at).toLocaleString()}
                          </td>
                          <td className="px-4 py-4">
                              {alert.cited_provisions && alert.cited_provisions.map((prov: any, index: number) => {
                                const label = typeof prov === "object" ? (prov?.section_ref || prov?.section || JSON.stringify(prov)) : prov;
                                return (
                                  <span key={index} className="px-2 py-0.5 rounded bg-blue-50 border border-blue-100 text-blue-700 text-[10px] font-semibold">
                                    {label}
                                  </span>
                                );
                              })}
                          </td>
                          <td className="px-4 py-4 text-xs text-slate-700 max-w-xs">{alert.recommendation_text || "Consider immediate outreach."}</td>
                          <td className="px-4 py-4">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              isActive ? "bg-red-100 text-red-700 border border-red-200" : "bg-green-100 text-green-700 border border-green-200"
                            }`}>
                              {alert.status}
                            </span>
                          </td>
                          <td className="px-4 py-4">
                            {isActive ? (
                              <button
                                onClick={() => acknowledgeAlert(alert.id)}
                                className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold"
                              >
                                Resolve / Acknowledge
                              </button>
                            ) : (
                              <div className="text-xs text-[#64748b]">
                                Resolved by <span className="font-semibold">{alert.acknowledged_by}</span>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* 4. ANALYTICS VIEW */}
        {activeNav === "Analytics" && (
          <div className="rounded-2xl p-6 border border-[#e2e8f0] bg-white space-y-6">
            <div>
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Distress Trends Analytics</h2>
              <p className="text-xs text-[#64748b] mt-0.5">Visualize distress history breakdown and engagement level</p>
            </div>

            {selectedCaseId ? (
              <div className="space-y-6">
                <div className="p-4 bg-slate-50 border rounded-xl flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-500">Active Case</span>
                    <h4 className="font-bold text-slate-800 text-base">{selectedCaseDetails?.user?.name}</h4>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-500">Current Score</span>
                    <h4 className="font-black text-red-600 text-xl">{selectedCaseDetails?.summary?.current_distress_score * 100}%</h4>
                  </div>
                </div>

                <div className="h-[280px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="day" />
                        <YAxis />
                        <Tooltip />
                        <Area type="monotone" dataKey="distress" stroke="#0d9488" fill="#f1f5f9" />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-500">No chart data.</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center text-slate-500 p-8">Select a case on the Dashboard tab to view analytics.</div>
            )}
          </div>
        )}

        {/* 5. SETTINGS VIEW */}
        {activeNav === "Settings" && (
          <div className="rounded-2xl p-6 border border-[#e2e8f0] bg-white space-y-6">
            <div>
              <h2 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Settings & Configuration</h2>
              <p className="text-xs text-[#64748b] mt-0.5">Verify connection details and dashboard status</p>
            </div>

            <div className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Backend URL Endpoint</label>
                <input
                  type="text"
                  readOnly
                  value={import.meta.env.VITE_API_BASE_URL || "http://localhost:8000"}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 text-slate-600"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Counsellor Account</label>
                <input
                  type="text"
                  readOnly
                  value={user.email}
                  className="w-full px-3 py-2 border rounded-lg text-sm bg-slate-50 text-slate-600"
                />
              </div>
              <div className="p-4 bg-[#f0fdfa] border border-[#99f6e4] rounded-xl text-teal-800 text-xs">
                💡 Nirbhaya Mitra uses a double-modality distress score. It weights the acoustic and linguistic variables separately and links alerts to legal relief provisions.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
