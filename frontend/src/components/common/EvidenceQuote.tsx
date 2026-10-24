import React from 'react';
import { Quote, User } from 'lucide-react';

interface EvidenceQuoteProps {
  quote: string | null | undefined;
  speaker?: string | null;
}

export const EvidenceQuote: React.FC<EvidenceQuoteProps> = ({ quote, speaker }) => {
  if (!quote) return null;

  return (
    <div className="relative pl-3 pr-4 py-2.5 my-2 bg-slate-50 border-l-4 border-indigo-400 rounded-r-md text-slate-700 text-sm italic font-normal">
      <div className="flex items-start gap-2">
        <Quote className="w-4 h-4 text-indigo-400 flex-shrink-0 mt-0.5 not-italic" aria-hidden="true" />
        <div className="flex-1">
          <p className="whitespace-pre-wrap break-words not-italic text-slate-800 text-xs sm:text-sm font-serif leading-relaxed">
            "{quote}"
          </p>
          {speaker && (
            <div className="mt-1.5 flex items-center gap-1.5 not-italic text-xs text-slate-500 font-sans">
              <User className="w-3 h-3 text-slate-400" aria-hidden="true" />
              <span>Spoken by <strong className="font-semibold text-slate-700">{speaker}</strong></span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
