'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  User,
  ShieldCheck,
  Crown,
  ChevronRight,
  ChevronDown,
  Sun,
  Moon,
  Coins,
  Ruler,
  Sparkles,
  Bell,
  Cloud,
  Database,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  LogIn,
  LogOut,
  Check,
  Instagram,
  Facebook,
  KeyRound,
  ExternalLink,
  Lock,
  X,
  Mail,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/utils/supabase/client';
import type { HistoryItem } from '../lib/historyStorage';
import {
  playReminderChime,
  requestNotificationPermission,
  sendServiceWorkerPushNotification,
} from '../lib/reminderService';
import { flushOfflineSyncQueue, getPendingSyncCount } from '../lib/notesTasksStorage';
import {
  TEN_MB_LIMIT_BYTES,
  formatStorageLimitLabel,
  getCachedStorageSnapshot,
  getPlanDisplayName,
  getPlanLimitBytes,
  getSavedPlanId,
} from '../lib/subscriptionPlans';
import { fetchAndCacheStorageSnapshot } from '../lib/storageSyncClient';
import { OfflineWifiIndicator } from './PwaRuntime';
import SubscriptionView, { type SubscriptionPlanId } from './SubscriptionView';

export interface CurrencyOption {
  symbol: string;
  code: string;
  name: string;
  country: string;
  flag: string;
}

export interface BackupPayload {
  calculations?: HistoryItem[];
  notes?: any[];
  tasks?: any[];
}

interface ProfileSettingsViewProps {
  currentUser: any;
  currency: string;
  currencies: CurrencyOption[];
  onCurrencyChange: (symbol: string) => void;
  unitSystem?: 'metric' | 'imperial';
  onUnitSystemChange?: (sys: 'metric' | 'imperial') => void;
  onOpenAuthModal: (mode?: 'signin' | 'update_password') => void;
  onSignOut: () => Promise<void> | void;
  onSyncHistory: () => Promise<void> | void;
  onExportCalculations: () => void;
  onBuildLocalBackup?: () => BackupPayload;
  onRestoreBackup?: (payload: BackupPayload) => number;
  onUserUpdated?: (user: any) => void;
  calculationsCount: number;
  onSubOverlayChange?: (hasOverlay: boolean) => void;
  closeSubViewSignal?: number;
  refreshSignal?: number;
}

type ExpandedAccountPanel = 'profile_info' | 'security' | 'subscriptions' | null;

export default function ProfileSettingsView({
  currentUser,
  currency,
  currencies,
  onCurrencyChange,
  unitSystem: controlledUnitSystem,
  onUnitSystemChange,
  onOpenAuthModal,
  onSignOut,
  onSyncHistory,
  onExportCalculations,
  onBuildLocalBackup,
  onRestoreBackup,
  onUserUpdated,
  calculationsCount,
  onSubOverlayChange,
  closeSubViewSignal = 0,
  refreshSignal = 0,
}: ProfileSettingsViewProps) {
  const [expandedAccount, setExpandedAccount] = useState<ExpandedAccountPanel>(null);
  const [showSubscriptionView, setShowSubscriptionView] = useState(false);
  const [showBackupSettingsView, setShowBackupSettingsView] = useState(false);
  const [closeBackupSignal, setCloseBackupSignal] = useState(0);
  const [activePlanLabel, setActivePlanLabel] = useState<SubscriptionPlanId>('starter');
  const [activeLimitBytes, setActiveLimitBytes] = useState<number>(TEN_MB_LIMIT_BYTES);
  const [showBackupPanel, setShowBackupPanel] = useState(false);

  // User profile editing state
  const [editName, setEditName] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<string | null>(null);

  // Preferences persisted to localStorage
  const [themeMode, setThemeMode] = useState<'light' | 'dark'>('light');
  const [localUnitSystem, setLocalUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [notifyUpdates, setNotifyUpdates] = useState(true);
  const [notifyGoals, setNotifyGoals] = useState(true);
  const unitSystem = controlledUnitSystem ?? localUnitSystem;

  // Sync & backup status
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedText, setLastSyncedText] = useState('Ready to sync');
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [skipBlockedPushPopup, setSkipBlockedPushPopup] = useState(true);
  const [pushFeedback, setPushFeedback] = useState<string | null>(null);
  const [privacyNotice, setPrivacyNotice] = useState<string | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(false);
  const [confirmEraseData, setConfirmEraseData] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement | null>(null);
  const prevCloseSignalRef = useRef<number>(closeSubViewSignal);

  const hasSubOverlay = Boolean(
    showSubscriptionView || expandedAccount !== null || showBackupPanel || confirmEraseData
  );

  useEffect(() => {
    onSubOverlayChange?.(hasSubOverlay);
    return () => {
      onSubOverlayChange?.(false);
    };
  }, [hasSubOverlay, onSubOverlayChange]);

  useEffect(() => {
    if (closeSubViewSignal === prevCloseSignalRef.current) return;
    prevCloseSignalRef.current = closeSubViewSignal;

    if (showSubscriptionView && showBackupSettingsView) {
      setCloseBackupSignal((n) => n + 1);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return;
    }
    if (showSubscriptionView) {
      setShowSubscriptionView(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return;
    }
    if (confirmEraseData) {
      setConfirmEraseData(false);
      return;
    }
    if (showBackupPanel) {
      setShowBackupPanel(false);
      return;
    }
    if (expandedAccount !== null) {
      setExpandedAccount(null);
    }
  }, [
    closeSubViewSignal,
    confirmEraseData,
    expandedAccount,
    showBackupPanel,
    showBackupSettingsView,
    showSubscriptionView,
  ]);

  useEffect(() => {
    const initialName =
      currentUser?.user_metadata?.full_name ||
      currentUser?.user_metadata?.name ||
      currentUser?.email?.split('@')[0] ||
      '';
    setEditName(initialName);
    const pending = getPendingSyncCount(currentUser?.id);
    setPendingSyncCount(pending);
    setLastSyncedText(
      currentUser
        ? pending > 0
          ? `${pending} pending offline`
          : 'Synced just now'
        : 'Local device only'
    );

    const syncLocalPlanState = () => {
      const snap = getCachedStorageSnapshot(currentUser?.id);
      const nextPlan = snap?.planId || getSavedPlanId(currentUser?.id) || 'starter';
      const nextLimit = snap?.limitBytes || getPlanLimitBytes(nextPlan);
      setActivePlanLabel(nextPlan);
      setActiveLimitBytes(nextLimit);
    };

    syncLocalPlanState();

    const handleStorageUpdated = () => {
      syncLocalPlanState();
    };
    window.addEventListener('calcmax:storage-updated', handleStorageUpdated);
    return () => {
      window.removeEventListener('calcmax:storage-updated', handleStorageUpdated);
    };
  }, [currentUser]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const userSet = localStorage.getItem('calculator-max-user-theme-set') === 'true';
    const savedTheme = localStorage.getItem('calculator-max-theme');
    const resolvedTheme: 'light' | 'dark' =
      userSet && (savedTheme === 'dark' || savedTheme === 'light') ? savedTheme : 'light';
    setThemeMode(resolvedTheme);
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');

    const handleThemeChanged = (e: Event) => {
      const next = (e as CustomEvent)?.detail?.theme;
      if (next === 'dark' || next === 'light') {
        setThemeMode(next);
      }
    };
    window.addEventListener('calcmax:theme-changed', handleThemeChanged);
    const savedUnits = localStorage.getItem('calculator-max-unit-system');
    if (savedUnits === 'metric' || savedUnits === 'imperial') {
      setLocalUnitSystem(savedUnits);
    }
    const savedAppUpdates = localStorage.getItem('calculator-max-notify-updates');
    if (savedAppUpdates !== null) {
      setNotifyUpdates(savedAppUpdates === 'true');
    }
    const savedGoalAlerts = localStorage.getItem('calculator-max-notify-goals');
    if (savedGoalAlerts !== null) {
      setNotifyGoals(savedGoalAlerts === 'true');
    }
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    } else {
      setNotificationPermission('unsupported');
    }

    const checkPerm = () => {
      if ('Notification' in window) {
        setNotificationPermission(Notification.permission);
      }
    };
    window.addEventListener('focus', checkPerm);
    document.addEventListener('visibilitychange', checkPerm);

    let permStatus: PermissionStatus | null = null;
    if ('permissions' in navigator && typeof navigator.permissions?.query === 'function') {
      navigator.permissions
        .query({ name: 'notifications' as PermissionName })
        .then((status) => {
          permStatus = status;
          status.onchange = () => {
            checkPerm();
          };
        })
        .catch(() => {});
    }

    const permInterval = window.setInterval(checkPerm, 1500);

    const handleSyncUpdated = () => {
      const pending = getPendingSyncCount(currentUser?.id);
      setPendingSyncCount(pending);
      if (currentUser && pending === 0) {
        setLastSyncedText(
          `Synced: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
        );
      } else if (currentUser && pending > 0) {
        setLastSyncedText(`${pending} pending offline`);
      }
    };
    window.addEventListener('calcmax:sync-updated', handleSyncUpdated);
    return () => {
      window.removeEventListener('calcmax:sync-updated', handleSyncUpdated);
      window.removeEventListener('calcmax:theme-changed', handleThemeChanged);
      window.removeEventListener('focus', checkPerm);
      document.removeEventListener('visibilitychange', checkPerm);
      window.clearInterval(permInterval);
      if (permStatus) {
        permStatus.onchange = null;
      }
    };
  }, [currentUser]);

  const toggleTheme = () => {
    const next = themeMode === 'light' ? 'dark' : 'light';
    setThemeMode(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('calculator-max-theme', next);
      document.documentElement.dataset.theme = next;
      window.dispatchEvent(new CustomEvent('calcmax:theme-changed', { detail: { theme: next } }));
    }
  };

  const toggleUnitSystem = () => {
    const next = unitSystem === 'metric' ? 'imperial' : 'metric';
    setLocalUnitSystem(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('calculator-max-unit-system', next);
    }
    onUnitSystemChange?.(next);
  };

  const toggleNotifyUpdates = () => {
    const next = !notifyUpdates;
    setNotifyUpdates(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('calculator-max-notify-updates', String(next));
    }
  };

  const toggleNotifyGoals = async () => {
    const next = !notifyGoals;
    setNotifyGoals(next);
    if (typeof window !== 'undefined') {
      localStorage.setItem('calculator-max-notify-goals', String(next));
      if (next && 'Notification' in window) {
        const perm = await requestNotificationPermission(currentUser?.id);
        setNotificationPermission(perm);
      }
    }
  };

  const handleEnablePushNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPushFeedback('Browser does not support push notifications.');
      return;
    }
    const perm = await requestNotificationPermission(currentUser?.id);
    setNotificationPermission(perm);
    if (perm === 'granted') {
      setSkipBlockedPushPopup(false);
      playReminderChime(false);
      await sendServiceWorkerPushNotification('Calculator Max Push Active', {
        body: 'Scheduled Note & Task reminders will alert you even when offline.',
      });
      setPushFeedback('Push notifications enabled for offline & background alerts.');
    } else if (perm === 'denied') {
      setSkipBlockedPushPopup(false);
      setPushFeedback('Blocked in browser settings. Enable Notifications for this site to receive alerts.');
    }
    setTimeout(() => setPushFeedback(null), 4000);
  };

  const handleSendTestPush = async () => {
    if (notificationPermission !== 'granted') {
      await handleEnablePushNotifications();
      return;
    }
    playReminderChime(false);
    const sent = await sendServiceWorkerPushNotification('Test Push Reminder', {
      body: 'Offline-capable Service Worker push alert is working cleanly.',
    });
    setPushFeedback(sent ? 'Test notification dispatched!' : 'Enable site notifications first.');
    setTimeout(() => setPushFeedback(null), 3200);
  };

  const handleSaveProfileInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = editName.trim().slice(0, 80);
    if (!cleaned) {
      setProfileFeedback('Display name cannot be empty.');
      return;
    }
    setSavingProfile(true);
    setProfileFeedback(null);

    try {
      const supabase = createClient();
      if (currentUser) {
        await supabase.auth.updateUser({ data: { full_name: cleaned } }).catch(() => {});
      }

      if (typeof window !== 'undefined' && currentUser) {
        const updatedUser = {
          ...currentUser,
          user_metadata: {
            ...(currentUser.user_metadata || {}),
            full_name: cleaned,
          },
        };
        const stored = localStorage.getItem('retail_calc_auth_user');
        if (stored) {
          localStorage.setItem('retail_calc_auth_user', JSON.stringify(updatedUser));
        }
        onUserUpdated?.(updatedUser);
      }

      setProfileFeedback('Profile updated cleanly.');
    } catch {
      setProfileFeedback('Saved locally.');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleManualCloudSync = async () => {
    if (!currentUser) {
      onOpenAuthModal('signin');
      return;
    }
    setIsSyncing(true);
    try {
      const queueRes = await flushOfflineSyncQueue(currentUser.id);
      await onSyncHistory();
      const snap = await fetchAndCacheStorageSnapshot(currentUser.id);
      setActivePlanLabel(snap.planId);
      setActiveLimitBytes(snap.limitBytes);
      setPendingSyncCount(queueRes.pendingCount);
      setLastSyncedText(
        queueRes.pendingCount > 0
          ? `${queueRes.pendingCount} still queued`
          : `Last synced: ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportPrivacyArchive = async () => {
    setPrivacyLoading(true);
    setPrivacyNotice(null);
    try {
      let archiveData: any = null;
      if (currentUser) {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const res = await fetch('/api/privacy', {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : undefined,
        });
        if (res.ok) {
          archiveData = await res.json();
        }
      }

      if (!archiveData && onBuildLocalBackup) {
        archiveData = {
          source: 'local-workspace',
          exportedAt: new Date().toISOString(),
          ...onBuildLocalBackup(),
        };
      }

      if (!archiveData) {
        setPrivacyNotice('Sign in or add calculations first to export a backup archive.');
        return;
      }

      const blob = new Blob([JSON.stringify(archiveData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `calculator-max-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setPrivacyNotice(
        currentUser ? 'Encrypted cloud backup archive downloaded.' : 'Local backup archive downloaded.'
      );
    } catch {
      setPrivacyNotice('Backup export failed. Please try again.');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleRestoreBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setPrivacyNotice('Backup file exceeds 5 MB limit.');
      return;
    }
    setPrivacyLoading(true);
    setPrivacyNotice(null);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== 'object') {
        setPrivacyNotice('Invalid backup format.');
        return;
      }
      const payload: BackupPayload = {
        calculations: Array.isArray(parsed.calculations)
          ? parsed.calculations
          : Array.isArray(parsed.data?.calculations)
          ? parsed.data.calculations
          : Array.isArray(parsed)
          ? parsed
          : undefined,
        notes: Array.isArray(parsed.notes)
          ? parsed.notes
          : Array.isArray(parsed.data?.notes)
          ? parsed.data.notes
          : undefined,
        tasks: Array.isArray(parsed.tasks)
          ? parsed.tasks
          : Array.isArray(parsed.data?.tasks)
          ? parsed.data.tasks
          : undefined,
      };
      const restoredCount = onRestoreBackup ? onRestoreBackup(payload) : 0;
      if (restoredCount > 0) {
        setPrivacyNotice(`Restored ${restoredCount} items from backup.`);
      } else {
        setPrivacyNotice('No valid calculations, notes, or tasks found in backup file.');
      }
    } catch {
      setPrivacyNotice('Could not read JSON backup file. Ensure it is valid JSON.');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const handleEraseCloudData = async () => {
    if (!currentUser) return;
    setPrivacyLoading(true);
    setPrivacyNotice(null);
    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const res = await fetch('/api/privacy', {
        method: 'DELETE',
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : undefined,
      });
      if (res.ok) {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('retail_calc_auth_user');
          if (currentUser?.id) {
            localStorage.removeItem(`retail-calc-history-${currentUser.id}`);
          }
        }
        setConfirmEraseData(false);
        await onSignOut();
      } else {
        setPrivacyNotice('Unable to erase cloud archive right now.');
      }
    } catch {
      setPrivacyNotice('Erasure request failed.');
    } finally {
      setPrivacyLoading(false);
    }
  };

  const displayName =
    currentUser?.user_metadata?.full_name ||
    currentUser?.user_metadata?.name ||
    currentUser?.email?.split('@')[0] ||
    'Guest User';

  const displayEmail = currentUser?.email || 'Not signed in · Local Workspace';
  const avatarUrl = currentUser?.user_metadata?.avatar_url;
  const createdYear = currentUser?.created_at
    ? new Date(currentUser.created_at).getFullYear()
    : 2026;
  const planDisplayName = getPlanDisplayName(activePlanLabel);
  const memberStatusLabel = currentUser
    ? `${planDisplayName} Member · Since ${isNaN(createdYear) ? 2026 : createdYear}`
    : `${planDisplayName} · Free Plan`;

  const activeCurrencyObj =
    currencies.find((c) => c.symbol === currency) || currencies[0];

  return (
    <AnimatePresence mode="wait" initial={false}>
      {showSubscriptionView ? (
        <motion.div
          key="profile-subscription-subview"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 40 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'transform, opacity' }}
        >
          <SubscriptionView
            currentUser={currentUser}
            currency={currency}
            currencies={currencies}
            onCurrencyChange={onCurrencyChange}
            onClose={() => {
              setShowBackupSettingsView(false);
              setShowSubscriptionView(false);
            }}
            onOpenAuthModal={onOpenAuthModal}
            onStorageSynced={(_used, limit, planId) => {
              setActivePlanLabel(planId);
              setActiveLimitBytes(limit);
            }}
            onBackupViewChange={(isOpen) => setShowBackupSettingsView(isOpen)}
            closeBackupSignal={closeBackupSignal}
            refreshSignal={refreshSignal}
          />
        </motion.div>
      ) : (
        <motion.div
          key="profile-main-settings"
          initial={{ opacity: 0, x: -24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
          style={{ willChange: 'transform, opacity' }}
          className="w-full max-w-2xl mx-auto px-3 sm:px-4 pb-8 space-y-5"
        >
      {/* Top Profile Title & Quick Session Control */}
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-700">
          Profile Settings
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <OfflineWifiIndicator />
          {currentUser ? (
            <button
              type="button"
              onClick={onSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-white/90 hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200/80 hover:border-rose-200 text-xs font-bold transition-colors cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuthModal('signin')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>
      </div>

      {/* User Identity Card: Avatar, Name, Email, Member Status */}
      <section
        aria-label="User Identity"
        className="flex flex-col items-center text-center pt-1 pb-2 space-y-2.5"
      >
        <div className="relative">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              className="w-20 h-20 rounded-full object-cover ring-4 ring-white shadow-md border border-slate-200"
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-blue-600 to-indigo-700 text-white ring-4 ring-white shadow-md flex items-center justify-center text-2xl font-black">
              {(displayName[0] || 'U').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center shadow-xs ${
              currentUser ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'
            }`}
            title={currentUser ? 'Verified Cloud Account' : 'Guest Session'}
          >
            {currentUser ? <Check className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
          </span>
        </div>

        <div className="space-y-0.5 min-w-0 max-w-full px-2">
          <h3 className="text-xl font-extrabold text-slate-900 tracking-tight truncate">
            {displayName}
          </h3>
          <p className="text-xs font-medium text-slate-500 truncate">{displayEmail}</p>
          <div className="pt-1 flex items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                currentUser
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              <Crown className="w-3 h-3" />
              <span>{memberStatusLabel}</span>
            </span>
          </div>
        </div>
      </section>

      {/* GROUP 1: ACCOUNT DETAILS */}
      <section aria-labelledby="profile-account-details" className="space-y-2">
        <h4
          id="profile-account-details"
          className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
        >
          Account Details
        </h4>
        <div className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] divide-y divide-slate-100 overflow-hidden">
          {/* Profile Info */}
          <div>
            <button
              type="button"
              onClick={() =>
                setExpandedAccount((prev) => (prev === 'profile_info' ? null : 'profile_info'))
              }
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                  <User className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate">
                  Profile Info
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
                <span>{currentUser ? 'Edit' : 'Guest'}</span>
                {expandedAccount === 'profile_info' ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedAccount === 'profile_info' && (
              <div className="px-4 pb-4 pt-1 bg-slate-50/60 border-t border-slate-100 space-y-3">
                {currentUser ? (
                  <form onSubmit={handleSaveProfileInfo} className="space-y-2.5">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">
                        Display Name
                      </label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        maxLength={80}
                        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                        placeholder="Your display name"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] text-slate-500 truncate">
                        Email: {displayEmail}
                      </span>
                      <button
                        type="submit"
                        disabled={savingProfile}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                      >
                        {savingProfile ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                    {profileFeedback && (
                      <p className="text-[11px] font-semibold text-emerald-700">{profileFeedback}</p>
                    )}
                  </form>
                ) : (
                  <div className="flex items-center justify-between gap-3 py-1">
                    <p className="text-xs text-slate-600">
                      Sign in to personalize your profile and sync calculations across devices.
                    </p>
                    <button
                      type="button"
                      onClick={() => onOpenAuthModal('signin')}
                      className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shrink-0 cursor-pointer"
                    >
                      Sign In
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Security & Password */}
          <div>
            <button
              type="button"
              onClick={() =>
                setExpandedAccount((prev) => (prev === 'security' ? null : 'security'))
              }
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate">
                  Security &amp; Password
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 shrink-0">
                <span className="hidden sm:inline">Encrypted</span>
                {expandedAccount === 'security' ? (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </button>

            {expandedAccount === 'security' && (
              <div className="px-4 pb-4 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>AES-256-GCM at rest · TLS 1.3 · Signed HttpOnly cookies</span>
                </div>
                {currentUser ? (
                  <button
                    type="button"
                    onClick={() => onOpenAuthModal('update_password')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-xs font-bold text-slate-800 transition-colors cursor-pointer"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Change Account Password</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onOpenAuthModal('signin')}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs font-bold text-white transition-colors cursor-pointer"
                  >
                    <LogIn className="w-3.5 h-3.5" />
                    <span>Sign In to Manage Password</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Subscriptions (Opens dedicated Subscription & 10MB Storage Status View) */}
          <div>
            <button
              type="button"
              onClick={() => setShowSubscriptionView(true)}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <Crown className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">
                    Subscriptions
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {formatStorageLimitLabel(activeLimitBytes)} Cloud Storage Limit · Plans &amp; Usage
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-xs font-semibold shrink-0">
                <span className={activePlanLabel === 'starter' ? 'text-slate-600 uppercase' : 'text-emerald-600 uppercase'}>
                  {activePlanLabel === 'starter'
                    ? 'Starter · Free'
                    : `${planDisplayName} · Active`}
                </span>
                <ChevronRight className="w-4 h-4 text-slate-400" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* GROUP 2: PREFERENCES & NOTIFICATIONS */}
      <section aria-labelledby="profile-preferences" className="space-y-2">
        <h4
          id="profile-preferences"
          className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
        >
          Preferences &amp; Notifications
        </h4>
        <div className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] divide-y divide-slate-100 overflow-hidden">
          {/* Theme Toggle */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                {themeMode === 'dark' ? (
                  <Moon className="w-4 h-4" />
                ) : (
                  <Sun className="w-4 h-4" />
                )}
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">Theme</span>
            </div>
            <div className="flex items-center gap-2.5 shrink-0">
              <span className="text-xs font-medium text-slate-500">
                {themeMode === 'dark' ? 'Dark' : 'Light'}
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={themeMode === 'dark'}
                aria-label="Toggle Light or Dark theme"
                onClick={toggleTheme}
                className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer ${
                  themeMode === 'dark' ? 'bg-slate-900' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                    themeMode === 'dark' ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>



          {/* Currency Selection (Streamlined compact side dropdown without country name text) */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                <Coins className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">
                Currency Selection
              </span>
            </div>

            <div className="relative shrink-0">
              <select
                aria-label="Select currency"
                value={activeCurrencyObj?.code || 'INR'}
                onChange={(e) => {
                  const found = currencies.find((c) => c.code === e.target.value);
                  if (found) onCurrencyChange(found.symbol);
                }}
                className="bg-slate-100 hover:bg-slate-200/80 rounded-xl py-1.5 pl-3 pr-7 text-xs font-bold text-slate-700 appearance-none cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-200 transition-colors"
              >
                {currencies.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.symbol} {c.code}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          {/* Unit System */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                <Ruler className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">Unit System</span>
            </div>
            <button
              type="button"
              onClick={toggleUnitSystem}
              className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200/80 text-xs font-bold text-slate-700 transition-colors cursor-pointer shrink-0"
            >
              {unitSystem === 'metric' ? 'Metric (kg / m)' : 'Imperial (lb / ft)'}
            </button>
          </div>

          {/* Notification Settings Sub-header */}
          <div className="px-4 py-2.5 bg-slate-50/70">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Notification Settings
            </span>
          </div>

          {/* App Updates Toggle */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">App Updates</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyUpdates}
              aria-label="Toggle App Updates notifications"
              onClick={toggleNotifyUpdates}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                notifyUpdates ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  notifyUpdates ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Goal Alerts Toggle */}
          <div className="px-4 py-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
                <Bell className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">Goal Alerts</span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyGoals}
              aria-label="Toggle Goal Alerts notifications"
              onClick={toggleNotifyGoals}
              className={`relative w-11 h-6 rounded-full transition-colors cursor-pointer shrink-0 ${
                notifyGoals ? 'bg-emerald-500' : 'bg-slate-300'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-xs transition-transform ${
                  notifyGoals ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Push Notifications Permission & Offline Reminder Delivery */}
          <div className="px-4 py-3.5 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    notificationPermission === 'granted'
                      ? 'bg-emerald-100 text-emerald-600'
                      : notificationPermission === 'denied'
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-indigo-100 text-indigo-600'
                  }`}
                >
                  <Bell className="w-4 h-4" />
                </span>
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800 truncate">
                    Offline Push Reminders
                  </span>
                  <span className="block text-[11px] text-slate-500 truncate">
                    {notificationPermission === 'granted'
                      ? 'Enabled — delivers alerts offline'
                      : notificationPermission === 'denied'
                      ? 'Blocked in browser site settings'
                      : notificationPermission === 'unsupported'
                      ? 'Not supported on this browser'
                      : 'Permission needed for scheduled alerts'}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {notificationPermission === 'granted' ? (
                  <button
                    type="button"
                    onClick={handleSendTestPush}
                    className="px-3 py-1.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-bold transition-colors cursor-pointer"
                  >
                    Test Alert
                  </button>
                ) : notificationPermission === 'denied' ? (
                  <button
                    type="button"
                    onClick={() => setSkipBlockedPushPopup(false)}
                    className="px-3 py-1.5 rounded-xl bg-amber-100 hover:bg-amber-200/80 text-amber-800 border border-amber-200 text-xs font-extrabold transition-colors cursor-pointer"
                  >
                    Unblock Guide
                  </button>
                ) : notificationPermission !== 'unsupported' ? (
                  <button
                    type="button"
                    onClick={handleEnablePushNotifications}
                    className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
                  >
                    Allow Push
                  </button>
                ) : null}
              </div>
            </div>

            {pushFeedback && (
              <p className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200/80 rounded-xl px-3 py-1.5">
                {pushFeedback}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* GROUP 3: DATA & BACKUP */}
      <section aria-labelledby="profile-data-backup" className="space-y-2">
        <h4
          id="profile-data-backup"
          className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
        >
          Data &amp; Backup
        </h4>
        <div className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] divide-y divide-slate-100 overflow-hidden">
          {/* Sync with Cloud */}
          <button
            type="button"
            onClick={handleManualCloudSync}
            disabled={isSyncing}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left disabled:opacity-60"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                {isSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Cloud className="w-4 h-4" />
                )}
              </span>
              <div className="min-w-0">
                <span className="block text-sm font-semibold text-slate-800 truncate">
                  Sync with Cloud
                </span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {pendingSyncCount > 0
                    ? `${pendingSyncCount} offline change${pendingSyncCount === 1 ? '' : 's'} waiting to sync`
                    : 'PostgreSQL & Supabase Cloud'}
                </span>
              </div>
            </div>
            <span className="text-[11px] font-medium text-slate-500 text-right shrink-0">
              {isSyncing ? 'Syncing...' : lastSyncedText}
            </span>
          </button>

          {/* Backup & Restore Data */}
          <div>
            <button
              type="button"
              onClick={() => setShowBackupPanel((prev) => !prev)}
              className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                  <Database className="w-4 h-4" />
                </span>
                <span className="text-sm font-semibold text-slate-800 truncate">
                  Backup &amp; Restore Data
                </span>
              </div>
              {showBackupPanel ? (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>

            {showBackupPanel && (
              <div className="px-4 pb-4 pt-2 bg-slate-50/60 border-t border-slate-100 space-y-2.5">
                {privacyNotice && (
                  <p className="text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2">
                    {privacyNotice}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleExportPrivacyArchive}
                    disabled={privacyLoading}
                    className="flex-1 min-w-[140px] py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{currentUser ? 'Download Archive (JSON)' : 'Backup JSON'}</span>
                  </button>

                  {onRestoreBackup && (
                    <>
                      <input
                        ref={restoreInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleRestoreBackupFile}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => restoreInputRef.current?.click()}
                        disabled={privacyLoading}
                        className="flex-1 min-w-[140px] py-2 px-3 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Upload className="w-3.5 h-3.5 text-blue-600" />
                        <span>Restore Backup (JSON)</span>
                      </button>
                    </>
                  )}

                  {currentUser && !confirmEraseData && (
                    <button
                      type="button"
                      onClick={() => setConfirmEraseData(true)}
                      disabled={privacyLoading}
                      className="py-2 px-3 bg-white hover:bg-rose-50 border border-rose-200 rounded-xl text-xs font-bold text-rose-600 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Erase Cloud Data</span>
                    </button>
                  )}
                </div>

                {confirmEraseData && (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleEraseCloudData}
                      disabled={privacyLoading}
                      className="flex-1 py-2 px-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                    >
                      Confirm Permanent Cloud Erase
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmEraseData(false)}
                      disabled={privacyLoading}
                      className="py-2 px-3 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Export Calculations */}
          <button
            type="button"
            onClick={onExportCalculations}
            className="w-full px-4 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors cursor-pointer text-left"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-8 h-8 rounded-xl bg-rose-100 text-rose-500 flex items-center justify-center shrink-0">
                <Upload className="w-4 h-4" />
              </span>
              <span className="text-sm font-semibold text-slate-800 truncate">
                Export Calculations
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 shrink-0">
              <span>{calculationsCount} CSV</span>
              <ChevronRight className="w-4 h-4 text-slate-400" />
            </div>
          </button>
        </div>
      </section>

      {/* GROUP 4: ABOUT / DEVELOPER BIO & SOCIAL LINKS */}
      <section aria-labelledby="profile-about-section" className="space-y-2">
        <h4
          id="profile-about-section"
          className="px-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-700"
        >
          About
        </h4>
        <div className="bg-white/95 rounded-2xl border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-5 space-y-4">
          <div className="text-center space-y-2.5">
            <span className="block text-[11px] font-extrabold uppercase tracking-[0.12em] text-slate-800">
              About the Developer
            </span>
            <div className="w-16 h-16 rounded-full mx-auto bg-gradient-to-br from-sky-500 via-blue-600 to-indigo-700 text-white ring-4 ring-slate-100 shadow-sm flex items-center justify-center text-lg font-black">
              SD
            </div>
            <p className="text-xs sm:text-[13px] text-slate-600 leading-relaxed max-w-md mx-auto">
              Crafted with passion by <strong className="text-slate-800">Sudip Debnath</strong>,
              a software developer dedicated to making powerful everyday calculation tools simple
              and fast. <strong className="text-slate-800">Calculator Max</strong> brings scientific
              math, financial planners, notes, and tasks into one unified hub.
            </p>
          </div>

          <div className="pt-2 border-t border-slate-100 space-y-2.5">
            <a
              href="https://www.instagram.com/sudipdebnath416?rpxt=MWUzbTA1ZW43a2w4Ng=="
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50/90 hover:bg-pink-50/70 border border-slate-200/70 hover:border-pink-200 transition-colors cursor-pointer group"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 via-pink-500 to-purple-600 text-white flex items-center justify-center shrink-0">
                  <Instagram className="w-4 h-4" />
                </span>
                <span className="text-xs sm:text-sm font-semibold text-blue-600 group-hover:text-pink-700 underline decoration-blue-300 underline-offset-2 truncate">
                  Follow @sudipdebnath416 on Instagram
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </a>

            <a
              href="https://www.facebook.com/share/1CSqc7Rdfu/"
              target="_blank"
              rel="noopener noreferrer"
              className="relative z-10 flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50/90 hover:bg-blue-50/80 border border-slate-200/70 hover:border-blue-200 transition-colors cursor-pointer group"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-[#1877F2] text-white flex items-center justify-center shrink-0">
                  <Facebook className="w-4 h-4" />
                </span>
                <span className="text-xs sm:text-sm font-semibold text-blue-600 group-hover:text-blue-700 underline decoration-blue-300 underline-offset-2 truncate">
                  Connect on Facebook
                </span>
              </span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            </a>

            <a
              href="mailto:sudipdebnathgff1@gmail.com?subject=Calculator%20Max%20Feedback"
              aria-label="Send Feedback to sudipdebnathgff1@gmail.com"
              className="relative z-10 flex items-center justify-between gap-3 px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50/90 hover:bg-indigo-50/80 border border-slate-200/70 hover:border-indigo-200 transition-colors cursor-pointer group"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-600 to-blue-600 text-white flex items-center justify-center shrink-0">
                  <Mail className="w-4 h-4" />
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-xs sm:text-sm font-semibold text-slate-900 group-hover:text-indigo-700 truncate">
                    Feedback
                  </span>
                  <span className="text-[11px] text-slate-500 truncate">
                    sudipdebnathgff1@gmail.com
                  </span>
                </span>
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 shrink-0" />
            </a>
          </div>
        </div>
      </section>

      {/* Popup Modal for Blocked Offline Push Reminders with Cross (X) Button to Skip */}
      {typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {notificationPermission === 'denied' && !skipBlockedPushPopup && (
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="blocked-push-popup-title"
                onClick={() => setSkipBlockedPushPopup(true)}
                className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-xs"
              >
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: 14 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: 14 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md bg-white rounded-3xl border border-slate-200/90 shadow-2xl p-6 space-y-4 relative overflow-hidden"
                >
                  {/* Top Header with Cross (X) Button for Skip */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <span className="w-11 h-11 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
                        <Lock className="w-5 h-5" />
                      </span>
                      <div className="min-w-0">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-extrabold uppercase tracking-wider mb-1">
                          Permission Blocked
                        </span>
                        <h3
                          id="blocked-push-popup-title"
                          className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug"
                        >
                          Enable Browser Push Reminders
                        </h3>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setSkipBlockedPushPopup(true)}
                      aria-label="Skip and close popup"
                      title="Skip for now"
                      className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer shrink-0"
                    >
                      <X className="w-4.5 h-4.5" />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    Offline Push Reminders are currently blocked in your browser settings. Follow these quick steps to allow notifications, or use the close button to skip for now:
                  </p>

                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2.5 text-xs text-slate-700 font-medium">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                        1
                      </span>
                      <p>
                        Click the <strong className="text-slate-900">Lock / Site Settings icon</strong> on the left side of your browser&apos;s address bar.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                        2
                      </span>
                      <p>
                        Find <strong className="text-slate-900">Notifications</strong> in the permissions menu.
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                        3
                      </span>
                      <p>
                        Change the setting from{' '}
                        <span className="px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 font-bold">
                          Block
                        </span>{' '}
                        to{' '}
                        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 font-bold">
                          Allow
                        </span>
                        .
                      </p>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 flex items-center justify-center font-extrabold text-[11px] shrink-0 mt-0.5">
                        4
                      </span>
                      <p>
                        Once switched to <strong className="text-slate-900">Allow</strong>, this popup automatically closes.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSkipBlockedPushPopup(true)}
                      className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors cursor-pointer"
                    >
                      Skip for Now
                    </button>
                    <button
                      type="button"
                      onClick={handleEnablePushNotifications}
                      className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md transition-all cursor-pointer shrink-0"
                    >
                      Verify Permission Now
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>,
          document.body
        )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
