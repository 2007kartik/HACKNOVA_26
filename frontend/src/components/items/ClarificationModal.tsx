import React, { useState } from 'react';
import { X, HelpCircle, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Item, AmbiguityFlag } from '../../types/api';
import { itemsApi } from '../../api/items';
import { FLAG_TO_FIELD_MAP } from '../../config/app';
import { useToast } from '../common/Toast';

interface ClarificationModalProps {
  isOpen: boolean;
  item: Item | null;
  initialFlag?: AmbiguityFlag | string | null;
  onClose: () => void;
  onSuccess: (updatedItem: Item) => void;
}

export const ClarificationModal: React.FC<ClarificationModalProps> = ({
  isOpen,
  item,
  initialFlag,
  onClose,
  onSuccess,
}) => {
  const { success, error: showError } = useToast();
  const [selectedFlag, setSelectedFlag] = useState<string>(
    initialFlag || (item?.flags && item.flags.length > 0 ? item.flags[0] : 'NO_OWNER')
  );
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen || !item) return null;

  const flags = item.flags || [];
  const currentFlag = selectedFlag || (flags.length > 0 ? flags[0] : 'NO_OWNER');
  const fieldMapping = FLAG_TO_FIELD_MAP[currentFlag] || {
    field: currentFlag.toLowerCase().includes('deadline') ? 'deadline' : 'owner',
    label: `Clarify ${currentFlag.replace(/_/g, ' ')}`,
    placeholder: 'Enter answer...',
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!answer.trim()) {
      setErrorMessage('Please provide an answer to clarify this item.');
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage(null);
      const updated = await itemsApi.clarifyItem(item.id, {
        field: fieldMapping.field,
        answer: answer.trim(),
      });
      success(`Clarification submitted for ${fieldMapping.field}`);
      onSuccess(updated);
      setAnswer('');
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Clarification failed. Please check your answer format.');
      showError(err.message || 'Clarification failed.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="clarification-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden border border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-amber-50/50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-amber-100 text-amber-800">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="clarification-modal-title" className="text-base font-semibold text-slate-900">
                Resolve Ambiguity
              </h3>
              <p className="text-xs text-slate-500">Provide missing details to make this item actionable.</p>
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
            <span className="font-semibold block text-slate-800 mb-0.5">Item: {item.title}</span>
            {item.evidence_quote && (
              <p className="text-slate-500 italic mt-1 font-serif line-clamp-2">"{item.evidence_quote}"</p>
            )}
          </div>

          {/* If there are multiple flags, let the user choose which one to address */}
          {flags.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Select Ambiguity to Resolve
              </label>
              <div className="flex flex-wrap gap-1.5">
                {flags.map((flag) => (
                  <button
                    key={flag}
                    type="button"
                    onClick={() => {
                      setSelectedFlag(flag);
                      setAnswer('');
                    }}
                    className={`px-2.5 py-1 text-xs rounded-lg border font-medium transition-colors ${
                      currentFlag === flag
                        ? 'bg-amber-100 border-amber-400 text-amber-900 font-semibold'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {flag.replace(/_/g, ' ')}
                  </button>
                ))}
              </div>
            </div>
          )}

          {errorMessage && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {fieldMapping.label} <span className="text-rose-500">*</span>
            </label>
            {fieldMapping.isDate ? (
              <input
                type="date"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            ) : (
              <input
                type="text"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder={fieldMapping.placeholder}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-amber-500"
                required
              />
            )}
            <p className="text-[11px] text-slate-400 mt-1">
              Field submitted: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">{fieldMapping.field}</code>
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
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 shadow-sm transition-colors disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Resolving...' : 'Submit Clarification'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
