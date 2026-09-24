import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Biosignal Device — how to pair and use the Sahaaya wearable.
 *
 * The hardware (wearable_health.ino) is an ESP32 health monitor with a
 * MAX30105 heart-rate / SpO2 sensor, a DS18B20 temperature probe, an
 * MPU6050 motion sensor for fall detection, a small OLED screen and a
 * buzzer. It joins Wi-Fi on its own and uploads a reading every 15 seconds,
 * which the counsellor dashboard picks up.
 *
 * The pairing flow on this screen is a DEMO (clearly labelled): the victim
 * portal has no read-only endpoint for the live device yet. The only live
 * endpoint (/api/wearable/analysis/{case_id}) also writes readings and
 * "not responding" alerts, so it is deliberately not called from here.
 */

interface Props {
  onNavigate: (tab: string) => void;
}

type Phase = "idle" | "searching" | "found" | "waiting" | "connected";

const PHASE_TEXT: Record<Exclude<Phase, "idle" | "connected">, string> = {
  searching: "Looking for your wearable on Wi-Fi…",
  found: "Found Sahaaya Biosignal Prototype",
  waiting: "Waiting for the first reading…",
};

const SYNC_SECONDS = 15;

export default function DeviceTab({ onNavigate }: Props) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [secondsSinceSync, setSecondsSinceSync] = useState(0);
  const timers = useRef<number[]>([]);

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // "Last synced" counter — resets every 15 s like the real device's upload cycle.
  useEffect(() => {
    if (phase !== "connected") return;
    setSecondsSinceSync(0);
    const id = window.setInterval(() => setSecondsSinceSync((s) => (s + 1) % SYNC_SECONDS), 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  const connect = () => {
    clearTimers();
    setPhase("searching");
    timers.current.push(
      window.setTimeout(() => setPhase("found"), 1400),
      window.setTimeout(() => setPhase("waiting"), 2400),
      window.setTimeout(() => setPhase("connected"), 3800),
    );
  };

  const disconnect = () => {
    clearTimers();
    setPhase("idle");
  };

  const busy = phase === "searching" || phase === "found" || phase === "waiting";
  const connected = phase === "connected";

  // Which setup step is "current" (steps before it show as done).
  const currentStep = connected ? 4 : phase === "waiting" ? 2 : busy ? 1 : 0;

  return (
    <div className="flex-1 min-h-0 flex flex-col min-w-0 overflow-y-auto">
      {/* Header */}
      <div className="vic-bar flex items-center justify-between gap-3 px-4 sm:px-6 py-3 sm:py-4 border-b">
        <div className="min-w-0">
          <h1 className="font-bold text-[#0f172a] text-lg" style={{ fontFamily: "Manrope, sans-serif" }}>
            Biosignal Device
          </h1>
          <p className="hidden sm:block text-xs text-[#64748b]">Connect your Sahaaya wearable so your care team can see how your body is doing</p>
        </div>
        <button
          onClick={() => onNavigate("Chat")}
          className="shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-semibold text-[#0d9488] bg-[#f0fdfa] border border-[#99f6e4] hover:bg-teal-100 transition-all whitespace-nowrap"
        >
          ← Back to Chat
        </button>
      </div>

      <div className="p-4 sm:p-6 md:p-8 max-w-4xl mx-auto w-full space-y-5">
        {/* ---------------- Connection card ---------------- */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-100/60 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div
              className={`relative w-20 h-20 shrink-0 rounded-3xl flex items-center justify-center transition-colors duration-300 ${
                connected ? "bg-emerald-50 text-emerald-600" : busy ? "bg-teal-50 text-teal-600" : "bg-slate-100 text-slate-400"
              }`}
            >
              {busy && <span className="absolute inset-0 rounded-3xl border-2 border-teal-300 animate-ping opacity-40" />}
              <WearableIcon />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
                  Sahaaya Biosignal Prototype
                </h2>
                <StatusPill phase={phase} />
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
                  Demo pairing
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                {connected
                  ? "Your wearable is connected. Readings are sent to your care team every 15 seconds."
                  : busy
                    ? PHASE_TEXT[phase as keyof typeof PHASE_TEXT]
                    : "Switch on your wearable, then tap Connect. It joins Wi-Fi on its own — no Bluetooth pairing needed."}
              </p>
            </div>

            <div className="sm:self-center">
              {connected ? (
                <button
                  onClick={disconnect}
                  className="w-full sm:w-auto px-5 py-3 rounded-2xl text-sm font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 transition-all"
                >
                  Disconnect
                </button>
              ) : (
                <button
                  onClick={connect}
                  disabled={busy}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl text-sm font-bold bg-[#18181B] text-white hover:bg-slate-800 active:scale-[0.98] transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy && <span className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                  {busy ? "Connecting…" : "Connect device"}
                </button>
              )}
            </div>
          </div>

          {connected && (
            <div className="mt-6 pt-5 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <InfoTile label="Connection" value="Wi-Fi" />
              <InfoTile label="Sends a reading" value="Every 15 s" />
              <InfoTile label="Last reading" value={secondsSinceSync === 0 ? "Just now" : `${secondsSinceSync}s ago`} />
              <InfoTile label="Shared with" value="Your care team" />
            </div>
          )}
        </section>

        {/* ---------------- How to connect ---------------- */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-100/60 shadow-sm">
          <SectionTitle title="How to connect" subtitle="Takes about a minute the first time" />
          <ol className="mt-5 space-y-4">
            {[
              {
                title: "Switch on the wearable",
                body: 'The small screen lights up and shows "HEALTH MONITOR — Place Finger".',
              },
              {
                title: "Let it join Wi-Fi",
                body: "It connects to the Wi-Fi network your care team set up. Keep it near the router or phone hotspot.",
              },
              {
                title: "Rest your fingertip on the sensor",
                body: "Cover the small light fully and keep still for about 10 seconds until your heart rate appears on the screen.",
              },
              {
                title: "Keep it on",
                body: "That's it — it sends a reading every 15 seconds. You can carry on with your day.",
              },
            ].map((step, i) => {
              const done = i < currentStep;
              const active = i === currentStep && !connected;
              return (
                <li key={step.title} className="flex gap-4">
                  <span
                    className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                      done
                        ? "bg-emerald-500 text-white"
                        : active
                          ? "bg-teal-50 text-teal-700 ring-2 ring-teal-300"
                          : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {done ? (
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      i + 1
                    )}
                  </span>
                  <div className="pt-1">
                    <p className="text-sm font-bold text-slate-900">{step.title}</p>
                    <p className="text-[13px] text-slate-600 leading-relaxed">{step.body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </section>

        {/* ---------------- What it measures ---------------- */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-100/60 shadow-sm">
          <SectionTitle title="What your wearable measures" subtitle="Only what's needed to understand how you're doing" />
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <MeasureCard
              tone="rose"
              title="Heart rate"
              body="Beats per minute from your fingertip. A racing heart can be a sign of stress."
              sensor="Optical pulse sensor"
              icon={<path d="M12 21s-7-4.5-9.5-9A5.5 5.5 0 0112 5.5 5.5 5.5 0 0121.5 12C19 16.5 12 21 12 21z" />}
            />
            <MeasureCard
              tone="sky"
              title="Blood oxygen (SpO₂)"
              body="How much oxygen your blood is carrying. Healthy levels are usually 95% or above."
              sensor="Same fingertip sensor"
              icon={<path d="M12 3s6 6.5 6 11a6 6 0 01-12 0c0-4.5 6-11 6-11z" />}
            />
            <MeasureCard
              tone="amber"
              title="Body temperature"
              body="A small probe checks your skin temperature in °C."
              sensor="Temperature probe"
              icon={<path d="M14 14.76V4a2 2 0 10-4 0v10.76a4 4 0 104 0z" />}
            />
            <MeasureCard
              tone="violet"
              title="Movement & falls"
              body="Notices a sudden fall so your care team can check you're alright."
              sensor="Motion sensor"
              icon={<path d="M13 4a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM9 21l2-6 3 2v4M7 12l3-4 4 1 3 3" />}
            />
          </div>
        </section>

        {/* ---------------- Alerts on the device ---------------- */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-100/60 shadow-sm">
          <SectionTitle title="If your wearable beeps" subtitle="What the sounds and messages mean" />
          <div className="mt-5 space-y-3">
            <AlertRow
              badge="2 beeps"
              badgeTone="amber"
              screen="STRESS HIGH — ALERT!"
              body="Your readings suggest you're under strain. Pause, breathe slowly, and talk to the companion if it helps."
              action={{ label: "Open chat", onClick: () => onNavigate("Chat") }}
            />
            <AlertRow
              badge="Beep"
              badgeTone="rose"
              screen="FALL DETECTED — CHECK PERSON!"
              body="The motion sensor noticed a sudden fall. The fall is included in the next reading sent to your care team."
            />
          </div>
        </section>

        {/* ---------------- Troubleshooting ---------------- */}
        <section className="bg-white rounded-3xl p-5 sm:p-7 border border-emerald-100/60 shadow-sm">
          <SectionTitle title="Having trouble?" />
          <div className="mt-4 divide-y divide-slate-100">
            <Faq q='The screen shows "--" instead of my heart rate'>
              Your fingertip isn't fully covering the sensor. Press gently so the light is covered, keep your hand still, and wait
              about 10 seconds. Cold fingers can make it slower — warm your hands first.
            </Faq>
            <Faq q="It won't connect to Wi-Fi">
              Switch the wearable off and on again close to your router or hotspot. The Wi-Fi name and password are set up by your
              care team — ask them if your network has changed.
            </Faq>
            <Faq q="My readings aren't updating">
              The wearable sends a reading every 15 seconds while it's switched on and connected. If nothing changes for a few
              minutes, restart it. Your care team is told if the device stops reporting for a long time.
            </Faq>
          </div>
        </section>

        <p className="flex items-start gap-2 px-1 pb-4 text-xs text-slate-500">
          <svg className="w-4 h-4 shrink-0 text-emerald-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          Your readings are used only to support your care and are visible to your assigned care team.
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function StatusPill({ phase }: { phase: Phase }) {
  const map: Record<Phase, [string, string, string]> = {
    idle: ["Not connected", "bg-slate-100 text-slate-600 border-slate-200", "bg-slate-400"],
    searching: ["Searching", "bg-teal-50 text-teal-700 border-teal-200", "bg-teal-500 animate-pulse"],
    found: ["Found", "bg-teal-50 text-teal-700 border-teal-200", "bg-teal-500 animate-pulse"],
    waiting: ["Connecting", "bg-teal-50 text-teal-700 border-teal-200", "bg-teal-500 animate-pulse"],
    connected: ["Connected", "bg-emerald-50 text-emerald-700 border-emerald-200", "bg-emerald-500 animate-pulse"],
  };
  const [label, cls, dot] = map[phase];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${cls}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h3 className="text-base font-bold text-slate-900" style={{ fontFamily: "Manrope, sans-serif" }}>
        {title}
      </h3>
      {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 border border-slate-100 px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold text-slate-900 tabular-nums">{value}</p>
    </div>
  );
}

const TONES = {
  rose: "bg-rose-50 text-rose-600",
  sky: "bg-sky-50 text-sky-600",
  amber: "bg-amber-50 text-amber-600",
  violet: "bg-violet-50 text-violet-600",
} as const;

function MeasureCard({
  tone,
  title,
  body,
  sensor,
  icon,
}: {
  tone: keyof typeof TONES;
  title: string;
  body: string;
  sensor: string;
  icon: ReactNode;
}) {
  return (
    <div className="flex gap-3.5 rounded-2xl border border-slate-100 bg-slate-50/60 p-4 hover:bg-white hover:shadow-sm transition-all">
      <span className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${TONES[tone]}`}>
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </span>
      <div className="min-w-0">
        <p className="text-sm font-bold text-slate-900">{title}</p>
        <p className="text-[13px] text-slate-600 leading-relaxed mt-0.5">{body}</p>
        <p className="mt-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">{sensor}</p>
      </div>
    </div>
  );
}

function AlertRow({
  badge,
  badgeTone,
  screen,
  body,
  action,
}: {
  badge: string;
  badgeTone: "amber" | "rose";
  screen: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  const tone = badgeTone === "amber" ? "bg-amber-50 text-amber-700 border-amber-200" : "bg-rose-50 text-rose-700 border-rose-200";
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-slate-100 p-4">
      <span className={`self-start shrink-0 px-2.5 py-1 rounded-lg text-[11px] font-bold border ${tone}`}>{badge}</span>
      <div className="flex-1 min-w-0">
        <p className="font-mono text-[12px] font-bold text-slate-800">“{screen}”</p>
        <p className="text-[13px] text-slate-600 leading-relaxed mt-0.5">{body}</p>
      </div>
      {action && (
        <button
          onClick={action.onClick}
          className="self-start sm:self-center shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold text-teal-700 bg-teal-50 border border-teal-100 hover:bg-teal-100 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <details className="group py-3.5">
      <summary className="flex items-center justify-between gap-3 cursor-pointer list-none text-sm font-semibold text-slate-800">
        {q}
        <svg className="w-4 h-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </summary>
      <p className="mt-2 text-[13px] text-slate-600 leading-relaxed">{children}</p>
    </details>
  );
}

function WearableIcon() {
  return (
    <svg className="w-10 h-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <rect x="6" y="6" width="12" height="12" rx="3" />
      <path d="M9 6l1-3h4l1 3M9 18l1 3h4l1-3" />
      <path d="M8.5 12h1.8l1-2 1.5 4 1-2h1.7" />
    </svg>
  );
}
