import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  animate,
  motion,
  easeInOut,
  type MotionValue,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
} from "framer-motion";
import type { GlobePose } from "../components/landing/IndiaGlobe";
import { INDIAN_LANGUAGES, graphemes, loadIndianScriptFonts } from "../components/landing/indianLanguages";
import { STAT_CARDS, STATE_MARKERS, STATE_MARKERS_CAPTION, type StatCard } from "../components/landing/indiaStats";

// three.js + globe.gl are only fetched when this screen actually renders the globe.
const IndiaGlobe = lazy(() => import("../components/landing/IndiaGlobe"));

interface GlobeLandingProps {
  // Same contract as LoginScreen — App.tsx's existing portal handler is reused as-is.
  onSelectPortal: (role: "victim" | "counsellor") => void;
}

/* ------------------------------------------------------------------ */
/*  Layout constants                                                  */
/* ------------------------------------------------------------------ */

// India's approximate geographic centre — where the camera ends up.
const INDIA = { lat: 20.5937, lng: 78.9629 };

// Scroll-progress keyframes (0 → 1 across the 400vh track).
const P = {
  camera: [0, 0.42] as const, //    close-up → whole globe centred on India
  title: [0, 0.22] as const, //     title fades + lifts
  hint: [0, 0.06] as const, //      "scroll to explore" fades
  stats: [0.4, 0.74] as const, //   data section: cards + state pins (in → out)
  overlay: [0.74, 0.88] as const, // dimming overlay 0 → 0.55
  card: [0.78, 0.94] as const, //   login card fades + scales in
  interactive: 0.9, //              card accepts clicks / focus from here
};
const TRACK_VH = 400;

/** Visibility of the data section (pins + cards) for a scroll progress. */
function statsOpacity(p: number, delay = 0) {
  const [a, b] = P.stats;
  const fadeIn = clamp01((p - (a + delay)) / 0.06);
  const fadeOut = clamp01((b - p) / 0.05);
  return Math.min(fadeIn, fadeOut);
}
const pinOpacity = (p: number) => statsOpacity(p, 0.04);

const BG = "#000000";

/* ------------------------------------------------------------------ */
/*  Camera path                                                       */
/* ------------------------------------------------------------------ */

/**
 * START — the globe peeks in from the bottom-left corner with India
 * (glowing saffron) in that corner; stars and the title fill the rest.
 * END — the spec camera: India centred, altitude 1.8, whole globe visible.
 */
function startPose(w: number, h: number): GlobePose {
  if (w / h < 0.9) {
    // Portrait: globe bleeds off the bottom-left corner with India on it.
    return { lat: -12, lng: 64, altitude: 1.15, cx: w * -0.05, cy: h * 1.04 };
  }
  // Globe bleeds off the left and bottom edges (no gap to the screen edge);
  // looking a little west of India puts India on the visible part.
  return { lat: 4, lng: 71, altitude: 0.7, cx: w * 0.1, cy: h * 0.86 };
}

function endPose(w: number, h: number): GlobePose {
  return { ...INDIA, altitude: w / h < 0.9 ? 2.6 : 1.8, cx: w / 2, cy: h / 2 };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

function poseAt(progress: number, w: number, h: number): GlobePose {
  const t = easeInOut(clamp01((progress - P.camera[0]) / (P.camera[1] - P.camera[0])));
  const a = startPose(w, h);
  const b = endPose(w, h);
  return {
    lat: lerp(a.lat, b.lat, t),
    lng: lerp(a.lng, b.lng, t),
    // Interpolate distance-from-centre geometrically so the pull-back feels even.
    altitude: Math.exp(lerp(Math.log(1 + a.altitude), Math.log(1 + b.altitude), t)) - 1,
    cx: lerp(a.cx, b.cx, t),
    cy: lerp(a.cy, b.cy, t),
  };
}

/* ------------------------------------------------------------------ */
/*  Hooks                                                             */
/* ------------------------------------------------------------------ */

function useViewportSize() {
  const [size, setSize] = useState(() => ({
    w: typeof window === "undefined" ? 1440 : window.innerWidth,
    h: typeof window === "undefined" ? 900 : window.innerHeight,
  }));
  useEffect(() => {
    let t = 0;
    const onResize = () => {
      window.clearTimeout(t);
      t = window.setTimeout(() => setSize({ w: window.innerWidth, h: window.innerHeight }), 120);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  return size;
}

/* ------------------------------------------------------------------ */
/*  Screen                                                            */
/* ------------------------------------------------------------------ */

export default function GlobeLanding({ onSelectPortal }: GlobeLandingProps) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return <StaticLanding onSelectPortal={onSelectPortal} />;
  return <ScrollLanding onSelectPortal={onSelectPortal} />;
}

function ScrollLanding({ onSelectPortal }: GlobeLandingProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [globeReady, setGlobeReady] = useState(false);
  const [cardLive, setCardLive] = useState(false);
  const { w, h } = useViewportSize();

  // This screen is its own scroll container (same pattern as LoginScreen),
  // so `container` is passed alongside `target`.
  const { scrollYProgress: rawProgress } = useScroll({
    container: scrollerRef,
    target: trackRef,
    offset: ["start start", "end end"],
  });
  // Pass through a function transform so every value below is driven from
  // JS on the same frame. Mapping rawProgress directly lets framer-motion
  // hand opacity off to a native ScrollTimeline, which mis-maps
  // container + target offsets (values run backwards past the range end).
  const scrollYProgress = useTransform(rawProgress, (v) => v);

  // --- Title ------------------------------------------------------------
  const titleOpacity = useTransform(scrollYProgress, [...P.title], [1, 0]);
  const titleY = useTransform(scrollYProgress, [...P.title], [0, -48]);

  // --- Scroll hint ------------------------------------------------------
  const hintOpacity = useTransform(scrollYProgress, [...P.hint], [1, 0]);
  const hintPointer = useTransform(scrollYProgress, (v) => (v < P.hint[1] ? "auto" : "none"));
  // Nav "Sign in" stays until the login card itself arrives.
  const signInOpacity = useTransform(scrollYProgress, [P.overlay[0], P.card[0]], [1, 0]);
  const signInPointer = useTransform(scrollYProgress, (v) => (v < P.card[0] - 0.01 ? "auto" : "none"));
  const statsHeaderOpacity = useTransform(scrollYProgress, (v) => statsOpacity(v));

  // --- Dimming overlay --------------------------------------------------
  const overlayOpacity = useTransform(scrollYProgress, [...P.overlay], [0, 0.55]);

  // --- Login card -------------------------------------------------------
  const cardOpacity = useTransform(scrollYProgress, [...P.card], [0, 1]);
  const cardScale = useTransform(scrollYProgress, [...P.card], [0.95, 1]);

  useMotionValueEvent(scrollYProgress, "change", (v) => {
    const live = v >= P.interactive;
    setCardLive((prev) => (prev === live ? prev : live));
  });

  useEffect(() => {
    loadIndianScriptFonts();
  }, []);

  // Always open on the static shot: don't let the browser restore an old
  // scroll position (which would start the spin before the user scrolls).
  useEffect(() => {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
    scrollerRef.current?.scrollTo({ top: 0 });
  }, []);

  // Scroll one screen down (into the story) for people who click the cue.
  const exploreNext = () => {
    const el = scrollerRef.current;
    if (el) el.scrollBy({ top: el.clientHeight, behavior: "smooth" });
  };

  const skipToCard = () => {
    const el = scrollerRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  };

  return (
    <div
      ref={scrollerRef}
      className="relative w-full h-screen overflow-y-auto overflow-x-hidden scrollbar-none"
      style={{ background: BG, fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', wordSpacing: "0.05em" }}
    >
      {/* Keyboard users: the card is inert until scrolled to, so offer a shortcut. */}
      <button
        type="button"
        onClick={skipToCard}
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:rounded-xl focus:bg-white focus:text-slate-900 focus:text-sm focus:font-semibold"
      >
        Skip to sign in
      </button>

      {/* Tall track: scroll travel */}
      <div ref={trackRef} className="relative" style={{ height: `${TRACK_VH}vh` }}>
        {/* Pinned stage */}
        <div className="sticky top-0 h-screen w-full overflow-hidden">
          {/* ---------- Globe: full-screen canvas, camera moved by scroll ---------- */}
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none transition-opacity duration-1000"
            style={{ opacity: globeReady ? 1 : 0 }}
          >
            <Suspense fallback={null}>
              <IndiaGlobe
                width={w}
                height={h}
                progress={scrollYProgress}
                getPose={poseAt}
                onReady={() => setGlobeReady(true)}
                markers={STATE_MARKERS}
                markerOpacity={pinOpacity}
              />
            </Suspense>
          </div>

          {/* ---------- Data section: India in numbers ---------- */}
          <motion.div
            aria-hidden
            style={{ opacity: statsHeaderOpacity }}
            className="absolute z-10 top-6 md:top-8 inset-x-0 px-4 text-center pointer-events-none"
          >
            <p className="text-[11px] md:text-xs font-bold uppercase tracking-[0.26em] text-[#6ee7b7]">The scale of what we face</p>
            <p
              className="mt-2 text-[24px] md:text-[32px] leading-tight font-bold tracking-[-0.02em] text-white"
              style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}
            >
              Behind every number is a person.
            </p>
          </motion.div>
          <motion.p
            aria-hidden
            style={{ opacity: statsHeaderOpacity }}
            className="absolute z-10 bottom-4 md:bottom-6 inset-x-0 text-center text-[10px] md:text-[11px] uppercase tracking-[0.2em] text-slate-500 pointer-events-none"
          >
            Pins: {STATE_MARKERS_CAPTION}
          </motion.p>
          <div className="absolute z-10 inset-0 pointer-events-none">
            {/* Desktop: two cards either side of the globe. Phone: 2×2 grid at the bottom. */}
            <div className="hidden md:flex absolute left-[3vw] top-1/2 -translate-y-1/2 flex-col gap-4">
              {STAT_CARDS.slice(0, 2).map((c, i) => (
                <StatCardView key={c.label} card={c} progress={scrollYProgress} delay={i * 0.035} />
              ))}
            </div>
            <div className="hidden md:flex absolute right-[3vw] top-1/2 -translate-y-1/2 flex-col gap-4">
              {STAT_CARDS.slice(2).map((c, i) => (
                <StatCardView key={c.label} card={c} progress={scrollYProgress} delay={(i + 2) * 0.035} />
              ))}
            </div>
            <div className="md:hidden absolute inset-x-3 bottom-10 grid grid-cols-2 gap-2">
              {STAT_CARDS.map((c, i) => (
                <StatCardView key={c.label} card={c} progress={scrollYProgress} delay={i * 0.025} compact />
              ))}
            </div>
          </div>

          {/* ---------- Dimming overlay ---------- */}
          <motion.div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{ opacity: overlayOpacity, background: "#000" }}
          />

          {/* ---------- Top-right navbar (placeholder widgets) ---------- */}
          <nav aria-label="Primary" className="absolute top-0 inset-x-0 z-30 flex justify-end items-center gap-2 md:gap-3 px-4 md:px-10 py-5">
            <motion.div style={{ opacity: titleOpacity }}>
              <TopNav />
            </motion.div>
            {/* Always-available shortcut: nobody has to scroll the whole story to log in */}
            <motion.button
              type="button"
              onClick={skipToCard}
              style={{ opacity: signInOpacity, pointerEvents: signInPointer }}
              className="h-9 px-4 rounded-full text-[13px] font-semibold text-[#1a0f05] bg-gradient-to-r from-[#d1fae5] to-[#10b981] shadow-[0_0_24px_rgba(16,185,129,0.3)] hover:brightness-110 transition"
            >
              Sign in
            </motion.button>
          </nav>

          {/* ---------- Title (right side, in the stars) ---------- */}
          <motion.div
            style={{ opacity: titleOpacity, y: titleY, textShadow: "0 2px 30px rgba(0,0,0,0.85)" }}
            className="absolute z-10 inset-x-0 top-[14%] px-6 text-center md:text-left md:inset-x-auto md:top-1/2 md:-translate-y-1/2 md:right-[7vw] md:max-w-[560px] md:px-0"
          >
            {/* "Mann Saathi" typed out in every Indian language, one after another */}
            <TypedBrandLine />
            <h1
              className="text-[56px] md:text-[clamp(56px,6.2vw,96px)] leading-[0.95] tracking-[-0.045em] font-extrabold text-white"
              style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}
            >
              Mann{" "}
              <span className="bg-gradient-to-r from-[#d1fae5] via-[#34d399] to-[#10b981] bg-clip-text text-transparent">
                Saathi
              </span>
            </h1>
            <div className="mt-7 mx-auto md:mx-0 h-px w-20 bg-gradient-to-r from-[#10b981] to-transparent" />
            <p
              className="mt-6 text-[15px] md:text-[17px] font-medium tracking-[0.01em] text-slate-400"
              style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}
            >
              NHAA tracks the case.
            </p>
            <p
              className="mt-1 text-[24px] md:text-[30px] leading-tight font-bold tracking-[-0.02em] text-white"
              style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}
            >
              We track the person.
            </p>
          </motion.div>

          {/* ---------- Scroll cue (bottom-right) ---------- */}
          <motion.div
            style={{ opacity: hintOpacity, pointerEvents: hintPointer }}
            className="absolute z-10 bottom-6 right-4 md:bottom-10 md:right-[7vw]"
          >
            <ScrollCue onExplore={exploreNext} />
          </motion.div>

          {/* ---------- Login card ---------- */}
          <div className="absolute inset-0 z-20 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              style={{ opacity: cardOpacity, scale: cardScale }}
              className={cardLive ? "pointer-events-auto w-full max-w-[440px]" : "w-full max-w-[440px]"}
              inert={!cardLive}
            >
              <PortalCard onSelectPortal={onSelectPortal} />
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stat card — fades in during the data section and counts up          */
/* ------------------------------------------------------------------ */

const STAT_ICONS: Record<StatCard["icon"], ReactNode> = {
  shield: <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />,
  gavel: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M14 4l6 6M11 7l6 6M12.5 5.5l-5 5M18.5 11.5l-5 5M9.5 13.5L3 20M3 21h9" />
  ),
  mind: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4a4 4 0 00-4 4v1a3 3 0 00-1 5.5A3.5 3.5 0 008 20h1V4zM15 4a4 4 0 014 4v1a3 3 0 011 5.5A3.5 3.5 0 0116 20h-1V4z" />
  ),
  doctor: (
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 12a4 4 0 100-8 4 4 0 000 8zM5 21a7 7 0 0114 0M12 15v4M10 17h4" />
  ),
};

function StatCardView({
  card,
  progress,
  delay,
  compact = false,
}: {
  card: StatCard & { format: (n: number) => string };
  progress: MotionValue<number>;
  delay: number;
  compact?: boolean;
}) {
  const opacity = useTransform(progress, (v) => statsOpacity(v, delay));
  const y = useTransform(progress, (v) => (1 - Math.min(1, statsOpacity(v, delay) * 1.2)) * 16);
  const numberRef = useRef<HTMLSpanElement>(null);
  const counted = useRef(false);

  // Count up the first time the card becomes visible; reset when scrolled away.
  useMotionValueEvent(progress, "change", (v) => {
    const vis = statsOpacity(v, delay);
    if (vis > 0.3 && !counted.current) {
      counted.current = true;
      animate(0, card.value, {
        duration: 1.6,
        ease: [0.16, 1, 0.3, 1],
        onUpdate: (n) => {
          if (numberRef.current) numberRef.current.textContent = card.format(n);
        },
      });
    } else if (vis === 0 && counted.current && v < P.stats[0]) {
      counted.current = false;
      if (numberRef.current) numberRef.current.textContent = card.format(0);
    }
  });

  return (
    <motion.div
      style={{ opacity, y }}
      className={`rounded-2xl border border-white/10 bg-black/45 backdrop-blur-md shadow-xl shadow-black/40 ${
        compact ? "p-3" : "w-[clamp(220px,21vw,300px)] p-5"
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`shrink-0 rounded-xl bg-[#10b981]/10 text-[#6ee7b7] flex items-center justify-center ${
            compact ? "w-7 h-7" : "w-10 h-10"
          }`}
        >
          <svg className={compact ? "w-4 h-4" : "w-5 h-5"} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
            {STAT_ICONS[card.icon]}
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-white font-extrabold tracking-[-0.02em] leading-none tabular-nums" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
            <span ref={numberRef} className={compact ? "text-[20px]" : "text-[30px]"}>
              {card.format(0)}
            </span>
            {card.suffix && <span className={compact ? "text-[13px]" : "text-[18px]"}>{card.suffix}</span>}
          </p>
          <p className={`mt-1.5 text-slate-300 leading-snug ${compact ? "text-[11px]" : "text-[13px]"}`}>{card.label}</p>
          {!compact && <p className="mt-2 text-[10px] uppercase tracking-[0.14em] text-slate-500">{card.source}</p>}
        </div>
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Top-right navbar — placeholder widgets (not wired up yet)         */
/* ------------------------------------------------------------------ */

function TopNav() {
  return (
    <div className="flex items-center gap-2 md:gap-3">
      {/* Links (dummy) */}
      <div className="hidden md:flex items-center h-9 px-1.5 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-md">
        {["About", "How it works", "Resources"].map((label) => (
          <button
            key={label}
            type="button"
            className="px-3.5 h-7 rounded-full text-[13px] text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Typed brand line — "Mann Saathi" in every Indian language          */
/* ------------------------------------------------------------------ */

const TYPE_MS = 110; // per character
const DELETE_MS = 45;
const HOLD_MS = 1500; // pause on the finished word
const GAP_MS = 250; // pause before the next language

function TypedBrandLine() {
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(0);
  const [phase, setPhase] = useState<"typing" | "holding" | "deleting">("typing");
  const lang = INDIAN_LANGUAGES[index];
  const chars = graphemes(lang.text);

  useEffect(() => {
    let t: number;
    if (phase === "typing") {
      if (count < chars.length) t = window.setTimeout(() => setCount((c) => c + 1), TYPE_MS);
      else t = window.setTimeout(() => setPhase("holding"), 0);
    } else if (phase === "holding") {
      t = window.setTimeout(() => setPhase("deleting"), HOLD_MS);
    } else {
      if (count > 0) t = window.setTimeout(() => setCount((c) => c - 1), DELETE_MS);
      else
        t = window.setTimeout(() => {
          setIndex((i) => (i + 1) % INDIAN_LANGUAGES.length);
          setPhase("typing");
        }, GAP_MS);
    }
    return () => window.clearTimeout(t);
  }, [phase, count, chars.length]);

  return (
    <p className="mb-3 h-9 flex items-center justify-center md:justify-start gap-3" aria-label="Mann Saathi, in the languages of India">
      <span aria-hidden className="flex items-center gap-[3px]" dir={lang.rtl ? "rtl" : "ltr"}>
        <span
          lang={lang.code}
          className={`text-[#6ee7b7] whitespace-pre ${lang.rtl ? "text-[17px] md:text-[18px]" : "text-[18px] md:text-[20px]"}`}
          style={{ fontFamily: lang.font }}
        >
          {chars.slice(0, count).join("")}
        </span>
        <motion.span
          className="inline-block w-[2px] h-[1.1em] bg-[#6ee7b7] rounded-full"
          animate={{ opacity: [1, 0, 1] }}
          transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
        />
      </span>
      <motion.span
        aria-hidden
        key={lang.code}
        initial={{ opacity: 0, x: -4 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.4 }}
        className="text-[11px] uppercase tracking-[0.22em] text-slate-500"
      >
        {lang.english}
      </motion.span>
    </p>
  );
}

/* ------------------------------------------------------------------ */
/*  Scroll cue — tells first-time users what to do                    */
/* ------------------------------------------------------------------ */

function ScrollCue({ onExplore }: { onExplore: () => void }) {
  return (
    <button
      type="button"
      onClick={onExplore}
      aria-label="Scroll down to explore"
      className="flex items-center gap-4 pl-5 pr-4 py-3 rounded-2xl border border-white/15 bg-white/[0.05] backdrop-blur-md hover:bg-white/[0.09] hover:border-white/25 transition-colors text-left"
    >
      <span className="flex flex-col">
        <span className="text-[14px] font-medium text-white">Scroll to explore</span>
        <span className="text-[12px] text-slate-400">See the story behind it</span>
      </span>
      {/* Mouse with a moving wheel dot */}
      <span className="relative flex items-start justify-center w-6 h-9 rounded-full border-2 border-white/70">
        <motion.span
          className="mt-1.5 w-1 h-2 rounded-full bg-[#6ee7b7]"
          animate={{ y: [0, 10, 0], opacity: [1, 0.2, 1] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        />
      </span>
      {/* Bouncing arrow */}
      <motion.svg
        className="w-4 h-4 text-white/80"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
        animate={{ y: [0, 4, 0] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
      </motion.svg>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Reduced motion: no globe, no scroll choreography                  */
/* ------------------------------------------------------------------ */

function StaticLanding({ onSelectPortal }: GlobeLandingProps) {
  return (
    <div
      className="relative w-full min-h-screen flex items-center justify-center p-4"
      style={{
        background: `radial-gradient(1000px 700px at 20% 100%, rgba(16,185,129,0.18), transparent 60%), ${BG}`,
        fontFamily: '"Plus Jakarta Sans", Inter, sans-serif',
        wordSpacing: "0.05em",
      }}
    >
      <div className="w-full max-w-[440px]">
        <div className="mb-8 text-center">
          <h1 className="text-[44px] leading-tight font-extrabold tracking-[-0.03em] text-white" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
            Mann Saathi
          </h1>
          <p className="mt-2 text-base text-slate-400">NHAA tracks the case. We track the person.</p>
        </div>
        <PortalCard onSelectPortal={onSelectPortal} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Glass card — reuses LoginScreen's portal-selection flow           */
/* ------------------------------------------------------------------ */

function PortalCard({ onSelectPortal }: GlobeLandingProps) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/55 backdrop-blur-xl shadow-2xl shadow-black/50 p-7 md:p-8">
      <div className="space-y-1.5">
        <span className="inline-block px-3 py-1 rounded-md bg-emerald-400/10 text-emerald-300 text-[11px] font-bold uppercase tracking-wider">
          Direct portal access
        </span>
        <h2 className="text-2xl font-bold text-white tracking-[-0.02em]" style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif' }}>
          Welcome to Mann Saathi
        </h2>
        <p className="text-sm text-slate-400">Choose your portal to continue.</p>
      </div>

      <div className="mt-6 space-y-3">
        <PortalButton
          title="Complainant Portal"
          badge="Survivor entry"
          description="AI check-ins, biosignals, appointments and support resources."
          onClick={() => onSelectPortal("victim")}
          accent="emerald"
          icon={
            <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          }
        />
        <PortalButton
          title="Counsellor Portal"
          badge="Officer dashboard"
          description="Assigned cases, stress alerts, notes and interventions."
          onClick={() => onSelectPortal("counsellor")}
          accent="slate"
          icon={
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
            />
          }
        />
      </div>

      <div className="mt-6 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-slate-500">
        <svg className="w-4 h-4 shrink-0 text-emerald-400/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        Confidential &amp; encrypted · no registration needed for demo access
      </div>
    </div>
  );
}

function PortalButton({
  title,
  badge,
  description,
  onClick,
  icon,
  accent,
}: {
  title: string;
  badge: string;
  description: string;
  onClick: () => void;
  icon: ReactNode;
  accent: "emerald" | "slate";
}) {
  const tint =
    accent === "emerald"
      ? "bg-emerald-400/10 text-emerald-300 group-hover:bg-emerald-400/20"
      : "bg-white/5 text-slate-300 group-hover:bg-white/10";
  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full text-left flex items-center gap-4 p-4 rounded-2xl border border-white/10 bg-white/[0.03] hover:bg-white/[0.07] hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/70 transition-colors"
    >
      <span className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-colors ${tint}`}>
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          {icon}
        </svg>
      </span>
      <span className="flex-1 min-w-0">
        <span className="flex items-center gap-2 flex-wrap">
          <span className="text-[15px] font-semibold text-white">{title}</span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{badge}</span>
        </span>
        <span className="block mt-0.5 text-xs text-slate-400 leading-relaxed">{description}</span>
      </span>
      <svg
        className="w-5 h-5 shrink-0 text-slate-500 group-hover:text-white group-hover:translate-x-0.5 transition"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    </button>
  );
}
