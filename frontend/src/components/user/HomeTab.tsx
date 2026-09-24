import { useState, useEffect } from "react";
import { FlowingWaves } from "../interactive/FlowingWaves";
import { BreathingWidget } from "../interactive/BreathingWidget";
import { getApiBaseUrl } from "../../utils/api";

interface ActivityData {
  steps_today: number;
  goal: number;
  progress_pct: number;
  distance_km: string;
  active_time: string;
  summary: string;
}

interface NearbyPlace {
  name: string;
  location_area: string;
  approx_distance: string;
  tag: string;
  description: string;
  map_query: string;
  google_maps_url: string;
}

interface SleepData {
  duration_formatted: string;
  label: string;
  bedtime: string;
  wake_time: string;
  time_range: string;
  quality: string;
}

interface HomeSnapshot {
  user_id: string;
  case_id: string;
  user_name: string;
  first_name: string;
  subtitle: string;
  activity: ActivityData;
  nearby_place: NearbyPlace;
  sleep: SleepData;
}

interface Props {
  user: { id: string; name: string; email: string; role: string };
  onNavigate: (tab: string) => void;
  onStartExercise?: (exerciseId: string) => void;
}

const fallbackSnapshot: HomeSnapshot = {
  user_id: "",
  case_id: "",
  user_name: "",
  first_name: "",
  subtitle: "Your daily wellness overview",
  activity: {
    steps_today: 0,
    goal: 6000,
    progress_pct: 0,
    distance_km: "0 km",
    active_time: "0 min",
    summary: "A short walk can be a gentle way to reset.",
  },
  nearby_place: {
    name: "A peaceful place nearby",
    location_area: "Your neighbourhood",
    approx_distance: "Nearby",
    tag: "Fresh air",
    description: "Take a short walk somewhere that feels comfortable and familiar.",
    map_query: "",
    google_maps_url: "https://www.google.com/maps",
  },
  sleep: {
    duration_formatted: "Not tracked",
    label: "Rest",
    bedtime: "--",
    wake_time: "--",
    time_range: "No sleep data yet",
    quality: "No data",
  },
};

export default function HomeTab({ user, onNavigate, onStartExercise }: Props) {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);

  useEffect(() => {
    async function loadSnapshot() {
      try {
        setLoading(true);
        const baseUrl = getApiBaseUrl();
        const res = await fetch(`${baseUrl}/api/user/${user.id}/home-snapshot`);
        if (res.ok) {
          const data = await res.json();
          setSnapshot(data);
        }
      } catch (err) {
        console.error("Failed to load home snapshot:", err);
      } finally {
        setLoading(false);
      }
    }
    loadSnapshot();
  }, [user.id]);

  const firstName = snapshot?.first_name || (user.name ? user.name.split(" ")[0] : "there");
  const homeData: HomeSnapshot = {
    ...fallbackSnapshot,
    ...snapshot,
    activity: { ...fallbackSnapshot.activity, ...(snapshot?.activity || {}) },
    nearby_place: { ...fallbackSnapshot.nearby_place, ...(snapshot?.nearby_place || {}) },
    sleep: { ...fallbackSnapshot.sleep, ...(snapshot?.sleep || {}) },
  };

  // Dynamic Time-of-Day Greeting
  const getGreeting = (name: string) => {
    const hour = new Date().getHours();
    if (hour < 12) return `Good morning, ${name} 🌅`;
    if (hour < 17) return `Good afternoon, ${name} ☀️`;
    return `Good evening, ${name} 👋`;
  };

  // Date context
  const todayDateFormatted = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-y-auto bg-transparent">
      <div className="p-4 sm:p-5 md:p-8 max-w-5xl mx-auto w-full space-y-5">
        {/* 1. WELCOME HEADER WITH DATE CONTEXT */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 pb-1">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {todayDateFormatted}
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
              <span className="text-xs font-semibold text-teal-700 bg-teal-50/80 px-2 py-0.5 rounded-full border border-teal-100/80">
                Daily Wellness
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
              {getGreeting(firstName)}
            </h1>
            <p className="text-slate-500 text-xs md:text-sm font-medium">
              Let's make today a good one.
            </p>
          </div>

          <div className="hidden sm:flex items-center gap-2 text-xs text-slate-500 bg-white px-3 py-1.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{loading ? "Syncing" : "Sync active"}</span>
          </div>
        </div>

        <div className="space-y-4">
            {/* 2-COLUMN RESPONSIVE GRID (ACTIVITY + SLEEP) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* CARD 1: TODAY'S ACTIVITY (STEPS) */}
              <div className="md:col-span-7 bg-white rounded-3xl p-5 border border-emerald-100/40 shadow-sm hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold transition-transform duration-200 hover:scale-110">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>
                      <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                        Today's Activity
                      </h2>
                    </div>

                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                      {homeData.activity.progress_pct}% of daily goal
                    </span>
                  </div>

                  <div className="pt-1 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                        {homeData.activity.steps_today.toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">steps</span>
                    </div>

                    <span className="text-xs text-slate-500 font-medium">
                      Goal: {homeData.activity.goal.toLocaleString()}
                    </span>
                  </div>

                  {/* Sleek Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, homeData.activity.progress_pct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Metric Chips */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Distance:</span>
                    <strong className="text-slate-800 font-bold">{homeData.activity.distance_km}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Active Time:</span>
                    <strong className="text-slate-800 font-bold">{homeData.activity.active_time}</strong>
                  </div>
                </div>
              </div>

              {/* CARD 2: SLEEP */}
              <div className="md:col-span-5 rounded-3xl bg-white shadow-sm border border-emerald-100/40 p-5 hover:-translate-y-1 hover:shadow-md transition-all duration-300 ease-out flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold transition-transform duration-200 hover:scale-110">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                      </div>
                      <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                        Sleep
                      </h2>
                    </div>

                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {homeData.sleep.quality}
                    </span>
                  </div>

                  <div className="pt-1 flex items-baseline gap-2">
                    <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                      {homeData.sleep.duration_formatted}
                    </span>
                    <span className="text-xs font-semibold text-slate-400">Last night</span>
                  </div>

                  {/* Sleep Timeline Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="w-[15%] h-full bg-slate-200" title="Asleep" />
                      <div className="w-[45%] h-full bg-indigo-500" title="Deep Restful Sleep" />
                      <div className="w-[28%] h-full bg-indigo-300" title="Light Sleep" />
                      <div className="w-[12%] h-full bg-slate-200" title="Awakening" />
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <span className="text-slate-400">Schedule</span>
                  <span className="font-semibold text-slate-800">{homeData.sleep.time_range}</span>
                </div>
              </div>
            </div>

            {/* CARD 3: A PLACE NEARBY (VISUAL FOCUS DESTINATION CARD) */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md">

              <FlowingWaves />

              {/* Subtle Background Pattern & Soft Glow */}
              <div className="absolute inset-0 opacity-15 pointer-events-none">
                <svg className="w-full h-full" viewBox="0 0 800 300" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M-50 150 C 150 50, 350 250, 550 100 C 750 -50, 950 180, 1050 150" stroke="white" strokeWidth="1.5" strokeDasharray="6 6" />
                  <path d="M-50 220 C 200 120, 400 280, 650 160 C 850 40, 950 240, 1050 200" stroke="white" strokeWidth="1" opacity="0.6" />
                  <circle cx="680" cy="80" r="140" fill="white" opacity="0.08" />
                  <circle cx="120" cy="220" r="90" fill="white" opacity="0.05" />
                </svg>
              </div>

              <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="space-y-2 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/15 backdrop-blur-xs flex items-center justify-center text-teal-300">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                    </span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-teal-300">
                      A Place Nearby
                    </span>
                    <span className="text-white/40">•</span>
                    <span className="text-xs font-semibold text-blue-200 bg-white/10 px-2 py-0.5 rounded-md backdrop-blur-xs">
                      {homeData.nearby_place.approx_distance}
                    </span>
                  </div>

                  <h3 className="text-lg md:text-xl font-extrabold text-white tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {homeData.nearby_place.name}
                  </h3>

                  <p className="text-xs text-blue-200 font-medium">
                    {homeData.nearby_place.location_area} • <span className="text-teal-300">{homeData.nearby_place.tag}</span>
                  </p>

                  <p className="text-xs sm:text-sm text-slate-200/90 leading-relaxed pt-1">
                    A nearby place for a short walk or some fresh air.
                  </p>
                </div>

                <div className="flex-shrink-0 self-start md:self-center">
                  <button
                    onClick={() => setShowLocationModal(true)}
                    className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-900 bg-white hover:bg-teal-50 active:scale-[0.98] transition-all shadow-sm flex items-center gap-2"
                  >
                    <span>Explore location</span>
                    <span className="text-teal-600 font-black">→</span>
                  </button>
                </div>
              </div>
            </div>

            {/* CARD 4: BREATHING WIDGET */}
            <BreathingWidget />

            {/* QUICK ACTIONS AND EXERCISES */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-3xl bg-white shadow-sm border border-emerald-100/40 p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                    Quick Actions
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Small steps for how you feel today.</p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => onNavigate("Chat")} className="rounded-2xl bg-teal-50 border border-teal-100 px-3 py-3 text-left text-xs font-bold text-teal-800 hover:bg-teal-100 transition-colors">
                    Talk to Sahaaya
                  </button>
                  <button onClick={() => onNavigate("Appointments")} className="rounded-2xl bg-emerald-50 border border-emerald-100 px-3 py-3 text-left text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition-colors">
                    View appointments
                  </button>
                </div>
              </div>

              <div className="rounded-3xl bg-white shadow-sm border border-emerald-100/40 p-5 space-y-4">
                <div>
                  <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                    Exercises
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">Guided practices that take a few minutes.</p>
                </div>
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-slate-50 border border-slate-100 p-3">
                  <div>
                    <p className="text-xs font-bold text-slate-800">Box breathing</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">2 minutes</p>
                  </div>
                  <button onClick={() => onStartExercise ? onStartExercise("ex-breathing") : onNavigate("Resources")} className="px-3 py-2 rounded-xl bg-teal-600 text-white text-[11px] font-bold hover:bg-teal-700 transition-colors">
                    Start
                  </button>
                </div>
              </div>
            </div>
          </div>
      </div>

      {/* LOCATION DETAILS MODAL */}
      {showLocationModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 border border-emerald-100/40 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wide">
                  Nearby Destination
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {homeData.nearby_place.name}
                </h3>
                <p className="text-xs text-slate-500">{homeData.nearby_place.location_area}</p>
              </div>

              <button
                onClick={() => setShowLocationModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Estimated Proximity</span>
                  <strong className="text-teal-700 font-bold">{homeData.nearby_place.approx_distance}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Highlight</span>
                  <strong className="text-slate-800">{homeData.nearby_place.tag}</strong>
                </div>
              </div>

              <p className="text-slate-600 text-sm leading-relaxed p-1">
                {homeData.nearby_place.description}
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 py-2.5 rounded-2xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Close
              </button>
              <a
                href={homeData.nearby_place.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 rounded-2xl text-xs font-bold text-white bg-[#18181B] hover:bg-slate-800 transition-all text-center flex items-center justify-center gap-1.5 shadow-xs"
              >
                <span>Open in Maps</span>
                <span>→</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
