'use client';

import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const [isChunkError, setIsChunkError] = useState(false);

  useEffect(() => {
    console.error('App error boundary caught an error:', error);
    const msg = error?.message || '';
    if (msg.includes('Loading chunk') || msg.includes('ChunkLoadError') || msg.includes('Failed to fetch dynamically imported module')) {
      setIsChunkError(true);
    }
  }, [error]);

  const handleReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    } else {
      reset();
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center font-sans">
      <div className="bg-white border border-slate-200 rounded-3xl p-8 max-w-md shadow-sm">
        <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <AlertCircle className="w-6 h-6" />
        </div>
        <h2 className="text-xl font-bold text-slate-800 mb-2">
          {isChunkError ? 'Application Update Available' : 'Something went wrong'}
        </h2>
        <p className="text-slate-500 text-xs mb-6 leading-relaxed">
          {isChunkError
            ? 'A new version of the applet was built. Refreshing will load the latest components smoothly.'
            : error?.message || 'An unexpected error occurred. Please try refreshing the page.'}
        </p>
        <div className="flex flex-col gap-2">
          <button
            onClick={handleReload}
            className="w-full py-2.5 px-5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>{isChunkError ? 'Refresh & Load Latest Version' : 'Reload Page'}</span>
          </button>
          {!isChunkError && (
            <button
              onClick={() => reset()}
              className="w-full py-2 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-all cursor-pointer"
            >
              Try Again
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
