import React from 'react';
import { AlertTriangle, RefreshCw, ServerCrash } from 'lucide-react';
import { NormalizedApiError } from '../../types/api';

interface ErrorStateProps {
  error?: NormalizedApiError | Error | string | null;
  title?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export const ErrorState: React.FC<ErrorStateProps> = ({
  error,
  title = 'Something went wrong',
  onRetry,
  compact = false,
}) => {
  let message = 'An unexpected error occurred.';
  let code: string | undefined;
  let details: any;

  if (typeof error === 'string') {
    message = error;
  } else if (error && 'code' in error) {
    message = error.message;
    code = error.code;
    details = error.details;
  } else if (error instanceof Error) {
    message = error.message;
  }

  const isNetwork = code === 'NETWORK_ERROR' || message.includes('Failed to fetch') || message.includes('Network');

  if (compact) {
    return (
      <div className="flex items-center justify-between p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-xs">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-600 flex-shrink-0" />
          <span>{message}</span>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-1 font-semibold text-rose-700 hover:text-rose-900 underline ml-2"
          >
            <RefreshCw className="w-3 h-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-6 my-4 text-center">
      <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
        {isNetwork ? <ServerCrash className="w-6 h-6" /> : <AlertTriangle className="w-6 h-6" />}
      </div>
      <h3 className="text-base font-semibold text-rose-900">{title}</h3>
      <p className="mt-1 text-sm text-rose-700 max-w-md mx-auto">{message}</p>

      {isNetwork && (
        <div className="mt-3 p-2.5 rounded bg-white/80 border border-rose-200 text-xs text-slate-600 max-w-md mx-auto text-left">
          <span className="font-semibold text-slate-700 block mb-1">Backend Connection Help:</span>
          Ensure FastAPI backend is running locally at <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-indigo-600">http://localhost:8000</code>.
          If running on another host/port, configure <code className="bg-slate-100 px-1 py-0.5 rounded font-mono">VITE_API_BASE_URL</code> in <code className="font-mono">.env</code>.
        </div>
      )}

      {code && (
        <div className="mt-2 text-[11px] font-mono text-rose-500 uppercase">
          Error Code: {code}
        </div>
      )}

      {details && (
        <pre className="mt-2 text-left bg-white/70 p-2 rounded border border-rose-200 text-[11px] font-mono text-slate-700 overflow-x-auto max-w-md mx-auto">
          {JSON.stringify(details, null, 2)}
        </pre>
      )}

      {onRetry && (
        <div className="mt-4">
          <button
            onClick={onRetry}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-rose-300 text-sm font-medium text-rose-700 hover:bg-rose-50 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
          >
            <RefreshCw className="w-4 h-4" />
            Retry Request
          </button>
        </div>
      )}
    </div>
  );
};
