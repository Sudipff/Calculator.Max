export type SubscriptionPlanId = 'starter' | 'pro' | 'team' | 'enterprise';

export interface SubscriptionPlanSpec {
  id: SubscriptionPlanId;
  title: string;
  subtitle?: string;
  price: string;
  priceCents: number;
  period: string;
  storageQuotaLabel: string;
  storageLimitBytes: number;
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

export const TEN_MB_LIMIT_BYTES = 10 * 1024 * 1024; // 10,485,760 bytes
export const TEN_GB_LIMIT_BYTES = 10 * 1024 * 1024 * 1024; // 10,737,418,240 bytes
export const FIFTY_GB_LIMIT_BYTES = 50 * 1024 * 1024 * 1024; // 53,687,091,200 bytes
export const ONE_TB_LIMIT_BYTES = 1024 * 1024 * 1024 * 1024; // 1,099,511,627,776 bytes

export const PLAN_STORAGE_LIMIT_BYTES: Record<SubscriptionPlanId, number> = {
  starter: TEN_MB_LIMIT_BYTES,
  pro: TEN_GB_LIMIT_BYTES,
  team: FIFTY_GB_LIMIT_BYTES,
  enterprise: ONE_TB_LIMIT_BYTES,
};

export const PLAN_PRICE_CENTS: Record<SubscriptionPlanId, number> = {
  starter: 0,
  pro: 999,
  team: 2499,
  enterprise: 4999,
};

export const SUBSCRIPTION_PLANS: SubscriptionPlanSpec[] = [
  {
    id: 'starter',
    title: 'STARTER',
    subtitle: 'Free',
    price: '$0',
    priceCents: 0,
    period: '/mo',
    storageQuotaLabel: '10 MB Storage',
    storageLimitBytes: TEN_MB_LIMIT_BYTES,
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
    priceCents: 999,
    period: '/mo',
    storageQuotaLabel: '10 GB Storage',
    storageLimitBytes: TEN_GB_LIMIT_BYTES,
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
    priceCents: 2499,
    period: '/mo',
    storageQuotaLabel: '50 GB Storage',
    storageLimitBytes: FIFTY_GB_LIMIT_BYTES,
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
    priceCents: 4999,
    period: '/mo',
    storageQuotaLabel: '1 TB Storage',
    storageLimitBytes: ONE_TB_LIMIT_BYTES,
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

export function isValidPlanId(val: unknown): val is SubscriptionPlanId {
  return val === 'starter' || val === 'pro' || val === 'team' || val === 'enterprise';
}

export function getPlanLimitBytes(planId: SubscriptionPlanId): number {
  return PLAN_STORAGE_LIMIT_BYTES[planId] ?? TEN_MB_LIMIT_BYTES;
}

export function formatStorageLimitLabel(limitBytes: number): string {
  if (limitBytes >= ONE_TB_LIMIT_BYTES) {
    const tb = limitBytes / ONE_TB_LIMIT_BYTES;
    return `${Number.isInteger(tb) ? tb : tb.toFixed(1)} TB`;
  }
  if (limitBytes >= 1024 * 1024 * 1024) {
    const gb = limitBytes / (1024 * 1024 * 1024);
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  const mb = Math.max(1, Math.round(limitBytes / (1024 * 1024)));
  return `${mb} MB`;
}

export function formatUsedStorageShort(usedBytes: number): string {
  if (usedBytes <= 0) return '0.00 MB';
  if (usedBytes >= 1024 * 1024 * 1024) {
    return `${(usedBytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  return `${(usedBytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatDetailedBytesLabel(bytes: number): string {
  if (bytes <= 0) return '0 KB';
  if (bytes >= 1024 * 1024 * 1024) {
    const gb = bytes / (1024 * 1024 * 1024);
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  if (bytes >= 1024 * 1024) {
    const mb = bytes / (1024 * 1024);
    return `${Number.isInteger(mb) ? mb : mb.toFixed(1)} MB`;
  }
  if (bytes >= 1024) {
    return `${Math.round(bytes / 1024)} KB`;
  }
  return `${bytes} B`;
}

export function getPlanDisplayName(planId: SubscriptionPlanId): string {
  switch (planId) {
    case 'pro':
      return 'Pro';
    case 'team':
      return 'Team';
    case 'enterprise':
      return 'Enterprise';
    case 'starter':
    default:
      return 'Starter';
  }
}

export interface StorageSnapshot {
  planId: SubscriptionPlanId;
  usedBytes: number;
  limitBytes: number;
  breakdown: {
    calculationsBytes: number;
    notesBytes: number;
    tasksBytes: number;
  };
  counts: {
    calculations: number;
    notes: number;
    tasks: number;
  };
  syncedAt: string | null;
}

const SNAPSHOT_KEY_PREFIX = 'calculator-max-storage-snapshot-';
const PLAN_KEY_PREFIX = 'calculator-max-plan-';

// Track initial app launch sync per browser session/runtime so navigating
// to SubscriptionView does not re-trigger the Cloud Sync animation.
let initialLaunchStorageSynced = false;

export function hasCompletedInitialCloudSync(): boolean {
  return initialLaunchStorageSynced;
}

export function markInitialCloudSyncCompleted(): void {
  initialLaunchStorageSynced = true;
}

export function getSavedPlanId(uid?: string | null): SubscriptionPlanId {
  if (typeof window === 'undefined') return 'starter';
  try {
    const raw = localStorage.getItem(`${PLAN_KEY_PREFIX}${uid || 'guest'}`);
    if (isValidPlanId(raw)) return raw;
  } catch {
    // ignore storage errors
  }
  return 'starter';
}

export function savePlanId(uid: string | null | undefined, planId: SubscriptionPlanId): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(`${PLAN_KEY_PREFIX}${uid || 'guest'}`, planId);
  } catch {
    // ignore storage errors
  }
}

export function getCachedStorageSnapshot(uid?: string | null): StorageSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(`${SNAPSHOT_KEY_PREFIX}${uid || 'guest'}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StorageSnapshot>;
    const planId: SubscriptionPlanId = isValidPlanId(parsed.planId) ? parsed.planId : 'starter';
    const limitBytes =
      typeof parsed.limitBytes === 'number' && parsed.limitBytes > 0
        ? parsed.limitBytes
        : getPlanLimitBytes(planId);
    return {
      planId,
      usedBytes: Number(parsed.usedBytes) || 0,
      limitBytes,
      breakdown: {
        calculationsBytes: Number(parsed.breakdown?.calculationsBytes) || 0,
        notesBytes: Number(parsed.breakdown?.notesBytes) || 0,
        tasksBytes: Number(parsed.breakdown?.tasksBytes) || 0,
      },
      counts: {
        calculations: Number(parsed.counts?.calculations) || 0,
        notes: Number(parsed.counts?.notes) || 0,
        tasks: Number(parsed.counts?.tasks) || 0,
      },
      syncedAt: typeof parsed.syncedAt === 'string' ? parsed.syncedAt : null,
    };
  } catch {
    return null;
  }
}

export function saveCachedStorageSnapshot(
  uid: string | null | undefined,
  snapshot: StorageSnapshot
): void {
  if (typeof window === 'undefined') return;
  try {
    savePlanId(uid, snapshot.planId);
    localStorage.setItem(`${SNAPSHOT_KEY_PREFIX}${uid || 'guest'}`, JSON.stringify(snapshot));
    window.dispatchEvent(
      new CustomEvent('calcmax:storage-updated', {
        detail: { uid: uid || 'guest', snapshot },
      })
    );
  } catch {
    // ignore storage errors
  }
}
