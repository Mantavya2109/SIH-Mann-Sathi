import { useState, useEffect } from "react";

interface Article {
  id: string;
  title: string;
  read_time: string;
  summary: string;
  content: string;
}

interface ResourceCategory {
  category: string;
  icon: string;
  description: string;
  articles: Article[];
}

interface QuickExercise {
  id: string;
  title: string;
  duration: string;
  type: string;
  tag: string;
  description: string;
  steps: { phase: string; seconds?: number; guidance: string }[];
}

interface Props {
  user: { id: string; name: string; email: string; role: string };
  initialExerciseId?: string | null;
}

export default function ResourcesTab({ user, initialExerciseId }: Props) {
  const [categories, setCategories] = useState<ResourceCategory[]>([]);
  const [quickExercises, setQuickExercises] = useState<QuickExercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null);
  const [activeExercise, setActiveExercise] = useState<QuickExercise | null>(null);

  // Interactive Breathing State
  const [breathingPhase, setBreathingPhase] = useState<number>(0);
  const [breathTimer, setBreathTimer] = useState<number>(4);
  const [breathingActive, setBreathingActive] = useState<boolean>(false);
  const [cycleCount, setCycleCount] = useState<number>(0);

  // Grounding Step Tracker
  const [groundingStep, setGroundingStep] = useState<number>(0);

  useEffect(() => {
    async function loadResources() {
      try {
        setLoading(true);
        const baseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
        const res = await fetch(`${baseUrl}/api/user/resources`);
        if (res.ok) {
          const data = await res.json();
          setCategories(data.categories || []);
          setQuickExercises(data.quick_exercises || []);

          if (initialExerciseId && data.quick_exercises) {
            const found = data.quick_exercises.find((e: QuickExercise) => e.id === initialExerciseId);
            if (found) {
              setActiveExercise(found);
            }
          }
        }
      } catch (err) {
        console.error("Failed to load resources:", err);
      } finally {
        setLoading(false);
      }
    }
    loadResources();
  }, [initialExerciseId]);

  // Box Breathing Interval
  useEffect(() => {
    let interval: any = null;
    if (breathingActive && activeExercise?.id === "ex-breathing") {
      interval = setInterval(() => {
        setBreathTimer((prev) => {
          if (prev <= 1) {
            setBreathingPhase((phase) => {
              const nextPhase = (phase + 1) % 4;
              if (nextPhase === 0) {
                setCycleCount((c) => c + 1);
              }
              return nextPhase;
            });
            return 4;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [breathingActive, activeExercise]);

  const boxBreathingPhases = [
    { name: "Inhale Slowly", desc: "Breathe in deeply through your nose", color: "bg-teal-500", ring: "ring-teal-200" },
    { name: "Hold Breath", desc: "Hold gently, keeping your chest open", color: "bg-blue-500", ring: "ring-blue-200" },
    { name: "Exhale Fully", desc: "Release breath smoothly through your mouth", color: "bg-indigo-500", ring: "ring-indigo-200" },
    { name: "Pause & Rest", desc: "Rest in stillness before the next breath", color: "bg-emerald-500", ring: "ring-emerald-200" },
  ];

  function startExercise(ex: QuickExercise) {
    setActiveExercise(ex);
    if (ex.id === "ex-breathing") {
      setBreathingPhase(0);
      setBreathTimer(4);
      setBreathingActive(true);
      setCycleCount(0);
    } else {
      setGroundingStep(0);
    }
  }

  function closeExerciseModal() {
    setActiveExercise(null);
    setBreathingActive(false);
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" style={{ background: "#f7f8fb" }}>
      <div className="p-8 max-w-5xl mx-auto w-full space-y-8">
        {/* Header */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-500" />
              <span className="text-xs font-semibold uppercase tracking-wider text-teal-700">
                Self-Help & Resilience Hub
              </span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
              Wellbeing & Self-Care Resources
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Practical guides and guided stress-management exercises based on structured mental health self-help principles.
            </p>
          </div>

          <div className="p-3 bg-teal-50/70 border border-teal-100 rounded-xl text-teal-900 text-xs flex items-center gap-2 self-start md:self-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
            <span>Evidence-informed wellbeing support</span>
          </div>
        </div>

        {/* QUICK EXERCISES SECTION */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
              Guided Quick Exercises
            </h2>
            <span className="text-xs text-slate-500">2–3 minute grounding & breathing practices</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {quickExercises.map((ex) => (
              <div
                key={ex.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between space-y-4 hover:border-teal-300 transition-all group"
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 border border-teal-100">
                      {ex.duration}
                    </span>
                    <span className="text-[11px] text-slate-400 font-medium">
                      {ex.type}
                    </span>
                  </div>

                  <h3 className="font-bold text-slate-900 text-base group-hover:text-[#0d9488] transition-colors" style={{ fontFamily: "Manrope, sans-serif" }}>
                    {ex.title}
                  </h3>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {ex.description}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-100">
                  <button
                    onClick={() => startExercise(ex)}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all shadow-xs flex items-center justify-center gap-2"
                  >
                    <span>Start Exercise</span>
                    <span>→</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* EDUCATIONAL CATEGORIES & ARTICLES */}
        <div className="space-y-6">
          <h2 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
            Self-Care & Psychoeducation Guides
          </h2>

          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm animate-pulse">
              Loading self-help guides...
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {categories.map((cat, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs space-y-4"
                >
                  <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                    <div>
                      <h3 className="font-bold text-slate-900 text-base" style={{ fontFamily: "Manrope, sans-serif" }}>
                        {cat.category}
                      </h3>
                      <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {cat.articles.map((art) => (
                      <div
                        key={art.id}
                        className="p-4 rounded-xl bg-slate-50 border border-slate-100 hover:border-slate-200 transition-all flex flex-col justify-between space-y-2"
                      >
                        <div>
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-800 text-sm">{art.title}</h4>
                            <span className="text-[10px] text-slate-400 font-medium">{art.read_time}</span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2 leading-relaxed">
                            {art.summary}
                          </p>
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => setSelectedArticle(art)}
                            className="text-xs font-semibold text-[#0d9488] hover:text-[#0f766e] flex items-center gap-1"
                          >
                            Read Guide →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ARTICLE READER MODAL */}
      {selectedArticle && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 border border-slate-200 shadow-xl space-y-4 max-h-[85vh] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between pb-2 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wide text-teal-600">
                  {selectedArticle.read_time}
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {selectedArticle.title}
                </h3>
              </div>

              <button
                onClick={() => setSelectedArticle(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {selectedArticle.content}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setSelectedArticle(null)}
                className="px-5 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Close Article
              </button>
            </div>
          </div>
        </div>
      )}

      {/* INTERACTIVE EXERCISE MODAL */}
      {activeExercise && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-8 border border-slate-200 shadow-2xl space-y-6 text-center animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="text-left">
                <span className="text-[10px] font-bold uppercase tracking-wide text-[#0d9488]">
                  {activeExercise.tag}
                </span>
                <h3 className="font-bold text-slate-900 text-lg mt-0.5" style={{ fontFamily: "Manrope, sans-serif" }}>
                  {activeExercise.title}
                </h3>
              </div>

              <button
                onClick={closeExerciseModal}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center text-sm font-bold transition-all"
              >
                ✕
              </button>
            </div>

            {/* BOX BREATHING PACER */}
            {activeExercise.id === "ex-breathing" ? (
              <div className="py-6 space-y-6 flex flex-col items-center">
                {/* Visual Breathing Orb */}
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <div
                    className={`absolute inset-0 rounded-full transition-all duration-1000 ${
                      breathingPhase === 0
                        ? "scale-110 bg-teal-100/80"
                        : breathingPhase === 1
                        ? "scale-110 bg-blue-100/80 animate-pulse"
                        : breathingPhase === 2
                        ? "scale-90 bg-indigo-100/80"
                        : "scale-90 bg-emerald-100/80"
                    }`}
                  />
                  <div
                    className={`w-32 h-32 rounded-full flex flex-col items-center justify-center text-white shadow-lg transition-all duration-1000 ${
                      boxBreathingPhases[breathingPhase].color
                    }`}
                  >
                    <span className="text-3xl font-black">{breathTimer}s</span>
                    <span className="text-[11px] font-semibold mt-1">
                      {boxBreathingPhases[breathingPhase].name}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {boxBreathingPhases[breathingPhase].desc}
                  </p>
                  <p className="text-xs text-slate-400">
                    Cycle count: <strong>{cycleCount}</strong> • Maintain steady, effortless breaths
                  </p>
                </div>

                <div className="flex items-center gap-3 w-full">
                  <button
                    onClick={() => setBreathingActive(!breathingActive)}
                    className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all"
                  >
                    {breathingActive ? "Pause Pacer" : "Resume Pacer"}
                  </button>
                  <button
                    onClick={closeExerciseModal}
                    className="flex-1 py-2.5 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 transition-all"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : activeExercise.id === "ex-grounding" ? (
              /* 5-4-3-2-1 GROUNDING TRACKER */
              <div className="py-4 space-y-5 text-left">
                <div className="p-4 bg-teal-50/60 rounded-2xl border border-teal-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-teal-800">
                      Step {groundingStep + 1} of {activeExercise.steps.length}
                    </span>
                    <span className="text-[10px] font-bold text-teal-600 uppercase">
                      {activeExercise.steps[groundingStep].phase}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-teal-950 font-medium leading-relaxed">
                    {activeExercise.steps[groundingStep].guidance}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    disabled={groundingStep === 0}
                    onClick={() => setGroundingStep((s) => Math.max(0, s - 1))}
                    className="py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 disabled:opacity-40 transition-all"
                  >
                    Previous
                  </button>

                  {groundingStep < activeExercise.steps.length - 1 ? (
                    <button
                      onClick={() => setGroundingStep((s) => s + 1)}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all"
                    >
                      Next Step →
                    </button>
                  ) : (
                    <button
                      onClick={closeExerciseModal}
                      className="flex-1 py-2.5 rounded-xl text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-all"
                    >
                      Complete Exercise ✓
                    </button>
                  )}
                </div>
              </div>
            ) : (
              /* SOMATIC RESET */
              <div className="py-4 space-y-4 text-left">
                <div className="space-y-3">
                  {activeExercise.steps.map((st, i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                      <strong className="text-xs text-slate-800">{st.phase}</strong>
                      <p className="text-xs text-slate-600">{st.guidance}</p>
                    </div>
                  ))}
                </div>

                <button
                  onClick={closeExerciseModal}
                  className="w-full py-2.5 rounded-xl text-xs font-bold text-white bg-[#0d9488] hover:bg-[#0f766e] transition-all"
                >
                  Finished Reset
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
