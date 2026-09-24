import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

/**
 * Hand-off screen shown briefly after login, before the destination page.
 *
 * A single thin green "calm mind" line: a soft brainwave that flows
 * endlessly from left to right while its height slowly breathes in and out,
 * like a steady alpha rhythm settling down. A fainter echo line sits behind
 * it for depth. One quiet line of text underneath. With
 * prefers-reduced-motion the line is drawn once and stays still.
 *
 * It renders as a full-screen overlay so the destination page can mount (and
 * start fetching its data) underneath; when the time is up the overlay fades
 * out and calls onDone.
 */

export type LoadingRole = "victim" | "counsellor";

const MESSAGES: Record<LoadingRole, string> = {
  counsellor: "Preparing case overview...",
  victim: "Getting things ready for you...",
};

const W = 400;
const H = 80;
const MID = H / 2;
const STEPS = 160;

/** Builds the wave path for time t (seconds). */
function wavePath(t: number, phase: number, ampScale: number): string {
  // Slow "breathing": amplitude swells and settles every ~4s.
  const breath = 0.72 + 0.28 * Math.sin(t * 1.6 + phase);
  let d = "";
  for (let i = 0; i <= STEPS; i++) {
    const x = (i / STEPS) * W;
    const u = i / STEPS;
    // Bell-shaped envelope so the wave is calm at the edges, fullest in the middle.
    const env = Math.pow(Math.sin(Math.PI * u), 1.6);
    const y =
      MID +
      env *
        breath *
        ampScale *
        (13 * Math.sin(u * 5.2 * Math.PI - t * 2.4 + phase) +
          4 * Math.sin(u * 11.5 * Math.PI - t * 3.7 + phase * 1.7) +
          1.6 * Math.sin(u * 23 * Math.PI - t * 5.1));
    d += (i === 0 ? "M" : "L") + x.toFixed(1) + " " + y.toFixed(2) + " ";
  }
  return d;
}

interface LoadingTransitionProps {
  role: LoadingRole;
  /** How long the screen stays fully visible before fading out (ms). */
  durationMs?: number;
  /** Fade-out length (ms). */
  fadeMs?: number;
  onDone?: () => void;
}

export default function LoadingTransition({ role, durationMs = 2000, fadeMs = 500, onDone }: LoadingTransitionProps) {
  const [leaving, setLeaving] = useState(false);
  const mainRef = useRef<SVGPathElement>(null);
  const glowRef = useRef<SVGPathElement>(null);
  const echoRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    const t1 = window.setTimeout(() => setLeaving(true), durationMs);
    const t2 = window.setTimeout(() => onDone?.(), durationMs + fadeMs);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [durationMs, fadeMs, onDone]);

  // Endless flowing wave, updated every frame.
  useEffect(() => {
    const draw = (t: number) => {
      const main = wavePath(t, 0, 1);
      mainRef.current?.setAttribute("d", main);
      glowRef.current?.setAttribute("d", main);
      echoRef.current?.setAttribute("d", wavePath(t * 0.8, 2.1, 0.6));
    };
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      draw(0.6);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const loop = (now: number) => {
      draw((now - start) / 1000);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <motion.div
      role="status"
      aria-live="polite"
      initial={{ opacity: 1 }}
      animate={{ opacity: leaving ? 0 : 1 }}
      transition={{ duration: fadeMs / 1000, ease: "easeInOut" }}
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{ background: "#000", pointerEvents: leaving ? "none" : "auto" }}
    >
      <div className="relative w-[min(88vw,460px)]" style={{ aspectRatio: `${W} / ${H}` }}>
        {/* very soft green haze behind the line */}
        <div
          aria-hidden
          className="absolute inset-[-40%_-10%] rounded-full"
          style={{ background: "radial-gradient(closest-side, rgba(16,185,129,0.14), rgba(16,185,129,0.04) 60%, transparent)" }}
        />

        <svg viewBox={`0 0 ${W} ${H}`} className="relative w-full h-full overflow-visible" aria-hidden>
          <defs>
            <linearGradient id="ms-wave-stroke" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="#10b981" stopOpacity="0" />
              <stop offset="0.18" stopColor="#34d399" stopOpacity="1" />
              <stop offset="0.5" stopColor="#a7f3d0" stopOpacity="1" />
              <stop offset="0.82" stopColor="#34d399" stopOpacity="1" />
              <stop offset="1" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
            <filter id="ms-wave-blur" x="-10%" y="-100%" width="120%" height="300%">
              <feGaussianBlur stdDeviation="3" />
            </filter>
          </defs>

          {/* faint echo wave, slightly out of phase */}
          <path ref={echoRef} fill="none" stroke="url(#ms-wave-stroke)" strokeWidth="0.9" strokeLinecap="round" opacity="0.28" />
          {/* bloom under the main line */}
          <path ref={glowRef} fill="none" stroke="url(#ms-wave-stroke)" strokeWidth="4" strokeLinecap="round" filter="url(#ms-wave-blur)" opacity="0.55" />
          {/* the thin line itself */}
          <path ref={mainRef} fill="none" stroke="url(#ms-wave-stroke)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      <p
        className="mt-8 text-[14px] md:text-[15px] font-medium tracking-[0.02em] text-slate-400"
        style={{ fontFamily: '"Plus Jakarta Sans", Inter, sans-serif', wordSpacing: "0.05em" }}
      >
        {MESSAGES[role]}
      </p>
    </motion.div>
  );
}
