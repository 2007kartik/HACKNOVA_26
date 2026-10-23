import React, { useState } from 'react';
import { 
  User, 
  Calendar, 
  Edit3, 
  Check, 
  RotateCcw, 
  Ban, 
  History, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  Info,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { Item, AmbiguityFlag } from '../../types/api';
import { StatusBadge } from '../common/StatusBadge';
import { TypeBadge } from '../common/TypeBadge';
import { CommitmentBadge } from '../common/CommitmentBadge';
import { AmbiguityChip } from '../common/AmbiguityChip';
import { ConfidenceIndicator } from '../common/ConfidenceIndicator';
import { EvidenceQuote } from '../common/EvidenceQuote';
import { ItemEditorModal } from './ItemEditorModal';
import { ClarificationModal } from './ClarificationModal';
import { RejectModal } from './RejectModal';
import { AuditDrawer } from './AuditDrawer';
import { itemsApi } from '../../api/items';
import { APP_CONFIG } from '../../config/app';
import { useToast } from '../common/Toast';

interface ItemCardProps {
  item: Item;
  onItemUpdated: (updatedItem: Item) => void;
}

export const ItemCard: React.FC<ItemCardProps> = ({ item, onItemUpdated }) => {
  const { success, error: showError } = useToast();
  const [showReasoning, setShowReasoning] = useState(false);
  const [isRejectedExpanded, setIsRejectedExpanded] = useState(false);
  const [isActionPending, setIsActionPending] = useState(false);

  // Modals state
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isClarifyOpen, setIsClarifyOpen] = useState(false);
  const [activeClarifyFlag, setActiveClarifyFlag] = useState<AmbiguityFlag | string | null>(null);
  const [isRejectOpen, setIsRejectOpen] = useState(false);
  const [isAuditOpen, setIsAuditOpen] = useState(false);

  const isRejected = item.status === 'REJECTED';
  const isApproved = item.status === 'APPROVED';
  const isSynced = item.status === 'SYNCED';
  const isDone = item.status === 'DONE';
  const needsClarification = item.status === 'NEEDS_CLARIFICATION' || (item.flags && item.flags.length > 0);

  // Eligibility heuristics
  const hasOwner = Boolean(item.owner && item.owner.trim());
  const hasUnresolvedFlags = Boolean(item.flags && item.flags.length > 0);
  const isEligibleType = item.type === 'ACTION_ITEM' || item.type === 'FOLLOW_UP';
  const isConfirmed = item.commitment_level === 'CONFIRMED';
  const isReadyToApprove = !hasUnresolvedFlags && hasOwner && isEligibleType && isConfirmed;

  // Handle direct Approve
  const handleApprove = async () => {
    try {
      setIsActionPending(true);
      const updated = await itemsApi.approveItem(item.id, APP_CONFIG.defaultActor);
      success('Item approved successfully');
      onItemUpdated(updated);
    } catch (err: any) {
      showError(err.message || 'Cannot approve item.');
    } finally {
      setIsActionPending(false);
    }
  };

  // Handle Un-approve
  const handleUnapprove = async () => {
    try {
      setIsActionPending(true);
      const updated = await itemsApi.unapproveItem(item.id, APP_CONFIG.defaultActor);
      success('Item returned to review');
      onItemUpdated(updated);
    } catch (err: any) {
      showError(err.message || 'Cannot un-approve item.');
    } finally {
      setIsActionPending(false);
    }
  };

  const handleOpenClarify = (flag?: AmbiguityFlag | string) => {
    setActiveClarifyFlag(flag || null);
    setIsClarifyOpen(true);
  };

  // If rejected and collapsed, show compact bar
  if (isRejected && !isRejectedExpanded) {
    return (
      <div className="bg-slate-50/80 rounded-xl border border-slate-200 p-3.5 flex items-center justify-between text-xs text-slate-500 opacity-75 hover:opacity-100 transition-opacity">
        <div className="flex items-center gap-2 line-clamp-1">
          <StatusBadge status="REJECTED" size="sm" />
          <span className="line-through text-slate-600 font-medium">{item.title}</span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={() => setIsAuditOpen(true)}
            className="p-1 hover:text-slate-800 transition-colors"
            title="View Audit Trail"
          >
            <History className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsRejectedExpanded(true)}
            className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900 px-2 py-0.5 rounded bg-white border border-slate-200"
          >
            <span>Expand</span>
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
        </div>
        <AuditDrawer isOpen={isAuditOpen} item={item} onClose={() => setIsAuditOpen(false)} />
      </div>
    );
  }

  return (
    <div
      className={`bg-white rounded-2xl border transition-all duration-200 shadow-xs hover:shadow-md ${
        needsClarification
          ? 'border-amber-300 ring-1 ring-amber-100'
          : isApproved
          ? 'border-emerald-300 ring-1 ring-emerald-50'
          : isSynced
          ? 'border-teal-300 bg-teal-50/10'
          : isRejected
          ? 'border-slate-300 opacity-80'
          : 'border-slate-200/90'
      } p-5 flex flex-col justify-between`}
    >
      <div>
        {/* Top Badges Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={item.type} />
            <CommitmentBadge level={item.commitment_level} />
            <StatusBadge status={item.status} size="sm" />
          </div>
          <ConfidenceIndicator score={item.confidence} compact />
        </div>

        {/* Title & Description */}
        <h4 className={`text-base font-semibold text-slate-900 leading-snug mb-1.5 ${isRejected ? 'line-through text-slate-500' : ''}`}>
          {item.title}
        </h4>
        {item.description && (
          <p className="text-xs text-slate-600 mb-3 whitespace-pre-wrap leading-relaxed">
            {item.description}
          </p>
        )}

        {/* Evidence Quote */}
        <EvidenceQuote quote={item.evidence_quote} speaker={item.speaker} />

        {/* Ambiguity Flags Warning */}
        {item.flags && item.flags.length > 0 && (
          <div className="my-3 p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-900 mb-1.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Ambiguity Flags ({item.flags.length})</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {item.flags.map((flag) => (
                <AmbiguityChip
                  key={flag}
                  flag={flag}
                  onClick={() => handleOpenClarify(flag)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Meta Grid: Owner, Deadline, Speaker, External Sync */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 my-3 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-slate-500">Owner:</span>
            {item.owner ? (
              <span className="font-semibold text-slate-800">{item.owner}</span>
            ) : (
              <span className="text-amber-700 italic font-medium bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                Unassigned
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
            <span className="text-slate-500">Deadline:</span>
            {item.deadline ? (
              <span className="font-semibold text-slate-800">{item.deadline}</span>
            ) : (
              <span className="text-slate-400 italic">None specified</span>
            )}
          </div>
        </div>

        {/* External Synced Task Link if available */}
        {item.external_url && (
          <div className="my-2 p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs flex items-center justify-between text-teal-800">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-teal-600" />
              <span>Synced to Task Board</span>
            </div>
            <a
              href={item.external_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-semibold text-teal-700 hover:text-teal-900 hover:underline"
            >
              <span>View Card</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        )}

        {/* Collapsible Reasoning */}
        {item.reasoning && (
          <div className="mt-2 text-xs">
            <button
              type="button"
              onClick={() => setShowReasoning(!showReasoning)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-indigo-600 transition-colors"
            >
              <Info className="w-3 h-3" />
              <span>{showReasoning ? 'Hide extraction reasoning' : 'Why this was extracted'}</span>
              {showReasoning ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            {showReasoning && (
              <div className="mt-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-xs leading-relaxed animate-in fade-in duration-150">
                {item.reasoning}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Card Actions Footer */}
      <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            disabled={isActionPending}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors border border-slate-200"
            title="Edit item fields"
          >
            <Edit3 className="w-3.5 h-3.5" />
            <span>Edit</span>
          </button>

          <button
            type="button"
            onClick={() => setIsAuditOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
            title="View audit trail"
          >
            <History className="w-3.5 h-3.5" />
            <span className="sr-only sm:not-sr-only sm:text-[11px]">Audit</span>
          </button>

          {isRejected && (
            <button
              type="button"
              onClick={() => setIsRejectedExpanded(false)}
              className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 rounded-lg"
              title="Collapse rejected card"
            >
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Collapse</span>
            </button>
          )}
        </div>

        {/* Primary State Machine Controls */}
        <div className="flex items-center gap-1.5">
          {needsClarification && (
            <button
              type="button"
              onClick={() => handleOpenClarify()}
              disabled={isActionPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-600 hover:bg-amber-700 text-white rounded-lg shadow-xs transition-colors"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>Clarify</span>
            </button>
          )}

          {!isRejected && !isDone && (
            <button
              type="button"
              onClick={() => setIsRejectOpen(true)}
              disabled={isActionPending}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Reject</span>
            </button>
          )}

          {isApproved ? (
            <button
              type="button"
              onClick={handleUnapprove}
              disabled={isActionPending}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
              title="Return approved item back to review status"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Un-approve</span>
            </button>
          ) : !isRejected && !isDone ? (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isActionPending || !isReadyToApprove}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition-colors ${
                isReadyToApprove
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              }`}
              title={
                !isReadyToApprove
                  ? 'Requires confirmed commitment, assigned owner, and resolved ambiguity before approval'
                  : 'Approve this item'
              }
            >
              <Check className="w-3.5 h-3.5" />
              <span>Approve</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Child Modals & Drawers */}
      <ItemEditorModal
        isOpen={isEditOpen}
        item={item}
        onClose={() => setIsEditOpen(false)}
        onSuccess={onItemUpdated}
      />

      <ClarificationModal
        isOpen={isClarifyOpen}
        item={item}
        initialFlag={activeClarifyFlag}
        onClose={() => setIsClarifyOpen(false)}
        onSuccess={onItemUpdated}
      />

      <RejectModal
        isOpen={isRejectOpen}
        item={item}
        onClose={() => setIsRejectOpen(false)}
        onSuccess={onItemUpdated}
      />

      <AuditDrawer
        isOpen={isAuditOpen}
        item={item}
        onClose={() => setIsAuditOpen(false)}
      />
    </div>
  );
};
