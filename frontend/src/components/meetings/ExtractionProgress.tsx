import React from 'react';
import { Sparkles, Brain, CheckCircle2, Search, AlertCircle } from 'lucide-react';

interface ExtractionProgressProps {
  elapsedSeconds?: number;
}

export const ExtractionProgress: React.FC<ExtractionProgressProps> = ({ elapsedSeconds = 0 }) => {
  const steps = [
    { label: 'Parsing speaker dialogue & context', icon: Search, done: elapsedSeconds >= 2 },
    { label: 'Extracting action items, decisions & follow-ups', icon: Brain, done: elapsedSeconds >= 4 },
    { label: 'Evaluating commitments & ambiguity flags', icon: Sparkles, done: elapsedSeconds >= 6 },
    { label: 'Generating evidence quotes & confidence scoring', icon: CheckCircle2, done: elapsedSeconds >= 8 },
  ];

  return (
    <div className="bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 rounded-2xl border border-indigo-200/80 p-8 my-6 shadow-sm text-center max-w-2xl mx-auto">
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div className="absolute inset-0 rounded-2xl bg-indigo-600/10 animate-ping" />
        <div className="relative w-16 h-16 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-500 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
          <Brain className="w-8 h-8 animate-pulse" />
        </div>
      </div>

      <h3 className="text-xl font-bold text-slate-900 tracking-tight">
        MeetingFlow AI is analyzing your meeting...
      </h3>
      <p className="text-sm text-slate-600 mt-1.5 max-w-md mx-auto">
        Deep analysis in progress. Extracting confirmed commitments, mapping owners and deadlines, and flagging any ambiguities.
      </p>

      {/* Animated Step List */}
      <div className="mt-6 space-y-2.5 max-w-md mx-auto text-left">
        {steps.map((step, idx) => {
          const Icon = step.icon;
          return (
            <div
              key={idx}
              className={`flex items-center gap-3 p-2.5 rounded-xl border text-xs font-medium transition-all ${
                step.done
                  ? 'bg-emerald-50/80 border-emerald-200 text-emerald-800'
                  : 'bg-white/60 border-slate-200 text-slate-500'
              }`}
            >
              <div
                className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                  step.done ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
              </div>
              <span className="flex-1">{step.label}</span>
              {step.done ? (
                <span className="text-[10px] uppercase font-bold text-emerald-600">Done</span>
              ) : (
                <span className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-6 flex items-center justify-center gap-2 text-xs text-indigo-700">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Polling updates every 2 seconds. The page will refresh automatically once completed.</span>
      </div>
    </div>
  );
};
