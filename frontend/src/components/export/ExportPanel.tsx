import React, { useState } from 'react';
import { Download, FileSpreadsheet, FileJson, CheckCircle2, ShieldCheck } from 'lucide-react';
import { meetingsApi } from '../../api/meetings';
import { useToast } from '../common/Toast';

interface ExportPanelProps {
  meetingId: string;
  meetingTitle: string;
  meetingDate: string;
}

export const ExportPanel: React.FC<ExportPanelProps> = ({
  meetingId,
  meetingTitle,
  meetingDate,
}) => {
  const { success, error: showError } = useToast();
  const [onlyApproved, setOnlyApproved] = useState(true);
  const [isDownloadingCsv, setIsDownloadingCsv] = useState(false);
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);

  const cleanTitle = (meetingTitle || 'meeting')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 30);
  const dateStr = meetingDate || 'export';

  const handleExport = async (format: 'csv' | 'json') => {
    const only = onlyApproved ? 'approved' : 'all';
    const filename = `${cleanTitle}_${dateStr}_${only}.${format}`;

    try {
      if (format === 'csv') setIsDownloadingCsv(true);
      else setIsDownloadingJson(true);

      await meetingsApi.exportMeeting(meetingId, format, only, filename);
      success(`Downloaded ${filename}`);
    } catch (err: any) {
      showError(err.message || `Failed to export ${format.toUpperCase()}`);
    } finally {
      if (format === 'csv') setIsDownloadingCsv(false);
      else setIsDownloadingJson(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h4 className="text-base font-semibold text-slate-900">Export Meeting Deliverables</h4>
          <p className="text-xs text-slate-500 mt-0.5">
            Download machine-readable exports of decisions, action items, owners, deadlines, and evidence quotes.
          </p>
        </div>
        <div className="p-2 rounded-xl bg-indigo-50 text-indigo-700">
          <Download className="w-5 h-5" />
        </div>
      </div>

      {/* Filter Selector */}
      <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
        <label className="block text-xs font-semibold text-slate-700">Filter Items for Export</label>
        <div className="flex flex-wrap gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
            <input
              type="radio"
              name="exportFilter"
              checked={onlyApproved}
              onChange={() => setOnlyApproved(true)}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span className="font-medium">Approved items only (Recommended)</span>
          </label>
          <label className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
            <input
              type="radio"
              name="exportFilter"
              checked={!onlyApproved}
              onChange={() => setOnlyApproved(false)}
              className="text-indigo-600 focus:ring-indigo-500"
            />
            <span>All items (including review & suggestions)</span>
          </label>
        </div>
      </div>

      {/* Download Action Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CSV */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-emerald-700 font-semibold text-sm mb-1">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Comma Separated (CSV)</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Best for spreadsheets (Excel, Google Sheets). Includes title, type, owner, deadline, status, and evidence quote.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleExport('csv')}
            disabled={isDownloadingCsv || isDownloadingJson}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-colors disabled:opacity-50"
          >
            {isDownloadingCsv ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isDownloadingCsv ? 'Exporting CSV...' : 'Download CSV'}</span>
          </button>
        </div>

        {/* JSON */}
        <div className="p-4 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 transition-colors flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 text-indigo-700 font-semibold text-sm mb-1">
              <FileJson className="w-4 h-4 text-indigo-600" />
              <span>Structured JSON</span>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Best for programmatic pipelines, backups, or custom webhook integrations with raw schemas.
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleExport('json')}
            disabled={isDownloadingCsv || isDownloadingJson}
            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors disabled:opacity-50"
          >
            {isDownloadingJson ? (
              <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            <span>{isDownloadingJson ? 'Exporting JSON...' : 'Download JSON'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
