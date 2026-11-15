'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Calculator, CheckSquare, FileText } from 'lucide-react';
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
  icon: React.ComponentType<{ className?: string }>;
  iconBgClass: string;
}

const BACKUP_ITEMS: BackupToggleSpec[] = [
  {
    key: 'calculatorHistory',
    title: 'Calculator History',
    description: 'Automatically back up calculator activity',
    icon: Calculator,
    iconBgClass: 'bg-blue-100 text-blue-600',
  },
  {
    key: 'notes',
    title: 'Notes',
    description: 'Securely back up all your saved notes',
    icon: FileText,
    iconBgClass: 'bg-amber-100 text-amber-600',
  },
  {
    key: 'tasks',
    title: 'Tasks',
    description: 'Prevent data loss for your task lists',
    icon: CheckSquare,
    iconBgClass: 'bg-emerald-100 text-emerald-600',
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
      {/* Top Header Bar: Back Button + "Backup Settings" Title */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to Subscription"
            title="Back to Subscription"
            className="min-w-[42px] min-h-[42px] rounded-2xl bg-white/90 hover:bg-slate-100 border border-slate-200/80 text-slate-800 flex items-center justify-center shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">
            Backup Settings
          </h2>
        </div>

        {isSaving && (
          <span className="text-[11px] font-semibold text-emerald-600 shrink-0">
            Saving...
          </span>
        )}
      </div>

      {/* Independent Backup Permission Toggle Cards (Matching Profile Settings Toggle Design) */}
      <section aria-labelledby="backup-permissions-heading" className="space-y-2.5">
        <h4
          id="backup-permissions-heading"
          className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
        >
          Backup Permissions
        </h4>

        <div className="space-y-3">
          {BACKUP_ITEMS.map((item) => {
            const isEnabled = permissions[item.key];
            const Icon = item.icon;
            return (
              <div
                key={item.key}
                className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] px-4 py-3.5 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${item.iconBgClass}`}
                  >
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0">
                    <span className="block text-sm font-semibold text-slate-800 truncate">
                      {item.title}
                    </span>
                    <span className="block text-[11px] text-slate-500 leading-snug">
                      {item.description}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label={`Toggle ${item.title} backup`}
                  onClick={() => void handleToggle(item.key)}
                  className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                    isEnabled ? 'bg-emerald-500' : 'bg-slate-300'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                      isEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </motion.div>
  );
}
