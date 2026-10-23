import React, { useState } from 'react';
import { 
  GitMerge, 
  GitCompare, 
  CheckCheck, 
  Trash2, 
  AlertTriangle, 
  ArrowRightLeft,
  CheckCircle2,
  HelpCircle
} from 'lucide-react';
import { DuplicateLink, DuplicateActionType } from '../../types/api';
import { duplicatesApi } from '../../api/duplicates';
import { TypeBadge } from '../common/TypeBadge';
import { CommitmentBadge } from '../common/CommitmentBadge';
import { StatusBadge } from '../common/StatusBadge';
import { EvidenceQuote } from '../common/EvidenceQuote';
import { useToast } from '../common/Toast';

interface DuplicateLinkCardProps {
  link: DuplicateLink;
  onResolved: (updatedLink: DuplicateLink) => void;
}

export const DuplicateLinkCard: React.FC<DuplicateLinkCardProps> = ({ link, onResolved }) => {
  const { success, error: showError } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedKeepId, setSelectedKeepId] = useState<string>(link.item_a?.id || '');

  const isPending = link.resolution === 'PENDING';
  const percentage = Math.round(Math.min(Math.max(link.score || 0, 0), 1) * 100);

  const handleAction = async (action: DuplicateActionType) => {
    if ((action === 'merge' || action === 'reject_one') && !selectedKeepId) {
      showError('Please select which item you want to keep.');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await duplicatesApi.resolveDuplicate(link.id, action, selectedKeepId);
      success(`Resolved relation as ${action.replace('_', ' ')}`);
      onResolved(res);
    } catch (err: any) {
      showError(err.message || 'Failed to resolve duplicate link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const relationBadges = {
    DUPLICATE: { label: 'Potential Duplicate', bg: 'bg-amber-50 text-amber-800 border-amber-300' },
    CONFLICT: { label: 'Task Conflict', bg: 'bg-rose-50 text-rose-800 border-rose-300' },
    RELATED: { label: 'Related Items', bg: 'bg-blue-50 text-blue-800 border-blue-200' },
  }[link.relation] || { label: link.relation, bg: 'bg-slate-50 text-slate-800 border-slate-200' };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden p-5 space-y-4">
      {/* Header bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-md text-xs font-semibold border ${relationBadges.bg}`}>
            {relationBadges.label}
          </span>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <span>Similarity Score:</span>
            <span className="font-bold text-slate-800">{percentage}%</span>
          </div>
        </div>

        <div>
          {isPending ? (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
              <span>Pending Decision</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Resolved: {link.resolution}</span>
            </span>
          )}
        </div>
      </div>

      {/* Explanation Quote */}
      {link.explanation && (
        <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-700 flex items-start gap-2">
          <HelpCircle className="w-4 h-4 text-indigo-500 flex-shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold text-slate-900 block">AI Match Rationale:</span>
            <p className="mt-0.5 text-slate-600 leading-relaxed">{link.explanation}</p>
          </div>
        </div>
      )}

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Item A */}
        {link.item_a && (
          <div
            className={`p-4 rounded-xl border transition-all ${
              selectedKeepId === link.item_a.id && isPending
                ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-100'
                : 'border-slate-200 bg-slate-50/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Item A
              </span>
              <StatusBadge status={link.item_a.status} size="sm" />
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              <TypeBadge type={link.item_a.type} />
              <CommitmentBadge level={link.item_a.commitment_level} />
            </div>

            <h5 className="font-semibold text-slate-900 text-sm mb-1">{link.item_a.title}</h5>
            {link.item_a.description && (
              <p className="text-xs text-slate-600 mb-2 line-clamp-2">{link.item_a.description}</p>
            )}

            <div className="text-xs text-slate-500 space-y-0.5 mb-2">
              <div>Owner: <strong className="text-slate-800">{link.item_a.owner || 'Unassigned'}</strong></div>
              <div>Deadline: <strong className="text-slate-800">{link.item_a.deadline || 'None'}</strong></div>
            </div>

            <EvidenceQuote quote={link.item_a.evidence_quote} speaker={link.item_a.speaker} />

            {isPending && (
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-indigo-900 cursor-pointer pt-2 border-t border-slate-200">
                <input
                  type="radio"
                  name={`keep-${link.id}`}
                  checked={selectedKeepId === link.item_a.id}
                  onChange={() => setSelectedKeepId(link.item_a.id)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>Select Item A as canonical</span>
              </label>
            )}
          </div>
        )}

        {/* Item B */}
        {link.item_b && (
          <div
            className={`p-4 rounded-xl border transition-all ${
              selectedKeepId === link.item_b.id && isPending
                ? 'border-indigo-500 bg-indigo-50/20 ring-2 ring-indigo-100'
                : 'border-slate-200 bg-slate-50/40'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Item B
              </span>
              <StatusBadge status={link.item_b.status} size="sm" />
            </div>

            <div className="flex items-center gap-1.5 mb-2">
              <TypeBadge type={link.item_b.type} />
              <CommitmentBadge level={link.item_b.commitment_level} />
            </div>

            <h5 className="font-semibold text-slate-900 text-sm mb-1">{link.item_b.title}</h5>
            {link.item_b.description && (
              <p className="text-xs text-slate-600 mb-2 line-clamp-2">{link.item_b.description}</p>
            )}

            <div className="text-xs text-slate-500 space-y-0.5 mb-2">
              <div>Owner: <strong className="text-slate-800">{link.item_b.owner || 'Unassigned'}</strong></div>
              <div>Deadline: <strong className="text-slate-800">{link.item_b.deadline || 'None'}</strong></div>
            </div>

            <EvidenceQuote quote={link.item_b.evidence_quote} speaker={link.item_b.speaker} />

            {isPending && (
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-indigo-900 cursor-pointer pt-2 border-t border-slate-200">
                <input
                  type="radio"
                  name={`keep-${link.id}`}
                  checked={selectedKeepId === link.item_b.id}
                  onChange={() => setSelectedKeepId(link.item_b.id)}
                  className="text-indigo-600 focus:ring-indigo-500"
                />
                <span>Select Item B as canonical</span>
              </label>
            )}
          </div>
        )}
      </div>

      {/* Action Controls for Pending Decisions */}
      {isPending && (
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Choose how to resolve this link. The backend will persist the decision and audit history.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => handleAction('keep_both')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <CheckCheck className="w-3.5 h-3.5 text-slate-500" />
              <span>Keep Both</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction('reject_one')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold transition-colors disabled:opacity-50"
              title="Keep selected canonical item and reject the duplicate"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Reject Other</span>
            </button>

            <button
              type="button"
              onClick={() => handleAction('merge')}
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shadow-xs transition-colors disabled:opacity-50"
              title="Merge items into selected item"
            >
              <GitMerge className="w-3.5 h-3.5" />
              <span>Merge into Selected</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
