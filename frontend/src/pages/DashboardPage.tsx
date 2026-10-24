import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RefreshCw, Clock, UserX, Calendar, CheckCircle2,
  ArrowRight, Layers, FileCheck2, HelpCircle,
  TrendingUp, AlertCircle, Sparkles, ExternalLink,
} from 'lucide-react';
import { dashboardApi } from '../api/dashboard';
import { OverdueList } from '../components/dashboard/OverdueList';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { StatusBadge } from '../components/common/StatusBadge';
import { useToast } from '../components/common/Toast';
import { useDarkMode } from '../hooks/useDarkMode';

// ── Stat card ─────────────────────────────────────────────────────────────────
const StatCard: React.FC<{
  label: string;
  value: number;
  icon: React.ElementType;
  gradient: string;
  glow: string;
  sublabel?: string;
  dark: boolean;
}> = ({ label, value, icon: Icon, gradient, glow, sublabel, dark }) => (
  <div className={`relative overflow-hidden rounded-2xl p-5 transition-all hover:scale-[1.02] hover:shadow-xl ${
    dark ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-300 shadow-md'
  } ${glow}`}>
    {/* Gradient accent top-left */}
    <div className={`absolute -top-6 -left-6 w-24 h-24 rounded-full opacity-10 ${gradient}`} />
    <div className="relative">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${gradient} shadow-lg`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <TrendingUp className={`w-4 h-4 ${dark ? 'text-slate-700' : 'text-slate-300'}`} />
      </div>
      <div className={`text-3xl font-black tracking-tight mb-1 ${dark ? 'text-white' : 'text-slate-900'}`}>
        {value}
      </div>
      <div className={`text-xs font-semibold uppercase tracking-wider ${dark ? 'text-slate-400' : 'text-slate-500'}`}>
        {label}
      </div>
      {sublabel && (
        <div className={`text-[10px] mt-0.5 ${dark ? 'text-slate-600' : 'text-slate-400'}`}>{sublabel}</div>
      )}
    </div>
  </div>
);

// ── Secondary stat ────────────────────────────────────────────────────────────
const MiniStat: React.FC<{
  label: string; value: number; color: string; dark: boolean;
}> = ({ label, value, color, dark }) => (
  <div className={`p-4 rounded-xl border text-center transition-all hover:scale-[1.02] ${
    dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300 shadow-md'
  }`}>
    <div className={`text-2xl font-black mb-1 ${color}`}>{value}</div>
    <div className={`text-[11px] font-medium ${dark ? 'text-slate-500' : 'text-slate-400'}`}>{label}</div>
  </div>
);

// ── Section header ────────────────────────────────────────────────────────────
const SectionHeader: React.FC<{
  icon: React.ElementType; title: string; count: number;
  badge?: string; dark: boolean; iconColor: string;
}> = ({ icon: Icon, title, count, badge, dark, iconColor }) => (
  <div className={`flex items-center justify-between pb-3 border-b ${dark ? 'border-slate-800' : 'border-slate-100'}`}>
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${iconColor}`} />
      <h3 className={`text-sm font-bold ${dark ? 'text-slate-100' : 'text-slate-900'}`}>
        {title} <span className={`font-normal ${dark ? 'text-slate-500' : 'text-slate-400'}`}>({count})</span>
      </h3>
    </div>
    {badge && (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
        dark ? 'bg-slate-800 text-slate-500' : 'bg-slate-100 text-slate-400'
      }`}>{badge}</span>
    )}
  </div>
);

// ── Main page ─────────────────────────────────────────────────────────────────
export const DashboardPage: React.FC = () => {
  const { success, error: showError } = useToast();
  const { dark } = useDarkMode();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const { data: dashboard, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.getDashboard(),
  });

  const handleSync = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback(null);
      const res = await dashboardApi.syncWithTrello();
      const msg = `Checked ${res.items_checked} tasks: ${res.synced_to_done} updated to DONE.`;
      setSyncFeedback(msg);
      success(msg, 'Trello Sync Complete');
      refetch();
    } catch (err: any) {
      showError(err.message || 'Failed to sync with Trello.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) return <LoadingState message="Loading dashboard..." fullPage />;
  if (isError || !dashboard) return <ErrorState error={error as any} title="Could not load dashboard" onRetry={() => refetch()} />;

  const counts: Record<string, number> = (dashboard.status_counts as Record<string, number>) || dashboard.counts || {};
  const awaiting = dashboard.awaiting_clarification || counts.NEEDS_CLARIFICATION || 0;

  const cardBg     = dark ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-300 shadow-sm';
  const textMain   = dark ? 'text-slate-100' : 'text-slate-900';
  const textSub    = dark ? 'text-slate-400' : 'text-slate-500';
  const divider    = dark ? 'border-slate-800' : 'border-slate-100';
  const itemHover  = dark ? 'hover:bg-slate-800/50' : 'hover:bg-slate-50';

  return (
    <div className="space-y-6">

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5 text-indigo-500" />
            <h1 className={`text-2xl font-bold tracking-tight ${textMain}`}>Dashboard</h1>
          </div>
          <p className={`text-sm ${textSub}`}>
            Global overview of tasks, overdue work, and board synchronization.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className={`p-2 rounded-xl border transition-colors ${
              dark ? 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200' : 'bg-white border-slate-200 text-slate-500 hover:text-slate-800'
            }`}
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={handleSync}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/20 transition-all disabled:opacity-50 hover:scale-105"
          >
            <Layers className="w-4 h-4" />
            <span>{isSyncing ? 'Syncing...' : 'Sync with Trello'}</span>
          </button>
        </div>
      </div>

      {/* ── Sync feedback ── */}
      {syncFeedback && (
        <div className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
          dark ? 'bg-emerald-950/40 border-emerald-800/50 text-emerald-300' : 'bg-emerald-50 border-emerald-200 text-emerald-900'
        }`}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            <span>{syncFeedback}</span>
          </div>
          <button onClick={() => setSyncFeedback(null)} className="text-xs font-semibold opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {/* ── Primary stat cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard dark={dark} label="In Review" value={counts.READY_FOR_REVIEW || 0}
          icon={FileCheck2} gradient="bg-indigo-600" glow="hover:shadow-indigo-500/10"
          sublabel="Awaiting approval" />
        <StatCard dark={dark} label="Needs Clarification" value={awaiting}
          icon={HelpCircle} gradient="bg-amber-500" glow="hover:shadow-amber-500/10"
          sublabel="Flags unresolved" />
        <StatCard dark={dark} label="Approved" value={counts.APPROVED || 0}
          icon={CheckCircle2} gradient="bg-emerald-600" glow="hover:shadow-emerald-500/10"
          sublabel="Ready to push" />
        <StatCard dark={dark} label="Synced" value={counts.SYNCED || 0}
          icon={Layers} gradient="bg-teal-600" glow="hover:shadow-teal-500/10"
          sublabel="Live on board" />
      </div>

      {/* ── Secondary stats ── */}
      <div className="grid grid-cols-3 gap-4">
        <MiniStat dark={dark} label="Extracted" value={counts.EXTRACTED || 0} color="text-blue-500" />
        <MiniStat dark={dark} label="Completed" value={counts.DONE || 0} color="text-purple-500" />
        <MiniStat dark={dark} label="Rejected" value={counts.REJECTED || 0} color="text-rose-500" />
      </div>

      {/* ── Overdue ── */}
      <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
        <SectionHeader dark={dark} icon={Clock} title="Overdue Commitments"
          count={dashboard.overdue.length} badge="Past deadline" iconColor="text-rose-500" />
        {dashboard.overdue.length === 0 ? (
          <div className={`py-8 text-center text-sm ${textSub}`}>
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-50" />
            No overdue items — great work!
          </div>
        ) : (
          <OverdueList items={dashboard.overdue} />
        )}
      </div>

      {/* ── Two column: Unassigned + Pending ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* Unassigned */}
        <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
          <SectionHeader dark={dark} icon={UserX} title="Unassigned Items"
            count={dashboard.unassigned.length} badge="Needs owner" iconColor="text-amber-500" />
          {dashboard.unassigned.length === 0 ? (
            <div className={`py-8 text-center text-sm ${textSub}`}>
              <UserX className="w-8 h-8 mx-auto mb-2 opacity-20" />
              All items have owners assigned.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {dashboard.unassigned.map((item) => (
                <div key={item.id} className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 transition-colors ${itemHover} ${
                  dark ? 'border-amber-900/30 bg-amber-950/20' : 'border-amber-200/80 bg-amber-50/30'
                }`}>
                  <div className="min-w-0">
                    <div className={`font-semibold truncate ${textMain}`}>{item.title}</div>
                    <div className={`flex gap-2 mt-0.5 text-[11px] ${textSub}`}>
                      <span>{item.type?.replace('_', ' ')}</span>
                      <span>·</span>
                      <span>{item.deadline || 'No deadline'}</span>
                    </div>
                  </div>
                  <Link to={`/meetings/${item.meeting_id}`}
                    className="flex-shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-500 transition-colors">
                    Assign <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending from previous meetings */}
        <div className={`rounded-2xl border p-5 space-y-4 ${cardBg}`}>
          <SectionHeader dark={dark} icon={Calendar} title="Pending from Meetings"
            count={dashboard.pending?.length || 0} badge="Carry-over" iconColor="text-indigo-500" />
          {(!dashboard.pending || dashboard.pending.length === 0) ? (
            <div className={`py-8 text-center text-sm ${textSub}`}>
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
              No carry-over items from previous meetings.
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {dashboard.pending.map((item) => (
                <div key={item.id} className={`p-3 rounded-xl border text-xs flex items-center justify-between gap-2 transition-colors ${itemHover} ${
                  dark ? 'border-slate-700 bg-slate-800/40' : 'border-slate-200 bg-slate-50/50'
                }`}>
                  <div className="min-w-0">
                    <div className={`font-semibold truncate ${textMain}`}>{item.title}</div>
                    <div className={`flex gap-2 mt-0.5 text-[11px] ${textSub}`}>
                      <span>{(item as any).meeting_title || 'Meeting'}</span>
                      <span>·</span>
                      <span>Owner: {item.owner || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={item.status} size="sm" />
                    <Link to={`/meetings/${item.meeting_id}`}
                      className={`p-1 rounded-lg transition-colors ${dark ? 'text-slate-500 hover:text-indigo-400' : 'text-slate-400 hover:text-indigo-600'}`}>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Alert if anything needs attention ── */}
      {(awaiting > 0 || dashboard.overdue.length > 0) && (
        <div className={`rounded-2xl border p-4 flex items-start gap-3 ${
          dark ? 'bg-amber-950/20 border-amber-800/40' : 'bg-amber-50 border-amber-200'
        }`}>
          <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className={`font-semibold ${dark ? 'text-amber-300' : 'text-amber-900'}`}>Action needed — </span>
            <span className={dark ? 'text-amber-400' : 'text-amber-700'}>
              {awaiting > 0 && `${awaiting} item${awaiting > 1 ? 's' : ''} need clarification`}
              {awaiting > 0 && dashboard.overdue.length > 0 && ' and '}
              {dashboard.overdue.length > 0 && `${dashboard.overdue.length} overdue commitment${dashboard.overdue.length > 1 ? 's' : ''}`}
              {'.'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
