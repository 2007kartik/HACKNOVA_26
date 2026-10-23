import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, ArrowRight } from 'lucide-react';
import { BulkApproveResponse } from '../../types/api';
import { meetingsApi } from '../../api/meetings';
import { APP_CONFIG } from '../../config/app';
import { useToast } from '../common/Toast';

interface BulkApproveModalProps {
  isOpen: boolean;
  meetingId: string;
  readyCount: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const BulkApproveModal: React.FC<BulkApproveModalProps> = ({
  isOpen,
  meetingId,
  readyCount,
  onClose,
  onSuccess,
}) => {
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [results, setResults] = useState<BulkApproveResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleApprove = async () => {
    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const res = await meetingsApi.approveAllReady(meetingId, APP_CONFIG.defaultActor);
      setResults(res);
      success(`Approved ${res.approved?.length || 0} items`);
      onSuccess();
    } catch (err: any) {
      setErrorMessage(err.message || 'Bulk approval failed.');
      showError(err.message || 'Bulk approval failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setResults(null);
    setErrorMessage(null);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-approve-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-emerald-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-800">
              <CheckCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="bulk-approve-modal-title" className="text-base font-semibold text-slate-900">
                Bulk Approve Ready Items
              </h3>
              <p className="text-xs text-slate-500">Approve all eligible items that have passed validation.</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {errorMessage && (
            <div className="p-3 mb-4 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!results ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                This action will approve all items in status <strong className="text-slate-900">READY_FOR_REVIEW</strong> with an assigned owner and no unresolved ambiguity flags.
              </p>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Candidates in review:</span>
                  <span className="font-bold text-slate-900">{readyCount} items</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">Approver identity:</span>
                  <span className="font-mono text-indigo-700">{APP_CONFIG.defaultActor}</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Items with missing owners, vague deadlines, or suggestions/questions without confirmation will be safely skipped.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={isSubmitting}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 shadow-sm transition-colors disabled:opacity-50"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>{isSubmitting ? 'Approving...' : 'Approve All Ready'}</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between">
                <span className="font-semibold">Approved successfully:</span>
                <span className="text-sm font-bold">{results.approved?.length || 0} items</span>
              </div>

              {results.skipped && results.skipped.length > 0 && (
                <div>
                  <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Skipped Items ({results.skipped.length})
                  </h4>
                  <div className="max-h-48 overflow-y-auto space-y-2 pr-1">
                    {results.skipped.map((skipped, idx) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs space-y-1"
                      >
                        <div className="font-medium text-slate-800">
                          {skipped.title || skipped.item_id || `Item #${idx + 1}`}
                        </div>
                        <div className="text-amber-700 font-sans">
                          Reason: {skipped.reason}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-end">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                >
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
