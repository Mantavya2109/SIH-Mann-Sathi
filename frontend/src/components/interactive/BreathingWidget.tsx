import React, { useState, useEffect } from 'react';

export const BreathingWidget: React.FC = () => {
  const [isActive, setIsActive] = useState(false);
  const [phase, setPhase] = useState<'Inhale' | 'Hold' | 'Exhale'>('Inhale');

  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      setPhase((prev) => {
        if (prev === 'Inhale') return 'Hold';
        if (prev === 'Hold') return 'Exhale';
        return 'Inhale';
      });
    }, 4000);

    return () => clearInterval(interval);
  }, [isActive]);

  return (
    <div className="p-6 rounded-3xl bg-white border border-emerald-100/80 shadow-sm hover:shadow-md transition-all duration-300 relative overflow-hidden">
      {!isActive ? (
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100/80 text-emerald-800 flex items-center justify-center font-bold text-lg animate-pulse">
              🫁
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">A Little Pause</h3>
              <p className="text-xs text-slate-500">Take 2 minutes to step away, breathe, and reset.</p>
            </div>
          </div>
          <button
            onClick={() => setIsActive(true)}
            className="px-4 py-2 bg-slate-900 hover:bg-emerald-800 text-white text-xs font-semibold rounded-2xl transition-all duration-200 hover:scale-105 active:scale-95 shadow-xs flex items-center gap-1.5"
          >
            <span>Start exercise</span>
            <span>→</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-4 space-y-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="relative flex items-center justify-center w-28 h-28">
            {/* Pulsing Breathing Circle */}
            <div 
              className={`absolute inset-0 rounded-full bg-emerald-200/60 transition-all duration-[4000ms] ease-in-out ${
                phase === 'Inhale' ? 'scale-110 opacity-80' : phase === 'Hold' ? 'scale-110 opacity-100' : 'scale-75 opacity-40'
              }`}
            />
            <div className="relative z-10 text-center">
              <span className="text-sm font-bold text-emerald-900 tracking-wide uppercase">{phase}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500 font-medium">Follow the circle cadence</span>
            <button
              onClick={() => setIsActive(false)}
              className="text-xs font-bold text-slate-400 hover:text-slate-700 underline transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
};