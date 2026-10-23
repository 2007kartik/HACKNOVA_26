import React from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, ArrowRight, Clock } from 'lucide-react';
import { Meeting } from '../../types/api';
import { StatusBadge } from '../common/StatusBadge';

interface MeetingCardProps {
  meeting: Meeting;
}

export const MeetingCard: React.FC<MeetingCardProps> = ({ meeting }) => {
  return (
    <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs hover:shadow-md hover:border-indigo-200 transition-all p-5 flex flex-col justify-between group">
      <div>
        <div className="flex items-start justify-between gap-3 mb-2.5">
          <h3 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 text-base">
            <Link to={`/meetings/${meeting.id}`}>{meeting.title}</Link>
          </h3>
          <StatusBadge status={meeting.status} size="sm" />
        </div>

        <div className="flex flex-wrap items-center gap-y-1.5 gap-x-4 text-xs text-slate-500 mb-4">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span>{meeting.date}</span>
          </div>
          {meeting.created_at && (
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <span>{new Date(meeting.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          )}
        </div>

        {/* Participants Tags */}
        {meeting.participants && meeting.participants.length > 0 && (
          <div className="mb-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              <span>Participants ({meeting.participants.length})</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {meeting.participants.slice(0, 3).map((p, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[11px] font-medium"
                >
                  {p}
                </span>
              ))}
              {meeting.participants.length > 3 && (
                <span className="px-1.5 py-0.5 rounded-md bg-slate-50 text-slate-500 text-[11px]">
                  +{meeting.participants.length - 3} more
                </span>
              )}
            </div>
          </div>
        )}

        {meeting.error_message && meeting.status === 'FAILED' && (
          <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs mb-3">
            <span className="font-semibold">Error: </span>
            {meeting.error_message}
          </div>
        )}
      </div>

      <div className="pt-3 border-t border-slate-100 flex items-center justify-between mt-auto">
        <span className="text-xs text-slate-400">
          {meeting.items_count !== undefined ? `${meeting.items_count} items` : 'View meeting'}
        </span>
        <Link
          to={`/meetings/${meeting.id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          <span>Open Workspace</span>
          <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-0.5 transition-transform" />
        </Link>
      </div>
    </div>
  );
};
