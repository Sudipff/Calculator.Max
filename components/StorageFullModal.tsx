'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, Check, FileText, History } from 'lucide-react';
import {
  StorageSnapshot,
  formatDetailedBytesLabel,
  formatStorageLimitLabel,
  formatUsedStorageShort,
} from '@/lib/subscriptionPlans';

interface StorageFullModalProps {
  isOpen: boolean;
  snapshot: StorageSnapshot | null;
  onManageStorage: () => void;
  onClose: () => void;
}

export default function StorageFullModal({
  isOpen,
  snapshot,
  onManageStorage,
  onClose,
}: StorageFullModalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') return null;

  const snap = snapshot || {
    planId: 'starter' as const,
    usedBytes: 10 * 1024 * 1024,
    limitBytes: 10 * 1024 * 1024,
    breakdown: {
      calculationsBytes: 0,
      notesBytes: 0,
      tasksBytes: 0,
    },
    counts: {
      calculations: 0,
      notes: 0,
      tasks: 0,
    },
    syncedAt: null,
  };

  const limitLabel = formatStorageLimitLabel(snap.limitBytes);
  const usedLabel =
    snap.usedBytes >= snap.limitBytes
      ? limitLabel
      : formatUsedStorageShort(snap.usedBytes);

  const percent =
    snap.limitBytes > 0
      ? Math.min(100, Math.max(0, Math.round((snap.usedBytes / snap.limitBytes) * 100)))
      : 100;
  const displayPercent = snap.usedBytes >= snap.limitBytes ? 100 : Math.max(percent, 99);

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="storage-full-modal-title"
          className="fixed inset-0 z-[100020] flex items-center justify-center p-5 bg-slate-950/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: 10 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-[330px] sm:max-w-[356px] bg-white rounded-3xl p-6 shadow-2xl border border-slate-200/80 text-slate-900"
          >
            {/* Header Title */}
            <h2
              id="storage-full-modal-title"
              className="text-center text-[22px] font-extrabold tracking-tight text-slate-900"
            >
              Storage Full
            </h2>

            {/* Usage Readout & Full Red Progress Bar */}
            <div className="mt-4">
              <div className="flex items-center justify-between text-[15px] font-medium text-slate-800 tabular-nums mb-2">
                <span>
                  {usedLabel} / {limitLabel} Used
                </span>
                <span>{displayPercent}%</span>
              </div>

              <div
                className="w-full h-3.5 rounded-full bg-red-100 overflow-hidden"
                role="progressbar"
                aria-valuenow={displayPercent}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="h-full rounded-full bg-[#df3830] transition-all duration-300"
                  style={{ width: `${Math.max(displayPercent, 100)}%` }}
                />
              </div>
            </div>

            {/* Category Usage Breakdown */}
            <div className="mt-5 space-y-3">
              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-[#2b7de9] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <History className="w-3.5 h-3.5 stroke-[2.4]" />
                </span>
                <span className="text-[15px] font-medium text-slate-900 tabular-nums">
                  History ({formatDetailedBytesLabel(snap.breakdown.calculationsBytes)})
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-[#1db954] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <FileText className="w-3.5 h-3.5 stroke-[2.4]" />
                </span>
                <span className="text-[15px] font-medium text-slate-900 tabular-nums">
                  Notes ({formatDetailedBytesLabel(snap.breakdown.notesBytes)})
                </span>
              </div>

              <div className="flex items-center gap-3">
                <span className="w-6 h-6 rounded-md bg-[#9333ea] text-white flex items-center justify-center shrink-0 shadow-2xs">
                  <Check className="w-3.5 h-3.5 stroke-[2.8]" />
                </span>
                <span className="text-[15px] font-medium text-slate-900 tabular-nums">
                  Tasks ({formatDetailedBytesLabel(snap.breakdown.tasksBytes)})
                </span>
              </div>
            </div>

            {/* Stacked Actions */}
            <div className="mt-6 space-y-2.5">
              <button
                type="button"
                onClick={onManageStorage}
                className="w-full py-3 rounded-xl bg-[#007aff] hover:bg-blue-600 active:scale-[0.99] text-white font-semibold text-[15px] shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>Manage Storage</span>
                <ArrowRight className="w-4 h-4 stroke-[2.4]" />
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-slate-100/90 hover:bg-slate-200/80 active:scale-[0.99] border border-slate-300 text-slate-500 font-semibold text-[15px] transition-all cursor-pointer"
              >
                Skip
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
}
