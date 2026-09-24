import { useEffect, useRef, useState } from "react";
import Orb from "../interactive/Orb";

/**
 * Full-screen "listening" pop-up shown while a voice check-in is recording.
 *
 * Hands-free: there is no Send button. The pop-up watches the microphone's
 * loudness (Web Audio analyser on the same stream) and
 *  - sends automatically once the person has spoken and then pauses for
 *    SILENCE_MS (calls onSend — VictimChat's normal stop-and-upload path);
 *  - closes without sending if nobody speaks within NO_SPEECH_MS (onCancel);
 *  - sends anyway after MAX_MS as a safety limit.
 * Cancel / Esc still discard the recording.
 */

interface Props {
  stream: MediaStream | null;
  onSend: () => void;
  onCancel: () => void;
}

const SILENCE_MS = 1800; // pause length that ends a message
const NO_SPEECH_MS = 10000; // give up if nothing is said
const NO_SPEECH_WARN_MS = 5000;
const MAX_MS = 120000; // hard cap on one voice message
const CALIBRATE_MS = 500; // measure room noise first

type Phase = "waiting" | "speaking" | "pausing" | "sending";

export default function VoiceRecorderModal({ stream, onSend, onCancel }: Props) {
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [phase, setPhase] = useState<Phase>("waiting");
  const [pauseProgress, setPauseProgress] = useState(0); // 0–1 while a pause is counting down
  const [noSpeechWarn, setNoSpeechWarn] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Latest callbacks, so the audio loop never needs restarting.
  const cbRef = useRef({ onSend, onCancel });
  cbRef.current = { onSend, onCancel };

  // Timer
  useEffect(() => {
    const id = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Loudness → orb wobble + automatic stop
  useEffect(() => {
    if (!stream) return;
    const AC: typeof AudioContext | undefined =
      window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    let ctx: AudioContext;
    try {
      ctx = new AC();
    } catch {
      return;
    }
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);

    const start = performance.now();
    let raf = 0;
    let smooth = 0;
    let noiseSum = 0;
    let noiseN = 0;
    let threshold = 0.035; // RMS; refined after calibration
    let spoke = false;
    let lastVoice = 0;
    let done = false;

    const finish = (send: boolean) => {
      if (done) return;
      done = true;
      if (send) {
        setPhase("sending");
        // brief beat so the "Sending" state is visible
        window.setTimeout(() => cbRef.current.onSend(), 250);
      } else {
        cbRef.current.onCancel();
      }
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (done) return;
      const now = performance.now();
      const elapsed = now - start;

      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      smooth += (Math.min(1, rms * 5) - smooth) * 0.2;
      setLevel(smooth);

      // 1) Calibrate against the room's background noise.
      if (elapsed < CALIBRATE_MS) {
        noiseSum += rms;
        noiseN += 1;
        return;
      }
      if (noiseN > 0) {
        threshold = Math.max(0.03, (noiseSum / noiseN) * 2.5);
        noiseN = 0;
      }

      const voiced = rms > threshold;
      if (voiced) {
        lastVoice = now;
        if (!spoke) {
          spoke = true;
          setNoSpeechWarn(false);
        }
        setPhase("speaking");
        setPauseProgress(0);
      } else if (spoke) {
        // 2) After speech, a long enough pause sends the message.
        const quiet = now - lastVoice;
        if (quiet > 250) {
          setPhase("pausing");
          setPauseProgress(Math.min(1, quiet / SILENCE_MS));
        }
        if (quiet >= SILENCE_MS) finish(true);
      } else {
        // 3) Nothing said yet.
        if (elapsed > NO_SPEECH_WARN_MS) setNoSpeechWarn(true);
        if (elapsed > NO_SPEECH_MS) finish(false);
      }

      // 4) Safety cap.
      if (elapsed > MAX_MS) finish(spoke);
    };
    tick();
    return () => {
      done = true;
      cancelAnimationFrame(raf);
      source.disconnect();
      ctx.close().catch(() => {});
    };
  }, [stream]);

  // Keyboard: Esc cancels; focus the primary action.
  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const title =
    phase === "sending"
      ? "Sending…"
      : phase === "pausing"
        ? "Got it…"
        : phase === "speaking"
          ? "I'm listening…"
          : noSpeechWarn
            ? "Still there?"
            : "Go ahead, I'm here";
  const subtitle =
    phase === "sending"
      ? "Sharing your message with your companion."
      : phase === "pausing"
        ? "I'll send this when you pause — keep talking to add more."
        : phase === "speaking"
          ? "Take your time. I'll send it when you pause."
          : noSpeechWarn
            ? "I didn't hear anything. I'll close this in a moment if you'd rather not speak."
            : "Just start speaking — it sends by itself when you pause.";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recording a voice message"
      className="vic-voice fixed inset-0 z-[70] flex flex-col items-center justify-center px-6"
    >
      <div className="absolute inset-0 bg-[#03050a]/90 backdrop-blur-md" />

      <div className="relative flex flex-col items-center text-center w-full max-w-md">
        <p className="text-[11px] font-bold uppercase tracking-[0.26em] text-[#6ee7b7]/80">Voice check-in</p>
        <h2 className="mt-2 text-[26px] sm:text-[30px] font-extrabold tracking-[-0.02em] text-white">
          {title}
        </h2>
        <p className="mt-1.5 min-h-[40px] text-sm text-[#9aa5b5] max-w-sm" aria-live="polite">{subtitle}</p>

        <div className="relative my-6 w-[min(78vw,340px)] aspect-square">
          <Orb hue={100} hoverIntensity={0.6 + level * 1.4} rotateOnHover level={Math.min(1, level * 1.6)} backgroundColor="#03050a" />
        </div>

        <div className="flex items-center gap-2 text-[15px] font-semibold tabular-nums text-[#d1fae5]">
          <span className={`w-2 h-2 rounded-full ${phase === "sending" ? "bg-emerald-400" : "bg-red-500 animate-pulse"}`} aria-hidden />
          {mm}:{ss}
        </div>

        {/* Auto-send progress: fills while you're paused, resets when you speak again */}
        <div className="mt-4 h-1 w-40 rounded-full bg-white/[0.08] overflow-hidden" aria-hidden>
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#34d399] to-[#5eead4] transition-[width] duration-100"
            style={{ width: `${(phase === "sending" ? 1 : phase === "pausing" ? pauseProgress : 0) * 100}%` }}
          />
        </div>

        <div className="mt-8">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={phase === "sending"}
            className="h-11 px-6 rounded-full border border-white/12 bg-white/[0.05] text-sm font-semibold text-[#c9d2de] hover:bg-white/[0.09] hover:text-white transition-colors disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/10"
          >
            Cancel
          </button>
        </div>
        <p className="mt-4 text-[11.5px] text-[#737e90]">Press Esc to cancel</p>
      </div>
    </div>
  );
}
