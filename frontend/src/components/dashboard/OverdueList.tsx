import React from 'react';
import { Link } from 'react-router-dom';
import { Clock, Calendar, User, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Item } from '../../types/api';
import { StatusBadge } from '../common/StatusBadge';
import { TypeBadge } from '../common/TypeBadge';

interface OverdueListProps {
  items: (Partial<Item> & {
    id: string;
    title: string;
    owner?: string | null;
    deadline?: string | null;
    status?: any;
    type?: any;
    meeting_id?: string;
  })[];
}

export const OverdueList: React.FC<OverdueListProps> = ({ items }) => {
  if (items.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
        <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <h5 className="text-sm font-semibold text-slate-800">No Overdue Items</h5>
        <p className="text-xs text-slate-500 mt-0.5">All actionable commitments are currently within schedule.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="p-4 rounded-xl border border-rose-200 bg-rose-50/30 hover:bg-rose-50/60 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
        >
          <div className="space-y-1.5 flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                <Clock className="w-3 h-3" />
                OVERDUE
              </span>
              {item.type && <TypeBadge type={item.type} />}
              <StatusBadge status={item.status} size="sm" />
            </div>

            <h5 className="font-semibold text-slate-900 text-sm truncate" title={item.title}>
              {item.title}
            </h5>

            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600">
              <div className="flex items-center gap-1">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <span>Owner: <strong className="text-slate-800">{item.owner || 'Unassigned'}</strong></span>
              </div>
              <div className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-rose-500" />
                <span className="text-rose-700 font-semibold">Deadline: {item.deadline}</span>
              </div>
            </div>
          </div>

          <div className="flex-shrink-0">
            <Link
              to={item.meeting_id ? `/meetings/${item.meeting_id}` : '/'}
              className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-2xs hover:shadow-xs transition-all"
            >
              <span>{item.meeting_id ? 'View Meeting' : 'View Meetings'}</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
};
