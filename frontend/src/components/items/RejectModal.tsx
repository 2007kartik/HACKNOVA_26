import React, { useState } from 'react';
import { X, Ban, AlertCircle } from 'lucide-react';
import { Item } from '../../types/api';
import { itemsApi } from '../../api/items';
import { APP_CONFIG } from '../../config/app';
import { useToast } from '../common/Toast';

interface RejectModalProps {
  isOpen: boolean;
  item: Item | null;
  onClose: () => void;
  onSuccess: (updatedItem: Item) => void;
}

export const RejectModal: React.FC<RejectModalProps> = ({
  isOpen,
  item,
  onClose,
  onSuccess,
}) => {
  const { success, error: showError } = useToast();
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setErrorMessage('Please provide a reason for rejecting this item.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const updated = await itemsApi.rejectItem(item.id, APP_CONFIG.defaultActor, reason.trim());
      success('Item rejected');
      onSuccess(updated);
      setReason('');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to reject item.');
      showError(err.message || 'Failed to reject item.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="reject-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-rose-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-700">
              <Ban className="w-5 h-5" />
            </div>
            <div>
              <h3 id="reject-modal-title" className="text-base font-semibold text-slate-900">
                Reject Action Item
              </h3>
              <p className="text-xs text-slate-500">Provide an audit reason for rejecting this item.</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
            <span className="font-semibold block text-slate-900 mb-0.5">Item: {item.title}</span>
            <span className="text-slate-500">Type: {item.type} • Status: {item.status}</span>
          </div>

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Rejection Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Out of scope for this sprint, discussed in offline sync, duplicate..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
            <p className="text-[11px] text-slate-400 mt-1">
              Actor recorded: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{APP_CONFIG.defaultActor}</code>
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-rose-600 rounded-lg hover:bg-rose-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <Ban className="w-4 h-4" />
              <span>{isSubmitting ? 'Rejecting...' : 'Confirm Rejection'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
