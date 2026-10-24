import React from 'react';
import { ItemType } from '../../types/api';
import { CheckSquare, GitFork, Lightbulb, HelpCircle, ArrowRightCircle } from 'lucide-react';

interface TypeBadgeProps {
  type?: ItemType | string | null;
}

const typeConfig: Record<string, { label: string; icon: React.ElementType; bg: string; text: string; border: string }> = {
  ACTION_ITEM: {
    label: 'Action Item',
    icon: CheckSquare,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
  },
  DECISION: {
    label: 'Decision',
    icon: GitFork,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
  },
  SUGGESTION: {
    label: 'Suggestion',
    icon: Lightbulb,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
  },
  OPEN_QUESTION: {
    label: 'Open Question',
    icon: HelpCircle,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
  },
  FOLLOW_UP: {
    label: 'Follow-up',
    icon: ArrowRightCircle,
    bg: 'bg-cyan-50',
    text: 'text-cyan-700',
    border: 'border-cyan-200',
  },
};

export const TypeBadge: React.FC<TypeBadgeProps> = ({ type }) => {
  if (!type) {
    return null;
  }

  const config = typeConfig[type] || {
    label: String(type).replace(/_/g, ' '),
    icon: CheckSquare,
    bg: 'bg-slate-50',
    text: 'text-slate-700',
    border: 'border-slate-200',
  };

  const Icon = config.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md text-xs font-medium border ${config.bg} ${config.text} ${config.border}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
