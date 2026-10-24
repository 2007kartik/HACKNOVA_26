import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  ArrowLeft, 
  Sparkles, 
  Calendar, 
  Users, 
  FileText, 
  CheckCircle, 
  Eye, 
  Download, 
  GitCompare, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw, 
  AlertTriangle,
  Play,
  RotateCcw
} from 'lucide-react';
import { meetingsApi } from '../api/meetings';
import { itemsApi } from '../api/items';
import { duplicatesApi } from '../api/duplicates';
import { Item, ItemType, ItemStatus, MeetingStatus } from '../types/api';
import { StatusBadge } from '../components/common/StatusBadge';
import { LoadingState } from '../components/common/LoadingState';
import { ErrorState } from '../components/common/ErrorState';
import { EmptyState } from '../components/common/EmptyState';
import { ItemCard } from '../components/items/ItemCard';
import { ExtractionProgress } from '../components/meetings/ExtractionProgress';
import { BulkApproveModal } from '../components/items/BulkApproveModal';
import { DuplicateLinkCard } from '../components/duplicates/DuplicateLinkCard';
import { PushPreviewModal } from '../components/export/PushPreviewModal';
import { ExportPanel } from '../components/export/ExportPanel';
import { useToast } from '../components/common/Toast';
import { APP_CONFIG } from '../config/app';

export const MeetingDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();

  const [activeTab, setActiveTab] = useState<'items' | 'duplicates' | 'export'>('items');
  const [showTranscript, setShowTranscript] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Modals
  const [isBulkApproveOpen, setIsBulkApproveOpen] = useState(false);
  const [isPushPreviewOpen, setIsPushPreviewOpen] = useState(false);
  const [isExtractingAction, setIsExtractingAction] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Query 1: Meeting details
  const {
    data: meeting,
    isLoading: isMeetingLoading,
    isError: isMeetingError,
    error: meetingError,
    refetch: refetchMeeting,
  } = useQuery({
    queryKey: ['meeting', id],
    queryFn: () => (id ? meetingsApi.getMeeting(id) : Promise.reject('No ID')),
    enabled: Boolean(id),
    // Controlled polling every 2s while status is CREATED or EXTRACTING
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === 'EXTRACTING' || status === 'CREATED') {
        return APP_CONFIG.pollingIntervalMs;
      }
      return false;
    },
  });

  // Track elapsed seconds while extracting
  useEffect(() => {
    let timer: any;
    if (meeting?.status === 'EXTRACTING') {
      timer = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      setElapsedSeconds(0);
    }
    return () => clearInterval(timer);
  }, [meeting?.status]);

  // Query 2: Items list
  const {
    data: items = [],
    isLoading: isItemsLoading,
    refetch: refetchItems,
  } = useQuery({
    queryKey: ['items', id, typeFilter, statusFilter],
    queryFn: () =>
      id
        ? itemsApi.getItems(id, {
            type: typeFilter !== 'ALL' ? typeFilter : undefined,
            status: statusFilter !== 'ALL' ? statusFilter : undefined,
          })
        : Promise.resolve([]),
    enabled: Boolean(id && meeting?.status === 'EXTRACTED'),
  });

  // Query 3: Duplicates
  const {
    data: duplicates = [],
    isLoading: isDuplicatesLoading,
    refetch: refetchDuplicates,
  } = useQuery({
    queryKey: ['duplicates', id],
    queryFn: () => (id ? duplicatesApi.getDuplicates(id) : Promise.resolve([])),
    enabled: Boolean(id && meeting?.status === 'EXTRACTED'),
  });

  if (!id) {
    return <ErrorState title="Invalid meeting ID" />;
  }

  if (isMeetingLoading) {
    return <LoadingState message="Loading meeting workspace..." fullPage />;
  }

  if (isMeetingError || !meeting) {
    return (
      <ErrorState
        error={meetingError as any}
        title="Could not find meeting"
        onRetry={() => refetchMeeting()}
      />
    );
  }

  // Trigger extraction
  const handleTriggerExtract = async () => {
    try {
      setIsExtractingAction(true);
      await meetingsApi.triggerExtraction(id);
      success('Extraction initiated. AI is analyzing the transcript...');
      refetchMeeting();
    } catch (err: any) {
      showError(err.message || 'Failed to start extraction.');
    } finally {
      setIsExtractingAction(false);
    }
  };

  // Invalidate queries after any mutation
  const handleItemChanged = (updatedItem: Item) => {
    queryClient.setQueryData(['items', id, typeFilter, statusFilter], (old: Item[] | undefined) => {
      if (!old) return [updatedItem];
      return old.map((it) => (it.id === updatedItem.id ? updatedItem : it));
    });
    queryClient.invalidateQueries({ queryKey: ['items', id] });
    queryClient.invalidateQueries({ queryKey: ['duplicates', id] });
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  const handleDuplicateResolved = () => {
    refetchDuplicates();
    refetchItems();
    queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  };

  // Ready candidate count for bulk approval
  const readyForReviewItems = items.filter(
    (it) => it.status === 'READY_FOR_REVIEW' && it.owner && (!it.flags || it.flags.length === 0)
  );

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Navigation */}
      <div className="flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Meetings</span>
        </Link>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              refetchMeeting();
              if (meeting.status === 'EXTRACTED') {
                refetchItems();
                refetchDuplicates();
              }
            }}
            className="p-1.5 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            title="Refresh workspace data"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Meeting Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2.5 mb-2">
              <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
                {meeting.title}
              </h1>
              <StatusBadge status={meeting.status} />
            </div>

            <div className="flex flex-wrap items-center gap-y-1.5 gap-x-5 text-xs text-slate-500">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-slate-400" />
                <span>Date: <strong className="text-slate-700">{meeting.date}</strong></span>
              </div>
              {meeting.participants && meeting.participants.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-slate-400" />
                  <span>Participants: <strong className="text-slate-700">{meeting.participants.join(', ')}</strong></span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Header Actions */}
          <div className="flex items-center gap-2">
            {meeting.status === 'CREATED' && (
              <button
                onClick={handleTriggerExtract}
                disabled={isExtractingAction}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-xs shadow-sm transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{isExtractingAction ? 'Starting...' : 'Start Extraction'}</span>
              </button>
            )}

            {meeting.status === 'FAILED' && (
              <button
                onClick={handleTriggerExtract}
                disabled={isExtractingAction}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-medium text-xs shadow-sm transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isExtractingAction ? 'Retrying...' : 'Retry Extraction'}</span>
              </button>
            )}

            {meeting.status === 'EXTRACTED' && (
              <button
                onClick={() => setIsPushPreviewOpen(true)}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs shadow-xs transition-colors"
              >
                <Eye className="w-3.5 h-3.5" />
                <span>Preview Push</span>
              </button>
            )}
          </div>
        </div>

        {/* AI-Generated Summary */}
        {meeting.status === 'EXTRACTED' && meeting.summary && (
          <div className="mt-5 p-4 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center flex-shrink-0">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-900 mb-1.5">AI Summary</h3>
                <p className="text-sm leading-relaxed text-slate-700">{meeting.summary}</p>
              </div>
            </div>
          </div>
        )}

        {/* Collapsible Raw Transcript Section */}
        {meeting.raw_text && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowTranscript(!showTranscript)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-indigo-600 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{showTranscript ? 'Hide raw transcript' : 'View full meeting transcript'}</span>
              {showTranscript ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>

            {showTranscript && (
              <div className="mt-3 p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed max-h-72 overflow-y-auto">
                {meeting.raw_text}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Status Views */}
      {meeting.status === 'EXTRACTING' && (
        <ExtractionProgress elapsedSeconds={elapsedSeconds} />
      )}

      {meeting.status === 'FAILED' && (
        <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 space-y-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-rose-600 flex-shrink-0" />
            <div>
              <h3 className="font-bold text-base text-rose-900">Extraction Pipeline Failed</h3>
              <p className="mt-1 text-xs text-rose-700 leading-relaxed">
                {meeting.error_message || 'The AI extraction service encountered an error while processing the transcript.'}
              </p>
            </div>
          </div>
          <div className="pt-2">
            <button
              onClick={handleTriggerExtract}
              disabled={isExtractingAction}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shadow-xs"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry Extraction Pipeline</span>
            </button>
          </div>
        </div>
      )}

      {meeting.status === 'CREATED' && (
        <div className="p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <Sparkles className="w-10 h-10 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-base font-semibold text-slate-800">Transcript Ready for Analysis</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Click "Start Extraction" to invoke the AI pipeline. It will identify decisions, assignees, deadlines, and ambiguity flags.
          </p>
          <button
            onClick={handleTriggerExtract}
            disabled={isExtractingAction}
            className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs shadow-sm"
          >
            <Play className="w-4 h-4" />
            <span>Start Extraction</span>
          </button>
        </div>
      )}

      {/* Extracted Workspace */}
      {meeting.status === 'EXTRACTED' && (
        <div className="space-y-5">
          {/* Tabs Navigation */}
          <div className="flex items-center justify-between border-b border-slate-200 pb-px">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('items')}
                className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors ${
                  activeTab === 'items'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>Items & Review</span>
                <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-bold">
                  {items.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('duplicates')}
                className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors ${
                  activeTab === 'duplicates'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <GitCompare className="w-4 h-4" />
                <span>Duplicates & Conflicts</span>
                {duplicates.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">
                    {duplicates.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('export')}
                className={`flex items-center gap-2 py-3 px-4 font-semibold text-xs sm:text-sm border-b-2 transition-colors ${
                  activeTab === 'export'
                    ? 'border-indigo-600 text-indigo-600 font-bold'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Download className="w-4 h-4" />
                <span>Push & Export</span>
              </button>
            </div>

            {/* Tab 1 Quick Action: Bulk Approve */}
            {activeTab === 'items' && readyForReviewItems.length > 0 && (
              <button
                onClick={() => setIsBulkApproveOpen(true)}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 text-xs font-semibold transition-colors"
                title="Approve all eligible items currently in review"
              >
                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                <span>Approve All Ready ({readyForReviewItems.length})</span>
              </button>
            )}
          </div>

          {/* TAB 1: Items & Review */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              {/* Filter controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium">Type:</span>
                    <select
                      value={typeFilter}
                      onChange={(e) => setTypeFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="ALL">All Types</option>
                      <option value="ACTION_ITEM">Action Item</option>
                      <option value="DECISION">Decision</option>
                      <option value="SUGGESTION">Suggestion</option>
                      <option value="OPEN_QUESTION">Open Question</option>
                      <option value="FOLLOW_UP">Follow-up</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-slate-400 font-medium">Status:</span>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      className="px-2.5 py-1 text-xs rounded-lg border border-slate-200 bg-slate-50 text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium"
                    >
                      <option value="ALL">All Statuses</option>
                      <option value="READY_FOR_REVIEW">Ready for Review</option>
                      <option value="NEEDS_CLARIFICATION">Needs Clarification</option>
                      <option value="APPROVED">Approved</option>
                      <option value="SYNCED">Synced</option>
                      <option value="REJECTED">Rejected</option>
                      <option value="EXTRACTED">Extracted</option>
                    </select>
                  </div>
                </div>

                {readyForReviewItems.length > 0 && (
                  <button
                    onClick={() => setIsBulkApproveOpen(true)}
                    className="sm:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>Approve Ready ({readyForReviewItems.length})</span>
                  </button>
                )}
              </div>

              {/* Items List */}
              {isItemsLoading ? (
                <LoadingState message="Loading action items..." />
              ) : items.length === 0 ? (
                <EmptyState
                  title="No items found"
                  description={
                    typeFilter !== 'ALL' || statusFilter !== 'ALL'
                      ? 'No items match your active filters. Try resetting the filters.'
                      : 'No action items or decisions were extracted from this transcript.'
                  }
                  icon={Sparkles}
                />
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {items.map((item) => (
                    <ItemCard
                      key={item.id}
                      item={item}
                      onItemUpdated={handleItemChanged}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Duplicates & Conflicts */}
          {activeTab === 'duplicates' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-600">
                <span className="font-semibold text-slate-800 block mb-0.5">Semantic Duplicate & Conflict Detection</span>
                The agent compares action items across context to identify overlapping responsibilities or contradictory commitments.
              </div>

              {isDuplicatesLoading ? (
                <LoadingState message="Checking duplicate links..." />
              ) : duplicates.length === 0 ? (
                <EmptyState
                  title="No duplicates or conflicts detected"
                  description="All extracted action items in this meeting appear distinct and non-conflicting."
                  icon={CheckCircle}
                />
              ) : (
                <div className="space-y-4">
                  {duplicates.map((link) => (
                    <DuplicateLinkCard
                      key={link.id}
                      link={link}
                      onResolved={handleDuplicateResolved}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: Push & Export */}
          {activeTab === 'export' && (
            <div className="space-y-6">
              {/* Push Action Callout */}
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h4 className="text-base font-semibold text-slate-900">Push to Trello</h4>
                  <p className="text-xs text-slate-500 mt-0.5 max-w-lg leading-relaxed">
                    Generate an interactive dry-run preview to verify cards before creating them. Human review and explicit confirmation are required.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPushPreviewOpen(true)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  <span>Preview & Push to Trello</span>
                </button>
              </div>

              {/* Export Deliverables Panel */}
              <ExportPanel
                meetingId={meeting.id}
                meetingTitle={meeting.title}
                meetingDate={meeting.date}
              />
            </div>
          )}
        </div>
      )}

      {/* Bulk Approval Modal */}
      <BulkApproveModal
        isOpen={isBulkApproveOpen}
        meetingId={meeting.id}
        readyCount={readyForReviewItems.length}
        onClose={() => setIsBulkApproveOpen(false)}
        onSuccess={() => {
          refetchItems();
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />

      {/* Push Preview Modal */}
      <PushPreviewModal
        isOpen={isPushPreviewOpen}
        meetingId={meeting.id}
        meetingTitle={meeting.title}
        onClose={() => setIsPushPreviewOpen(false)}
        onSuccess={() => {
          refetchItems();
          queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        }}
      />
    </div>
  );
};
