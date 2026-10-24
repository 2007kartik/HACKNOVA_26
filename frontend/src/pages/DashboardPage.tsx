import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  RefreshCw, 
  Clock, 
  UserX, 
  HelpCircle, 
  CheckCircle, 
  ArrowRight, 
  Layers,
  FileCheck2,
  Calendar,
  Sparkles,
  Trello
} from 'lucide-react';
import { dashboardApi } from '../api/dashboard';
import { MetricCard } from '../components/dashboard/MetricCard';
import { OverdueList } from '../components/dashboard/OverdueList';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { StatusBadge } from '../components/common/StatusBadge';
import { TypeBadge } from '../components/common/TypeBadge';
import { useToast } from '../components/common/Toast';

export const DashboardPage: React.FC = () => {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const {
    data: dashboard,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => dashboardApi.getDashboard(),
  });

  const handleSyncWithTrello = async () => {
    try {
      setIsSyncing(true);
      setSyncFeedback(null);
      const res = await dashboardApi.syncWithTrello();
      const msg = `Checked ${res.items_checked} tasks on board: ${res.synced_to_done} updated to DONE.`;
      setSyncFeedback(msg);
      success(msg, 'Trello Sync Complete');
      refetch();
    } catch (err: any) {
      showError(err.message || 'Failed to sync with Trello.');
    } finally {
      setIsSyncing(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading dashboard metrics..." fullPage />;
  }

  if (isError || !dashboard) {
    return (
      <ErrorState
        error={error as any}
        title="Could not load dashboard metrics"
        onRetry={() => refetch()}
      />
    );
  }

  const counts: Record<string, number> = (dashboard.status_counts as Record<string, number>) || dashboard.counts || {};
  const awaitingClarification =
    dashboard.awaiting_clarification || counts.NEEDS_CLARIFICATION || 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Global overview of action items, pending clarifications, overdue work, and board synchronization.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-xl hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh metrics"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleSyncWithTrello}
            disabled={isSyncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-medium text-xs sm:text-sm shadow-sm transition-colors disabled:opacity-50"
            title="Poll Trello board to sync completed cards to DONE"
          >
            <Trello className="w-4 h-4" />
            <span>{isSyncing ? 'Syncing...' : 'Sync with Trello'}</span>
          </button>
        </div>
      </div>

      {/* Sync Feedback Alert */}
      {syncFeedback && (
        <div className="p-3.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center justify-between animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-teal-600" />
            <span>{syncFeedback}</span>
          </div>
          <button
            onClick={() => setSyncFeedback(null)}
            className="text-teal-700 hover:text-teal-900 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Status Metric Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <MetricCard
          label="In Review"
          value={counts.READY_FOR_REVIEW || 0}
          icon={FileCheck2}
          colorScheme="indigo"
          sublabel="Awaiting human decision"
        />

        <MetricCard
          label="Needs Clarification"
          value={awaitingClarification}
          icon={HelpCircle}
          colorScheme="amber"
          sublabel="Unresolved ambiguity flags"
        />

        <MetricCard
          label="Approved"
          value={counts.APPROVED || 0}
          icon={CheckCircle}
          colorScheme="emerald"
          sublabel="Ready for board push"
        />

        <MetricCard
          label="Synced to Board"
          value={counts.SYNCED || 0}
          icon={Layers}
          colorScheme="teal"
          sublabel="Live external tasks"
        />
      </div>

      {/* Secondary Status Row */}
      <div className="grid grid-cols-3 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 bg-white text-xs">
          <span className="text-slate-400 font-medium block mb-1">Newly Extracted</span>
          <span className="text-xl font-bold text-slate-800">{counts.EXTRACTED || 0}</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white text-xs">
          <span className="text-slate-400 font-medium block mb-1">Completed (Done)</span>
          <span className="text-xl font-bold text-purple-700">{counts.DONE || 0}</span>
        </div>
        <div className="p-4 rounded-xl border border-slate-200 bg-white text-xs">
          <span className="text-slate-400 font-medium block mb-1">Rejected Items</span>
          <span className="text-xl font-bold text-rose-600">{counts.REJECTED || 0}</span>
        </div>
      </div>

      {/* Overdue Work Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-rose-600" />
            <h2 className="text-base font-semibold text-slate-900">
              Overdue Commitments ({dashboard.overdue.length})
            </h2>
          </div>
          <span className="text-xs text-slate-400">Determined by backend schedule</span>
        </div>
        <OverdueList items={dashboard.overdue} />
      </div>

      {/* Two Column Layout: Unassigned & Pending Items */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Unassigned Work */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <UserX className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Unassigned Items ({dashboard.unassigned.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Needs owner to approve</span>
          </div>

          {dashboard.unassigned.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center italic">
              All extracted action items currently have an assigned owner.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {dashboard.unassigned.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-amber-200/80 bg-amber-50/20 text-xs flex items-center justify-between gap-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.title}</div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>Type: {item.type}</span>
                      <span>•</span>
                      <span>Deadline: {item.deadline || 'None'}</span>
                    </div>
                  </div>
                  <Link
                    to={`/meetings/${item.meeting_id}`}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                  >
                    <span>Assign</span>
                    <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Pending from Previous Meetings */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-semibold text-slate-900">
                Pending Work from Meetings ({dashboard.pending.length})
              </h3>
            </div>
            <span className="text-[11px] text-slate-400">Incomplete carry-over</span>
          </div>

          {dashboard.pending.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center italic">
              No outstanding pending items from earlier sessions.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
              {dashboard.pending.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 text-xs flex items-center justify-between gap-2"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-slate-900 truncate">{item.title}</div>
                    <div className="flex items-center gap-2 text-[11px] text-slate-500">
                      <span>{item.meeting_title || 'Meeting'}</span>
                      <span>•</span>
                      <span>Owner: {item.owner || 'Unassigned'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <StatusBadge status={item.status} size="sm" />
                    <Link
                      to={`/meetings/${item.meeting_id}`}
                      className="p-1 text-slate-400 hover:text-indigo-600"
                      title="Open Meeting"
                    >
                      <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
