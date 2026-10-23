import React from 'react';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  message?: string;
  subMessage?: string;
  size?: 'sm' | 'md' | 'lg';
  fullPage?: boolean;
}

export const LoadingState: React.FC<LoadingStateProps> = ({
  message = 'Loading...',
  subMessage,
  size = 'md',
  fullPage = false,
}) => {
  const spinnerSize = {
    sm: 'w-5 h-5',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  }[size];

  const content = (
    <div className="flex flex-col items-center justify-center p-8 text-center" role="status">
      <Loader2 className={`${spinnerSize} text-indigo-600 animate-spin mb-3`} />
      <p className="text-sm font-medium text-slate-700">{message}</p>
      {subMessage && <p className="text-xs text-slate-500 mt-1 max-w-sm">{subMessage}</p>}
      <span className="sr-only">Loading</span>
    </div>
  );

  if (fullPage) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        {content}
      </div>
    );
  }

  return content;
};
