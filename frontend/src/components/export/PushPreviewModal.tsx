import React, { useState } from 'react';
import {
  X, Eye, Send, ExternalLink, CheckCircle2,
  AlertCircle, AlertTriangle, ShieldAlert, GitBranch,
} from 'lucide-react';
import { PushResponse } from '../../types/api';
import { meetingsApi } from '../../api/meetings';
import { useToast } from '../common/Toast';

interface PushPreviewModalProps {
  isOpen: boolean;
  meetingId: string;
  meetingTitle: string;
  onClose: () => void;
  onSuccess: () => void;
}

type Target = 'trello' | 'github';

const TARGET_CONFIG: Record<Target, {
  label: string;
  color: string;
  activeBg: string;
  activeTxt: string;
  btnBg: string;
  icon: React.ReactNode;
  confirmMsg: string;
  pushingMsg: string;
  successMsg: string;
}> = {
  trello: {
    label: 'Trello',
    color: 'blue',
    activeBg: 'bg-blue-600',
    activeTxt: 'text-white',
    btnBg: 'bg-blue-600 hover:bg-blue-700',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
        <path d="M21 0H3C1.3 0 0 1.3 0 3v18c0 1.7 1.3 3 3 3h18c1.7 0 3-1.3 3-3V3c0-1.7-1.3-3-3-3zM10.4 17.5c0 .8-.6 1.4-1.4 1.4H4.6c-.8 0-1.4-.6-1.4-1.4V6.5c0-.8.6-1.4 1.4-1.4H9c.8 0 1.4.6 1.4 1.4v11zm10.4-5.6c0 .8-.6 1.4-1.4 1.4H15c-.8 0-1.4-.6-1.4-1.4V6.5c0-.8.6-1.4 1.4-1.4h4.4c.8 0 1.4.6 1.4 1.4v5.4z"/>
      </svg>
    ),
    confirmMsg: 'This will create real Trello cards. Cannot be undone.',
    pushingMsg: 'Creating Trello Cards...',
    successMsg: 'Trello cards created',
  },
  github: {
    label: 'GitHub Issues',
    color: 'slate',
    activeBg: 'bg-slate-800',
    activeTxt: 'text-white',
    btnBg: 'bg-slate-800 hover:bg-slate-700',
    icon: <GitBranch className="w-4 h-4" />,
    confirmMsg: 'This will create real GitHub Issues with labels. Cannot be undone.',
    pushingMsg: 'Creating GitHub Issues...',
    successMsg: 'GitHub issues created',
  },
};

export const PushPreviewModal: React.FC<PushPreviewModalProps> = ({
  isOpen,
  meetingId,
  meetingTitle,
  onClose,
  onSuccess,
}) => {
  const { success, error: showError } = useToast();
  const [target, setTarget] = useState<Target>('trello');
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [isPushLoading, setIsPushLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<PushResponse | null>(null);
  const [executionResult, setExecutionResult] = useState<PushResponse | null>(null);
  const [confirmStepOpen, setConfirmStepOpen] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const cfg = TARGET_CONFIG[target];

  const resetState = () => {
    setPreviewResult(null);
    setExecutionResult(null);
    setConfirmStepOpen(false);
    setErrorMessage(null);
  };

  const handleTargetChange = (t: Target) => {
    setTarget(t);
    resetState();
  };

  const handleRunPreview = async () => {
    try {
      setIsPreviewLoading(true);
      setErrorMessage(null);
      setExecutionResult(null);
      const res = await meetingsApi.previewPush(meetingId, target);
      setPreviewResult(res);
      success(`Dry-run preview generated for ${cfg.label}`);
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to generate preview for ${cfg.label}.`);
      showError(err.message || 'Dry-run preview failed.');
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const handleExecutePush = async () => {
    try {
      setIsPushLoading(true);
      setErrorMessage(null);
      const res = await meetingsApi.executePush(meetingId, target);
      setExecutionResult(res);
      setConfirmStepOpen(false);
      success(`${cfg.successMsg}: ${res.pushed?.length || 0} pushed, ${res.failed?.length || 0} failed.`);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || `Push to ${cfg.label} failed.`);
      showError(err.message || 'Push failed.');
    } finally {
      setIsPushLoading(false);
    }
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const candidateCount = previewResult?.pushed?.length || 0;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="push-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden border border-slate-200">

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/60">
          <div>
            <h3 id="push-modal-title" className="text-base font-semibold text-slate-900">
              Push Approved Tasks
            </h3>
            <p className="text-xs text-slate-500">
              Dry-run preview is mandatory before any live push.
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isPreviewLoading || isPushLoading}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Target selector ── */}
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
            {(Object.keys(TARGET_CONFIG) as Target[]).map((t) => {
              const c = TARGET_CONFIG[t];
              const isActive = target === t;
              return (
                <button
                  key={t}
                  onClick={() => handleTargetChange(t)}
                  disabled={isPreviewLoading || isPushLoading}
                  className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold transition-all ${
                    isActive
                      ? `${c.activeBg} ${c.activeTxt} shadow-sm`
                      : 'text-slate-500 hover:text-slate-700 hover:bg-white/60'
                  }`}
                >
                  {c.icon}
                  {c.label}
                </button>
              );
            })}
          </div>

          {/* ── Error ── */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-rose-600" />
              <div>
                <p className="font-semibold">Integration Notice</p>
                <p className="mt-0.5 leading-relaxed">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* ── Initial: no preview yet ── */}
          {!previewResult && !executionResult && (
            <div className="text-center py-8 px-4 bg-slate-50 rounded-xl border border-slate-200">
              <Eye className="w-10 h-10 text-indigo-500 mx-auto mb-2.5" />
              <h4 className="text-sm font-semibold text-slate-800">Dry-Run Preview Required</h4>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                Simulate {cfg.label === 'Trello' ? 'card' : 'issue'} creation for all approved items
                without making any real changes.
              </p>
              <button
                type="button"
                onClick={handleRunPreview}
                disabled={isPreviewLoading}
                className={`mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg ${cfg.btnBg} text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50`}
              >
                {isPreviewLoading
                  ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  : <Eye className="w-4 h-4" />}
                {isPreviewLoading ? 'Simulating...' : 'Generate Preview'}
              </button>
            </div>
          )}

          {/* ── Preview results ── */}
          {previewResult && !executionResult && (
            <div className="space-y-4">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
                <span className="font-semibold">
                  Preview only — no {cfg.label === 'Trello' ? 'cards' : 'issues'} have been created yet.
                </span>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                  <span>Eligible to Push ({previewResult.pushed?.length || 0})</span>
                  <span className="text-slate-400 font-normal">Approved items only</span>
                </div>
                {previewResult.pushed && previewResult.pushed.length > 0 ? (
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {previewResult.pushed.map((card, idx) => (
                      <div key={idx} className="p-3 rounded-lg border border-slate-200 bg-white text-xs space-y-1 shadow-xs">
                        <div className="font-semibold text-slate-900">{card.title}</div>
                        <div className="flex items-center gap-4 text-slate-500 text-[11px]">
                          <span>Owner: <strong className="text-slate-700">{card.owner || 'Unassigned'}</strong></span>
                          <span>Deadline: <strong className="text-slate-700">{card.deadline || 'None'}</strong></span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-4 text-center rounded-lg border border-dashed border-slate-200 text-slate-400 text-xs">
                    No approved items to push. Approve some items first.
                  </div>
                )}
              </div>

              {/* Confirm step */}
              {confirmStepOpen ? (
                <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-xs space-y-3">
                  <div className="flex items-start gap-2.5">
                    <ShieldAlert className="w-5 h-5 text-rose-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-bold text-rose-900">Confirm Live Push</h4>
                      <p className="mt-0.5 text-rose-700 leading-relaxed">
                        {cfg.confirmMsg} Creating <strong>{candidateCount} {cfg.label === 'Trello' ? 'cards' : 'issues'}</strong>.
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setConfirmStepOpen(false)}
                      disabled={isPushLoading}
                      className="px-3 py-1.5 rounded-lg bg-white border border-rose-300 text-rose-700 font-semibold hover:bg-rose-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleExecutePush}
                      disabled={isPushLoading}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-semibold shadow-xs disabled:opacity-50"
                    >
                      {isPushLoading && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      {isPushLoading ? cfg.pushingMsg : `Yes, Push Now`}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleRunPreview}
                    disabled={isPreviewLoading}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-800 underline"
                  >
                    Re-run Preview
                  </button>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={handleClose} className="px-4 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50">
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmStepOpen(true)}
                      disabled={candidateCount === 0 || isPushLoading}
                      className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white ${cfg.btnBg} rounded-lg shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Push {candidateCount} to {cfg.label}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Execution results ── */}
          {executionResult && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span className="font-semibold">Push to {cfg.label} Complete</span>
                </div>
                <span className="font-bold">
                  {executionResult.pushed?.length || 0} Success / {executionResult.failed?.length || 0} Failed
                </span>
              </div>

              {executionResult.pushed && executionResult.pushed.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Created ({executionResult.pushed.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {executionResult.pushed.map((card, idx) => {
                      const url = (card as any).trello_url || (card as any).card_url || (card as any).url;
                      return (
                        <div key={idx} className="p-3 rounded-lg border border-emerald-200 bg-white text-xs flex items-center justify-between shadow-xs">
                          <div>
                            <div className="font-semibold text-slate-900">{card.title}</div>
                            <div className="text-[11px] text-slate-500">
                              Owner: {card.owner || 'Unassigned'} · Deadline: {card.deadline || 'None'}
                            </div>
                          </div>
                          {url && (
                            <a
                              href={url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-50 text-teal-700 font-semibold hover:bg-teal-100 flex-shrink-0 ml-3"
                            >
                              Open <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {executionResult.failed && executionResult.failed.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-rose-700 uppercase tracking-wider mb-2">
                    Failed ({executionResult.failed.length})
                  </h4>
                  <div className="max-h-36 overflow-y-auto space-y-2 pr-1">
                    {executionResult.failed.map((card, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg border border-rose-200 bg-rose-50 text-xs">
                        <div className="font-semibold text-slate-900">{card.title}</div>
                        <div className="text-rose-700 text-[11px] mt-0.5">
                          {(card as any).error || 'Integration error.'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button type="button" onClick={handleClose} className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700">
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
