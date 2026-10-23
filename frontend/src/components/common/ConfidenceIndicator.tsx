import React from 'react';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

interface ConfidenceIndicatorProps {
  score: number; // 0 to 1
  compact?: boolean;
}

export const ConfidenceIndicator: React.FC<ConfidenceIndicatorProps> = ({ score, compact = false }) => {
  const percentage = Math.round(Math.min(Math.max(score, 0), 1) * 100);
  const isLow = score < 0.7;

  if (compact) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
          isLow
            ? 'bg-amber-50 text-amber-800 border-amber-300'
            : 'bg-slate-50 text-slate-700 border-slate-200'
        }`}
        title={`AI Confidence Score: ${percentage}% ${isLow ? '(Low confidence: requires review)' : ''}`}
      >
        {isLow ? (
          <AlertCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" aria-hidden="true" />
        )}
        <span>{percentage}%</span>
        {isLow && <span className="font-semibold text-[10px] text-amber-700 uppercase">Low</span>}
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-1 min-w-[120px]">
      <div className="flex items-center justify-between text-xs">
        <span className="text-slate-500 font-medium flex items-center gap-1">
          {isLow && <AlertCircle className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />}
          AI Confidence
        </span>
        <span className={`font-semibold ${isLow ? 'text-amber-700' : 'text-slate-700'}`}>
          {percentage}% {isLow ? '(Low)' : ''}
        </span>
      </div>
      <div className="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${
            isLow ? 'bg-amber-500' : score > 0.85 ? 'bg-emerald-500' : 'bg-indigo-500'
          }`}
          style={{ width: `${percentage}%` }}
          role="progressbar"
          aria-valuenow={percentage}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
};
