import React from 'react';
import { CommitmentLevel } from '../../types/api';
import { ShieldCheck, HelpCircle, FileQuestion } from 'lucide-react';

interface CommitmentBadgeProps {
  level: CommitmentLevel | string;
}

const commitmentConfig: Record<string, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  CONFIRMED: {
    label: 'Confirmed',
    icon: ShieldCheck,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  PROPOSED: {
    label: 'Proposed',
    icon: HelpCircle,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  UNRESOLVED: {
    label: 'Unresolved',
    icon: FileQuestion,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
  },
};

export const CommitmentBadge: React.FC<CommitmentBadgeProps> = ({ level }) => {
  const config = commitmentConfig[level] || {
    label: level,
    icon: HelpCircle,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
      title={`Commitment Level: ${config.label}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
