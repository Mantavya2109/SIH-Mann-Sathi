import { useState, useEffect } from "react";

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

export default function HomeTab({ user, onNavigate, onStartExercise }: Props) {
  const [snapshot, setSnapshot] = useState<HomeSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [showLocationModal, setShowLocationModal] = useState(false);

  useEffect(() => {
    async function loadSnapshot() {
      try {
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
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
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
      <div className="p-5 md:p-8 max-w-5xl mx-auto w-full space-y-5">
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
            <span>Sync active</span>
          </div>
        </div>

        {loading ? (
          <div className="py-20 text-center text-slate-400 text-sm animate-pulse space-y-3">
            <div className="w-8 h-8 mx-auto rounded-full border-2 border-teal-500 border-t-transparent animate-spin" />
            <p>Loading your daily view...</p>
          </div>
        ) : snapshot ? (
          <div className="space-y-4">
            {/* 2-COLUMN RESPONSIVE GRID (ACTIVITY + SLEEP) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* CARD 1: TODAY'S ACTIVITY (STEPS) */}
              <div className="md:col-span-7 bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-teal-200 transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center font-bold">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      </div>
                      <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                        Today's Activity
                      </h2>
                    </div>

                    <span className="text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full border border-teal-100">
                      {snapshot.activity.progress_pct}% of daily goal
                    </span>
                  </div>

                  <div className="pt-1 flex items-baseline justify-between">
                    <div className="flex items-baseline gap-2">
                      <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                        {snapshot.activity.steps_today.toLocaleString()}
                      </span>
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">steps</span>
                    </div>

                    <span className="text-xs text-slate-500 font-medium">
                      Goal: {snapshot.activity.goal.toLocaleString()}
                    </span>
                  </div>

                  {/* Sleek Progress Bar */}
                  <div className="space-y-1">
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, snapshot.activity.progress_pct)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Metric Chips */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Distance:</span>
                    <strong className="text-slate-800 font-bold">{snapshot.activity.distance_km}</strong>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-400 font-medium">Active Time:</span>
                    <strong className="text-slate-800 font-bold">{snapshot.activity.active_time}</strong>
                  </div>
                </div>
              </div>

              {/* CARD 2: SLEEP */}
              <div className="md:col-span-5 bg-gradient-to-br from-white via-white to-indigo-50/30 rounded-2xl p-5 border border-slate-200/80 shadow-xs hover:border-indigo-200 transition-all flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                        </svg>
                      </div>
                      <h2 className="font-bold text-slate-900 text-sm md:text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                        Sleep
                      </h2>
                    </div>

                    <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                      {snapshot.sleep.quality}
                    </span>
                  </div>

                  <div className="pt-1 flex items-baseline gap-2">
                    <span className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                      {snapshot.sleep.duration_formatted}
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
                  <span className="font-semibold text-slate-800">{snapshot.sleep.time_range}</span>
                </div>
              </div>
            </div>

            {/* CARD 3: A PLACE NEARBY (VISUAL FOCUS DESTINATION CARD) */}
            <div className="relative overflow-hidden bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 rounded-2xl p-6 text-white shadow-md">
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
                      {snapshot.nearby_place.approx_distance}
                    </span>
                  </div>

                  <h3 className="text-lg md:text-xl font-extrabold text-white tracking-tight" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {snapshot.nearby_place.name}
                  </h3>

                  <p className="text-xs text-blue-200 font-medium">
                    {snapshot.nearby_place.location_area} • <span className="text-teal-300">{snapshot.nearby_place.tag}</span>
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

            {/* CARD 4: SMALL WELLBEING MICRO-CARD */}
            <div className="bg-white rounded-2xl p-4 md:p-5 border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center flex-shrink-0">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 21.593c-5.63-5.539-11-10.297-11-14.402C1 3.534 4.068 2 6.999 2 9.03 2 10.999 3 12 5c1.001-2 2.87-3 5.001-3 2.93 0 5.999 1.534 5.999 5.191 0 4.105-5.37 8.863-11 14.402z"/>
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm" style={{ fontFamily: "Manrope, sans-serif" }}>
                    A little pause
                  </h4>
                  <p className="text-xs text-slate-500">
                    Take 2 minutes to step away, breathe, and reset.
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  if (onStartExercise) {
                    onStartExercise("ex-breathing");
                  } else {
                    onNavigate("Resources");
                  }
                }}
                className="px-4 py-2 rounded-xl text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 hover:bg-emerald-100 transition-all flex items-center gap-1.5 self-start sm:self-center"
              >
                <span>Start exercise</span>
                <span>→</span>
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* LOCATION DETAILS MODAL */}
      {showLocationModal && snapshot?.nearby_place && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 border border-slate-200 shadow-xl space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold text-teal-600 uppercase tracking-wide">
                  Nearby Destination
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {snapshot.nearby_place.name}
                </h3>
                <p className="text-xs text-slate-500">{snapshot.nearby_place.location_area}</p>
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
                  <strong className="text-teal-700 font-bold">{snapshot.nearby_place.approx_distance}</strong>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 font-medium">Highlight</span>
                  <strong className="text-slate-800">{snapshot.nearby_place.tag}</strong>
                </div>
              </div>

              <p className="text-slate-600 text-sm leading-relaxed p-1">
                {snapshot.nearby_place.description}
              </p>
            </div>

            <div className="pt-2 flex items-center gap-2">
              <button
                onClick={() => setShowLocationModal(false)}
                className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Close
              </button>
              <a
                href={snapshot.nearby_place.google_maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all text-center flex items-center justify-center gap-1.5 shadow-xs"
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
