'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { motion } from 'motion/react';
import {
  DEFAULT_BACKUP_PERMISSIONS,
  fetchBackupPermissionsFromCloud,
  getBackupPermissions,
  updateBackupPermissionsInCloud,
  type BackupPermissions,
} from '@/lib/backupPermissions';
import { flushOfflineCalculationsQueue } from '@/lib/historyStorage';
import { flushOfflineSyncQueue } from '@/lib/notesTasksStorage';

interface BackupSettingsViewProps {
  currentUser: any;
  onBack: () => void;
}

interface BackupToggleSpec {
  key: keyof BackupPermissions;
  title: string;
  description: string;
}

const BACKUP_ITEMS: BackupToggleSpec[] = [
  {
    key: 'calculatorHistory',
    title: 'Calculator History',
    description: 'Automatically back up calculator activity',
  },
  {
    key: 'notes',
    title: 'Notes',
    description: 'Securely back up all your saved notes',
  },
  {
    key: 'tasks',
    title: 'Tasks',
    description: 'Prevent data loss for your task lists',
  },
];

export default function BackupSettingsView({
  currentUser,
  onBack,
}: BackupSettingsViewProps) {
  const userId = currentUser?.id || null;
  const [permissions, setPermissions] = useState<BackupPermissions>(() =>
    getBackupPermissions(userId)
  );
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setPermissions(getBackupPermissions(userId));

    if (userId) {
      void fetchBackupPermissionsFromCloud(userId).then((cloudPerms) => {
        if (active) {
          setPermissions(cloudPerms);
        }
      });
    }

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const handleToggle = async (key: keyof BackupPermissions) => {
    const nextValue = !permissions[key];
    const nextPerms: BackupPermissions = {
      ...(permissions || DEFAULT_BACKUP_PERMISSIONS),
      [key]: nextValue,
    };

    setPermissions(nextPerms);
    setIsSaving(true);
    try {
      await updateBackupPermissionsInCloud(nextPerms, userId);
      if (nextValue && userId) {
        if (key === 'calculatorHistory') {
          void flushOfflineCalculationsQueue(userId);
        } else {
          void flushOfflineSyncQueue(userId);
        }
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 18 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      aria-label="Backup Management Settings"
      className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-12 space-y-5"
    >
      {/* Top Back Arrow & Page Title (Matching Reference Photo) */}
      <div className="pt-1 space-y-3">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Subscription"
          title="Back to Subscription"
          className="min-w-[40px] min-h-[40px] -ml-1.5 rounded-2xl text-slate-800 hover:bg-slate-200/60 flex items-center justify-center transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="flex items-baseline justify-between gap-3 px-0.5">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
            Backup Settings
          </h2>
          {isSaving && (
            <span className="text-[11px] font-semibold text-emerald-600">
              Saving...
            </span>
          )}
        </div>
      </div>

      {/* Independent Backup Permission Cards */}
      <section aria-label="Backup Permissions" className="space-y-3.5">
        {BACKUP_ITEMS.map((item) => {
          const isEnabled = permissions[item.key];
          return (
            <div
              key={item.key}
              className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_4px_18px_rgba(15,23,42,0.05)] px-5 py-4 flex items-center justify-between gap-4"
            >
              <div className="min-w-0 space-y-1">
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-snug">
                  {item.title}
                </h3>
                <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                  {item.description}
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                aria-label={`Toggle ${item.title} backup`}
                onClick={() => void handleToggle(item.key)}
                className={`relative inline-flex items-center w-14 h-8 rounded-full transition-colors duration-200 cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 ${
                  isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block w-6.5 h-6.5 rounded-full bg-white shadow-sm transform transition-transform duration-200 ${
                    isEnabled ? 'translate-x-[26px]' : 'translate-x-[3px]'
                  }`}
                />
              </button>
            </div>
          );
        })}
      </section>
    </motion.div>
  );
}
