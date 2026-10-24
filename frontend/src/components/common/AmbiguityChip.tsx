import React from 'react';
import { AmbiguityFlag } from '../../types/api';
import { AlertTriangle } from 'lucide-react';

interface AmbiguityChipProps {
  flag: AmbiguityFlag | string;
  onClick?: () => void;
}

const flagLabels: Record<string, string> = {
  NO_OWNER: 'No owner assigned',
  VAGUE_OWNER: 'Owner is unclear',
  MULTIPLE_OWNERS: 'Multiple owners mentioned',
  VAGUE_DEADLINE: 'Deadline is vague',
  NO_DEADLINE: 'No deadline mentioned',
};

export const AmbiguityChip: React.FC<AmbiguityChipProps> = ({ flag, onClick }) => {
  const label = flagLabels[flag] || flag.replace(/_/g, ' ');

  const content = (
    <>
      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 flex-shrink-0" aria-hidden="true" />
      <span>{label}</span>
      {onClick && (
        <span className="text-[10px] font-bold text-amber-700 bg-amber-200/70 px-1 py-0.2 rounded ml-1">
          Resolve
        </span>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100 hover:border-amber-400 transition-colors cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-amber-500"
        title="Click to clarify this item"
      >
        {content}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300">
      {content}
    </span>
  );
};
