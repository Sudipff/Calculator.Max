'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  HardDrive,
  RefreshCw,
  Settings,
  User,
} from 'lucide-react';
import { motion } from 'motion/react';
import { createClient } from '@/utils/supabase/client';
import { getCalculationHistory } from '@/lib/historyStorage';
import { getLocalNotes, getLocalTasks, getLocalTaskLists } from '@/lib/notesTasksStorage';
import { useTheme } from '@/components/ThemeProvider';
import type { CurrencyOption } from './ProfileSettingsView';
import BackupSettingsView from './BackupSettingsView';

export type SubscriptionPlanId = 'starter' | 'pro' | 'team' | 'enterprise';

export interface SubscriptionPlanSpec {
  id: SubscriptionPlanId;
  title: string;
  subtitle?: string;
  price: string;
  period: string;
  storageQuotaLabel: string;
  features: string[];
  headerBgLight: string;
  headerBgDark: string;
  headerTextClass: string;
  bodyBgLight: string;
  bodyBgDark: string;
  borderLight: string;
  borderDark: string;
  rank: number;
}

export const SUBSCRIPTION_PLANS: SubscriptionPlanSpec[] = [
  {
    id: 'starter',
    title: 'STARTER',
    subtitle: 'Free',
    price: '$0',
    period: '/mo',
    storageQuotaLabel: '10 MB Storage',
    features: ['10 MB Storage', 'Basic Features', '1 User Support'],
    headerBgLight: '#3a9d64',
    headerBgDark: '#1b5e3a',
    headerTextClass: 'text-white',
    bodyBgLight: '#c4eed3',
    bodyBgDark: '#112e22',
    borderLight: '#96dfb0',
    borderDark: '#1f573d',
    rank: 0,
  },
  {
    id: 'pro',
    title: 'PRO',
    price: '$9.99',
    period: '/mo',
    storageQuotaLabel: '10 GB Storage',
    features: ['10 GB Storage', 'Priority Support', '5 Users Support', 'API Access'],
    headerBgLight: '#75afea',
    headerBgDark: '#1e4e8c',
    headerTextClass: 'text-slate-950 dark:text-white',
    bodyBgLight: '#d3e7fb',
    bodyBgDark: '#132742',
    borderLight: '#a9cef5',
    borderDark: '#264b7d',
    rank: 1,
  },
  {
    id: 'team',
    title: 'TEAM',
    subtitle: 'Popular',
    price: '$24.99',
    period: '/mo',
    storageQuotaLabel: '50 GB Storage',
    features: [
      '50 GB Storage',
      'Premium Support',
      '15 Users Support',
      'Advanced Features',
      'API Access',
    ],
    headerBgLight: '#b996eb',
    headerBgDark: '#4c2882',
    headerTextClass: 'text-slate-950 dark:text-white',
    bodyBgLight: '#eadcfb',
    bodyBgDark: '#23183b',
    borderLight: '#cfb4f5',
    borderDark: '#493278',
    rank: 2,
  },
  {
    id: 'enterprise',
    title: 'ENTERPRISE',
    price: '$49.99',
    period: '/mo',
    storageQuotaLabel: 'Unmatched 1 TB Storage',
    features: [
      'Unmatched 1 TB Storage',
      'Dedicated Account Manager',
      'Unlimited Users Support',
      'Full Custom API Access',
      '24/7 Premium Phone Support',
    ],
    headerBgLight: '#83672c',
    headerBgDark: '#594318',
    headerTextClass: 'text-white',
    bodyBgLight: '#e0cb93',
    bodyBgDark: '#2b2212',
    borderLight: '#c8ae6b',
    borderDark: '#574421',
    rank: 3,
  },
];

const TEN_MB_LIMIT_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes

function measureUtf8Bytes(data: unknown): number {
  try {
    const raw = typeof data === 'string' ? data : JSON.stringify(data ?? '');
    return new TextEncoder().encode(raw).length;
  } catch {
    return 0;
  }
}

export function formatStorageMb(usedBytes: number): string {
  if (usedBytes <= 0) return '0.00 MB';
  const mb = usedBytes / (1024 * 1024);
  if (mb < 0.01) {
    const kb = Math.max(0.1, usedBytes / 1024);
    return `${kb.toFixed(1)} KB (${mb.toFixed(3)} MB)`;
  }
  return `${mb.toFixed(2)} MB`;
}

interface SubscriptionViewProps {
  currentUser: any;
  currency: string;
  currencies: CurrencyOption[];
  onCurrencyChange: (symbol: string) => void;
  onClose: () => void;
  onOpenAuthModal: (mode?: 'signin' | 'update_password') => void;
  onStorageSynced?: (usedBytes: number, limitBytes: number, planId: SubscriptionPlanId) => void;
  onBackupViewChange?: (isOpen: boolean) => void;
  closeBackupSignal?: number;
}

export default function SubscriptionView({
  currentUser,
  currency,
  currencies,
  onClose,
  onOpenAuthModal,
  onStorageSynced,
  onBackupViewChange,
  closeBackupSignal = 0,
}: SubscriptionViewProps) {
  const { isDark } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const prevCloseBackupSignalRef = useRef(closeBackupSignal);
  const [activePlanId, setActivePlanId] = useState<SubscriptionPlanId>(
    currentUser ? 'pro' : 'starter'
  );
  const [usedBytes, setUsedBytes] = useState<number>(0);
  const [limitBytes, setLimitBytes] = useState<number>(TEN_MB_LIMIT_BYTES);
  const [breakdown, setBreakdown] = useState<{
    calculationsBytes: number;
    notesBytes: number;
    tasksBytes: number;
  }>({
    calculationsBytes: 0,
    notesBytes: 0,
    tasksBytes: 0,
  });
  const [counts, setCounts] = useState<{ calculations: number; notes: number; tasks: number }>({
    calculations: 0,
    notes: 0,
    tasks: 0,
  });
  const [isSyncingStorage, setIsSyncingStorage] = useState<boolean>(false);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(null);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [activeScrollIndex, setActiveScrollIndex] = useState<number>(0);

  useEffect(() => {
    onBackupViewChange?.(showBackupSettings);
    return () => {
      onBackupViewChange?.(false);
    };
  }, [onBackupViewChange, showBackupSettings]);

  useEffect(() => {
    if (closeBackupSignal === prevCloseBackupSignalRef.current) return;
    prevCloseBackupSignalRef.current = closeBackupSignal;
    if (showBackupSettings) {
      setShowBackupSettings(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }, [closeBackupSignal, showBackupSettings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showBackupSettings) {
          setShowBackupSettings(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, showBackupSettings]);

  const activeCurrencyObj = useMemo(
    () => currencies.find((c) => c.symbol === currency) || currencies[0],
    [currencies, currency]
  );

  const displayName = useMemo(() => {
    return (
      currentUser?.user_metadata?.full_name ||
      currentUser?.user_metadata?.name ||
      currentUser?.email?.split('@')[0] ||
      'Guest User'
    );
  }, [currentUser]);

  const userHandle = useMemo(() => {
    if (currentUser?.user_metadata?.user_name) {
      return `@${currentUser.user_metadata.user_name}`;
    }
    if (currentUser?.email) {
      return `@${currentUser.email.split('@')[0]}`;
    }
    return '@guest_workspace';
  }, [currentUser]);

  const memberSinceLabel = useMemo(() => {
    if (currentUser?.created_at) {
      const dt = new Date(currentUser.created_at);
      if (!Number.isNaN(dt.getTime())) {
        return `Member since ${dt.toLocaleDateString('en-US', {
          month: 'short',
          year: 'numeric',
        })}`;
      }
    }
    return 'Member since Oct 2021';
  }, [currentUser]);

  const avatarUrl = currentUser?.user_metadata?.avatar_url;

  const syncStorageWithCloud = useCallback(async () => {
    setIsSyncingStorage(true);
    try {
      const uid = currentUser?.id;
      const localCalcs = getCalculationHistory(uid);
      const localNotes = getLocalNotes(uid);
      const localTasks = getLocalTasks(uid);
      const localLists = getLocalTaskLists(uid);

      const localCalcBytes = localCalcs.length > 0 ? measureUtf8Bytes(localCalcs) : 0;
      const localNotesBytes = localNotes.length > 0 ? measureUtf8Bytes(localNotes) : 0;
      const localTasksBytes =
        (localTasks.length > 0 ? measureUtf8Bytes(localTasks) : 0) +
        (localLists.length > 0 ? measureUtf8Bytes(localLists) : 0);

      let finalCalcBytes = localCalcBytes;
      let finalNotesBytes = localNotesBytes;
      let finalTasksBytes = localTasksBytes;
      let finalCalcCount = localCalcs.length;
      let finalNotesCount = localNotes.length;
      let finalTasksCount = localTasks.length;
      let resolvedPlan: SubscriptionPlanId = currentUser ? 'pro' : 'starter';

      if (typeof window !== 'undefined') {
        const savedPlan = localStorage.getItem(
          `calculator-max-plan-${uid || 'guest'}`
        ) as SubscriptionPlanId | null;
        if (savedPlan && ['starter', 'pro', 'team', 'enterprise'].includes(savedPlan)) {
          resolvedPlan = savedPlan;
        }
      }

      if (uid) {
        try {
          const supabase = createClient();
          const {
            data: { session },
          } = await supabase.auth.getSession();

          const headers: Record<string, string> = {};
          if (session?.access_token) {
            headers['Authorization'] = `Bearer ${session.access_token}`;
          }

          const res = await fetch('/api/storage', {
            method: 'GET',
            headers,
            cache: 'no-store',
          });

          if (res.ok) {
            const cloudData = await res.json();
            finalCalcBytes = Math.max(
              localCalcBytes,
              Number(cloudData.breakdown?.calculationsBytes) || 0
            );
            finalNotesBytes = Math.max(
              localNotesBytes,
              Number(cloudData.breakdown?.notesBytes) || 0
            );
            finalTasksBytes = Math.max(
              localTasksBytes,
              Number(cloudData.breakdown?.tasksBytes) || 0
            );
            finalCalcCount = Math.max(localCalcs.length, Number(cloudData.counts?.calculations) || 0);
            finalNotesCount = Math.max(localNotes.length, Number(cloudData.counts?.notes) || 0);
            finalTasksCount = Math.max(localTasks.length, Number(cloudData.counts?.tasks) || 0);

            if (
              cloudData.planId &&
              ['starter', 'pro', 'team', 'enterprise'].includes(cloudData.planId)
            ) {
              resolvedPlan = cloudData.planId as SubscriptionPlanId;
              if (typeof window !== 'undefined') {
                localStorage.setItem(`calculator-max-plan-${uid}`, resolvedPlan);
              }
            }
          }
        } catch {
          // Fallback to local byte measurement if offline
        }
      }

      const totalUsed = finalCalcBytes + finalNotesBytes + finalTasksBytes;
      setBreakdown({
        calculationsBytes: finalCalcBytes,
        notesBytes: finalNotesBytes,
        tasksBytes: finalTasksBytes,
      });
      setCounts({
        calculations: finalCalcCount,
        notes: finalNotesCount,
        tasks: finalTasksCount,
      });
      setUsedBytes(totalUsed);
      setLimitBytes(TEN_MB_LIMIT_BYTES);
      setActivePlanId(resolvedPlan);
      setCloudSyncedAt(
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      );
      onStorageSynced?.(totalUsed, TEN_MB_LIMIT_BYTES, resolvedPlan);
    } finally {
      setIsSyncingStorage(false);
    }
  }, [currentUser, onStorageSynced]);

  useEffect(() => {
    void syncStorageWithCloud();
  }, [syncStorageWithCloud]);

  const handleSelectPlan = async (plan: SubscriptionPlanSpec) => {
    if (plan.id === 'enterprise') {
      setPlanNotice(
        'Enterprise inquiry registered. Our account team will contact your email with custom 1 TB workspace provisioning.'
      );
      setTimeout(() => setPlanNotice(null), 4500);
      return;
    }

    if (!currentUser && plan.id !== 'starter') {
      onOpenAuthModal('signin');
      return;
    }

    const uid = currentUser?.id || 'guest';
    setActivePlanId(plan.id);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`calculator-max-plan-${uid}`, plan.id);
    }

    if (currentUser?.id) {
      try {
        const supabase = createClient();
        const {
          data: { session },
        } = await supabase.auth.getSession();
        await fetch('/api/storage', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
          },
          body: JSON.stringify({
            planId: plan.id,
            countryRegion: activeCurrencyObj?.country,
          }),
        });
      } catch {
        // Saved locally if offline
      }
    }

    onStorageSynced?.(usedBytes, limitBytes, plan.id);
    setPlanNotice(`Subscription updated to ${plan.title} (${plan.price}${plan.period}).`);
    setTimeout(() => setPlanNotice(null), 3500);
  };

  const handleScrollPlans = (dir: 'left' | 'right') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const step = 220;
    el.scrollBy({
      left: dir === 'right' ? step : -step,
      behavior: 'smooth',
    });
  };

  const handleScrollUpdate = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const maxScroll = el.scrollWidth - el.clientWidth;
    if (maxScroll <= 0) {
      setActiveScrollIndex(0);
      return;
    }
    const ratio = el.scrollLeft / maxScroll;
    const idx = Math.min(
      SUBSCRIPTION_PLANS.length - 1,
      Math.max(0, Math.round(ratio * (SUBSCRIPTION_PLANS.length - 1)))
    );
    setActiveScrollIndex(idx);
  };

  // Accurate percentage of 10MB per-user limit with optical minimum when data > 0
  const rawPercent = Math.min(100, (usedBytes / limitBytes) * 100);
  const progressBarPercent = usedBytes > 0 ? Math.max(4, rawPercent) : 0;
  const usedMbNumber = (usedBytes / (1024 * 1024)).toFixed(2);
  const usedKbNumber = (usedBytes / 1024).toFixed(1);

  const activePlanSpec =
    SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId) || SUBSCRIPTION_PLANS[0];

  if (showBackupSettings) {
    return (
      <BackupSettingsView
        currentUser={currentUser}
        onBack={() => {
          setShowBackupSettings(false);
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'auto' });
          }
        }}
      />
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-3xl mx-auto px-2 sm:px-4 pb-10 space-y-5"
    >
      {/* Top Header Bar: Back Button + "Subscription" Title */}
      <div className="flex items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to Profile Settings"
            title="Back to Profile Settings"
            className="min-w-[42px] min-h-[42px] rounded-2xl bg-white/90 hover:bg-slate-100 border border-slate-200/80 text-slate-800 flex items-center justify-center shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight truncate">
            Subscription
          </h2>
        </div>
      </div>

      {/* User Identity Horizontal Card (Matching Reference Photo) */}
      <section
        aria-label="Subscriber Profile"
        className="bg-white/95 rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 sm:p-5 flex items-center gap-4"
      >
        <div className="relative shrink-0">
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="w-18 h-18 sm:w-20 sm:h-20 rounded-full object-cover ring-3 ring-blue-500/30 shadow-md border border-slate-200"
            />
          ) : (
            <div className="w-18 h-18 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-600 via-indigo-600 to-slate-800 text-white ring-3 ring-blue-500/30 shadow-md flex items-center justify-center text-2xl font-black">
              {(displayName[0] || 'U').toUpperCase()}
            </div>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center shadow-xs ${
              currentUser ? 'bg-emerald-500 text-white' : 'bg-slate-400 text-white'
            }`}
            title={currentUser ? 'Cloud Account Connected' : 'Local Guest Mode'}
          >
            {currentUser ? <Check className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-0.5">
          <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
            {displayName}
          </h3>
          <p className="text-xs sm:text-sm font-semibold text-slate-600 truncate">{userHandle}</p>
          <p className="text-xs font-medium text-slate-500 truncate">{memberSinceLabel}</p>
        </div>
      </section>

      {/* STORAGE STATUS Section (10MB Per-User Limit Synced with Cloud) */}
      <section aria-labelledby="subscription-storage-heading" className="space-y-2.5">
        <div className="flex items-center justify-between px-1">
          <h4
            id="subscription-storage-heading"
            className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900"
          >
            Storage Status
          </h4>

          <button
            type="button"
            onClick={() => void syncStorageWithCloud()}
            disabled={isSyncingStorage}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-60"
            title="Sync storage usage with Supabase Cloud"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingStorage ? 'animate-spin' : ''}`} />
            <span>
              {isSyncingStorage
                ? 'Syncing Cloud...'
                : cloudSyncedAt
                ? `Cloud Synced · ${cloudSyncedAt}`
                : 'Sync Cloud'}
            </span>
          </button>
        </div>

        <div className="bg-white/95 rounded-3xl border border-slate-200/80 shadow-[0_4px_20px_rgba(15,23,42,0.05)] p-4 sm:p-5 space-y-3">
          {/* Storage Usage Readout Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <HardDrive className="w-4.5 h-4.5 text-blue-600 shrink-0" />
              <div className="text-sm sm:text-base font-extrabold text-slate-900 tabular-nums">
                <span className="text-blue-600">{usedMbNumber} MB</span>
                <span className="text-slate-600 font-bold"> / 10MB</span>
                <span className="ml-2 text-xs font-medium text-slate-500">
                  ({usedKbNumber} KB used)
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
              <Cloud className="w-3.5 h-3.5 text-blue-500" />
              <span>{rawPercent < 0.1 && usedBytes > 0 ? '< 0.1%' : `${rawPercent.toFixed(1)}%`}</span>
            </span>
          </div>

          {/* 10MB Per-User Cloud Storage Progress Bar + Right-Aligned "10 MB Per-User Cloud Limit" Opposite the Storage Bar */}
          <div className="flex items-center justify-between gap-3">
            <div
              role="progressbar"
              aria-label="Cloud storage usage out of 10MB limit"
              aria-valuemin={0}
              aria-valuemax={10}
              aria-valuenow={Number(usedMbNumber)}
              className="flex-1 h-3.5 rounded-full bg-slate-200/90 overflow-hidden p-0.5 shadow-inner"
            >
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progressBarPercent}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${
                  rawPercent >= 90
                    ? 'bg-gradient-to-r from-rose-600 to-amber-500'
                    : 'bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400'
                }`}
              />
            </div>

            <span className="text-[11px] sm:text-xs font-semibold text-slate-600 text-right whitespace-nowrap shrink-0">
              10 MB Per-User Cloud Limit
            </span>
          </div>

          {/* Cloud Item & Byte Breakdown + Settings Icon for Backup Management */}
          <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 tabular-nums pt-0.5">
            <span className="min-w-0 leading-relaxed">
              Calculations: {counts.calculations} ({(breakdown.calculationsBytes / 1024).toFixed(1)} KB)
              {' · '}
              Notes: {counts.notes} ({(breakdown.notesBytes / 1024).toFixed(1)} KB)
              {' · '}
              Tasks: {counts.tasks} ({(breakdown.tasksBytes / 1024).toFixed(1)} KB)
            </span>

            <button
              type="button"
              onClick={() => {
                setShowBackupSettings(true);
                if (typeof window !== 'undefined') {
                  window.scrollTo({ top: 0, behavior: 'auto' });
                }
              }}
              aria-label="Open Backup Management settings"
              title="Backup Management"
              className="min-w-[36px] min-h-[36px] rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 flex items-center justify-center transition-colors cursor-pointer shrink-0"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Feedback Banner on Plan Action */}
      {planNotice && (
        <div
          role="status"
          className="px-4 py-3 rounded-2xl bg-blue-50 border border-blue-200 text-xs font-bold text-blue-800 flex items-center justify-between gap-2"
        >
          <span>{planNotice}</span>
          <button
            type="button"
            onClick={() => setPlanNotice(null)}
            className="text-blue-600 hover:text-blue-900 font-extrabold cursor-pointer px-1"
          >
            OK
          </button>
        </div>
      )}

      {/* SUBSCRIPTION PLANS Section (Horizontal Scrolling Carousel Matching Reference Photo) */}
      <section aria-labelledby="subscription-plans-heading" className="space-y-3 relative">
        <div className="flex items-center justify-between px-1">
          <h4
            id="subscription-plans-heading"
            className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900"
          >
            Subscription Plans
          </h4>
          <span className="text-[11px] font-medium text-slate-500">
            Swipe or use arrows to compare plans
          </span>
        </div>

        <div className="relative group">
          {/* Horizontal Scrolling Plan Cards */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScrollUpdate}
            className="flex items-stretch gap-3.5 overflow-x-auto snap-x snap-mandatory pb-3 pt-1 no-scrollbar scroll-smooth"
          >
            {SUBSCRIPTION_PLANS.map((plan) => {
              const isCurrentPlan = activePlanId === plan.id;
              const isStarter = plan.id === 'starter';
              const isEnterprise = plan.id === 'enterprise';
              const isLowerRank = plan.rank < activePlanSpec.rank;

              return (
                <article
                  key={plan.id}
                  data-subscription-card={plan.id}
                  style={{
                    backgroundColor: isDark ? plan.bodyBgDark : plan.bodyBgLight,
                    borderColor: isDark ? plan.borderDark : plan.borderLight,
                  }}
                  className={`snap-start shrink-0 w-[188px] sm:w-[205px] rounded-2xl border overflow-hidden flex flex-col justify-between shadow-md transition-transform duration-150 hover:-translate-y-0.5 ${
                    isCurrentPlan ? 'ring-2 ring-blue-500 shadow-lg' : ''
                  }`}
                >
                  {/* Colored Plan Header Band */}
                  <div>
                    <div
                      style={{
                        backgroundColor: isDark ? plan.headerBgDark : plan.headerBgLight,
                      }}
                      className={`px-4 py-3.5 ${plan.headerTextClass}`}
                    >
                      <div className="text-xs sm:text-[13px] font-black uppercase tracking-wide">
                        {plan.title}
                      </div>
                      <div className="text-[11px] font-semibold opacity-90 min-h-[16px]">
                        {plan.subtitle || '\u00A0'}
                      </div>
                      <div className="mt-1 flex items-baseline gap-0.5 tabular-nums">
                        <span className="text-xl sm:text-2xl font-black tracking-tight">
                          {plan.price}
                        </span>
                        <span className="text-xs font-bold opacity-90">{plan.period}</span>
                      </div>
                    </div>

                    {/* Plan Features List */}
                    <ul className="px-4 py-3.5 space-y-1.5 text-xs font-semibold text-slate-800">
                      {plan.features.map((feat) => (
                        <li key={feat} className="leading-snug">
                          {feat}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Plan Bottom Action / Status Control */}
                  <div className="px-4 pb-4 pt-2 mt-auto">
                    {isEnterprise ? (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        style={{
                          backgroundColor: isDark ? '#785a22' : '#6b5322',
                          color: '#ffffff',
                        }}
                        className="w-full min-h-[38px] px-3 py-2 rounded-lg text-xs font-bold shadow-xs hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap"
                      >
                        Contact Sales
                      </button>
                    ) : isCurrentPlan ? (
                      <div className="min-h-[38px] flex items-center text-xs font-extrabold text-slate-800">
                        {isStarter ? '[Current]' : '[Active]'}
                      </div>
                    ) : isStarter ? (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        className="min-h-[38px] text-left text-xs font-extrabold text-emerald-900 hover:underline cursor-pointer whitespace-nowrap"
                      >
                        [Current]
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-purple-400/70 text-slate-900 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {isLowerRank ? 'Downgrade' : 'Upgrade'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Floating Horizontal Scroll Arrow Button (Matching Reference Photo) */}
          <button
            type="button"
            onClick={() =>
              handleScrollPlans(
                activeScrollIndex >= SUBSCRIPTION_PLANS.length - 1 ? 'left' : 'right'
              )
            }
            aria-label="Scroll subscription plans horizontally"
            title="Next plans"
            className="absolute -right-1 sm:right-1 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/95 hover:bg-white text-slate-700 border border-slate-200 shadow-lg flex items-center justify-center transition-transform active:scale-95 cursor-pointer"
          >
            <ArrowRight className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Bottom Carousel Pagination Dots */}
        <div className="flex items-center justify-center gap-1.5 pt-1" aria-hidden="true">
          {SUBSCRIPTION_PLANS.map((plan, idx) => (
            <button
              key={plan.id}
              type="button"
              onClick={() => {
                const el = scrollContainerRef.current;
                if (!el) return;
                el.scrollTo({ left: idx * 200, behavior: 'smooth' });
                setActiveScrollIndex(idx);
              }}
              className={`h-2 rounded-full transition-all cursor-pointer ${
                activeScrollIndex === idx
                  ? 'w-4 bg-blue-600'
                  : 'w-2 bg-slate-300 hover:bg-slate-400'
              }`}
            />
          ))}
        </div>
      </section>
    </motion.div>
  );
}
