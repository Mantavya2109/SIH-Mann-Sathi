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
import { StagedAIInsight } from "../components/interactive/StagedAIInsight";
import { animate, motion } from "framer-motion";
import "./counsellor-theme.css";
import GhostFibers from "../components/interactive/GhostFibers";
import { getApiBaseUrl } from "../utils/api";

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
  priority_reason?: string;
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
  const [selectedHistoryDate, setSelectedHistoryDate] = useState<string | null>(null);
  // Bump this to force case details to re-fetch after a Sync (so Today/Yesterday recalculates)
  const [caseDetailsRefreshKey, setCaseDetailsRefreshKey] = useState(0);

  // Biosignal Prototype State
  const [bioData, setBioData] = useState<any>(null);
  const [holisticData, setHolisticData] = useState<any>(null);
  const [bioSyncLoading, setBioSyncLoading] = useState(false);

  // Wearable Monitoring State (real ThingSpeak-backed device, wearable_bridge.py)
  const [wearableData, setWearableData] = useState<any>(null);
  const [wearableLoading, setWearableLoading] = useState(false);

  // Location Telemetry State
  const [locationData, setLocationData] = useState<any>(null);
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const navItems = ["Dashboard", "Cases", "Analytics", "Alerts", "Biosignal Analysis", "Location", "Settings"];

  const getApiUrl = (path: string) => {
    const baseUrl = getApiBaseUrl();
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

  // Fetch Wearable Monitoring analysis for the currently-viewed case
  async function fetchWearableAnalysis(caseId: string) {
    try {
      setWearableLoading(true);
      const res = await fetch(getApiUrl(`/api/wearable/analysis/${caseId}`));
      if (res.ok) {
        const d = await res.json();
        setWearableData(d);
      } else {
        setWearableData(null);
      }
    } catch (err) {
      console.error("Failed to load wearable analysis for case:", caseId, err);
      setWearableData(null);
    } finally {
      setWearableLoading(false);
    }
  }

  useEffect(() => {
    if (selectedCaseId) {
      fetchWearableAnalysis(selectedCaseId);
    } else {
      setWearableData(null);
    }
  }, [selectedCaseId, caseDetailsRefreshKey]);

  // Auto-poll wearable analysis while the Biosignal Analysis or Dashboard tab is open, so the
  // Heart Rate / SpO2 tiles pick up each new ThingSpeak reading (e.g. a finger
  // placed back on the sensor) on their own, without a manual "Simulate Sync" click.
  useEffect(() => {
    if (!selectedCaseId || (activeNav !== "Biosignal Analysis" && activeNav !== "Dashboard")) return;
    const pollInterval = setInterval(() => {
      fetchWearableAnalysis(selectedCaseId);
    }, 15000); // matches the ESP32's ~15s ThingSpeak upload cadence
    return () => clearInterval(pollInterval);
  }, [selectedCaseId, activeNav]);

  useEffect(() => {
    // Clear details immediately during case transition to avoid stale state mixing
    setSelectedCaseDetails(null);
    setSelectedHistoryDate(null);
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

  // The physical wearable device only exists for one seeded case (Rohan / Case 2).
  // Every other case has no hardware behind it, so the Biosignal Analysis tiles
  // must not show fabricated numbers for them.
  const isRohanCase2 = !!(
    selectedCase?.nhaa_ref &&
    selectedCase.nhaa_ref.toUpperCase().includes("ROHAN") &&
    selectedCase.nhaa_ref.toUpperCase().includes("CASE-2")
  );

  // Live wearable readings for the Biosignal Analysis tiles (Heart Rate / Blood Oxygen only —
  // Sleep and Skin Conductance have no real sensor and stay demo/prototype, and only for
  // Rohan Case 2 — the only case with hardware attached).
  const liveHeartRate = isRohanCase2 && wearableData?.status === "active" && wearableData?.current_reading?.heart_rate != null
    ? wearableData.current_reading.heart_rate
    : null;
  const liveSpo2 = isRohanCase2 && wearableData?.status === "active" && wearableData?.current_reading?.spo2 != null
    ? wearableData.current_reading.spo2
    : null;
  const heartRateStatusLabel = liveHeartRate == null ? null :
    liveHeartRate < 60 ? "Low" : liveHeartRate <= 100 ? "Normal" : "Elevated";
  const spo2StatusLabel = liveSpo2 == null ? null :
    liveSpo2 >= 95 ? "Normal" : liveSpo2 >= 90 ? "Low" : "Critical";

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

  // The four physiological tiles (Heart Rate & SpO2 live from the wearable,
  // Sleep & Skin Conductance demo). Used in the Dashboard's three-column layout
  // and, on their own, in the Biosignal Analysis tab.
  const physioTiles = (
    <>
    {/* Heart Rate — live wearable (GET /api/wearable/analysis/{case_id}) */}
    <SignalTile
      label="Heart Rate"
      value={liveHeartRate != null ? `${Math.round(liveHeartRate)} BPM` : "—"}
      status={liveHeartRate != null ? heartRateStatusLabel : null}
      statusClass="text-slate-600"
      sub={liveHeartRate != null ? undefined : isRohanCase2 ? "No live reading yet" : "No device data"}
      badge={liveHeartRate != null ? "live" : undefined}
      muted={liveHeartRate == null}
    />
    {/* Blood Oxygen — live wearable (same endpoint) */}
    <SignalTile
      label="Blood Oxygen"
      value={liveSpo2 != null ? `${Math.round(liveSpo2)}% SpO2` : "—"}
      status={liveSpo2 != null ? spo2StatusLabel : null}
      statusClass="text-teal-700"
      sub={liveSpo2 != null ? undefined : isRohanCase2 ? "No live reading yet" : "No device data"}
      badge={liveSpo2 != null ? "live" : undefined}
      muted={liveSpo2 == null}
    />
    {/* Sleep — demo/prototype data, Rohan Case 2 only */}
    <SignalTile
      label="Sleep"
      value={isRohanCase2 ? (bioData?.sleep?.duration_formatted || "6h 42m") : "—"}
      status={isRohanCase2 ? (holisticData?.signals?.sleep_quality || "Moderate") : null}
      statusClass="text-purple-700"
      sub={isRohanCase2 ? undefined : "No device data"}
      badge={isRohanCase2 ? "demo" : undefined}
      muted={!isRohanCase2}
    />
    {/* Skin Conductance — demo/prototype data, Rohan Case 2 only */}
    <SignalTile
      label="Skin Conductance"
      value={isRohanCase2 ? `${bioData?.skin_conductance?.average_us || 2.8} µS` : "—"}
      status={isRohanCase2 ? (holisticData?.signals?.skin_conductance_status || "Elevated") : null}
      statusClass="text-orange-600"
      sub={isRohanCase2 ? undefined : "No device data"}
      badge={isRohanCase2 ? "demo" : undefined}
      muted={!isRohanCase2}
    />
    </>
  );

  // Three-column signal layout, shown on the Dashboard (selected case) and in Biosignal Analysis:
  // left = conversational signals · centre = fusion score (focal point) · right = physiological.
  // On narrow screens it stacks centre → left → right so the fusion score is never buried.
  const caseSignalsGrid = (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-stretch">
      {/* LEFT — conversational signals */}
      <div className="order-2 lg:order-1 flex flex-col gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 px-1">Conversational signals</div>
        <SignalTile label="Text Analysis" value={holisticData?.signals?.text_score || "40%"} sub="Linguistic" />
        <SignalTile label="Voice Analysis" value={holisticData?.signals?.voice_score || "59%"} sub="Acoustic" />
        <div className="flex-1 p-4 bg-slate-50 border border-slate-100 rounded-xl">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Recent check-in</div>
            {latestTurn?.timestamp && (
              <div className="text-[10px] text-slate-400">{formatRelativeTimeIST(latestTurn.timestamp)}</div>
            )}
          </div>
          {latestTurn?.transcript ? (
            <>
              <p className="mt-2 text-xs text-slate-700 leading-relaxed italic line-clamp-4">"{latestTurn.transcript}"</p>
              <div className="mt-2 flex items-center gap-2 text-[10px] font-semibold">
                <span className="px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600">
                  {latestTurn.internal_analysis?.voice_emotions != null ? "Voice" : "Text"} check-in
                </span>
                {latestTurn.distress_score != null && (
                  <span className="text-slate-500">Distress {Math.round(Number(latestTurn.distress_score) * 100)}%</span>
                )}
              </div>
            </>
          ) : (
            <p className="mt-2 text-xs text-slate-400 italic">No check-ins recorded for this case yet.</p>
          )}
        </div>
      </div>

      {/* CENTRE — fusion score, the visual anchor */}
      <div className="order-1 lg:order-2">
        <FusionScorePanel
          score={holisticData?.signals?.fusion_score || "52%"}
          tier={holisticData?.signals?.risk_tier || "MODERATE"}
          trend={holisticData?.trend || "Improving"}
        />
      </div>

      {/* RIGHT — physiological / wearable signals */}
      <div className="order-3 flex flex-col gap-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 px-1">Physiological signals</div>
        {physioTiles}
      </div>
    </div>
  );

  return (
    <div className="ms-dash min-h-screen flex flex-col relative" style={{ fontFamily: "Inter, sans-serif" }}>
      {/* Animated GhostFibers background (fixed behind everything) */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
        <GhostFibers
          lineColor="#0A2A1F"
          glowColor="#1E8A5E"
          speed={0.2}
          scale={2}
          rotation={0}
          rotationSpeed={0.25}
          layers={4}
          waveAmplitude={0.015}
          waveFrequency={3}
          waveSpeed={0.15}
          layerSpeed={0.08}
          twist={0.1}
          twistFrequency={5}
          twistSpeed={1.2}
          lineFrequency={5}
          lineSpacing={2}
          lineSharpness={16}
          glowFalloff={10}
          glowIntensity={1.6}
          brightness={2}
          blueBoost={1}
          vignette={0.8}
          grain={0.05}
          dpr={1}
          lightMode={false}
          fps={60}
          paused={false}
        />
      </div>

      {/* TOP HEADER */}
      <header
        className="flex items-center justify-between px-6 py-3.5"
        style={{
          background: "rgba(5, 7, 13, 0.72)",
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          position: "sticky",
          top: 0,
          zIndex: 40,
        }}
      >
        <div className="flex items-center gap-8">
          {/* Wordmark — same typography as the landing page */}
          <div className="leading-none select-none">
            <div className="text-[22px] font-extrabold text-white tracking-[-0.02em]">
              Mann <span className="bg-gradient-to-r from-[#d1fae5] via-[#6ee7b7] to-[#10b981] bg-clip-text text-transparent">Saathi</span>
            </div>
            <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.26em] text-[#6ee7b7]/80">Counsellor Portal</div>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => (
              <button
                key={item}
                onClick={() => setActiveNav(item)}
                className={`relative px-3.5 py-2 rounded-full text-[13px] font-medium transition-colors ${
                  activeNav === item ? "text-white" : "text-[#9aa5b5] hover:text-white"
                }`}
                style={{ fontFamily: "Inter, sans-serif" }}
              >
                {activeNav === item && (
                  <motion.span
                    layoutId="ms-nav-pill"
                    className="absolute inset-0 rounded-full border border-emerald-300/30 bg-emerald-400/10"
                    transition={{ type: "spring", stiffness: 380, damping: 32 }}
                  />
                )}
                <span className="relative">{item}</span>
                {item === "Alerts" && activeAlerts.length > 0 && (
                  <span className="relative ml-1.5 px-1.5 py-0.5 rounded-full bg-red-500 text-white text-[10px] font-bold">
                    {activeAlerts.length}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="hidden lg:flex items-center gap-2 h-9 px-3.5 rounded-full border border-white/10 bg-white/[0.04] text-[12px] text-[#c9d2de]">
            <span className="relative flex w-2 h-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping" />
              <span className="relative w-2 h-2 rounded-full bg-emerald-400" />
            </span>
            Live Monitor Active
          </div>
          <button
            onClick={onLogout}
            className="flex items-center gap-2 h-9 px-4 rounded-full text-[13px] font-medium transition-colors text-[#fca5a5] border border-red-400/20 bg-red-500/[0.06] hover:bg-red-500/15 hover:text-white"
            style={{ fontFamily: "Inter, sans-serif" }}
          >
            Logout ({user.name})
          </button>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main key={activeNav} className="relative z-10 flex-1 px-4 sm:px-6 py-8 max-w-7xl mx-auto w-full space-y-6">
        {/* WELCOME — Dashboard tab only */}
        {activeNav === "Dashboard" && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#6ee7b7]">
              Case overview · {new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" })}
            </p>
            <h1 className="mt-2 text-[34px] sm:text-[42px] font-extrabold leading-[1.08] tracking-[-0.025em] text-white">
              Welcome, <span className="bg-gradient-to-r from-[#d1fae5] via-[#6ee7b7] to-[#34d399] bg-clip-text text-transparent">{user.name}</span>
            </h1>
            <p className="text-sm text-[#64748b] mt-2">Counsellor / Case Officer — authorised access only</p>
          </div>
        )}

        {/* Backend status — shown on every tab */}
        {error && (
          <div className="px-4 py-2 rounded-xl bg-red-50 border border-red-200 text-red-600 text-xs font-semibold w-fit">
            ⚠️ {error}
          </div>
        )}

        {/* 1. DASHBOARD NAVIGATION TABS VIEW */}
        {activeNav === "Dashboard" && (
          <>
            {/* KPI STATS CARDS */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Assigned Cases", value: activeCasesCount, accent: "#86efac", icon: "users" as const },
                { label: "High / Severe Risk", value: highRiskCount, accent: "#f87171", icon: "siren" as const },
                { label: "Moderate Risk", value: moderateRiskCount, accent: "#fbbf24", icon: "alert" as const },
                { label: "Active Alerts", value: activeAlerts.length, accent: "#2dd4bf", icon: "bell" as const },
              ].map((card, i) => (
                <KpiCard key={card.label} {...card} index={i} />
              ))}
            </div>

            {/* Selected case — three-column signal overview */}
            {selectedCaseId && (
              <div className="rounded-3xl p-5 sm:p-6 border border-emerald-100/40 bg-white shadow-sm space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                      Case Signal Overview{selectedCase?.user?.name ? ` — ${selectedCase.user.name}` : ""}
                    </h3>
                    <p className="text-xs text-[#64748b]">Conversational signals · fusion score · physiological signals</p>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto">
                    <select
                      value={selectedCaseId || ""}
                      onChange={(e) => setSelectedCaseId(e.target.value)}
                      aria-label="Select case"
                      className="px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-800 outline-none focus:border-teal-500"
                    >
                      {cases.map((c) => (
                        <option key={c.case_id} value={c.case_id}>
                          {c.user?.name} ({c.nhaa_ref})
                        </option>
                      ))}
                    </select>
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 whitespace-nowrap">
                      Sleep & EDA: Demo
                    </span>
                  </div>
                </div>
                {caseSignalsGrid}
              </div>
            )}

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

                <div className="rounded-3xl overflow-hidden border border-emerald-100/40 hover:shadow-sm transition-all duration-300" style={{ background: "var(--ms-card)" }}>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-[#f8fafc]" style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
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
                              style={{ borderBottom: "1px solid rgba(255,255,255,0.06)" }}
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
                              <span className={`px-2 py-0.5 rounded-full text-xs font-bold flex items-center gap-1.5 w-max ${
                                c.priority_level === "CRITICAL" ? "bg-red-100 text-red-700 border border-red-200" :
                                c.priority_level === "HIGH" ? "bg-orange-100 text-orange-700 border border-orange-200" :
                                c.priority_level === "MEDIUM" ? "bg-amber-100 text-amber-700 border border-amber-200" : "bg-green-100 text-green-700 border border-green-200"
                              }`}>
                                {(c.priority_level === "CRITICAL" || c.priority_level === "HIGH") && (
                                  <span className="w-2 h-2 rounded-full bg-red-600 animate-ping" />
                                )}
                                <span>{c.priority_level || c.risk_tier}</span>
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
                {/* STAGED AI INSIGHT COMPONENT */}
                <StagedAIInsight
                  key={selectedCaseId || "none"}
                  insightText={
                    selectedCase?.priority_reason 
                      ? `Triage Note: ${selectedCase.priority_reason}`
                      : selectedCaseDetails?.summary?.explanation_text || "Patient demonstrates consistent biosignal stabilization post-session."
                  }
                  distressScore={selectedCase && Number.isFinite(Number(selectedCase.latest_distress_score)) ? Math.round(Number(selectedCase.latest_distress_score) / 10) : undefined}
                />
              </div>
            </div>

            {/* Dynamic Today vs Yesterday & Modality assessment breakdown */}
            {dailyBreakdown ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Today vs Yesterday Card */}
                <div className="rounded-3xl p-5 border border-emerald-100/40 bg-white shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out">
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
                <div className="rounded-3xl p-5 border border-emerald-100/40 bg-white shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out space-y-4">
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
            <div className="rounded-3xl p-6 border border-emerald-100/40 hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out" style={{ background: "var(--ms-card)" }}>
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
                        <stop offset="5%" stopColor="#5eead4" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#5eead4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9aa5b5" }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#9aa5b5" }} />
                    <Tooltip contentStyle={{ background: "#0f1420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#eef2f7" }} />
                    <ReferenceLine y={85} stroke="#ef4444" strokeDasharray="3 3" label={{ value: "Severe Distress", fill: "#ef4444", fontSize: 10 }} />
                    <Area type="monotone" dataKey="distress" stroke="#5eead4" strokeWidth={2} fill="url(#chartGrad)" />
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
                          <div className="font-bold text-lg text-slate-800">{selectedCaseDetails.summary?.total_check_ins ?? history.length} turns</div>
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

                    {/* Wearable Monitoring Card */}
                    <div className="rounded-2xl p-6 border border-slate-200 bg-white space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>Wearable Monitoring</h3>
                          <p className="text-xs text-[#64748b]">Live status from the connected wearable device</p>
                        </div>
                        {wearableData?.status && (
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold border ${
                            wearableData.status === "active" ? "bg-green-100 text-green-700 border-green-200" :
                            wearableData.status === "not_responding" ? "bg-amber-100 text-amber-700 border-amber-300" :
                            "bg-slate-100 text-slate-500 border-slate-200"
                          }`}>
                            {wearableData.status === "active" ? "ACTIVE" : wearableData.status === "not_responding" ? "NOT RESPONDING" : "NO DATA"}
                          </span>
                        )}
                      </div>

                      {wearableLoading && !wearableData ? (
                        <div className="text-xs text-slate-500 italic">Loading wearable status...</div>
                      ) : !wearableData || wearableData.status === "no_data" ? (
                        <div className="text-xs text-slate-500 italic">No wearable device data for this case yet.</div>
                      ) : wearableData.status === "not_responding" ? (
                        <div className="p-4 bg-amber-50 border border-amber-300 rounded-xl flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0 text-amber-700 font-bold mt-0.5">
                            ⚠️
                          </div>
                          <div className="text-xs text-amber-900 leading-relaxed">
                            <span className="font-bold">
                              No wearable data in {wearableData.minutes_since_last_reading != null ? Math.round(wearableData.minutes_since_last_reading) : "30+"} minutes
                            </span>
                            {" "}— device may be offline or removed. A counsellor should check in directly.
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-center">
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                              <div className="text-[10px] text-slate-500 font-bold uppercase">Heart Rate</div>
                              <div className="font-extrabold text-slate-800 text-sm mt-1">
                                {wearableData.current_reading?.heart_rate != null ? `${Math.round(wearableData.current_reading.heart_rate)} bpm` : "—"}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                              <div className="text-[10px] text-slate-500 font-bold uppercase">SpO2</div>
                              <div className="font-extrabold text-slate-800 text-sm mt-1">
                                {wearableData.current_reading?.spo2 != null ? `${Math.round(wearableData.current_reading.spo2)}%` : "—"}
                              </div>
                            </div>
                            <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl">
                              <div className="text-[10px] text-slate-500 font-bold uppercase">Temperature</div>
                              <div className="font-extrabold text-slate-800 text-sm mt-1">
                                {wearableData.current_reading?.body_temperature != null ? `${Number(wearableData.current_reading.body_temperature).toFixed(1)}°C` : "—"}
                              </div>
                            </div>
                          </div>
                          {wearableData.analysis_text && (
                            <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-xl border border-slate-100">
                              {wearableData.analysis_text}
                            </p>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Mental Status Progress Overview */}
                    {dailyBreakdown && (
                      <div className="flex items-center justify-between border-t border-slate-200 pt-4 pb-1">
                        <div>
                          <h3 className="font-bold text-slate-900 text-sm">Mental Status Progress Overview</h3>
                          <p className="text-xs text-[#64748b]">Day-over-day distress evaluation (IST)</p>
                        </div>
                        <div className={`px-2.5 py-1 rounded-lg text-xs font-bold ${
                          dailyBreakdown.changeStatus === "WORSENING" ? "bg-red-100 text-red-700 border border-red-200" :
                          dailyBreakdown.changeStatus === "IMPROVING" ? "bg-green-100 text-green-700 border-green-200" :
                          "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}>
                          Trend: {dailyBreakdown.changeStatus.replace("_", " ")}
                        </div>
                      </div>
                    )}

                    {/* Conversation History & Day/Date Selection Bar */}
                    {(() => {
                      const allTurns: any[] = selectedCaseDetails.history || [];

                      // 1. Group turns by IST date key ("YYYY-MM-DD")
                      const turnsByDate: Record<string, any[]> = {};
                      for (const turn of allTurns) {
                        const dKey = getISTDateKey(turn.timestamp || turn.timestamp_unix);
                        if (dKey) {
                          if (!turnsByDate[dKey]) {
                            turnsByDate[dKey] = [];
                          }
                          turnsByDate[dKey].push(turn);
                        }
                      }

                      // 2. Sorted unique date keys descending (latest date first)
                      const availableDateKeys = Object.keys(turnsByDate).sort((a, b) => b.localeCompare(a));

                      // 3. Default to most recent available date if selectedHistoryDate is null or invalid
                      const activeDateKey = selectedHistoryDate === "ALL"
                        ? "ALL"
                        : (selectedHistoryDate && availableDateKeys.includes(selectedHistoryDate))
                        ? selectedHistoryDate
                        : (availableDateKeys[0] || null);

                      // 4. Filter turns for active selection
                      const turnsForActiveDate = activeDateKey === "ALL"
                        ? allTurns
                        : (activeDateKey ? (turnsByDate[activeDateKey] || []) : []);

                      // 5. Order: Latest message first (at the top), followed by older messages
                      const sortedTurns = [...turnsForActiveDate].sort((a, b) => {
                        const tA = parseToDate(a.timestamp || a.timestamp_unix)?.getTime() || 0;
                        const tB = parseToDate(b.timestamp || b.timestamp_unix)?.getTime() || 0;
                        return tB - tA; // Latest first
                      });

                      const now = new Date();
                      const todayISTKey = getISTDateKey(now);
                      const yesterdayISTKey = getISTDateKey(new Date(now.getTime() - 86400000));

                      let activeDateDisplayLabel = "All Recorded History";
                      if (activeDateKey && activeDateKey !== "ALL") {
                        const sampleTurn = turnsByDate[activeDateKey]?.[0];
                        const sampleDate = parseToDate(sampleTurn?.timestamp || sampleTurn?.timestamp_unix);
                        const dateFormatted = sampleDate ? formatISTDate(sampleDate) : activeDateKey;
                        if (activeDateKey === todayISTKey) {
                          activeDateDisplayLabel = `Today (${dateFormatted})`;
                        } else if (activeDateKey === yesterdayISTKey) {
                          activeDateDisplayLabel = `Yesterday (${dateFormatted})`;
                        } else {
                          activeDateDisplayLabel = dateFormatted;
                        }
                      }

                      return (
                        <div className="space-y-4 border-t border-slate-200 pt-5">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                                Conversation History
                              </h3>
                              <p className="text-xs text-[#64748b] mt-0.5">
                                Select a date to view check-in messages (latest message at top)
                              </p>
                            </div>
                            {availableDateKeys.length > 0 && (
                              <span className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg self-start sm:self-auto">
                                Showing {sortedTurns.length} turn{sortedTurns.length !== 1 ? "s" : ""} from <strong className="text-slate-900">{activeDateDisplayLabel}</strong>
                              </span>
                            )}
                          </div>

                          {/* Horizontal Day/Date Selection Bar */}
                          {availableDateKeys.length > 0 ? (
                            <div className="flex items-center gap-2 overflow-x-auto pb-2 pt-1">
                              {availableDateKeys.map((dKey) => {
                                const isSelected = activeDateKey === dKey;
                                const turnsList = turnsByDate[dKey] || [];
                                const sampleTurn = turnsList[0];
                                const sampleDate = parseToDate(sampleTurn?.timestamp || sampleTurn?.timestamp_unix);
                                const dateFormatted = sampleDate ? formatISTDate(sampleDate) : dKey;

                                let pillTitle = dateFormatted;
                                if (dKey === todayISTKey) {
                                  pillTitle = `Today (${dateFormatted})`;
                                } else if (dKey === yesterdayISTKey) {
                                  pillTitle = `Yesterday (${dateFormatted})`;
                                }

                                return (
                                  <button
                                    key={dKey}
                                    onClick={() => setSelectedHistoryDate(dKey)}
                                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs transition-all flex-shrink-0 border cursor-pointer ${
                                      isSelected
                                        ? "bg-teal-600 text-white border-teal-600 shadow-xs font-bold"
                                        : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200 font-medium"
                                    }`}
                                    style={{ fontFamily: "Manrope, sans-serif" }}
                                  >
                                    <span className="flex items-center gap-1.5">
                                      <svg
                                        width="13"
                                        height="13"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        className={isSelected ? "text-teal-100" : "text-slate-400"}
                                      >
                                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                        <line x1="16" y1="2" x2="16" y2="6" />
                                        <line x1="8" y1="2" x2="8" y2="6" />
                                        <line x1="3" y1="10" x2="21" y2="10" />
                                      </svg>
                                      <span>{pillTitle}</span>
                                    </span>
                                    <span
                                      className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                        isSelected
                                          ? "bg-teal-700 text-white"
                                          : "bg-slate-100 text-slate-600"
                                      }`}
                                    >
                                      {turnsList.length}
                                    </span>
                                  </button>
                                );
                              })}

                              {/* All Dates option if multiple dates exist */}
                              {availableDateKeys.length > 1 && (
                                <button
                                  onClick={() => setSelectedHistoryDate("ALL")}
                                  className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs transition-all flex-shrink-0 border cursor-pointer ${
                                    activeDateKey === "ALL"
                                      ? "bg-teal-600 text-white border-teal-600 shadow-xs font-bold"
                                      : "bg-white text-slate-700 hover:bg-slate-50 border-slate-200 font-medium"
                                  }`}
                                  style={{ fontFamily: "Manrope, sans-serif" }}
                                >
                                  <span>All Dates</span>
                                  <span
                                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                                      activeDateKey === "ALL"
                                        ? "bg-teal-700 text-white"
                                        : "bg-slate-100 text-slate-600"
                                    }`}
                                  >
                                    {allTurns.length}
                                  </span>
                                </button>
                              )}
                            </div>
                          ) : null}

                          {/* Filtered Turns List (Latest First) */}
                          {sortedTurns.length > 0 ? (
                            <div className="space-y-4">
                              {sortedTurns.map((turn: any) => renderHistoryTurn(turn))}
                            </div>
                          ) : (
                            <div className="text-sm text-[#64748b] text-center p-8 bg-white border border-dashed rounded-2xl">
                              {allTurns.length === 0
                                ? "No check-in conversations recorded for this case."
                                : "No check-in messages found on the selected date."}
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
          <div className="rounded-2xl p-6 border border-[#e2e8f0]" style={{ background: "var(--ms-card)" }}>
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
                    <h4 className="font-black text-red-600 text-xl">{(() => {
                      const raw = selectedCaseDetails?.summary?.current_distress_score;
                      const pct = Number.isFinite(Number(raw)) && raw !== null ? Number(raw) * 100 : Number(selectedCase?.latest_distress_score);
                      return Number.isFinite(pct) ? `${Math.round(pct * 10) / 10}%` : "—";
                    })()}</h4>
                  </div>
                </div>

                <div className="h-[280px]">
                  {chartData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="day" tick={{ fontSize: 10, fill: "#9aa5b5" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#9aa5b5" }} />
                        <Tooltip contentStyle={{ background: "#0f1420", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, color: "#eef2f7" }} />
                        <Area type="monotone" dataKey="distress" stroke="#5eead4" fill="rgba(94,234,212,0.12)" />
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
                  <h2 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>Biosignal Telemetry</h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-purple-100 text-purple-700 border border-purple-200">
                    Prototype / Demo Integration
                  </span>
                </div>
                <p className="text-xs text-[#64748b] mt-0.5">Continuous physiological signal monitoring from the wearable device</p>
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
                  onClick={() => {
                    if (!selectedCaseId) return;
                    syncBiosignals(selectedCaseId); // demo tiles: Sleep, Skin Conductance (unchanged)
                    fetchWearableAnalysis(selectedCaseId); // real tiles: Heart Rate, SpO2
                  }}
                  disabled={bioSyncLoading || wearableLoading || !selectedCaseId}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal-50 text-teal-700 border border-teal-200 hover:bg-teal-100 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className={(bioSyncLoading || wearableLoading) ? "animate-spin" : ""}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l6.23-1.19"/>
                  </svg>
                  {(bioSyncLoading || wearableLoading) ? "Syncing..." : "Simulate Sync"}
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
                    <span className={`w-2 h-2 rounded-full animate-pulse ${
                      liveHeartRate != null || liveSpo2 != null ? "bg-green-500" : isRohanCase2 ? "bg-amber-400" : "bg-slate-300"
                    }`} />
                    <span className={`font-bold text-xs ${
                      liveHeartRate != null || liveSpo2 != null ? "text-green-700" : isRohanCase2 ? "text-amber-700" : "text-slate-400"
                    }`}>
                      {liveHeartRate != null || liveSpo2 != null
                        ? "Heart Rate & SpO2: Live sensor data · Sleep & EDA: Demo data"
                        : isRohanCase2
                        ? "Awaiting live wearable reading · Sleep & EDA: Demo data"
                        : "No device connected for this case"}
                    </span>
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
                  {isRohanCase2 ? (
                    <p className="text-red-800 leading-relaxed">
                      <strong>Biosignal Context:</strong> Sleep duration reduced ({bioData?.sleep?.duration_formatted || "6h 42m"}), elevated skin conductance ({bioData?.skin_conductance?.average_us || 2.8} µS) with {bioData?.skin_conductance?.stress_events || 4} physiological response markers.
                    </p>
                  ) : (
                    <p className="text-red-800 leading-relaxed">
                      <strong>Biosignal Context:</strong> No wearable device is attached to this case, so there are no physiological readings for this alert.
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* SECTION: PHYSIOLOGICAL SIGNALS (biosignals only — no text/voice/fusion here) */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
                <div>
                  <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>Physiological Signals</h3>
                  <p className="text-xs text-[#64748b]">Wearable readings for this case</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-green-50 text-green-700 border border-green-200">
                    Heart Rate & SpO2: Live
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[10px] font-semibold bg-purple-50 text-purple-700 border border-purple-200">
                    Sleep & Skin Conductance: Demo
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {physioTiles}
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

              {isRohanCase2 ? (
                <>
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
                </>
              ) : (
                <div className="p-6 text-center text-xs text-slate-400 italic bg-slate-50 border border-slate-100 rounded-xl">
                  No device data — this case has no wearable attached.
                </div>
              )}
            </div>

            {/* SECTION: HEART RATE, SKIN CONDUCTANCE, SPO2 GRID */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Heart Rate Analysis */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">Heart Rate (PPG)</h4>
                  {liveHeartRate != null ? (
                    <span className="text-[10px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded border border-green-200">
                      ● Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {isRohanCase2 ? "No live reading" : "No device"}
                    </span>
                  )}
                </div>
                {liveHeartRate != null ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Current Heart Rate</span>
                      <span className="font-bold text-slate-900">{Math.round(liveHeartRate)} BPM</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Status</span>
                      <span className="font-bold text-slate-900">{heartRateStatusLabel}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">
                    {isRohanCase2 ? "Wearable has not reported a heart rate reading recently." : "No wearable device attached to this case."}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 pt-1">
                  {liveHeartRate != null ? "Live ThingSpeak-backed wearable reading" : "* No sensor data available"}
                </div>
              </div>

              {/* Skin Conductance */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">Skin Conductance (GSR)</h4>
                  {isRohanCase2 ? (
                    <span className="text-[10px] font-bold text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                      {bioData?.skin_conductance?.status || "Elevated"}
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      No device
                    </span>
                  )}
                </div>
                {isRohanCase2 ? (
                  <>
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
                      * Prototype electrodermal activity telemetry (Demo)
                    </div>
                  </>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">No wearable device attached to this case.</div>
                )}
              </div>

              {/* Blood Oxygen & Respiratory Rate */}
              <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <h4 className="font-bold text-slate-900 text-sm">SpO2 & Respiration</h4>
                  {liveSpo2 != null ? (
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                      ● Live
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {isRohanCase2 ? "No live reading" : "No device"}
                    </span>
                  )}
                </div>
                {liveSpo2 != null ? (
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Current SpO2 Saturation</span>
                      <span className="font-bold text-slate-900">{Math.round(liveSpo2)}%</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-600">Status</span>
                      <span className="font-bold text-slate-900">{spo2StatusLabel}</span>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-slate-400 italic py-2">
                    {isRohanCase2 ? "Wearable has not reported an SpO2 reading recently." : "No wearable device attached to this case."}
                  </div>
                )}
                <div className="text-[10px] text-slate-400 pt-1">
                  {liveSpo2 != null ? "Live ThingSpeak-backed wearable reading" : "* No sensor data available"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 6. LOCATION VIEW */}
        {activeNav === "Location" && (
          <div className="space-y-6">
            {/* Header & Case Selector */}
            <div
              className="p-6 rounded-2xl border border-[#e2e8f0] bg-white flex flex-col md:flex-row md:items-center justify-between gap-4"
              style={{ boxShadow: "0 1px 3px rgba(0,0,0,0.04)" }}
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </div>
                  <h2 className="font-bold text-slate-900 text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
                    Live Victim Geolocation & Telemetry
                  </h2>
                </div>
                <p className="text-xs text-[#64748b] mt-1">
                  Hardware GPS telemetry for victims in active critical distress triage (&gt; 60% distress threshold)
                </p>
              </div>

              {/* Case Selection Dropdown */}
              <div className="flex items-center gap-3">
                <label className="text-xs font-semibold text-slate-600 whitespace-nowrap">Select Case:</label>
                <select
                  value={selectedCaseId || ""}
                  onChange={(e) => setSelectedCaseId(e.target.value)}
                  className="px-3.5 py-2 rounded-xl text-sm font-medium border border-slate-200 bg-slate-50 text-slate-800 outline-none focus:border-teal-500 transition-colors"
                  style={{ fontFamily: "Manrope, sans-serif" }}
                >
                  {cases.map((c) => {
                    const patientName = c.user?.name || (c.nhaa_ref.includes("ROHAN") ? "Rohan" : c.nhaa_ref.includes("ANANYA") ? "Ananya Patel" : "Patient");
                    const caseNum = c.nhaa_ref.includes("CASE-1") ? "Case 1" : c.nhaa_ref.includes("CASE-2") ? "Case 2" : c.nhaa_ref;
                    return (
                      <option key={c.case_id} value={c.case_id}>
                        {patientName} — {caseNum} ({c.latest_distress_score.toFixed(1)}% Distress {c.latest_distress_score > 60 ? "🚨 Critical" : "🔒 Non-Critical"})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Quick Case Selection Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cases.map((c) => {
                const isSelected = selectedCaseId === c.case_id;
                const patientName = c.user?.name || (c.nhaa_ref.includes("ROHAN") ? "Rohan" : c.nhaa_ref.includes("ANANYA") ? "Ananya Patel" : "Patient");
                const caseLabel = c.nhaa_ref.includes("CASE-1") ? `${patientName} — Case 1` : c.nhaa_ref.includes("CASE-2") ? `${patientName} — Case 2` : `${patientName} (${c.nhaa_ref})`;
                const isCritical = c.latest_distress_score > 60;

                return (
                  <button
                    key={c.case_id}
                    onClick={() => setSelectedCaseId(c.case_id)}
                    className="p-4 rounded-2xl text-left transition-all border flex flex-col justify-between"
                    style={{
                      background: isSelected ? "rgba(45,212,191,0.08)" : "var(--ms-card)",
                      borderColor: isSelected ? "rgba(94,234,212,0.6)" : "rgba(255,255,255,0.08)",
                      boxShadow: isSelected ? "0 0 0 3px rgba(94,234,212,0.12)" : "none"
                    }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
                          {caseLabel}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">{c.nhaa_ref}</p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          isCritical
                            ? "bg-red-100 text-red-700 border border-red-200 animate-pulse"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {isCritical ? "Critical (> 60%)" : "Locked (≤ 60%)"}
                      </span>
                    </div>

                    <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] text-slate-500 block">Distress Score</span>
                        <span className={`text-base font-bold ${isCritical ? "text-red-600" : "text-teal-600"}`}>
                          {c.latest_distress_score.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-500 block">Location Status</span>
                        <span className={`text-xs font-semibold ${isCritical ? "text-teal-700" : "text-slate-400"}`}>
                          {isCritical ? "📍 Coordinates Active" : "🔒 Privacy Locked"}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Current Selected Case Location Display */}
            {(() => {
              const currentCase = cases.find(c => c.case_id === selectedCaseId) || cases[0];
              if (!currentCase) {
                return (
                  <div className="p-12 text-center text-slate-500 bg-white rounded-2xl border border-slate-200">
                    No case selected.
                  </div>
                );
              }

              const isCritical = currentCase.latest_distress_score > 60;
              const isRohan = currentCase.nhaa_ref.includes("ROHAN") || currentCase.user?.name === "Rohan";
              const isAnanya = currentCase.nhaa_ref.includes("ANANYA") || currentCase.user?.name?.includes("Ananya");
              
              const patientName = currentCase.user?.name || (isRohan ? "Rohan" : isAnanya ? "Ananya Patel" : "Patient");
              const caseLabel = currentCase.nhaa_ref.includes("CASE-1") && isRohan
                ? "Rohan / Case 1"
                : currentCase.nhaa_ref.includes("CASE-2") && isRohan
                ? "Rohan / Case 2"
                : isRohan
                ? "Rohan"
                : isAnanya
                ? "Ananya Patel / Case 1"
                : patientName;

              // NON-CRITICAL (Distress <= 60): Show Protected View
              if (!isCritical) {
                return (
                  <div className="p-10 rounded-2xl border border-slate-200 bg-white text-center space-y-4 shadow-sm">
                    <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center mx-auto border border-slate-200">
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                      </svg>
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                      <h3 className="text-lg font-bold text-slate-800" style={{ fontFamily: "Manrope, sans-serif" }}>
                        Location unavailable — case is not currently critical.
                      </h3>
                      <p className="text-xs text-slate-500 leading-relaxed">
                        Per victim privacy safeguards and trauma-informed protocols, hardware GPS telemetry is gated and automatically unlocks only when a patient's canonical distress score reaches critical triage levels (<strong>&gt; 60%</strong>).
                      </p>
                    </div>

                    <div className="inline-flex items-center gap-6 px-6 py-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
                      <div>
                        <span className="text-slate-400 block text-[10px]">Selected Case</span>
                        <span className="font-semibold text-slate-900">{caseLabel}</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200" />
                      <div>
                        <span className="text-slate-400 block text-[10px]">Current Distress</span>
                        <span className="font-bold text-slate-900">{currentCase.latest_distress_score.toFixed(1)}%</span>
                      </div>
                      <div className="w-px h-6 bg-slate-200" />
                      <div>
                        <span className="text-slate-400 block text-[10px]">Unlock Threshold</span>
                        <span className="font-semibold text-red-600">&gt; 60.0%</span>
                      </div>
                    </div>
                  </div>
                );
              }

              // CRITICAL (Distress > 60): Show Live Map & Hardware Telemetry
              const coords = isRohan
                ? {
                    lat: 16.4971,
                    lon: 80.4992,
                    place: "VIT-AP University, Amaravati, Andhra Pradesh",
                    address: "VIT-AP University Campus, Beside AP Secretariat, Inavolu, Amaravati, Andhra Pradesh 522237, India",
                    landmark: "Academic Block / Central Courtyard",
                    minLon: 80.4850,
                    minLat: 16.4880,
                    maxLon: 80.5130,
                    maxLat: 16.5060,
                    deviceId: "MANN-IOT-GPS-082"
                  }
                : {
                    lat: 17.6868,
                    lon: 83.2185,
                    place: "Visakhapatnam, Andhra Pradesh",
                    address: "Siripuram / Beach Road Zone, Visakhapatnam, Andhra Pradesh 530003, India",
                    landmark: "Siripuram Junction / RK Beach Corridor",
                    minLon: 83.2000,
                    minLat: 17.6750,
                    maxLon: 83.2370,
                    maxLat: 17.6980,
                    deviceId: "MANN-IOT-GPS-104"
                  };

              const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${coords.minLon}%2C${coords.minLat}%2C${coords.maxLon}%2C${coords.maxLat}&layer=mapnik&marker=${coords.lat}%2C${coords.lon}`;

              return (
                <div className="space-y-6">
                  {/* Critical Status Banner */}
                  <div className="p-4 rounded-2xl bg-red-50 border border-red-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-red-800">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
                      <div>
                        <p className="text-sm font-bold" style={{ fontFamily: "Manrope, sans-serif" }}>
                          🚨 Critical Distress Triage Active: {caseLabel} ({currentCase.latest_distress_score.toFixed(1)}%)
                        </p>
                        <p className="text-xs text-red-600">
                          Hardware GPS telemetry unlocked for emergency welfare and first-responder triage.
                        </p>
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold bg-red-200/80 px-2.5 py-1 rounded-lg text-red-900 border border-red-300">
                      Live Telemetry Stream
                    </span>
                  </div>

                  {/* Main Map & HUD Grid */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Map Box (2 Cols) */}
                    <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm flex flex-col">
                      {/* Map Controls Bar */}
                      <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
                          <span className="text-xs font-mono font-bold tracking-wide text-teal-300 uppercase">
                            GPS Fix: {coords.lat.toFixed(4)}° N, {coords.lon.toFixed(4)}° E
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          Target: <strong className="text-white">{caseLabel}</strong>
                        </div>
                      </div>

                      {/* Large Map Frame */}
                      <div className="relative w-full h-[460px] bg-slate-100">
                        <iframe
                          title="Victim Geolocation Map"
                          src={osmEmbedUrl}
                          className="w-full h-full border-0"
                          loading="lazy"
                        />

                        {/* Top-Left HUD Overlay */}
                        <div className="absolute top-4 left-4 bg-slate-900/90 backdrop-blur-md text-white p-3.5 rounded-xl border border-slate-700 shadow-xl max-w-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-ping" />
                            <span className="text-[11px] font-bold text-teal-300 tracking-wide uppercase">Live IoT Beacon</span>
                          </div>
                          <p className="text-xs font-semibold text-white leading-snug">{coords.place}</p>
                          <p className="text-[10px] text-slate-300 font-mono">{coords.landmark}</p>
                          <p className="text-[10px] text-teal-400 font-mono font-bold pt-0.5">Target: {caseLabel}</p>
                        </div>

                        {/* Bottom-Right Watermark */}
                        <div className="absolute bottom-3 right-3 bg-amber-500/90 backdrop-blur-sm text-slate-950 font-bold px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider shadow">
                          ⚠️ Simulated Hardware Telemetry (Demo)
                        </div>
                      </div>

                      {/* Map Footer Info */}
                      <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Address:</span>
                          <span className="font-medium text-slate-800">{coords.address}</span>
                        </div>
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lon}`}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 text-teal-600 font-semibold hover:underline"
                        >
                          Open in Google Maps ↗
                        </a>
                      </div>
                    </div>

                    {/* Hardware Telemetry & Quick Action Sidebar (1 Col) */}
                    <div className="space-y-4">
                      {/* Telemetry Status Card */}
                      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-4 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Manrope, sans-serif" }}>
                          Wearable Hardware Diagnostics
                        </h4>

                        <div className="space-y-3 text-xs">
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-slate-500">Hardware Beacon ID</span>
                            <span className="font-mono font-bold text-slate-800">{coords.deviceId}</span>
                          </div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-slate-500">GPS Accuracy</span>
                            <span className="font-semibold text-teal-700">± 3.8 meters (High Fix)</span>
                          </div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-slate-500">Battery Level</span>
                            <span className="font-semibold text-slate-800">🔋 82% (Nominal)</span>
                          </div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-slate-500">Cellular Signal</span>
                            <span className="font-semibold text-slate-800">📶 -68 dBm (4G LTE-M)</span>
                          </div>
                          <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                            <span className="text-slate-500">Altitude</span>
                            <span className="font-semibold text-slate-800">24.5 m ASL</span>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-slate-500">Telemetry Source</span>
                            <span className="font-semibold text-slate-800">Simulated IoT Beacon</span>
                          </div>
                        </div>
                      </div>

                      {/* Emergency Responder Actions */}
                      <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3 shadow-sm">
                        <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider" style={{ fontFamily: "Manrope, sans-serif" }}>
                          Emergency Dispatch Protocols
                        </h4>

                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(`${coords.lat}, ${coords.lon}`);
                            alert(`GPS Coordinates copied to clipboard: ${coords.lat}, ${coords.lon}`);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-semibold text-xs transition-colors flex items-center justify-center gap-2"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                          </svg>
                          Copy Exact GPS Coordinates
                        </button>

                        <button
                          onClick={() => {
                            alert(`First-Responder Alert dispatched for ${caseLabel} at ${coords.place}. Coordinate packet: ${coords.lat}, ${coords.lon}`);
                          }}
                          className="w-full py-2.5 px-3 rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm"
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          Notify Local Nodal Support / 112
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {/* 7. SETTINGS VIEW */}
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
                  value={getApiBaseUrl() || "Same Origin (/api)"}
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

/* ------------------------------------------------------------------ */
/*  Biosignal view helpers                                             */
/* ------------------------------------------------------------------ */

/** Compact side-column tile (label · optional status · value · live/demo badge). */
function SignalTile({
  label,
  value,
  sub,
  status,
  statusClass = "text-slate-600",
  badge,
  muted = false,
}: {
  label: string;
  value: string;
  sub?: string;
  status?: string | null;
  statusClass?: string;
  badge?: "live" | "demo";
  muted?: boolean;
}) {
  return (
    <div className="p-3.5 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-between gap-3">
      <div className="min-w-0">
        <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">{label}</div>
        {status && <div className={`font-bold text-xs mt-0.5 ${statusClass}`}>{status}</div>}
        {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
      </div>
      <div className="text-right shrink-0">
        <div className={`font-extrabold text-lg sm:text-xl tracking-tight ${muted ? "text-slate-300" : "text-slate-800"}`}>{value}</div>
        {badge === "live" && <div className="text-[9px] font-bold uppercase text-green-600">● Live</div>}
        {badge === "demo" && <div className="text-[9px] font-bold uppercase text-slate-400">Demo</div>}
      </div>
    </div>
  );
}

const TIER_STYLES: Record<string, { ring: string; text: string; chip: string }> = {
  SEVERE: { ring: "#dc2626", text: "text-red-700", chip: "bg-red-100 text-red-700 border-red-200" },
  CRITICAL: { ring: "#dc2626", text: "text-red-700", chip: "bg-red-100 text-red-700 border-red-200" },
  HIGH: { ring: "#ea580c", text: "text-orange-700", chip: "bg-orange-100 text-orange-700 border-orange-200" },
  MODERATE: { ring: "#d97706", text: "text-amber-700", chip: "bg-amber-100 text-amber-700 border-amber-200" },
  LOW: { ring: "#0d9488", text: "text-teal-700", chip: "bg-teal-100 text-teal-700 border-teal-200" },
};

/** Large circular fusion-score gauge with distress tier and trend underneath. */
function FusionScorePanel({ score, tier, trend }: { score: string | number; tier: string; trend: string }) {
  const pct = Math.max(0, Math.min(100, parseFloat(String(score)) || 0));
  const tierKey = String(tier).toUpperCase();
  const style = TIER_STYLES[tierKey] || TIER_STYLES.MODERATE;
  const t = String(trend).toLowerCase();
  const trendView = t.includes("wors") || t.includes("ris")
    ? { arrow: "↑", cls: "bg-red-50 text-red-700 border-red-200" }
    : t.includes("improv") || t.includes("fall")
    ? { arrow: "↓", cls: "bg-green-50 text-green-700 border-green-200" }
    : { arrow: "→", cls: "bg-slate-100 text-slate-700 border-slate-200" };

  // SVG ring: 270° arc (open at the bottom) reads as a gauge rather than a pie.
  const size = 240;
  const stroke = 18;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const arc = circumference * 0.75;
  const filled = arc * (pct / 100);

  return (
    <div className="h-full rounded-2xl border border-teal-100 bg-gradient-to-b from-teal-50/70 to-white p-6 flex flex-col items-center justify-center text-center">
      <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-700">Fusion Score</div>
      <div className="relative mt-3 w-[200px] h-[200px] sm:w-[240px] sm:h-[240px]">
        <svg viewBox={`0 0 ${size} ${size}`} className="w-full h-full -rotate-[225deg]">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${arc} ${circumference}`} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={style.ring} strokeWidth={stroke}
            strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`}
            style={{ transition: "stroke-dasharray 900ms ease-out, stroke 300ms" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <div className={`font-extrabold tracking-tight leading-none text-[56px] sm:text-[64px] ${style.text}`} style={{ fontFamily: "Manrope, sans-serif" }}>
            {Math.round(pct)}<span className="text-2xl align-top">%</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500">combined distress</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
        <span className={`px-3 py-1 rounded-full text-xs font-extrabold tracking-wider border ${style.chip}`}>{tierKey}</span>
        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${trendView.cls}`}>
          {trendView.arrow} {trend}
        </span>
      </div>
      <p className="mt-3 text-[11px] text-slate-400 max-w-[260px]">Text + voice + biosignal channels fused into one distress index</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  KPI card — dark glass, accent edge, count-up number                */
/* ------------------------------------------------------------------ */

const KPI_ICONS = {
  users: <path strokeLinecap="round" strokeLinejoin="round" d="M17 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1M10 11a4 4 0 100-8 4 4 0 000 8zM21 20v-1a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />,
  siren: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2M5.6 5.6l1.4 1.4M18.4 5.6L17 7M6 17v-4a6 6 0 1112 0v4M4 17h16v3H4z" />,
  alert: <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />,
  bell: <path strokeLinecap="round" strokeLinejoin="round" d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />,
};

function KpiCard({ label, value, accent, icon, index }: { label: string; value: number; accent: string; icon: keyof typeof KPI_ICONS; index: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const controls = animate(0, value, {
      duration: 1.2,
      delay: 0.15 + index * 0.08,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => setShown(Math.round(v)),
    });
    return () => controls.stop();
  }, [value, index]);

  return (
    <motion.div
      whileHover={{ y: -4 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className="ms-shimmer rounded-3xl border border-white/10 p-5 cursor-default"
      style={{ background: `linear-gradient(160deg, ${accent}14, rgba(14,19,31,0.78) 55%)` }}
    >
      <div className="flex items-start justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#9aa5b5]">{label}</p>
        <span className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${accent}1f`, color: accent }}>
          <svg className="w-[18px] h-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            {KPI_ICONS[icon]}
          </svg>
        </span>
      </div>
      <p className="mt-3 text-[40px] font-extrabold leading-none tracking-[-0.03em] tabular-nums" style={{ color: accent }}>
        {shown}
      </p>
    </motion.div>
  );
}

