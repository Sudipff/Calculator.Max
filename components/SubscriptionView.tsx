'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  CheckCircle2,
  Cloud,
  CreditCard,
  HardDrive,
  Lock,
  RefreshCw,
  Settings,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { createClient } from '@/utils/supabase/client';
import { useTheme } from '@/components/ThemeProvider';
import {
  SUBSCRIPTION_PLANS,
  SubscriptionPlanId,
  SubscriptionPlanSpec,
  TEN_MB_LIMIT_BYTES,
  formatStorageLimitLabel,
  formatUsedStorageShort,
  getPlanDisplayName,
  getPlanLimitBytes,
  saveCachedStorageSnapshot,
} from '@/lib/subscriptionPlans';
import {
  buildLocalStorageSnapshot,
  fetchAndCacheStorageSnapshot,
} from '@/lib/storageSyncClient';
import type { CurrencyOption } from './ProfileSettingsView';
import BackupSettingsView from './BackupSettingsView';

export type { SubscriptionPlanId };
export { SUBSCRIPTION_PLANS };

type GatewayMethod = 'card' | 'upi' | 'netbanking';

interface PaymentReceipt {
  transactionId: string;
  receiptNumber: string;
  planId: SubscriptionPlanId;
  planName: string;
  membershipStatus: string;
  limitBytes: number;
  limitLabel: string;
  amountCents: number;
  payerSummary: string;
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
  refreshSignal?: number;
}

function formatCardNumberSpacing(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 16);
  return digits.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExpiryInput(raw: string): string {
  const digits = raw.replace(/\D/g, '').slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}/${digits.slice(2)}`;
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
  refreshSignal = 0,
}: SubscriptionViewProps) {
  const { isDark } = useTheme();
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  const initialSnapshot = useMemo(
    () => buildLocalStorageSnapshot(currentUser?.id),
    [currentUser?.id]
  );

  const [showBackupSettings, setShowBackupSettings] = useState(false);
  const prevCloseBackupSignalRef = useRef(closeBackupSignal);
  const prevRefreshSignalRef = useRef(refreshSignal);

  const [activePlanId, setActivePlanId] = useState<SubscriptionPlanId>(
    initialSnapshot.planId || 'starter'
  );
  const [usedBytes, setUsedBytes] = useState<number>(initialSnapshot.usedBytes || 0);
  const [limitBytes, setLimitBytes] = useState<number>(
    initialSnapshot.limitBytes || TEN_MB_LIMIT_BYTES
  );
  const [breakdown, setBreakdown] = useState(initialSnapshot.breakdown);
  const [counts, setCounts] = useState(initialSnapshot.counts);
  const [isSyncingStorage, setIsSyncingStorage] = useState<boolean>(false);
  const [cloudSyncedAt, setCloudSyncedAt] = useState<string | null>(initialSnapshot.syncedAt);
  const [planNotice, setPlanNotice] = useState<string | null>(null);
  const [activeScrollIndex, setActiveScrollIndex] = useState<number>(0);

  // Payment Gateway Checkout State
  const [checkoutPlan, setCheckoutPlan] = useState<SubscriptionPlanSpec | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<GatewayMethod>('card');
  const [cardholderName, setCardholderName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvc, setCardCvc] = useState('');
  const [upiId, setUpiId] = useState('');
  const [bankName, setBankName] = useState('HDFC Bank');
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [paymentReceipt, setPaymentReceipt] = useState<PaymentReceipt | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    onBackupViewChange?.(showBackupSettings);
    return () => {
      onBackupViewChange?.(false);
    };
  }, [onBackupViewChange, showBackupSettings]);

  useEffect(() => {
    if (closeBackupSignal === prevCloseBackupSignalRef.current) return;
    prevCloseBackupSignalRef.current = closeBackupSignal;
    if (checkoutPlan) {
      if (!isProcessingPayment) {
        setCheckoutPlan(null);
        setPaymentReceipt(null);
        setPaymentError(null);
      }
      return;
    }
    if (showBackupSettings) {
      setShowBackupSettings(false);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    }
  }, [checkoutPlan, closeBackupSignal, isProcessingPayment, showBackupSettings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (checkoutPlan && !isProcessingPayment) {
          setCheckoutPlan(null);
          setPaymentReceipt(null);
          setPaymentError(null);
        } else if (showBackupSettings) {
          setShowBackupSettings(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [checkoutPlan, isProcessingPayment, onClose, showBackupSettings]);

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

  const applySnapshotToState = useCallback(
    (snap: ReturnType<typeof buildLocalStorageSnapshot>) => {
      setBreakdown(snap.breakdown);
      setCounts(snap.counts);
      setUsedBytes(snap.usedBytes);
      setLimitBytes(snap.limitBytes);
      setActivePlanId(snap.planId);
      if (snap.syncedAt) {
        setCloudSyncedAt(snap.syncedAt);
      }
      onStorageSynced?.(snap.usedBytes, snap.limitBytes, snap.planId);
    },
    [onStorageSynced]
  );

  // Cloud Sync animation ONLY runs when manually requested (showAnimation = true).
  // Navigating to Subscription loads the cached/silent snapshot without spinning animation.
  const syncStorageWithCloud = useCallback(
    async (showAnimation: boolean) => {
      if (showAnimation) {
        setIsSyncingStorage(true);
      }
      try {
        const snapshot = await fetchAndCacheStorageSnapshot(currentUser?.id);
        applySnapshotToState(snapshot);
      } finally {
        if (showAnimation) {
          setIsSyncingStorage(false);
        }
      }
    },
    [applySnapshotToState, currentUser?.id]
  );

  // On mount / navigation to Subscription screen: hydrate from cache immediately and
  // perform a silent check without activating Cloud Sync animation.
  useEffect(() => {
    const snap = buildLocalStorageSnapshot(currentUser?.id);
    applySnapshotToState(snap);
    void syncStorageWithCloud(false);
  }, [applySnapshotToState, currentUser?.id, syncStorageWithCloud]);

  // Manual pull-to-refresh signal from parent triggers Cloud Sync animation explicitly
  useEffect(() => {
    if (refreshSignal === prevRefreshSignalRef.current) return;
    prevRefreshSignalRef.current = refreshSignal;
    void syncStorageWithCloud(true);
  }, [refreshSignal, syncStorageWithCloud]);

  const openPaymentGateway = (plan: SubscriptionPlanSpec) => {
    if (!currentUser) {
      onOpenAuthModal('signin');
      return;
    }
    setCheckoutPlan(plan);
    setPaymentReceipt(null);
    setPaymentError(null);
    setPaymentMethod('card');
    setCardholderName(
      currentUser?.user_metadata?.full_name ||
        currentUser?.user_metadata?.name ||
        ''
    );
    setCardNumber('');
    setCardExpiry('');
    setCardCvc('');
    setUpiId('');
  };

  const handleSelectPlan = async (plan: SubscriptionPlanSpec) => {
    if (plan.id === activePlanId) return;

    const currentRank =
      SUBSCRIPTION_PLANS.find((p) => p.id === activePlanId)?.rank ?? 0;

    // Require payment gateway checkout whenever upgrading to a paid tier
    if (plan.rank > currentRank && plan.id !== 'starter') {
      openPaymentGateway(plan);
      return;
    }

    // Switching back to free Starter tier
    if (!currentUser && plan.id !== 'starter') {
      onOpenAuthModal('signin');
      return;
    }

    const uid = currentUser?.id || 'guest';
    const nextLimit = getPlanLimitBytes(plan.id);
    setActivePlanId(plan.id);
    setLimitBytes(nextLimit);

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
            ...(session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
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

    saveCachedStorageSnapshot(uid, {
      planId: plan.id,
      usedBytes,
      limitBytes: nextLimit,
      breakdown,
      counts,
      syncedAt:
        cloudSyncedAt ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    });
    onStorageSynced?.(usedBytes, nextLimit, plan.id);
    setPlanNotice(
      `Subscription switched to ${plan.title} (${formatStorageLimitLabel(nextLimit)} Storage).`
    );
    setTimeout(() => setPlanNotice(null), 3500);
  };

  const handleSubmitPaymentCheckout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkoutPlan || isProcessingPayment) return;

    setPaymentError(null);
    setIsProcessingPayment(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token && !currentUser) {
        setPaymentError('Please sign in to complete your upgrade.');
        setIsProcessingPayment(false);
        return;
      }

      // Smooth gateway authorization feedback
      await new Promise((resolve) => setTimeout(resolve, 650));

      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          planId: checkoutPlan.id,
          paymentMethod,
          cardholderName,
          cardNumber,
          expiry: cardExpiry,
          cvc: cardCvc,
          upiId,
          bankName,
          countryRegion: activeCurrencyObj?.country,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setPaymentError(
          data.error || 'Payment declined by gateway. Please verify your details and try again.'
        );
        setIsProcessingPayment(false);
        return;
      }

      const upgradedPlan = (data.planId as SubscriptionPlanId) || checkoutPlan.id;
      const upgradedLimit =
        Number(data.limitBytes) || getPlanLimitBytes(upgradedPlan);
      const syncedNow = new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      });

      setActivePlanId(upgradedPlan);
      setLimitBytes(upgradedLimit);
      setCloudSyncedAt(syncedNow);

      saveCachedStorageSnapshot(currentUser?.id, {
        planId: upgradedPlan,
        usedBytes,
        limitBytes: upgradedLimit,
        breakdown,
        counts,
        syncedAt: syncedNow,
      });

      onStorageSynced?.(usedBytes, upgradedLimit, upgradedPlan);

      setPaymentReceipt({
        transactionId: data.transactionId,
        receiptNumber: data.receiptNumber,
        planId: upgradedPlan,
        planName: data.planName || getPlanDisplayName(upgradedPlan),
        membershipStatus:
          data.membershipStatus || `${getPlanDisplayName(upgradedPlan)} Member`,
        limitBytes: upgradedLimit,
        limitLabel: data.limitLabel || formatStorageLimitLabel(upgradedLimit),
        amountCents: Number(data.amountCents) || checkoutPlan.priceCents,
        payerSummary: data.payerSummary || paymentMethod.toUpperCase(),
      });

      setPlanNotice(
        `Payment confirmed! Upgraded to ${getPlanDisplayName(
          upgradedPlan
        )} (${formatStorageLimitLabel(upgradedLimit)} Cloud Storage).`
      );
      setTimeout(() => setPlanNotice(null), 5000);
    } catch {
      setPaymentError('Network error while contacting the payment gateway. Please retry.');
    } finally {
      setIsProcessingPayment(false);
    }
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

  const rawPercent = Math.min(100, (usedBytes / Math.max(1, limitBytes)) * 100);
  const progressBarPercent = usedBytes > 0 ? Math.max(4, rawPercent) : 0;
  const usedShortLabel = formatUsedStorageShort(usedBytes);
  const limitShortLabel = formatStorageLimitLabel(limitBytes);
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

      {/* User Identity Horizontal Card with Current Membership Badge */}
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
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
              {displayName}
            </h3>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide border ${
                activePlanId === 'starter'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-blue-50 text-blue-700 border-blue-200'
              }`}
            >
              {getPlanDisplayName(activePlanId)} Plan
            </span>
          </div>
          <p className="text-xs sm:text-sm font-semibold text-slate-600 truncate">{userHandle}</p>
          <p className="text-xs font-medium text-slate-500 truncate">{memberSinceLabel}</p>
        </div>
      </section>

      {/* STORAGE STATUS Section (Dynamic Plan Cloud Storage Quota) */}
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
            onClick={() => void syncStorageWithCloud(true)}
            disabled={isSyncingStorage}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer disabled:opacity-60"
            title="Manually sync storage usage with Cloud"
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
                <span className="text-blue-600">{usedShortLabel}</span>
                <span className="text-slate-600 font-bold"> / {limitShortLabel}</span>
                <span className="ml-2 text-xs font-medium text-slate-500">
                  ({usedKbNumber} KB used)
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 tabular-nums shrink-0">
              <Cloud className="w-3.5 h-3.5 text-blue-500" />
              <span>
                {rawPercent < 0.1 && usedBytes > 0 ? '< 0.1%' : `${rawPercent.toFixed(1)}%`}
              </span>
            </span>
          </div>

          {/* Per-User Cloud Storage Progress Bar + Right-Aligned Limit Label */}
          <div className="flex items-center justify-between gap-3">
            <div
              role="progressbar"
              aria-label={`Cloud storage usage out of ${limitShortLabel} limit`}
              aria-valuemin={0}
              aria-valuemax={Math.round(limitBytes / (1024 * 1024))}
              aria-valuenow={Number((usedBytes / (1024 * 1024)).toFixed(2))}
              className="flex-1 h-3.5 rounded-full bg-slate-200/90 overflow-hidden p-0.5 shadow-inner"
            >
              <motion.div
                initial={false}
                animate={{ width: `${progressBarPercent}%` }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                className={`h-full rounded-full ${
                  rawPercent >= 90
                    ? 'bg-gradient-to-r from-rose-600 to-amber-500'
                    : 'bg-gradient-to-r from-blue-600 via-blue-500 to-sky-400'
                }`}
              />
            </div>

            <span className="text-[11px] sm:text-xs font-semibold text-slate-600 text-right whitespace-nowrap shrink-0">
              {limitShortLabel} Per-User Cloud Limit
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
          className="px-4 py-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center justify-between gap-2"
        >
          <span>{planNotice}</span>
          <button
            type="button"
            onClick={() => setPlanNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 font-extrabold cursor-pointer px-1"
          >
            OK
          </button>
        </div>
      )}

      {/* SUBSCRIPTION PLANS Section */}
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
                    {isCurrentPlan ? (
                      <div className="min-h-[38px] flex items-center text-xs font-extrabold text-slate-800">
                        {isStarter ? '[Current]' : '[Active]'}
                      </div>
                    ) : isStarter ? (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-emerald-400/70 text-emerald-900 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Switch to Free
                      </button>
                    ) : isEnterprise ? (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        style={{
                          backgroundColor: isDark ? '#785a22' : '#6b5322',
                          color: '#ffffff',
                        }}
                        className="w-full min-h-[38px] px-3 py-2 rounded-lg text-xs font-bold shadow-xs hover:opacity-95 transition-opacity cursor-pointer whitespace-nowrap"
                      >
                        Upgrade ($49.99)
                      </button>
                    ) : isLowerRank ? (
                      <button
                        type="button"
                        onClick={() => openPaymentGateway(plan)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-full bg-white/85 hover:bg-white border border-slate-300 text-slate-800 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Switch Plan
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void handleSelectPlan(plan)}
                        className="w-full min-h-[38px] px-3 py-1.5 rounded-full bg-white/90 hover:bg-white border border-purple-400/70 text-slate-900 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Upgrade
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>

          {/* Floating Horizontal Scroll Arrow Button */}
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

      {/* SECURE PAYMENT GATEWAY MODAL FOR SUBSCRIPTION UPGRADES */}
      {isMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <AnimatePresence>
            {checkoutPlan && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="fixed inset-0 z-[99995] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/55 backdrop-blur-xs"
                onClick={() => {
                  if (!isProcessingPayment) {
                    setCheckoutPlan(null);
                    setPaymentReceipt(null);
                    setPaymentError(null);
                  }
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 28, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 24, scale: 0.98 }}
                  transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="payment-gateway-title"
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 p-5 sm:p-6 space-y-4 max-h-[90dvh] overflow-y-auto overscroll-contain pb-[max(1.5rem,env(safe-area-inset-bottom))]"
                >
                  {/* Modal Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <span className="w-10 h-10 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center shrink-0">
                        <ShieldCheck className="w-5 h-5" />
                      </span>
                      <div>
                        <h3
                          id="payment-gateway-title"
                          className="text-base sm:text-lg font-black text-slate-900 tracking-tight"
                        >
                          {paymentReceipt ? 'Payment Confirmed' : 'Secure Payment Gateway'}
                        </h3>
                        <p className="text-[11px] font-medium text-slate-500 flex items-center gap-1">
                          <Lock className="w-3 h-3 text-emerald-600" />
                          <span>256-bit TLS Encrypted Checkout</span>
                        </p>
                      </div>
                    </div>

                    {!isProcessingPayment && (
                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutPlan(null);
                          setPaymentReceipt(null);
                          setPaymentError(null);
                        }}
                        aria-label="Close payment gateway"
                        className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {paymentReceipt ? (
                    /* PAYMENT RECEIPT CONFIRMATION VIEW */
                    <div className="space-y-4">
                      <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-start gap-3">
                        <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                        <div className="space-y-1">
                          <div className="text-sm font-extrabold text-emerald-950">
                            {paymentReceipt.planName} Plan Activated!
                          </div>
                          <p className="text-xs text-emerald-800 leading-relaxed">
                            Your membership status has been updated to{' '}
                            <strong>{paymentReceipt.membershipStatus}</strong> and your cloud
                            storage quota is now{' '}
                            <strong>{paymentReceipt.limitLabel}</strong>.
                          </p>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-2xl border border-slate-200/80 divide-y divide-slate-200/70 text-xs">
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Receipt Number</span>
                          <span className="font-bold text-slate-900 tabular-nums">
                            {paymentReceipt.receiptNumber}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Transaction ID</span>
                          <span className="font-mono text-[11px] font-bold text-slate-800">
                            {paymentReceipt.transactionId}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Membership Status</span>
                          <span className="font-bold text-blue-700">
                            {paymentReceipt.membershipStatus}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Cloud Storage Limit</span>
                          <span className="font-extrabold text-emerald-700">
                            {paymentReceipt.limitLabel}
                          </span>
                        </div>
                        <div className="px-4 py-2.5 flex items-center justify-between">
                          <span className="text-slate-500 font-medium">Amount Charged</span>
                          <span className="font-black text-slate-900 tabular-nums">
                            ${(paymentReceipt.amountCents / 100).toFixed(2)} USD
                          </span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setCheckoutPlan(null);
                          setPaymentReceipt(null);
                        }}
                        className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-colors"
                      >
                        Done
                      </button>
                    </div>
                  ) : (
                    /* PAYMENT CHECKOUT FORM */
                    <form onSubmit={handleSubmitPaymentCheckout} className="space-y-4">
                      {/* Upgrade Summary Card */}
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[10px] font-extrabold uppercase tracking-wider text-blue-700">
                              Upgrading To
                            </span>
                            <div className="text-sm font-black text-slate-900">
                              {checkoutPlan.title} Membership
                            </div>
                          </div>
                          <div className="text-right tabular-nums">
                            <div className="text-lg font-black text-slate-900">
                              {checkoutPlan.price}
                              <span className="text-xs font-semibold text-slate-500">
                                {checkoutPlan.period}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-200/70 text-[11px] font-semibold text-slate-700">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200">
                            <Cloud className="w-3 h-3" />
                            <span>
                              Storage: {formatStorageLimitLabel(limitBytes)} →{' '}
                              {formatStorageLimitLabel(checkoutPlan.storageLimitBytes)}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Sparkles className="w-3 h-3" />
                            <span>{getPlanDisplayName(checkoutPlan.id)} Status</span>
                          </span>
                        </div>
                      </div>

                      {/* Payment Method Tabs */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('card');
                            setPaymentError(null);
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            paymentMethod === 'card'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Card</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('upi');
                            setPaymentError(null);
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            paymentMethod === 'upi'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>UPI</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentMethod('netbanking');
                            setPaymentError(null);
                          }}
                          className={`py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                            paymentMethod === 'netbanking'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Building2 className="w-3.5 h-3.5" />
                          <span>Bank</span>
                        </button>
                      </div>

                      {/* Method Fields */}
                      {paymentMethod === 'card' && (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                              Card Details
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (!cardholderName.trim()) {
                                  setCardholderName(displayName);
                                }
                                setCardNumber('4242 4242 4242 4242');
                                setCardExpiry('12/28');
                                setCardCvc('424');
                                setPaymentError(null);
                              }}
                              className="text-[11px] font-bold text-blue-600 hover:text-blue-700 hover:underline cursor-pointer"
                            >
                              Fill Test Visa (4242)
                            </button>
                          </div>

                          <input
                            type="text"
                            value={cardholderName}
                            onChange={(e) => setCardholderName(e.target.value)}
                            placeholder="Cardholder Name"
                            aria-label="Cardholder Name"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          />

                          <input
                            type="text"
                            inputMode="numeric"
                            value={cardNumber}
                            onChange={(e) => setCardNumber(formatCardNumberSpacing(e.target.value))}
                            placeholder="Card Number (e.g. 4242 4242 4242 4242)"
                            aria-label="Card Number"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          />

                          <div className="grid grid-cols-2 gap-2.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              value={cardExpiry}
                              onChange={(e) => setCardExpiry(formatExpiryInput(e.target.value))}
                              placeholder="MM/YY"
                              aria-label="Card Expiry"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                            />
                            <input
                              type="password"
                              inputMode="numeric"
                              maxLength={4}
                              value={cardCvc}
                              onChange={(e) => setCardCvc(e.target.value.replace(/\D/g, '').slice(0, 4))}
                              placeholder="CVC"
                              aria-label="Card CVC"
                              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-mono font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                            />
                          </div>
                        </div>
                      )}

                      {paymentMethod === 'upi' && (
                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            UPI ID / VPA
                          </label>
                          <input
                            type="text"
                            value={upiId}
                            onChange={(e) => setUpiId(e.target.value)}
                            placeholder="yourname@okaxis"
                            aria-label="UPI ID"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          />
                        </div>
                      )}

                      {paymentMethod === 'netbanking' && (
                        <div className="space-y-2">
                          <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            Select Bank
                          </label>
                          <select
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            aria-label="Select Bank"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
                          >
                            <option value="HDFC Bank">HDFC Bank</option>
                            <option value="ICICI Bank">ICICI Bank</option>
                            <option value="State Bank of India">State Bank of India</option>
                            <option value="Axis Bank">Axis Bank</option>
                            <option value="Kotak Mahindra Bank">Kotak Mahindra Bank</option>
                            <option value="Chase / Global Wire">Chase / Global Wire</option>
                          </select>
                        </div>
                      )}

                      {paymentError && (
                        <div
                          role="alert"
                          className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-start gap-2"
                        >
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{paymentError}</span>
                        </div>
                      )}

                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          disabled={isProcessingPayment}
                          onClick={() => {
                            setCheckoutPlan(null);
                            setPaymentError(null);
                          }}
                          className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer disabled:opacity-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isProcessingPayment}
                          className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all flex items-center gap-2"
                        >
                          {isProcessingPayment ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Processing Payment...</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3.5 h-3.5" />
                              <span>
                                Pay {checkoutPlan.price} &amp; Upgrade
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body
        )}
    </motion.div>
  );
}
