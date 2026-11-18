import React from 'react';
import Image from 'next/image';

export default function Loading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Calculator Max loading screen"
      className="fixed inset-0 z-[100] flex flex-col items-center justify-between bg-gradient-to-b from-[#f8fafc] via-[#f1f5f9] to-[#eef2ff] dark:from-[#0b0f19] dark:via-[#0f172a] dark:to-[#111827] px-6 py-10 select-none"
    >
      {/* Top spacer to keep center emblem balanced */}
      <div className="h-12" aria-hidden="true" />

      {/* Center Emblem & Loading Spinner */}
      <div className="flex flex-col items-center justify-center gap-5">
        <div className="relative flex items-center justify-center">
          <span
            aria-hidden="true"
            className="absolute -inset-2.5 rounded-[28px] border-2 border-blue-500/25 border-t-blue-600 dark:border-blue-400/20 dark:border-t-blue-400 animate-spin"
          />
          <div className="w-20 h-20 rounded-3xl bg-white dark:bg-slate-900 shadow-[0_12px_32px_rgba(37,99,235,0.16)] border border-slate-200/80 dark:border-slate-800 flex items-center justify-center p-2">
            <Image
              src="/pwa-192x192.png"
              alt="Calculator Max Logo"
              width={64}
              height={64}
              className="w-16 h-16 rounded-2xl object-contain"
              referrerPolicy="no-referrer"
              priority
            />
          </div>
        </div>
      </div>

      {/* Bottom Startup Branding: Displays "Calculator Max" clearly at the bottom */}
      <div className="w-full flex flex-col items-center justify-end pb-4 sm:pb-6 text-center">
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 dark:text-blue-400 mb-1">
          Smart Retail &amp; Math Suite
        </p>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white leading-tight">
          Calculator Max
        </h1>
      </div>
    </div>
  );
}
