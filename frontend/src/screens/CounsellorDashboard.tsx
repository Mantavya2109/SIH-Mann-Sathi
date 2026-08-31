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

  // Biosignal Prototype State
  const [bioData, setBioData] = useState<any>(null);
  const [holisticData, setHolisticData] = useState<any>(null);
  const [bioSyncLoading, setBioSyncLoading] = useState(false);

  const navItems = ["Dashboard", "Cases", "Analytics", "Alerts", "Biosignal Analysis", "Settings"];

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

  // Fetch Biosignal and Holistic Data for Selected Case
  async function fetchBiosignals(caseId: string) {
    try {
      const bioRes = await fetch(getApiUrl(`/api/biosignals/${caseId}`));
      const holRes = await fetch(getApiUrl(`/api/biosignals/${caseId}/holistic`));
      if (bioRes.ok) {
        const d = await bioRes.json();
        setBioData(d);
      }
      if (holRes.ok) {
        const h = await holRes.json();
        setHolisticData(h);
      }
    } catch (err) {
      console.error("Failed to load biosignals for case:", caseId, err);
    }
  }

  async function syncBiosignals(caseId: string) {
    try {
      setBioSyncLoading(true);
      const res = await fetch(getApiUrl(`/api/biosignals/${caseId}/sync`), { method: "POST" });
      if (res.ok) {
        await fetchBiosignals(caseId);
      }
    } catch (err) {
      console.error("Failed to sync biosignals:", err);
    } finally {
      setBioSyncLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCaseId) {
      fetchBiosignals(selectedCaseId);
    }
  }, [selectedCaseId, caseDetailsRefreshKey]);

  useEffect(() => {
    // Clear details immediately during case transition to avoid stale state mixing
    setSelectedCaseDetails(null);
    if (!selectedCaseId) {
      return;
    }

    let isMounted = true;
    async function fetchCaseDetails() {
      try {
        // Use persistent Supabase history endpoint (not in-memory /api/conversation/)
        const detailsRes = await fetch(getApiUrl(`/api/counsellor/cases/${selectedCaseId}`));
        const historyRes = await fetch(getApiUrl(`/api/counsellor/cases/${selectedCaseId}/history`));
        
        if (detailsRes.ok && isMounted) {
          const detailsData = await detailsRes.json();
          let historyArr: any[] = [];
          if (historyRes.ok) {
            const historyData = await historyRes.json();
            historyArr = Array.isArray(historyData) ? historyData : (historyData.history || []);
          }
          if (isMounted && detailsData.case?.id === selectedCaseId) {
            setSelectedCaseDetails({
              ...detailsData,
              history: historyArr
            });
          }
        }
      } catch (err) {
        console.error("Failed to load details for case:", selectedCaseId, err);
      }
    }

    fetchCaseDetails();
    return () => {
      isMounted = false;
    };
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

  const IST_TIMEZONE = "Asia/Kolkata";

  function parseToDate(dateInput: string | number | Date | null | undefined): Date | null {
    if (!dateInput) return null;
    if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput;
    if (typeof dateInput === "number") {
      const ms = dateInput < 1e11 ? dateInput * 1000 : dateInput;
      const d = new Date(ms);
      return isNaN(d.getTime()) ? null : d;
    }
    if (typeof dateInput === "string") {
      let str = dateInput.trim();
      if (!str) return null;
      if (!isNaN(Number(str)) && !str.includes("T") && !str.includes("-")) {
        const num = Number(str);
        const ms = num < 1e11 ? num * 1000 : num;
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
      }
      // If naive ISO string (e.g. from database timestamp column without trailing Z or offset),
      // append Z so that JavaScript parses it as UTC instead of browser local time!
      if (str.includes("T") && !str.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
        str = str + "Z";
      }
      const d = new Date(str);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  function formatISTDateTime(dateInput: string | number | Date | null | undefined): string {
    const d = parseToDate(dateInput);
    if (!d) return "N/A";
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return "N/A";
    }
  }

  function formatISTDate(dateInput: string | number | Date | null | undefined): string {
    const d = parseToDate(dateInput);
    if (!d) return "N/A";
    try {
      return new Intl.DateTimeFormat("en-IN", {
        timeZone: IST_TIMEZONE,
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(d);
    } catch {
      return "N/A";
    }
  }

  function getISTDateKey(dateInput: string | number | Date | null | undefined): string {
    const d = parseToDate(dateInput);
    if (!d) return "";
    try {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: IST_TIMEZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(d);
    } catch {
      return "";
    }
  }

  function formatRelativeTimeIST(dateInput: string | number | Date | null | undefined): string {
    const d = parseToDate(dateInput);
    if (!d) return "N/A";
    const now = new Date();
    const diffSec = Math.max(0, Math.floor((now.getTime() - d.getTime()) / 1000));
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} minutes ago`;
    if (diffSec < 86400) {
      const hrs = Math.floor(diffSec / 3600);
      return `${hrs} hour${hrs > 1 ? "s" : ""} ago`;
    }
    const days = Math.floor(diffSec / 86400);
    return `${days} day${days > 1 ? "s" : ""} ago`;
  }

  const activeCasesCount = cases.filter(c => c.stage === "active").length;
  const highRiskCount = cases.filter(c => c.risk_tier === "SEVERE" || c.risk_tier === "HIGH").length;
  const moderateRiskCount = cases.filter(c => c.risk_tier === "MODERATE").length;
  const stableCount = cases.filter(c => c.risk_tier === "LOW").length;

  const activeAlerts = alerts.filter(a => a.status === "active");

  const chartData = selectedCaseDetails?.history && selectedCaseDetails.history.length > 0
    ? selectedCaseDetails.history.map((turn: any) => {
        const dateObj = parseToDate(turn.timestamp || turn.timestamp_unix) || new Date();
        const dayStr = new Intl.DateTimeFormat("en-IN", {
          timeZone: IST_TIMEZONE,
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          hour12: true,
        }).format(dateObj);
        return {
          day: dayStr,
          distress: Math.round((turn.distress_score || 0.0) * 100),
        };
      })
    : [];

  const selectedCase = cases.find(c => c.case_id === selectedCaseId);
  const latestInteraction = selectedCaseDetails?.latest_interaction;
  const history = selectedCaseDetails?.history || [];
  const latestTurn = latestInteraction || (history.length > 0 ? history[history.length - 1] : null);

  // Helper to get daily breakdown using authoritative backend summaries or computed fallback
  const getDailyBreakdown = () => {
    if (!selectedCaseDetails) return null;

    const todaySummary = selectedCaseDetails.today_summary;
    const yesterdaySummary = selectedCaseDetails.yesterday_summary;

    if (!todaySummary && !yesterdaySummary && history.length === 0) return null;

    let changeStatus = "INSUFFICIENT_DATA";
    let changeValue = 0;

    if (todaySummary && yesterdaySummary) {
      changeValue = todaySummary.latest_distress_score - yesterdaySummary.latest_distress_score;
      if (changeValue > 5) {
        changeStatus = "WORSENING";
      } else if (changeValue < -5) {
        changeStatus = "IMPROVING";
      } else {
        changeStatus = "STABLE";
      }
    }

    const now = new Date();
    const todayISTKey = getISTDateKey(now);
    const yesterdayISTKey = getISTDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000));
    
    const todayTurns = history.filter((t: any) => getISTDateKey(t.timestamp || t.timestamp_unix) === todayISTKey);
    const yesterdayTurns = history.filter((t: any) => getISTDateKey(t.timestamp || t.timestamp_unix) === yesterdayISTKey);

    return {
      todayTurns,
      yesterdayTurns,
      todayMetrics: todaySummary ? {
        distressScore: todaySummary.latest_distress_score,
        riskTier: todaySummary.risk_tier,
        hasVoice: todaySummary.has_voice,
        hasText: todaySummary.has_text,
        turnsCount: todaySummary.turns_count,
        latestTime: latestInteraction?.timestamp ? formatISTDateTime(latestInteraction.timestamp) : "Today",
      } : (todayTurns.length > 0 ? {
        distressScore: Math.round((todayTurns[todayTurns.length - 1].distress_score || 0) * 100),
        riskTier: todayTurns[todayTurns.length - 1].risk_tier || "LOW",
        hasVoice: todayTurns.some((t: any) => t.internal_analysis?.voice_emotions),
        hasText: true,
        turnsCount: todayTurns.length,
        latestTime: formatISTDateTime(todayTurns[todayTurns.length - 1].timestamp),
      } : null),
      yesterdayMetrics: yesterdaySummary ? {
        distressScore: yesterdaySummary.latest_distress_score,
        riskTier: yesterdaySummary.risk_tier,
        hasVoice: yesterdaySummary.has_voice,
        hasText: yesterdaySummary.has_text,
        turnsCount: yesterdaySummary.turns_count,
        latestTime: "Yesterday",
      } : (yesterdayTurns.length > 0 ? {
        distressScore: Math.round((yesterdayTurns[yesterdayTurns.length - 1].distress_score || 0) * 100),
        riskTier: yesterdayTurns[yesterdayTurns.length - 1].risk_tier || "LOW",
        hasVoice: yesterdayTurns.some((t: any) => t.internal_analysis?.voice_emotions),
        hasText: true,
        turnsCount: yesterdayTurns.length,
        latestTime: formatISTDateTime(yesterdayTurns[yesterdayTurns.length - 1].timestamp),
      } : null),
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
              <span className="text-white font-bold">MS</span>
            </div>
            <span className="font-bold text-[#0f172a] text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Mann Sathi</span>
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
                                {c.days_since_last_checkin !== undefined && c.days_since_last_checkin !== null ? (
                                  c.days_since_last_checkin < 0.0007 ? "Just now" :
                                  c.days_since_last_checkin < 0.0416 ? `${Math.max(1, Math.round(c.days_since_last_checkin * 1440))} minutes ago` :
                                  c.days_since_last_checkin < 1.0 ? `${Math.max(1, Math.round(c.days_since_last_checkin * 24))} hours ago` :
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
                      <div className="text-xs text-slate-500 font-bold uppercase tracking-wider">Yesterday (IST)</div>
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
                      <div className="text-xs text-teal-600 font-bold uppercase tracking-wider">Today (IST)</div>
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
                  <h3 className="font-bold text-slate-900 text-sm flex items-center justify-between">
                    <span>Contributing Modality Signals & Fusion</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      selectedCaseDetails?.summary?.has_active_alert
                        ? "bg-red-100 text-red-700 border border-red-200"
                        : "bg-teal-50 text-teal-700 border border-teal-200"
                    }`}>
                      Alert: {selectedCaseDetails?.summary?.has_active_alert ? "ACTIVE" : "NONE"}
                    </span>
                  </h3>
                  
                  <div className="space-y-3">
                    {/* Multimodal Score Matrix */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Text Score</div>
                        <div className="font-extrabold text-slate-800 text-sm mt-0.5">
                          {(() => {
                            if (latestTurn?.text_score !== undefined && latestTurn?.text_score !== null) {
                              return `${latestTurn.text_score}%`;
                            }
                            const fm = latestTurn?.internal_analysis?.fusion_metrics;
                            if (fm && fm.d_text !== undefined && fm.d_text !== "UNAVAILABLE") {
                              return `${Math.round(Number(fm.d_text) * 100)}%`;
                            }
                            const to = latestTurn?.internal_analysis?.text_analysis_output;
                            if (to && to.sentiment_score !== undefined) {
                              return `${Math.round(Math.abs(to.sentiment_score) * 100)}%`;
                            }
                            return latestTurn ? `${Math.round((latestTurn.distress_score || 0) * 100)}%` : "N/A";
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500 font-bold uppercase">Voice Score</div>
                        <div className="font-extrabold text-slate-800 text-sm mt-0.5">
                          {(() => {
                            if (latestTurn?.voice_score !== undefined && latestTurn?.voice_score !== null) {
                              return `${latestTurn.voice_score}%`;
                            }
                            const fm = latestTurn?.internal_analysis?.fusion_metrics;
                            if (fm && fm.d_voice !== undefined && fm.d_voice !== "UNAVAILABLE") {
                              return `${Math.round(Number(fm.d_voice) * 100)}%`;
                            }
                            if (latestTurn?.is_voice && latestTurn?.voice_emotions) {
                              const vVals = Object.values(latestTurn.voice_emotions) as number[];
                              return vVals.length ? `${Math.round(Math.max(...vVals) * 100)}%` : "No voice data";
                            }
                            if (latestTurn?.internal_analysis?.voice_emotions) {
                              const vVals = Object.values(latestTurn.internal_analysis.voice_emotions) as number[];
                              return vVals.length ? `${Math.round(Math.max(...vVals) * 100)}%` : "No voice data";
                            }
                            return "No voice data";
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-teal-700 font-bold uppercase">Fusion Score</div>
                        <div className="font-extrabold text-teal-800 text-sm mt-0.5">
                          {(() => {
                            if (latestTurn?.fusion_score !== undefined && latestTurn?.fusion_score !== null) {
                              return `${latestTurn.fusion_score}%`;
                            }
                            const fm = latestTurn?.internal_analysis?.fusion_metrics;
                            if (fm && fm.d_base !== undefined && fm.d_base !== "UNAVAILABLE") {
                              return `${Math.round(Number(fm.d_base) * 100)}%`;
                            }
                            if (fm && fm.final_distress_score !== undefined && fm.final_distress_score !== "UNAVAILABLE") {
                              return `${Math.round(Number(fm.final_distress_score) * 100)}%`;
                            }
                            return latestTurn ? `${Math.round((latestTurn.distress_score || 0) * 100)}%` : "N/A";
                          })()}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-red-600 font-bold uppercase">Final Distress</div>
                        <div className="font-extrabold text-red-600 text-sm mt-0.5">
                          {(() => {
                            if (latestTurn?.final_distress_score !== undefined && latestTurn?.final_distress_score !== null) {
                              return `${latestTurn.final_distress_score}%`;
                            }
                            return latestTurn ? `${Math.round((latestTurn.distress_score || 0) * 100)}%` : "N/A";
                          })()}
                        </div>
                      </div>
                    </div>

                    {/* Text Modality Signal */}
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Text Sentiment / Emotions</span>
                        <span className="text-slate-900">
                          {latestTurn?.text_emotions && Object.keys(latestTurn.text_emotions).length > 0
                            ? `Emotions logged (${Object.keys(latestTurn.text_emotions).length})`
                            : latestTurn?.internal_analysis?.text_analysis_output?.emotion_category 
                            ? `Category: ${latestTurn.internal_analysis.text_analysis_output.emotion_category}`
                            : "Text logged"}
                        </span>
                      </div>
                      {(latestTurn?.text_emotions || latestTurn?.internal_analysis?.text_emotions) && (
                        <div className="flex gap-2 flex-wrap mt-1">
                          {Object.entries(latestTurn.text_emotions || latestTurn.internal_analysis.text_emotions).map(([em, val]: any) => (
                            <span key={em} className="px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600 font-semibold uppercase">
                              {em}: {Math.round(Number(val) * 100)}%
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
                          {latestTurn?.is_voice || latestTurn?.voice_emotions || latestTurn?.internal_analysis?.voice_emotions
                            ? "Acoustic data active"
                            : "No voice data for this interaction (Text check-in)"}
                        </span>
                      </div>
                      {(latestTurn?.is_voice || latestTurn?.voice_emotions || latestTurn?.internal_analysis?.voice_emotions) ? (
                        <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-600 font-medium mt-1">
                          <div>• Fillers: {latestTurn.conversational_features?.filler_count || latestTurn.internal_analysis?.conversational_features?.filler_count || 0}</div>
                          <div>• Pauses: {(latestTurn.conversational_features?.pause_duration || latestTurn.internal_analysis?.conversational_features?.pause_duration || 0).toFixed(2)}s</div>
                          <div>• Pitch mean: {(latestTurn.conversational_features?.pitch_mean_hz ?? latestTurn.internal_analysis?.conversational_features?.pitch_mean_hz ?? latestTurn.internal_analysis?.conversational_features?.pitch_mean ?? 0).toFixed(1)} Hz</div>
                          <div>• Tone: {Object.entries(latestTurn.voice_emotions || latestTurn.internal_analysis?.voice_emotions || {}).sort((a: any, b: any) => b[1] - a[1])[0]?.[0] || "Neutral"}</div>
                        </div>
                      ) : (
                        <div className="text-[10px] text-slate-400 italic mt-1">No acoustic features recorded for this interaction.</div>
                      )}
                    </div>
                    
                    {/* Fusion Signal */}
                    <div className="space-y-1 text-xs border-t border-slate-100 pt-2">
                      <div className="flex justify-between font-semibold">
                        <span className="text-slate-700">Multimodal Fusion Risk Tier</span>
                        <span className={`font-bold ${
                          (latestTurn?.risk_tier === "SEVERE" || latestTurn?.risk_tier === "HIGH") ? "text-red-600" :
                          latestTurn?.risk_tier === "MODERATE" ? "text-amber-600" : "text-green-600"
                        }`}>
                          {latestTurn?.risk_tier || "LOW"} Risk Tier
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-600 leading-relaxed mt-1">
                        {latestTurn?.is_voice
                          ? "Combined distress rating is computed via acoustic and text fusion analysis."
                          : "Distress rating is computed via text sentiment and linguistic analysis."}
                      </div>
                    </div>
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
                  const dateLabel = formatISTDateTime(turn.timestamp);
                  const isVoice = turn.internal_analysis?.voice_emotions !== undefined && turn.internal_analysis?.voice_emotions !== null;
                  const fm = turn.internal_analysis?.fusion_metrics;
                  const tier = fm?.tier || turn.risk_tier || (turn.distress_score > 0.75 ? "SEVERE" : turn.distress_score > 0.5 ? "HIGH" : turn.distress_score > 0.25 ? "MODERATE" : "LOW");
                  const isAlert = turn.safety_attention || turn.distress_score >= 0.6 || tier === "SEVERE" || tier === "HIGH";
                  
                  return (
                    <div key={turn.turn_number} className="rounded-2xl p-5 border border-slate-200 bg-white space-y-4 shadow-xs">
                      <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                        <span className="text-xs font-semibold text-[#64748b]">{dateLabel} (Turn {turn.turn_number})</span>
                        <div className="flex gap-2">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isVoice ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"}`}>
                            Channel: {isVoice ? "Voice" : "Text"}
                          </span>
                          <span className="text-xs font-bold text-red-600">Distress: {Math.round(turn.distress_score * 100)}%</span>
                        </div>
                      </div>

                      {/* Multimodal Score Matrix per Turn */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">Text Analysis</div>
                          <div className="font-extrabold text-slate-800 text-xs mt-0.5">
                            {fm?.d_text !== undefined && fm?.d_text !== "UNAVAILABLE" ? `${Math.round(Number(fm.d_text) * 100)}%` : `${Math.round((turn.distress_score || 0) * 100)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-slate-500 font-bold uppercase">Voice Analysis</div>
                          <div className="font-extrabold text-slate-800 text-xs mt-0.5">
                            {fm?.d_voice !== undefined && fm?.d_voice !== "UNAVAILABLE" ? `${Math.round(Number(fm.d_voice) * 100)}%` : isVoice ? "Active" : "Text-only"}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-teal-700 font-bold uppercase">Fusion Score</div>
                          <div className="font-extrabold text-teal-800 text-xs mt-0.5">
                            {fm?.d_base !== undefined && fm?.d_base !== "UNAVAILABLE" ? `${Math.round(Number(fm.d_base) * 100)}%` : fm?.final_distress_score !== undefined && fm?.final_distress_score !== "UNAVAILABLE" ? `${Math.round(Number(fm.final_distress_score) * 100)}%` : `${Math.round((turn.distress_score || 0) * 100)}%`}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-red-600 font-bold uppercase">Risk Tier & Alert</div>
                          <div className="font-extrabold text-red-600 text-xs mt-0.5">
                            {tier} ({isAlert ? "ALERT" : "NONE"})
                          </div>
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
                          <div className="text-xs text-[#64748b]">Last Interaction (IST)</div>
                          <div className="font-bold text-sm text-slate-800 mt-1">
                            {selectedCaseDetails.summary?.last_interaction ? formatISTDateTime(selectedCaseDetails.summary.last_interaction) : "Never"}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-[#64748b]">Enrollment Date (IST)</div>
                          <div className="font-bold text-sm text-slate-800 mt-1">
                            {formatISTDate(selectedCaseDetails.case?.enrollment_date)}
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
                              <span>Yesterday's Conversations (IST)</span>
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
                              <span>Today's Conversations (IST)</span>
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
                      <h3 className="font-bold text-slate-900 text-base">All Check-in History Logs (IST)</h3>
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
              <p className="text-xs text-[#64748b] mt-0.5">Critical risk alerts generated by the distress scorer, including recommended legal relief provisions (Timestamps in IST)</p>
            </div>

            <div className="rounded-xl overflow-hidden border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-[#64748b]">
                    <th className="px-4 py-3 text-left">Patient Name</th>
                    <th className="px-4 py-3 text-left">Generated At (IST)</th>
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
                            {formatISTDateTime(alert.created_at)}
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

        {/* 5. BIOSIGNAL ANALYSIS VIEW (PROTOTYPE) */}
        {activeNav === "Biosignal Analysis" && (
          <div className="space-y-6">
            {/* Header & Case Selector */}
            <div className="rounded-2xl p-6 border border-[#e2e8f0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Biosignal Telemetry & Holistic Mental Status</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200">
                    Prototype / Demo Integration
                  </span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">Continuous physiological signal monitoring correlated with conversational distress modeling</p>
              </div>

              {/* Case / Patient Selector */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 font-semibold">Select Case:</span>
                <select
                  value={selectedCaseId || ""}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-teal-500"
                >
                  {cases.map((c) => (
                    <option key={c.case_id} value={c.case_id}>
                      {c.user?.name} ({c.nhaa_ref}) — {c.risk_tier} RISK
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => selectedCaseId && syncBiosignals(selectedCaseId)}
                  disabled={bioSyncLoading || !selectedCaseId}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={bioSyncLoading ? "animate-spin" : ""}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.23-1.19"/>
                  </svg>
                  {bioSyncLoading ? "Syncing..." : "Simulate Sync"}
                </button>
              </div>
            </div>

            {/* Overview Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Patient</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{bioData?.patient_name || selectedCase?.user?.name || "Rohan"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Case Reference</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{bioData?.case_name || selectedCase?.nhaa_ref || "ROHAN-CASE-2"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Device Model</div>
                  <div className="font-bold text-slate-900 text-sm mt-0.5">{bioData?.device_name || "Sahaaya Biosignal Prototype"}</div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Connection Status</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="font-bold text-green-700 text-xs">{bioData?.device_status || "Connected"} (Demo Data)</span>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Last Sync (IST)</div>
                  <div className="font-bold text-slate-700 text-xs mt-0.5">{bioData?.last_sync_ist || formatISTDateTime(new Date())}</div>
                </div>
              </div>
            </div>

            {/* Active Alert Integration Banner */}
            {selectedCaseDetails?.summary?.risk_tier && ["SEVERE", "HIGH", "CRITICAL"].includes(selectedCaseDetails.summary.risk_tier) && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start gap-3 text-xs">
                <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center flex-shrink-0 text-red-600 font-bold mt-0.5">
                  ⚠️
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-red-900 text-sm flex items-center gap-2">
                    <span>Active Alert Context: {selectedCaseDetails.summary.risk_tier} RISK CASE</span>
                    <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded-full text-[10px] font-extrabold">STATUS: ACTIVE</span>
                  </div>
                  <p className="text-red-800 leading-relaxed">
                    <strong>Biosignal Context:</strong> Sleep duration reduced ({bioData?.sleep?.duration_formatted || "6h 42m"}), elevated skin conductance ({bioData?.skin_conductance?.average_us || 2.8} µS) with {bioData?.skin_conductance?.stress_events || 4} physiological response markers. Contextual physiological observations reinforce monitored conversational distress signals.
                  </p>
                </div>
              </div>
            )}

            {/* SECTION: OVERALL MENTAL STATUS (HOLISTIC ASSESSMENT) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Overall Mental Status (Holistic Assessment)</h3>
                  <p className="text-xs text-[#64748b]">Decision-support layer combining conversational AI indicators with prototype physiological telemetry</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-3 py-1 rounded-full text-xs font-extrabold border ${
                    holisticData?.status_color === "red" ? "bg-red-100 text-red-700 border-red-200" :
                    holisticData?.status_color === "orange" ? "bg-orange-100 text-orange-700 border-orange-200" :
                    holisticData?.status_color === "amber" ? "bg-amber-100 text-amber-700 border-amber-200" :
                    "bg-green-100 text-green-700 border-green-200"
                  }`}>
                    {holisticData?.current_status || "Moderate Concern"}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                    Trend: {holisticData?.trend || "Improving"}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Confidence: Demo / Prototype
                  </span>
                </div>
              </div>

              {/* Multimodal Signal Matrix */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-center">
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Text Analysis</div>
                  <div className="font-extrabold text-slate-800 text-sm mt-1">{holisticData?.signals?.text_score || "40%"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Linguistic</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Voice Analysis</div>
                  <div className="font-extrabold text-slate-800 text-sm mt-1">{holisticData?.signals?.voice_score || "59%"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">Acoustic</div>
                </div>
                <div className="p-3 bg-teal-50/50 border border-teal-100 rounded-xl">
                  <div className="text-[10px] text-teal-700 font-bold uppercase">Fusion Score</div>
                  <div className="font-extrabold text-teal-800 text-sm mt-1">{holisticData?.signals?.fusion_score || "52%"}</div>
                  <div className="text-[9px] text-teal-600 mt-0.5">Distress Tier: {holisticData?.signals?.risk_tier || "MODERATE"}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Sleep</div>
                  <div className="font-extrabold text-purple-700 text-sm mt-1">{holisticData?.signals?.sleep_quality || "Moderate"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{bioData?.sleep?.duration_formatted || "6h 42m"}</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Heart Rate</div>
                  <div className="font-extrabold text-slate-800 text-sm mt-1">{holisticData?.signals?.heart_rate_status || "Normal"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{bioData?.heart_rate?.resting_bpm || 74} BPM</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Skin Conductance</div>
                  <div className="font-extrabold text-orange-600 text-sm mt-1">{holisticData?.signals?.skin_conductance_status || "Elevated"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{bioData?.skin_conductance?.average_us || 2.8} µS</div>
                </div>
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Blood Oxygen</div>
                  <div className="font-extrabold text-teal-700 text-sm mt-1">{holisticData?.signals?.spo2_status || "Normal"}</div>
                  <div className="text-[9px] text-slate-400 mt-0.5">{bioData?.blood_oxygen?.average_spo2 || 98}% SpO2</div>
                </div>
              </div>

              {/* Dynamic Overall Interpretation */}
              <div className="p-4 bg-teal-50/30 border border-teal-100 rounded-xl space-y-2">
                <div className="text-xs font-bold text-teal-900 flex items-center gap-1.5">
                  <span>💡 Holistic Clinical-Support Interpretation</span>
                  <span className="text-[10px] font-normal text-teal-700">(Generated from synthesized multimodal + biosignal channels)</span>
                </div>
                <p className="text-xs text-slate-800 leading-relaxed italic">
                  "{holisticData?.overall_interpretation || "Current multimodal analysis indicates moderate distress. Sleep quality is observed as below baseline while resting heart rate remains within the normal demo range. Proactive counsellor check-in and safety monitoring are recommended."}"
                </p>
              </div>

              {/* Biosignal Contributing Indicators */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wide">Biosignal Contributing Indicators</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {holisticData?.contributing_indicators?.map((ind: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                      <span className="text-teal-600 font-bold">•</span>
                      <span>{ind}</span>
                    </div>
                  )) || (
                    <div className="text-xs text-slate-400 italic">No specific anomaly markers logged.</div>
                  )}
                </div>
              </div>
            </div>

            {/* SECTION: SLEEP ANALYTICS & SLEEP HISTORY */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Sleep Analytics & Circadian Pattern</h3>
                  <p className="text-xs text-[#64748b]">Sleep quality index, sleep architecture consistency, and nightly recovery scores (Simulated Data)</p>
                </div>
                <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                  SIMULATED / DEMO DATA
                </span>
              </div>

              {/* 5 Sleep KPI Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Sleep Duration</div>
                  <div className="text-xl font-black text-slate-800">{bioData?.sleep?.duration_formatted || "6h 42m"}</div>
                  <div className="text-[10px] text-slate-400">{bioData?.sleep?.duration_minutes || 402} minutes</div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Sleep Quality</div>
                  <div className="text-xl font-black text-purple-700">{bioData?.sleep?.quality || "Moderate"}</div>
                  <div className="text-[10px] text-slate-400">Score: {bioData?.sleep?.status || "Below Baseline"}</div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Sleep Consistency</div>
                  <div className="text-xl font-black text-slate-800">{bioData?.sleep?.consistency || 72}%</div>
                  <div className="text-[10px] text-slate-400">Regularity index</div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Disturbances</div>
                  <div className="text-xl font-black text-orange-600">{bioData?.sleep?.disturbances || 3}</div>
                  <div className="text-[10px] text-slate-400">Awakening markers</div>
                </div>
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl space-y-1">
                  <div className="text-[10px] text-slate-500 font-bold uppercase">Sleep Recovery</div>
                  <div className="text-xl font-black text-teal-700">{bioData?.sleep?.recovery || "Moderate"}</div>
                  <div className="text-[10px] text-slate-400">Restorative index</div>
                </div>
              </div>

              {/* Sleep History Table */}
              <div className="space-y-2">
                <h4 className="font-bold text-slate-800 text-sm">Sleep History Log (Last 4 Days)</h4>
                <div className="rounded-xl overflow-hidden border border-slate-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold">
                        <th className="px-4 py-2.5 text-left">Date</th>
                        <th className="px-4 py-2.5 text-left">Sleep Duration</th>
                        <th className="px-4 py-2.5 text-left">Quality Rating</th>
                        <th className="px-4 py-2.5 text-left">Recovery Index</th>
                        <th className="px-4 py-2.5 text-left">Awakening Disturbances</th>
                        <th className="px-4 py-2.5 text-left">Sleep Efficiency</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bioData?.sleep_history && bioData.sleep_history.length > 0 ? (
                        bioData.sleep_history.map((row: any, idx: number) => (
                          <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50/50">
                            <td className="px-4 py-3 font-bold text-slate-800">{row.date}</td>
                            <td className="px-4 py-3 text-slate-700 font-semibold">{row.duration}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                row.quality === "Good" ? "bg-green-50 text-green-700 border border-green-200" :
                                row.quality === "Moderate" ? "bg-purple-50 text-purple-700 border border-purple-200" :
                                "bg-red-50 text-red-700 border border-red-200"
                              }`}>
                                {row.quality}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-700">{row.recovery}</td>
                            <td className="px-4 py-3 text-slate-700">{row.disturbances} wake events</td>
                            <td className="px-4 py-3 font-semibold text-slate-800">{row.efficiency || "82%"}</td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-6 text-center text-slate-400">No sleep history logged for this case.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* SECTION: HEART RATE, SKIN CONDUCTANCE, SPO2 GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Heart Rate Analysis */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">Heart Rate (PPG)</h4>
                  <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                    {bioData?.heart_rate?.status || "Normal"}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Resting Heart Rate</span>
                    <span className="font-bold text-slate-900">{bioData?.heart_rate?.resting_bpm || 74} BPM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Average Heart Rate</span>
                    <span className="font-bold text-slate-900">{bioData?.heart_rate?.average_bpm || 78} BPM</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Daily Range (Min–Max)</span>
                    <span className="font-bold text-slate-900">{bioData?.heart_rate?.range_formatted || "62–101 BPM"}</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  * Simulated photoplethysmography sensor stream
                </div>
              </div>

              {/* Skin Conductance */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">Skin Conductance (GSR)</h4>
                  <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                    {bioData?.skin_conductance?.status || "Elevated"}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Average Conductance</span>
                    <span className="font-bold text-slate-900">{bioData?.skin_conductance?.average_us || 2.8} µS</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Peak Conductance</span>
                    <span className="font-bold text-slate-900">{bioData?.skin_conductance?.peak_us || 5.1} µS</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Stress Response Markers</span>
                    <span className="font-bold text-orange-600">{bioData?.skin_conductance?.stress_events || 4} events</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  * Prototype electrodermal activity telemetry
                </div>
              </div>

              {/* Blood Oxygen & Respiratory Rate */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">SpO2 & Respiration</h4>
                  <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                    {bioData?.blood_oxygen?.status || "Normal"}
                  </span>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Average SpO2 Saturation</span>
                    <span className="font-bold text-slate-900">{bioData?.blood_oxygen?.average_spo2 || 98}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Minimum SpO2 Recorded</span>
                    <span className="font-bold text-slate-900">{bioData?.blood_oxygen?.min_spo2 || 96}%</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-600">Average Respiratory Rate</span>
                    <span className="font-bold text-slate-900">{bioData?.respiratory_rate?.average_bpm || 15} breaths/min</span>
                  </div>
                </div>
                <div className="text-[10px] text-slate-400 pt-1">
                  * Simulated pulse oximetry & respiratory rhythm
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. SETTINGS VIEW */}
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
                💡 Mann Sathi uses a double-modality distress score. It weights the acoustic and linguistic variables separately and links alerts to legal relief provisions.
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
