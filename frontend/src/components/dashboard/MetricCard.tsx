import React from 'react';
import { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: number | string;
  icon: LucideIcon;
  sublabel?: string;
  colorScheme?: 'indigo' | 'emerald' | 'amber' | 'rose' | 'teal' | 'purple' | 'slate';
  onClick?: () => void;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  label,
  value,
  icon: Icon,
  sublabel,
  colorScheme = 'indigo',
  onClick,
}) => {
  const schemeClasses = {
    indigo: { bg: 'bg-indigo-50/50', border: 'border-indigo-100', iconBg: 'bg-indigo-100 text-indigo-700', text: 'text-indigo-900' },
    emerald: { bg: 'bg-emerald-50/50', border: 'border-emerald-100', iconBg: 'bg-emerald-100 text-emerald-700', text: 'text-emerald-900' },
    amber: { bg: 'bg-amber-50/50', border: 'border-amber-100', iconBg: 'bg-amber-100 text-amber-700', text: 'text-amber-900' },
    rose: { bg: 'bg-rose-50/50', border: 'border-rose-100', iconBg: 'bg-rose-100 text-rose-700', text: 'text-rose-900' },
    teal: { bg: 'bg-teal-50/50', border: 'border-teal-100', iconBg: 'bg-teal-100 text-teal-700', text: 'text-teal-900' },
    purple: { bg: 'bg-purple-50/50', border: 'border-purple-100', iconBg: 'bg-purple-100 text-purple-700', text: 'text-purple-900' },
    slate: { bg: 'bg-slate-50/50', border: 'border-slate-200', iconBg: 'bg-slate-100 text-slate-700', text: 'text-slate-900' },
  }[colorScheme];

  const Component = onClick ? 'button' : 'div';

  return (
    <Component
      onClick={onClick}
      className={`rounded-2xl border p-5 ${schemeClasses.bg} ${schemeClasses.border} flex items-center justify-between text-left transition-all ${
        onClick ? 'hover:shadow-md hover:scale-[1.01] cursor-pointer' : ''
      }`}
    >
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1">{label}</p>
        <p className={`text-2xl font-bold tracking-tight ${schemeClasses.text}`}>{value}</p>
        {sublabel && <p className="text-[11px] text-slate-500 mt-0.5">{sublabel}</p>}
      </div>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${schemeClasses.iconBg}`}>
        <Icon className="w-6 h-6" />
      </div>
    </Component>
  );
};
