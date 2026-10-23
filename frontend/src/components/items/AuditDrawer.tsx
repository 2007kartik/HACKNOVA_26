import React, { useEffect, useState } from 'react';
import { X, History, User, Clock, FileDiff, AlertCircle } from 'lucide-react';
import { Item, AuditEntry } from '../../types/api';
import { itemsApi } from '../../api/items';
import { LoadingState } from '../common/LoadingState';

interface AuditDrawerProps {
  isOpen: boolean;
  item: Item | null;
  onClose: () => void;
}

export const AuditDrawer: React.FC<AuditDrawerProps> = ({ isOpen, item, onClose }) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && item) {
      let isMounted = true;
      setIsLoading(true);
      setError(null);

      itemsApi
        .getItemAudit(item.id)
        .then((data) => {
          if (isMounted) setEntries(data);
        })
        .catch((err) => {
          if (isMounted) setError(err.message || 'Audit history is not currently available for this item.');
        })
        .finally(() => {
          if (isMounted) setIsLoading(false);
        });

      return () => {
        isMounted = false;
      };
    } else {
      setEntries([]);
    }
  }, [isOpen, item]);

  if (!isOpen || !item) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-drawer-title"
    >
      <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col border-l border-slate-200 animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-indigo-100 text-indigo-700">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 id="audit-drawer-title" className="text-sm font-semibold text-slate-900">
                Audit Timeline
              </h3>
              <p className="text-xs text-slate-500 truncate max-w-[260px]" title={item.title}>
                {item.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5">
          {isLoading ? (
            <LoadingState message="Fetching audit trail..." />
          ) : error ? (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-amber-600" />
              <div>
                <p className="font-semibold">Notice</p>
                <p className="mt-0.5">{error}</p>
              </div>
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              <History className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>No audit entries recorded yet for this item.</p>
              <p className="text-slate-400 mt-1">Actions like approvals, edits, and rejections will log here.</p>
            </div>
          ) : (
            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {entries.map((entry, idx) => (
                <div key={idx} className="relative group">
                  {/* Timeline Node */}
                  <span className="absolute -left-6 top-1 w-2.5 h-2.5 rounded-full bg-indigo-600 ring-4 ring-white" />
                  
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold uppercase tracking-wider text-indigo-700 text-[11px]">
                        {entry.action.replace(/_/g, ' ')}
                      </span>
                      <div className="flex items-center gap-1 text-[11px] text-slate-400">
                        <Clock className="w-3 h-3" />
                        <span>{new Date(entry.timestamp).toLocaleString()}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>Actor: <strong className="font-semibold text-slate-800">{entry.actor}</strong></span>
                    </div>

                    {entry.reason && (
                      <div className="text-slate-600 bg-white p-2 rounded border border-slate-200 italic">
                        "{entry.reason}"
                      </div>
                    )}

                    {entry.diff && Object.keys(entry.diff).length > 0 && (
                      <div className="mt-2 pt-2 border-t border-slate-200">
                        <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-600 mb-1">
                          <FileDiff className="w-3 h-3" />
                          <span>Field Changes:</span>
                        </div>
                        <pre className="text-[10px] font-mono bg-white p-2 rounded border border-slate-200 text-slate-700 overflow-x-auto">
                          {JSON.stringify(entry.diff, null, 2)}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
