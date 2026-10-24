import React from 'react';
import { ItemStatus, MeetingStatus } from '../../types/api';

interface StatusBadgeProps {
  status?: ItemStatus | MeetingStatus | string | null;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  // Item statuses
  EXTRACTED: {
    label: 'Extracted',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  NEEDS_CLARIFICATION: {
    label: 'Needs Clarification',
    bg: 'bg-amber-50',
    text: 'text-amber-800',
    border: 'border-amber-300',
    dot: 'bg-amber-500 animate-pulse',
  },
  READY_FOR_REVIEW: {
    label: 'Ready for Review',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    dot: 'bg-blue-500',
  },
  APPROVED: {
    label: 'Approved',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-300',
    dot: 'bg-emerald-500',
  },
  REJECTED: {
    label: 'Rejected',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    dot: 'bg-rose-400',
  },
  SYNCED: {
    label: 'Synced to Board',
    bg: 'bg-teal-50',
    text: 'text-teal-700',
    border: 'border-teal-300',
    dot: 'bg-teal-500',
  },
  DONE: {
    label: 'Done',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    dot: 'bg-purple-500',
  },
  // Meeting statuses
  CREATED: {
    label: 'Created',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  },
  EXTRACTING: {
    label: 'Analyzing with AI',
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-300',
    dot: 'bg-indigo-500 animate-ping',
  },
  FAILED: {
    label: 'Extraction Failed',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-300',
    dot: 'bg-red-500',
  },
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const safeStatus = status || 'EXTRACTED';
  const config = statusConfig[safeStatus] || {
    label: String(safeStatus).replace(/_/g, ' '),
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    dot: 'bg-slate-400',
  };

  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5 gap-1.5',
    md: 'text-xs font-medium px-2.5 py-1 gap-1.5',
    lg: 'text-sm font-medium px-3 py-1.5 gap-2',
  }[size];

  return (
    <span
      className={`inline-flex items-center rounded-full border ${config.bg} ${config.text} ${config.border} ${sizeClasses}`}
      title={`Status: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.dot}`} aria-hidden="true" />
      <span>{config.label}</span>
    </span>
  );
};
