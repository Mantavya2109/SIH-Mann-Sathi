import React, { useState, useEffect } from 'react';

interface StagedAIInsightProps {
  insightText: string;
  distressScore?: number;
}

const STAGES = [
  "Analyzing biosignal trends...",
  "Evaluating stress threshold...",
  "Trend identified...",
  "Insight updated"
];

export const StagedAIInsight: React.FC<StagedAIInsightProps> = ({ insightText, distressScore }) => {
  const [stageIndex, setStageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (stageIndex < STAGES.length - 1) {
      const timer = setTimeout(() => {
        setStageIndex((prev) => prev + 1);
      }, 900);
      return () => clearTimeout(timer);
    } else {
      setIsComplete(true);
    }
  }, [stageIndex]);

  return (
    <div className="p-5 rounded-3xl bg-white/90 backdrop-blur-md border border-emerald-100 shadow-sm relative overflow-hidden transition-all duration-300 hover:shadow-md">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isComplete ? 'bg-emerald-500' : 'bg-teal-400 animate-ping'}`} />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
            AI Clinical Assistant
          </span>
        </div>

        {distressScore !== undefined && (
          <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
            distressScore > 7 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
          }`}>
            Distress Index: {distressScore}/10
          </span>
        )}
      </div>

      {!isComplete ? (
        <div className="py-3 flex items-center gap-3">
          <div className="w-4 h-4 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
          <span className="text-xs font-semibold text-slate-600 animate-pulse">
            {STAGES[stageIndex]}
          </span>
        </div>
      ) : (
        <div className="space-y-2 animate-in fade-in duration-300">
          <p className="text-xs text-slate-700 leading-relaxed font-medium">
            {insightText || "Patient demonstrates consistent biosignal stabilization post-session."}
          </p>
          <div className="pt-2 flex items-center justify-between text-[11px] text-slate-400">
            <span>Confidence: 94%</span>
            <span>Real-time synthesis</span>
          </div>
        </div>
      )}
    </div>
  );
};