'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import Image from 'next/image';
import {
  Calculator,
  Clock,
  Percent,
  Scale,
  RotateCcw,
  Trash2,
  ArrowRightLeft,
  Target,
  CreditCard,
  LayoutGrid,
  ChevronDown,
  Search,
  X,
  AlertCircle,
  FileText,
  Globe,
  Check,
  RefreshCw,
  Loader2,
  Coins,
  CalendarDays,
  Cake,
  StickyNote,
  ListTodo,
  Home,
  User,
  ArrowLeft,
  LogOut,
  ArrowDown,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EmiCalculator from '../components/EmiCalculator';
import WishlistPlanner from '../components/WishlistPlanner';
import AgeCalculator from '../components/AgeCalculator';
import ScientificCalculator from '../components/ScientificCalculator';
import CalculatorErrorBoundary from '../components/CalculatorErrorBoundary';
import AuthHeader from '../components/AuthHeader';
import PWAInstallButton from '../components/PWAInstallButton';
import { OfflineWifiIndicator } from '../components/PwaRuntime';
import DashboardHome from '../components/DashboardHome';
import CurrencyExchange from '../components/CurrencyExchange';
import NotesView from '../components/NotesManager/NotesView';
import TasksView from '../components/NotesManager/TasksView';
import HistoryView from '../components/HistoryView';
import HistoryPreviewModal from '../components/HistoryPreviewModal';
import ProfileSettingsView, { type BackupPayload } from '../components/ProfileSettingsView';
import StorageFullModal from '../components/StorageFullModal';
import { createClient } from '@/utils/supabase/client';
import {
  evaluateBasicArithmetic,
  computeDiscount,
  computeWeightQuantity,
  computeWeightPrice,
  convertRetailUnit,
  type WeightTargetUnit,
} from '../lib/basicCalculators';
import {
  getCalculationHistory,
  saveCalculationHistory,
  deleteCalculationHistoryItem,
  clearCalculationHistory,
  setCalculationHistory,
  toggleCalculationHistoryFavorite,
  parseSavedAmountFromText,
  enqueueCalculationOfflineSync,
  clearCalculationOfflineOp,
  syncSingleCalculationToCloud,
  HistoryItem,
} from '../lib/historyStorage';
import { getLocalNotes, getLocalTasks, saveLocalNotes, saveLocalTasks } from '../lib/notesTasksStorage';
import { hasCompletedInitialCloudSync, type StorageSnapshot } from '../lib/subscriptionPlans';
import {
  buildLocalStorageSnapshot,
  checkStorageQuotaBeforeAdd,
  fetchAndCacheStorageSnapshot,
  refreshLocalStorageSnapshot,
  triggerStorageFullPopup,
} from '../lib/storageSyncClient';
import { getBackupPermissions } from '../lib/backupPermissions';
import type { NoteItem, SourceHistoryMeta } from '../lib/types/notes-tasks';
import { exportAllHistoryPDF, exportSingleItemPDF } from '../lib/pdfExport';
import { sanitizeCsvCell } from '../lib/validation';

type ActiveTab = 'home' | 'age' | 'calculator' | 'emi' | 'wishlist' | 'discount' | 'weight' | 'unit' | 'currency' | 'quick' | 'notes' | 'tasks' | 'history' | 'profile';
export type VibrationType = 'success' | 'error' | 'click' | 'reset';

const TAB_ORDER: Record<ActiveTab, number> = {
  home: 0,
  history: 1,
  notes: 2,
  tasks: 3,
  calculator: 4,
  age: 5,
  emi: 6,
  wishlist: 7,
  discount: 8,
  weight: 9,
  unit: 10,
  currency: 11,
  quick: 12,
  profile: 13,
};

const BOTTOM_NAV_TABS = new Set<ActiveTab>(['home', 'history', 'notes', 'tasks']);

const CURRENCIES = [
  { symbol: '৳', code: 'BDT', name: 'Bangladesh Taka', country: 'Bangladesh', flag: '🇧🇩' },
  { symbol: '₹', code: 'INR', name: 'Indian Rupee', country: 'India', flag: '🇮🇳' },
  { symbol: '$', code: 'USD', name: 'US Dollar', country: 'United States', flag: '🇺🇸' },
  { symbol: '€', code: 'EUR', name: 'Euro', country: 'European Union', flag: '🇪🇺' },
  { symbol: '£', code: 'GBP', name: 'British Pound', country: 'United Kingdom', flag: '🇬🇧' },
  { symbol: '﷼', code: 'SAR', name: 'Saudi Riyal', country: 'Saudi Arabia', flag: '🇸🇦' },
  { symbol: 'د.إ', code: 'AED', name: 'UAE Dirham', country: 'United Arab Emirates', flag: '🇦🇪' },
  { symbol: 'RM', code: 'MYR', name: 'Malaysian Ringgit', country: 'Malaysia', flag: '🇲🇾' },
  { symbol: 'S$', code: 'SGD', name: 'Singapore Dollar', country: 'Singapore', flag: '🇸🇬' },
  { symbol: 'C$', code: 'CAD', name: 'Canadian Dollar', country: 'Canada', flag: '🇨🇦' },
  { symbol: 'A$', code: 'AUD', name: 'Australian Dollar', country: 'Australia', flag: '🇦🇺' },
  { symbol: '¥', code: 'JPY', name: 'Japanese Yen', country: 'Japan', flag: '🇯🇵' },
];

const safeEvaluate = evaluateBasicArithmetic;

interface ToolInfoItem {
  id: ActiveTab;
  title: string;
  subtitle: string;
  icon: any;
  colorBg: string;
  colorText: string;
  colorActiveBg: string;
  colorActiveText: string;
  colorActiveDot: string;
  summary: string;
  features: string[];
  example: string;
}

const CALCULATOR_TOOLS_INFO: ToolInfoItem[] = [
  {
    id: 'age',
    title: 'Age Calculator',
    subtitle: 'Exact age & next birthday',
    icon: CalendarDays,
    colorBg: 'bg-rose-600',
    colorText: 'text-rose-600',
    colorActiveBg: 'bg-rose-50 border-rose-200/80',
    colorActiveText: 'text-rose-700',
    colorActiveDot: 'bg-rose-600',
    summary: 'Calculates your exact age in years, months, and days with strict date validation preventing future or invalid dates, plus a next birthday countdown.',
    features: ['Accurate years, months & days calculation', 'Next birthday countdown & weekday', 'Strict validation preventing invalid or future dates', 'Total days, weeks, hours lived statistics'],
    example: 'e.g. Born 12 Aug 1998 -> 28 Years, 1 Month, 3 Days',
  },
  {
    id: 'calculator',
    title: 'Scientific Calculator',
    subtitle: 'Advanced math & functions',
    icon: Calculator,
    colorBg: 'bg-violet-600',
    colorText: 'text-violet-600',
    colorActiveBg: 'bg-violet-50 border-violet-200/80',
    colorActiveText: 'text-violet-700',
    colorActiveDot: 'bg-violet-600',
    summary: 'Comprehensive scientific and standard calculator with trigonometry, logarithmic functions, square root, powers, parentheses, and strict validation.',
    features: ['Basic math (+, −, ×, ÷, %)', 'Trigonometry (sin, cos, tan, inverse) with DEG/RAD', 'Logarithms (log, ln) & exponents (xʸ, √x, x²)', 'Strict error handling & live preview'],
    example: 'e.g. sin(30°) = 0.5 or √(144) + 5² = 37',
  },
  {
    id: 'emi',
    title: 'EMI Calculator',
    subtitle: 'Loan & installment planner',
    icon: CreditCard,
    colorBg: 'bg-blue-600',
    colorText: 'text-blue-600',
    colorActiveBg: 'bg-blue-50 border-blue-200/80',
    colorActiveText: 'text-blue-700',
    colorActiveDot: 'bg-blue-600',
    summary: 'Calculates monthly installments (EMI), total interest payable, and repayment schedules with Reducing Balance and Flat Rate calculation methods.',
    features: ['Reducing Balance & Flat Rate options', 'Monthly EMI & interest schedule', 'Interactive loan tenure & rate presets'],
    example: 'e.g. ₹50,000 loan at 10.5% for 12 months',
  },
  {
    id: 'wishlist',
    title: 'Wishlist Planner',
    subtitle: 'Savings & target goals',
    icon: Target,
    colorBg: 'bg-emerald-600',
    colorText: 'text-emerald-600',
    colorActiveBg: 'bg-emerald-50 border-emerald-200/80',
    colorActiveText: 'text-emerald-700',
    colorActiveDot: 'bg-emerald-600',
    summary: 'Set target purchase goals, track saved funds, and plan exact daily or monthly contributions to reach your dream items.',
    features: ['Visual savings progress tracker', 'Target date countdowns', 'Item priority organization'],
    example: 'e.g. Save ₹25,000 for a phone in 6 months',
  },
  {
    id: 'discount',
    title: 'Discount Calculator',
    subtitle: 'Discounts & net savings',
    icon: Percent,
    colorBg: 'bg-sky-600',
    colorText: 'text-sky-600',
    colorActiveBg: 'bg-sky-50 border-sky-200/80',
    colorActiveText: 'text-sky-700',
    colorActiveDot: 'bg-sky-600',
    summary: 'Instant markdown calculator to calculate the net checkout price after store discounts and see exact amounts saved.',
    features: ['Instant final price & savings', '5% to 50% quick-tap discount presets', 'One-click save to calculation history'],
    example: 'e.g. 20% off on a ₹1,499 retail jacket',
  },
  {
    id: 'weight',
    title: 'Price by Weight',
    subtitle: 'Budget & weight per kg',
    icon: Scale,
    colorBg: 'bg-orange-600',
    colorText: 'text-orange-600',
    colorActiveBg: 'bg-orange-50 border-orange-200/80',
    colorActiveText: 'text-orange-700',
    colorActiveDot: 'bg-orange-600',
    summary: 'Calculates the exact quantity in grams or kilograms you get for any spending budget based on grocery rate per kg.',
    features: ['Fixed-budget grocery shopping helper', 'Instant grams & kg output', 'Convenient budget presets'],
    example: 'e.g. ₹80 budget when 1 kg of apples is ₹220',
  },
  {
    id: 'unit',
    title: 'Unit Converter',
    subtitle: 'Grams, kg, liters & mL',
    icon: ArrowRightLeft,
    colorBg: 'bg-purple-600',
    colorText: 'text-purple-600',
    colorActiveBg: 'bg-purple-50 border-purple-200/80',
    colorActiveText: 'text-purple-700',
    colorActiveDot: 'bg-purple-600',
    summary: 'Convert between everyday retail units including grams (g), kilograms (kg), milliliters (mL), and liters (L).',
    features: ['Weight & liquid volume conversions', 'Instant bi-directional results', 'Standard retail packaging units'],
    example: 'e.g. 1.25 kg = 1,250 grams',
  },
  {
    id: 'currency',
    title: 'Currency Exchange',
    subtitle: 'Live FX rates & conversion',
    icon: Coins,
    colorBg: 'bg-teal-600',
    colorText: 'text-teal-600',
    colorActiveBg: 'bg-teal-50 border-teal-200/80',
    colorActiveText: 'text-teal-700',
    colorActiveDot: 'bg-teal-600',
    summary: 'Real-time foreign exchange converter supporting 16+ global currencies with live market rates and reverse conversion.',
    features: ['16+ world currencies', 'Live FX market conversion', 'One-tap reverse currency swap'],
    example: 'e.g. $50 USD to INR (₹) or EUR (€)',
  },
  {
    id: 'quick',
    title: 'All Quick Tools',
    subtitle: 'Combined 4-in-1 overview',
    icon: LayoutGrid,
    colorBg: 'bg-slate-700',
    colorText: 'text-slate-700',
    colorActiveBg: 'bg-slate-100 border-slate-300',
    colorActiveText: 'text-slate-800',
    colorActiveDot: 'bg-slate-800',
    summary: 'Displays Discount, Weight, Unit, and Currency tools all together on one screen for fast side-by-side retail calculations.',
    features: ['4 tools in 1 dashboard', 'Side-by-side multitasking', 'Unified quick calculations'],
    example: 'e.g. Compare discounts & convert units simultaneously',
  },
  {
    id: 'notes',
    title: 'Notes',
    subtitle: 'Google Keep-style color notes',
    icon: StickyNote,
    colorBg: 'bg-amber-600',
    colorText: 'text-amber-600',
    colorActiveBg: 'bg-amber-50 border-amber-200/80',
    colorActiveText: 'text-amber-700',
    colorActiveDot: 'bg-amber-600',
    summary: 'Google Keep-style color coded notes with interactive checklists, tags/labels, pinning, and emergency reminders.',
    features: ['Color coding (12 palettes)', 'Interactive checkable checklists', 'Custom tags & labels filtering', 'Pin important notes to top', 'Emergency & time-based reminders'],
    example: 'e.g. Color coded store checklist & emergency supplier notes',
  },
  {
    id: 'tasks',
    title: 'Tasks',
    subtitle: 'Google Tasks-style organizer',
    icon: ListTodo,
    colorBg: 'bg-blue-600',
    colorText: 'text-blue-600',
    colorActiveBg: 'bg-blue-50 border-blue-200/80',
    colorActiveText: 'text-blue-700',
    colorActiveDot: 'bg-blue-600',
    summary: 'Google Tasks-style organizer supporting nested sub-tasks, priority star marking, custom lists/categories, and device push alerts.',
    features: ['Nested sub-tasks under main tasks', 'Priority star marking', 'Custom categories/lists', 'Push notifications & audio chime', 'Real-time Supabase synchronization'],
    example: 'e.g. Retail orders with nested sub-tasks and audio reminder',
  },
  {
    id: 'history',
    title: 'Calculation History',
    subtitle: 'Saved records & reports',
    icon: Clock,
    colorBg: 'bg-indigo-600',
    colorText: 'text-indigo-600',
    colorActiveBg: 'bg-indigo-50 border-indigo-200/80',
    colorActiveText: 'text-indigo-700',
    colorActiveDot: 'bg-indigo-600',
    summary: 'Chronological log of all your retail calculations with cloud synchronization, PDF/CSV export, and gamified Total Saved summary.',
    features: ['PDF report & CSV spreadsheet export', 'Cloud database synchronization', 'Total Saved gamification tracker'],
    example: 'e.g. Export your monthly shopping savings to PDF',
  },
  {
    id: 'profile',
    title: 'Profile Settings',
    subtitle: 'Account, preferences & backup',
    icon: User,
    colorBg: 'bg-slate-800',
    colorText: 'text-slate-800',
    colorActiveBg: 'bg-slate-100 border-slate-300',
    colorActiveText: 'text-slate-900',
    colorActiveDot: 'bg-slate-900',
    summary: 'Manage your Calculator Max account profile, security, preferences, cloud backup, and developer info.',
    features: ['Account & security controls', 'Theme, currency & unit preferences', 'Cloud sync & privacy export'],
    example: 'e.g. Switch currency, sync cloud history, or export backup',
  },
];

export default function RetailCalc() {
  const [currency, setCurrency] = useState('₹');
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>('metric');
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('home');
  const [direction, setDirection] = useState<number>(1);
  const [tabTransitionMode, setTabTransitionMode] = useState<'slide' | 'zoom'>('slide');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [profileCloseSignal, setProfileCloseSignal] = useState(0);
  const [noteEditorCloseSignal, setNoteEditorCloseSignal] = useState(0);
  const [exitPromptVisible, setExitPromptVisible] = useState(false);
  const [isNoteFullScreen, setIsNoteFullScreen] = useState(false);
  const [isManagerSubOverlayOpen, setIsManagerSubOverlayOpen] = useState(false);
  const [dashboardSearch, setDashboardSearch] = useState('');
  const [profileOpenSignal, setProfileOpenSignal] = useState(0);
  const [requestedAuthTab, setRequestedAuthTab] = useState<'signin' | 'update_password'>('signin');
  const [signOutSignal, setSignOutSignal] = useState(0);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [notesRefreshSignal, setNotesRefreshSignal] = useState(0);
  const [tasksRefreshSignal, setTasksRefreshSignal] = useState(0);
  const [profileRefreshSignal, setProfileRefreshSignal] = useState(0);
  const [pullDistance, setPullDistance] = useState(0);
  const [isPullRefreshing, setIsPullRefreshing] = useState(false);
  const [pullRefreshNotice, setPullRefreshNotice] = useState<string | null>(null);
  const [dashboardNotes, setDashboardNotes] = useState<NoteItem[]>([]);
  const [dashboardTasksCount, setDashboardTasksCount] = useState(0);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const navStackRef = useRef<ActiveTab[]>(['home']);
  const lastBackPressAtRef = useRef<number>(0);
  const exitPromptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyRefreshNotice, setHistoryRefreshNotice] = useState<string | null>(null);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<
    { type: 'single'; item: HistoryItem } | { type: 'batch'; items: HistoryItem[] } | { type: 'all' } | null
  >(null);
  const [previewHistoryItem, setPreviewHistoryItem] = useState<HistoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [storageFullSnapshot, setStorageFullSnapshot] = useState<StorageSnapshot | null>(null);

  // Quick Tools States
  const [originalPrice, setOriginalPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [discountSaved, setDiscountSaved] = useState<number | null>(null);

  const [pricePerKg, setPricePerKg] = useState('');
  const [budget, setBudget] = useState('');
  const [weightMode, setWeightMode] = useState<'quantity' | 'price'>('quantity');
  const [targetWeight, setTargetWeight] = useState('');
  const [targetWeightUnit, setTargetWeightUnit] = useState<WeightTargetUnit>('kg');
  const [quantityGrams, setQuantityGrams] = useState<number | null>(null);
  const [calculatedWeightPrice, setCalculatedWeightPrice] = useState<number | null>(null);

  const [unitInput, setUnitInput] = useState('');
  const [unitType, setUnitType] = useState('g_to_kg');
  const [unitResult, setUnitResult] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<any>(null);

  const loadUserHistory = useCallback(async (user: any) => {
    if (!user?.id) return;

    // 1. Instantly read user-scoped local storage for immediate responsiveness
    const localItems = getCalculationHistory(user.id);
    if (localItems.length > 0) {
      setHistory(localItems);
    }

    // 2. Query authoritative Cloud database (Direct Supabase client + /api/calculations)
    let isCloudSuccess = false;
    let cloudItems: HistoryItem[] = [];

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('calculations')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        isCloudSuccess = true;
        cloudItems = data.map((c: any) => ({
          id: c.id ? c.id.toString() : 'cloud-' + Math.random().toString(36).substring(2, 8),
          dbId: c.id ? c.id.toString() : null,
          syncStatus: 'synced' as const,
          type: c.type,
          details: c.details,
          result: c.result,
          createdAt: c.created_at || undefined,
          timestamp: c.created_at
            ? new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        }));
      }
    } catch (err) {
      console.warn('Note on direct Supabase calculations fetch:', err);
    }

    // If direct Supabase query was not completed, fallback to server API route
    if (!isCloudSuccess) {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const headers: Record<string, string> = {
          'x-user-id': user.id,
        };
        if (session?.access_token) {
          headers['Authorization'] = `Bearer ${session.access_token}`;
        }

        const res = await fetch('/api/calculations', {
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.calculations && Array.isArray(data.calculations)) {
            isCloudSuccess = true;
            cloudItems = data.calculations.map((c: any) => ({
              id: c.id ? c.id.toString() : 'cloud-' + Math.random().toString(36).substring(2, 8),
              dbId: c.id ? c.id.toString() : null,
              syncStatus: 'synced' as const,
              type: c.type,
              details: c.details,
              result: c.result,
              createdAt: c.createdAt || undefined,
              timestamp: c.createdAt
                ? new Date(c.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }));
          }
        }
      } catch (err) {
        console.warn('Note on API calculations fetch:', err);
      }
    }

    if (isCloudSuccess) {
      // Preserve local favorite status across cloud refreshes
      const mergedCloudItems = cloudItems.map((cloudItem) => {
        const matchedLocal = localItems.find(
          (localItem) =>
            (cloudItem.dbId && localItem.dbId?.toString() === cloudItem.dbId.toString()) ||
            localItem.id === cloudItem.id ||
            (localItem.type === cloudItem.type &&
              localItem.details === cloudItem.details &&
              localItem.result === cloudItem.result)
        );
        return matchedLocal?.isFavorite ? { ...cloudItem, isFavorite: true } : cloudItem;
      });
      setHistory(mergedCloudItems);
      setCalculationHistory(mergedCloudItems, user.id);

      // Clean up legacy calculation_history from user_metadata so stale tokens never resurrect deleted items
      try {
        const supabase = createClient();
        await supabase.auth.updateUser({
          data: {
            calculation_history: [],
          },
        });
      } catch {}
    }
  }, []);

  const handleUserChanged = useCallback((user: any) => {
    setCurrentUser((prev: any) => (prev?.id === user?.id ? prev : user));
    if (user) {
      loadUserHistory(user);
    } else {
      setHistory(getCalculationHistory());
    }
  }, [loadUserHistory]);

  const handleSyncFromCloudSql = useCallback(async () => {
    if (currentUser) {
      await loadUserHistory(currentUser);
    }
  }, [currentUser, loadUserHistory]);

  // Real-Time Data Refresh for Calculation History (invoked by Pull-to-Refresh while on History tab)
  const handleManualRefreshHistory = useCallback(async () => {
    try {
      if (currentUser?.id) {
        await loadUserHistory(currentUser);
      } else {
        const local = getCalculationHistory();
        setHistory(local);
      }
      setHistoryRefreshNotice('History updated');
      setTimeout(() => setHistoryRefreshNotice(null), 2200);
    } catch (err) {
      console.warn('Calculation history refresh notice:', err);
    }
  }, [currentUser, loadUserHistory]);

  // Intercept Supabase password recovery links and route to /reset-password
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash || '';
    const search = window.location.search || '';

    if (hash.includes('type=recovery') || search.includes('type=recovery')) {
      window.location.replace('/reset-password' + search + hash);
      return;
    }

    // If opened as an OAuth popup or tab by an opener window, notify opener and close cleanly
    if (window.opener && window.opener !== window) {
      if (hash.includes('access_token=') || search.includes('code=')) {
        try {
          window.opener.postMessage({ type: 'SUPABASE_AUTH_SUCCESS' }, '*');
        } catch (e) {
          console.warn('Post message to opener error:', e);
        }
        const timer = setTimeout(() => {
          try {
            window.close();
          } catch {}
        }, 500);
        return () => clearTimeout(timer);
      }
    }

    try {
      const supabase = createClient();
      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY') {
          const currentHash = typeof window !== 'undefined' ? window.location.hash : '';
          const currentSearch = typeof window !== 'undefined' ? window.location.search : '';
          window.location.replace('/reset-password' + currentSearch + currentHash);
        }
      });
      return () => {
        subscription?.unsubscribe();
      };
    } catch (err) {
      console.warn('Supabase auth recovery listener notice:', err);
    }
  }, []);

  // Initial App Launch Cloud Storage & Subscription Sync (runs once on launch, not on navigating to Subscription)
  useEffect(() => {
    if (!isClient) return;
    if (hasCompletedInitialCloudSync() && !currentUser?.id) return;
    void fetchAndCacheStorageSnapshot(currentUser?.id);
  }, [isClient, currentUser?.id]);

  // Realtime subscription for calculation history changes across devices and sessions
  useEffect(() => {
    if (!currentUser?.id) return;
    const userId = currentUser.id;
    let channel: any = null;

    try {
      const supabase = createClient();
      channel = supabase
        .channel(`realtime-calculations-${userId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'calculations',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            if (payload.eventType === 'DELETE') {
              const oldRecord = payload.old;
              if (oldRecord) {
                setHistory((prev) => {
                  const filtered = prev.filter((item) => {
                    if (oldRecord.id && (item.dbId?.toString() === oldRecord.id?.toString() || item.id === oldRecord.id?.toString())) {
                      return false;
                    }
                    if (oldRecord.details && oldRecord.result && item.details === oldRecord.details && item.result === oldRecord.result) {
                      return false;
                    }
                    return true;
                  });
                  setCalculationHistory(filtered, userId);
                  return filtered;
                });
              }
            } else if (payload.eventType === 'INSERT') {
              const newRecord = payload.new;
              if (newRecord && newRecord.details && newRecord.result) {
                const newItem: HistoryItem = {
                  id: newRecord.id ? newRecord.id.toString() : Date.now().toString(),
                  dbId: newRecord.id ? newRecord.id.toString() : null,
                  syncStatus: 'synced',
                  type: newRecord.type,
                  details: newRecord.details,
                  result: newRecord.result,
                  timestamp: newRecord.created_at
                    ? new Date(newRecord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                };
                setHistory((prev) => {
                  const exists = prev.some(
                    (item) =>
                      item.dbId?.toString() === newItem.dbId?.toString() ||
                      (item.details === newItem.details && item.result === newItem.result)
                  );
                  if (exists) return prev;
                  const updated = [newItem, ...prev].slice(0, 50);
                  setCalculationHistory(updated, userId);
                  return updated;
                });
              }
            }
          }
        )
        .subscribe();
    } catch (err) {
      console.warn('Realtime calculation channel subscription notice:', err);
    }

    return () => {
      if (channel) {
        try {
          const supabase = createClient();
          supabase.removeChannel(channel);
        } catch {}
      }
    };
  }, [currentUser?.id]);

  // Reactive listener for background offline calculation sync completions + Storage Full & Notes/Tasks updates
  useEffect(() => {
    const handleHistorySyncUpdated = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const targetUid = currentUser?.id;
      if (!detail?.userId || detail.userId === targetUid) {
        const fresh = getCalculationHistory(targetUid);
        setHistory(fresh);
      }
    };
    const handleStorageFull = (e: Event) => {
      const detail = (e as CustomEvent)?.detail;
      const snap: StorageSnapshot =
        detail?.snapshot || buildLocalStorageSnapshot(currentUser?.id);
      setStorageFullSnapshot(snap);
      triggerVibration('error');
    };
    const handleNotesTasksUpdated = () => {
      const targetUid = currentUser?.id;
      setDashboardNotes(getLocalNotes(targetUid));
      setDashboardTasksCount(getLocalTasks(targetUid).length);
    };

    window.addEventListener('calcmax:history-sync-updated', handleHistorySyncUpdated);
    window.addEventListener('calcmax:storage-full', handleStorageFull);
    window.addEventListener('calcmax:notes-tasks-updated', handleNotesTasksUpdated);
    return () => {
      window.removeEventListener('calcmax:history-sync-updated', handleHistorySyncUpdated);
      window.removeEventListener('calcmax:storage-full', handleStorageFull);
      window.removeEventListener('calcmax:notes-tasks-updated', handleNotesTasksUpdated);
    };
  }, [currentUser?.id]);

  useEffect(() => {
    setIsClient(true);
    const savedCurrency = localStorage.getItem('retail-calc-currency');
    if (savedCurrency) setCurrency(savedCurrency);

    const userSetTheme = localStorage.getItem('calculator-max-user-theme-set') === 'true';
    const savedTheme = localStorage.getItem('calculator-max-theme');
    const resolvedTheme: 'light' | 'dark' =
      userSetTheme && (savedTheme === 'light' || savedTheme === 'dark') ? savedTheme : 'light';
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark');
    if (!userSetTheme) {
      localStorage.setItem('calculator-max-theme', 'light');
    }

    const handleThemeSync = (e: Event) => {
      const next = (e as CustomEvent)?.detail?.theme;
      if (next === 'light' || next === 'dark') {
        document.documentElement.dataset.theme = next;
        document.documentElement.classList.toggle('dark', next === 'dark');
      }
    };
    window.addEventListener('calcmax:theme-changed', handleThemeSync);

    const savedUnitSys = localStorage.getItem('calculator-max-unit-system');
    if (savedUnitSys === 'metric' || savedUnitSys === 'imperial') {
      setUnitSystem(savedUnitSys);
      if (savedUnitSys === 'imperial') {
        setUnitType('lb_to_kg');
        setTargetWeightUnit('lb');
      }
    }

    // Initial check for local user or history
    if (typeof window !== 'undefined') {
      const local = localStorage.getItem('retail_calc_auth_user');
      if (local) {
        try {
          const u = JSON.parse(local);
          setCurrentUser(u);
          loadUserHistory(u);
        } catch {
          setHistory(getCalculationHistory());
        }
      } else {
        setHistory(getCalculationHistory());
      }
    } else {
      setHistory(getCalculationHistory());
    }

    return () => {
      window.removeEventListener('calcmax:theme-changed', handleThemeSync);
    };
  }, [loadUserHistory]);

  useEffect(() => {
    if (isClient) {
      localStorage.setItem('retail-calc-currency', currency);
    }
  }, [currency, isClient]);

  useEffect(() => {
    if (!isClient) return;
    const notesList = getLocalNotes(currentUser?.id);
    const tasksList = getLocalTasks(currentUser?.id);
    setDashboardNotes(notesList);
    setDashboardTasksCount(tasksList.length);
  }, [isClient, activeTab, currentUser?.id]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (activeTab === 'home') {
      document.title = 'Calculator Max • All Calculators & Tools';
      return;
    }
    const activeTool = CALCULATOR_TOOLS_INFO.find((t) => t.id === activeTab);
    if (activeTool) {
      document.title = `${activeTool.title} • Calculator Max`;
    }
  }, [activeTab]);

  const pushHistoryGuard = useCallback((tag: string) => {
    if (typeof window === 'undefined') return;
    try {
      const currentState =
        typeof window.history.state === 'object' && window.history.state !== null
          ? window.history.state
          : {};
      if (currentState.__calcMaxGuard && currentState.__calcMaxTag === tag) return;
      window.history.pushState(
        { ...currentState, __calcMaxGuard: true, __calcMaxSentinel: false, __calcMaxTag: tag },
        '',
        window.location.href
      );
    } catch {
      // Ignore history API restrictions in embedded sandboxes
    }
  }, []);

  const triggerVibration = (_type: VibrationType = 'click') => {
    // UI vibration completely removed as requested
  };

  const handleTabChange = useCallback(
    (newTab: ActiveTab) => {
      if (newTab === activeTab) {
        if (isNoteFullScreen || isManagerSubOverlayOpen) {
          setNoteEditorCloseSignal((n) => n + 1);
        }
        return;
      }
      const currentIdx = TAB_ORDER[activeTab] ?? 0;
      const newIdx = TAB_ORDER[newTab] ?? 0;
      setDirection(newIdx > currentIdx ? 1 : -1);
      setTabTransitionMode(activeTab === 'home' && !BOTTOM_NAV_TABS.has(newTab) ? 'zoom' : 'slide');
      triggerVibration('click');

      if (newTab !== 'notes' && newTab !== 'tasks' && newTab !== 'profile') {
        setIsNoteFullScreen(false);
        setIsManagerSubOverlayOpen(false);
      }

      if (newTab === 'home') {
        navStackRef.current = ['home'];
      } else {
        const stack = navStackRef.current;
        if (stack[stack.length - 1] !== newTab) {
          navStackRef.current = [...stack, newTab];
        }
        pushHistoryGuard(`tab:${newTab}`);
      }

      setActiveTab(newTab);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
    },
    [activeTab, isManagerSubOverlayOpen, isNoteFullScreen, pushHistoryGuard]
  );

  const handleStepBackHierarchy = useCallback((): boolean => {
    if (showSignOutConfirm) {
      setShowSignOutConfirm(false);
      return true;
    }
    if (deleteConfirmTarget) {
      setDeleteConfirmTarget(null);
      return true;
    }
    if (previewHistoryItem) {
      setPreviewHistoryItem(null);
      return true;
    }
    if (isAuthModalOpen) {
      setProfileCloseSignal((n) => n + 1);
      return true;
    }
    if (isNoteFullScreen || isManagerSubOverlayOpen) {
      setNoteEditorCloseSignal((n) => n + 1);
      return true;
    }
    if (activeTab === 'home' && dashboardSearch.trim() !== '') {
      setDashboardSearch('');
      return true;
    }
    if (activeTab !== 'home') {
      const stack = navStackRef.current;
      let targetTab: ActiveTab = 'home';
      if (stack.length > 1) {
        stack.pop();
        targetTab = stack[stack.length - 1] || 'home';
      } else {
        navStackRef.current = ['home'];
      }
      setDirection(-1);
      setTabTransitionMode('slide');
      setActiveTab(targetTab);
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'auto' });
      }
      return true;
    }
    return false;
  }, [
    activeTab,
    dashboardSearch,
    deleteConfirmTarget,
    isAuthModalOpen,
    isManagerSubOverlayOpen,
    isNoteFullScreen,
    previewHistoryItem,
    showSignOutConfirm,
  ]);

  const backHandlerRef = useRef(handleStepBackHierarchy);
  useEffect(() => {
    backHandlerRef.current = handleStepBackHierarchy;
  }, [handleStepBackHierarchy]);

  // Push distinct browser history entries when overlays/edit views open so hardware Back unwinds step-by-step
  useEffect(() => {
    if (showSignOutConfirm) {
      pushHistoryGuard('overlay:signout');
    } else if (deleteConfirmTarget) {
      pushHistoryGuard('overlay:delete');
    } else if (previewHistoryItem) {
      pushHistoryGuard('overlay:preview');
    } else if (isAuthModalOpen) {
      pushHistoryGuard('overlay:auth');
    } else if (isNoteFullScreen || isManagerSubOverlayOpen) {
      pushHistoryGuard(`overlay:${activeTab}`);
    }
  }, [
    activeTab,
    deleteConfirmTarget,
    isAuthModalOpen,
    isManagerSubOverlayOpen,
    isNoteFullScreen,
    previewHistoryItem,
    pushHistoryGuard,
    showSignOutConfirm,
  ]);

  // Intercept hardware Back button (Android browser / PWA popstate + WebView/Capacitor backbutton)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      const baseState =
        typeof window.history.state === 'object' && window.history.state !== null
          ? window.history.state
          : {};
      if (!baseState.__calcMaxGuard && !baseState.__calcMaxSentinel) {
        window.history.replaceState(
          { ...baseState, __calcMaxGuard: false, __calcMaxSentinel: true },
          '',
          window.location.href
        );
        window.history.pushState(
          { ...baseState, __calcMaxGuard: true, __calcMaxSentinel: false, __calcMaxTag: 'home-root' },
          '',
          window.location.href
        );
      }
    } catch {
      // Ignore if History API is restricted
    }

    const ensureArmedOnGesture = () => {
      try {
        const st =
          typeof window.history.state === 'object' && window.history.state !== null
            ? window.history.state
            : {};
        if (!st.__calcMaxGuard) {
          pushHistoryGuard('home-root');
        }
      } catch {
        // Ignore
      }
    };

    const handleBackAttempt = (fromPopState: boolean) => {
      const handled = backHandlerRef.current();
      if (handled) {
        lastBackPressAtRef.current = 0;
        setExitPromptVisible(false);
        if (fromPopState && !window.history.state?.__calcMaxGuard) {
          pushHistoryGuard('home-root');
        }
        return;
      }

      // Already at root Home dashboard: prevent immediate accidental exit on first back press
      const now = Date.now();
      if (now - lastBackPressAtRef.current < 2000) {
        lastBackPressAtRef.current = 0;
        setExitPromptVisible(false);
        return;
      }

      lastBackPressAtRef.current = now;
      setExitPromptVisible(true);
      if (exitPromptTimerRef.current) {
        clearTimeout(exitPromptTimerRef.current);
      }
      exitPromptTimerRef.current = setTimeout(() => {
        setExitPromptVisible(false);
      }, 2000);

      if (fromPopState) {
        pushHistoryGuard('home-exit-guard');
      }
    };

    const onPopState = () => {
      handleBackAttempt(true);
    };

    const onAndroidBackButton = (e: Event) => {
      e.preventDefault();
      handleBackAttempt(false);
    };

    window.addEventListener('pointerdown', ensureArmedOnGesture, { passive: true });
    window.addEventListener('keydown', ensureArmedOnGesture, { passive: true });
    window.addEventListener('popstate', onPopState);
    document.addEventListener('backbutton', onAndroidBackButton);

    return () => {
      window.removeEventListener('pointerdown', ensureArmedOnGesture);
      window.removeEventListener('keydown', ensureArmedOnGesture);
      window.removeEventListener('popstate', onPopState);
      document.removeEventListener('backbutton', onAndroidBackButton);
      if (exitPromptTimerRef.current) {
        clearTimeout(exitPromptTimerRef.current);
      }
    };
  }, [pushHistoryGuard]);

  // View-scoped Pull-to-Refresh (Refreshes ONLY current active view; never redirects to Home Dashboard)
  const activeTabRef = useRef<ActiveTab>(activeTab);
  const isOverlayBlockedRef = useRef<boolean>(false);
  const isPullRefreshingRef = useRef<boolean>(false);
  const pullDistanceRef = useRef<number>(0);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    isOverlayBlockedRef.current = Boolean(
      isNoteFullScreen ||
        isManagerSubOverlayOpen ||
        isAuthModalOpen ||
        deleteConfirmTarget ||
        previewHistoryItem ||
        showSignOutConfirm
    );
  }, [
    deleteConfirmTarget,
    isAuthModalOpen,
    isManagerSubOverlayOpen,
    isNoteFullScreen,
    previewHistoryItem,
    showSignOutConfirm,
  ]);

  const handleRefreshActiveView = useCallback(async () => {
    if (isPullRefreshingRef.current) return;
    isPullRefreshingRef.current = true;
    setIsPullRefreshing(true);

    const targetTab = activeTabRef.current;
    try {
      if (targetTab === 'notes') {
        setNotesRefreshSignal((n) => n + 1);
        setPullRefreshNotice('Notes refreshed');
      } else if (targetTab === 'tasks') {
        setTasksRefreshSignal((n) => n + 1);
        setPullRefreshNotice('Tasks refreshed');
      } else if (targetTab === 'history') {
        await handleManualRefreshHistory();
        setPullRefreshNotice('History refreshed');
      } else if (targetTab === 'home') {
        const notesList = getLocalNotes(currentUser?.id);
        const tasksList = getLocalTasks(currentUser?.id);
        setDashboardNotes(notesList);
        setDashboardTasksCount(tasksList.length);
        if (currentUser?.id) {
          await loadUserHistory(currentUser);
        }
        setPullRefreshNotice('Dashboard refreshed');
      } else if (targetTab === 'profile') {
        setProfileRefreshSignal((n) => n + 1);
        if (currentUser?.id) {
          await loadUserHistory(currentUser);
        }
        setPullRefreshNotice('Cloud storage synced');
      } else {
        if (currentUser?.id) {
          await loadUserHistory(currentUser);
        }
        setPullRefreshNotice('View refreshed');
      }
    } catch {
      // Ignore transient refresh notice errors
    } finally {
      setTimeout(() => {
        isPullRefreshingRef.current = false;
        setIsPullRefreshing(false);
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }, 450);
      setTimeout(() => {
        setPullRefreshNotice(null);
      }, 2000);
    }
  }, [currentUser, handleManualRefreshHistory, loadUserHistory]);

  const handleRefreshActiveViewRef = useRef(handleRefreshActiveView);
  useEffect(() => {
    handleRefreshActiveViewRef.current = handleRefreshActiveView;
  }, [handleRefreshActiveView]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let startY = 0;
    let startX = 0;
    let tracking = false;
    let activelyPulling = false;

    const hasScrolledInnerContainer = (target: EventTarget | null): boolean => {
      let el = target instanceof HTMLElement ? target : null;
      while (el && el !== document.body && el !== document.documentElement) {
        const style = window.getComputedStyle(el);
        const overflowY = style.overflowY;
        if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollTop > 2) {
          return true;
        }
        el = el.parentElement;
      }
      return false;
    };

    const getDocScrollTop = () =>
      Math.max(
        window.scrollY || 0,
        document.documentElement?.scrollTop || 0,
        document.body?.scrollTop || 0
      );

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isOverlayBlockedRef.current || isPullRefreshingRef.current) {
        tracking = false;
        return;
      }
      if (getDocScrollTop() > 2 || hasScrolledInnerContainer(e.target)) {
        tracking = false;
        return;
      }
      tracking = true;
      activelyPulling = false;
      startY = e.touches[0].clientY;
      startX = e.touches[0].clientX;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!tracking || e.touches.length !== 1 || isOverlayBlockedRef.current) return;
      const dy = e.touches[0].clientY - startY;
      const dx = e.touches[0].clientX - startX;

      if (!activelyPulling) {
        if (dy <= 0 || Math.abs(dx) > dy * 0.9 || getDocScrollTop() > 2) {
          tracking = false;
          return;
        }
        if (dy > 10) {
          activelyPulling = true;
        } else {
          return;
        }
      }

      if (dy > 10 && getDocScrollTop() <= 2) {
        e.preventDefault();
        const damped = Math.min(84, Math.round((dy - 10) * 0.45));
        pullDistanceRef.current = damped;
        setPullDistance(damped);
      }
    };

    const finishPull = () => {
      if (!tracking) return;
      tracking = false;
      const pulled = pullDistanceRef.current;
      activelyPulling = false;
      if (pulled >= 54) {
        pullDistanceRef.current = 52;
        setPullDistance(52);
        void handleRefreshActiveViewRef.current();
      } else {
        pullDistanceRef.current = 0;
        setPullDistance(0);
      }
    };

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', finishPull, { passive: true });
    window.addEventListener('touchcancel', finishPull, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', finishPull);
      window.removeEventListener('touchcancel', finishPull);
    };
  }, []);

  const handleFocusDashboardSearch = () => {
    if (activeTab !== 'home') {
      handleTabChange('home');
    }
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      searchInputRef.current?.focus();
    }, 80);
  };

  const saveHistoryItem = async (
    type: 'Discount' | 'Weight' | 'Unit' | 'EMI' | 'Wishlist' | 'Currency' | string,
    details: string,
    result: string,
    explicitSavedAmount?: number
  ) => {
    const userId = currentUser?.id;
    const tempId = 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

    let savedAmount = explicitSavedAmount;
    if (savedAmount === undefined) {
      savedAmount = parseSavedAmountFromText(type, details, result);
    }

    const backupPerms = getBackupPermissions(userId);
    const allowHistoryBackup = backupPerms.calculatorHistory;

    const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
    const initialStatus: 'syncing' | 'local' =
      currentUser && allowHistoryBackup
        ? isOnline
          ? 'syncing'
          : 'local'
        : 'local';

    const initialItem: HistoryItem = {
      id: tempId,
      type,
      details,
      result,
      createdAt: new Date().toISOString(),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      syncStatus: initialStatus,
      dbId: null,
      savedAmount,
    };

    // Enforce plan storage limit before adding new History entry
    const quota = checkStorageQuotaBeforeAdd(userId, initialItem);
    if (!quota.allowed) {
      triggerStorageFullPopup(quota.snapshot, userId);
      return;
    }

    // Always immediately save locally first
    const updatedHistory = saveCalculationHistory(initialItem, userId);
    setHistory(updatedHistory);
    refreshLocalStorageSnapshot(userId);

    if (currentUser && allowHistoryBackup) {
      if (!isOnline) {
        // Enqueue into offline sync outbox queue for automatic sync when connected
        enqueueCalculationOfflineSync(
          {
            opKey: `upsert_calculation:${tempId}`,
            type: 'upsert_calculation',
            item: initialItem,
          },
          userId
        );
        return;
      }

      // Online: Attempt cloud database synchronization
      const res = await syncSingleCalculationToCloud(initialItem, currentUser.id);
      const finalStatus: 'synced' | 'local' | 'error' = res.success
        ? 'synced'
        : navigator.onLine
        ? 'error'
        : 'local';
      const finalDbId = res.success ? res.dbId || `cloud-${Date.now()}` : null;

      if (!res.success) {
        enqueueCalculationOfflineSync(
          {
            opKey: `upsert_calculation:${tempId}`,
            type: 'upsert_calculation',
            item: { ...initialItem, syncStatus: finalStatus },
          },
          userId
        );
      }

      // Update state and storage with authoritative DB ID and status
      setHistory((prev) => {
        const syncedList = prev.map((item) =>
          item.id === tempId
            ? {
                ...item,
                dbId: finalDbId,
                syncStatus: finalStatus,
              }
            : item
        );
        setCalculationHistory(syncedList, userId);
        return syncedList;
      });
    }
  };

  const handleRestoreToHistory = useCallback(
    async (source: SourceHistoryMeta) => {
      const userId = currentUser?.id;
      const backupPerms = getBackupPermissions(userId);
      const allowHistoryBackup = backupPerms.calculatorHistory;
      const isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

      const initialStatus: 'syncing' | 'local' =
        currentUser && allowHistoryBackup ? (isOnline ? 'syncing' : 'local') : 'local';

      const restoredId =
        source.id || 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);

      const restoredItem: HistoryItem = {
        id: restoredId,
        type: source.type,
        details: source.details,
        result: source.result,
        savedAmount: source.savedAmount,
        isFavorite: Boolean(source.isFavorite),
        createdAt: source.createdAt || new Date().toISOString(),
        timestamp:
          source.timestamp ||
          (source.createdAt
            ? new Date(source.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
              })
            : new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })),
        syncStatus: initialStatus,
        dbId: null,
      };

      const updatedHistory = saveCalculationHistory(restoredItem, userId);
      setHistory(updatedHistory);
      refreshLocalStorageSnapshot(userId);
      if (userId) {
        if (source.dbId) {
          clearCalculationOfflineOp(`delete_calculation:${source.dbId}`, userId);
        }
        if (source.id) {
          clearCalculationOfflineOp(`delete_calculation:${source.id}`, userId);
        }
      }

      setIsNoteFullScreen(false);
      setIsManagerSubOverlayOpen(false);
      setHistoryRefreshNotice('Returned to History');
      setTimeout(() => setHistoryRefreshNotice(null), 2200);

      if (currentUser && allowHistoryBackup) {
        if (!isOnline) {
          enqueueCalculationOfflineSync(
            {
              opKey: `upsert_calculation:${restoredId}`,
              type: 'upsert_calculation',
              item: restoredItem,
            },
            userId
          );
          return;
        }

        const res = await syncSingleCalculationToCloud(restoredItem, currentUser.id);
        const finalStatus: 'synced' | 'local' | 'error' = res.success
          ? 'synced'
          : navigator.onLine
          ? 'error'
          : 'local';
        const finalDbId = res.success ? res.dbId || `cloud-${Date.now()}` : null;

        if (!res.success) {
          enqueueCalculationOfflineSync(
            {
              opKey: `upsert_calculation:${restoredId}`,
              type: 'upsert_calculation',
              item: { ...restoredItem, syncStatus: finalStatus },
            },
            userId
          );
        }

        setHistory((prev) => {
          const syncedList = prev.map((item) =>
            item.id === restoredId
              ? {
                  ...item,
                  dbId: finalDbId,
                  syncStatus: finalStatus,
                }
              : item
          );
          setCalculationHistory(syncedList, userId);
          return syncedList;
        });
        refreshLocalStorageSnapshot(userId);
      }
    },
    [currentUser]
  );

  const retrySyncItem = async (itemToSync: HistoryItem) => {
    if (!currentUser) {
      triggerVibration('error');
      alert('Please sign in to save this calculation record to the cloud database.');
      return;
    }

    triggerVibration('click');
    setHistory((prev) =>
      prev.map((i) => (i.id === itemToSync.id ? { ...i, syncStatus: 'syncing' } : i))
    );

    const res = await syncSingleCalculationToCloud(itemToSync, currentUser.id);
    const finalStatus: 'synced' | 'error' | 'local' = res.success
      ? 'synced'
      : navigator.onLine
      ? 'error'
      : 'local';
    const finalDbId = res.success ? res.dbId || itemToSync.dbId || `cloud-${Date.now()}` : itemToSync.dbId;

    if (res.success) {
      clearCalculationOfflineOp(`upsert_calculation:${itemToSync.id}`, currentUser.id);
      triggerVibration('success');
    } else {
      enqueueCalculationOfflineSync(
        {
          opKey: `upsert_calculation:${itemToSync.id}`,
          type: 'upsert_calculation',
          item: { ...itemToSync, syncStatus: finalStatus },
        },
        currentUser.id
      );
      triggerVibration('error');
    }

    setHistory((prev) => {
      const updated = prev.map((i) =>
        i.id === itemToSync.id
          ? { ...i, dbId: finalDbId, syncStatus: finalStatus }
          : i
      );
      setCalculationHistory(updated, currentUser?.id);
      return updated;
    });
  };

  // Quick Tools field error state trackers
  const [discPriceErr, setDiscPriceErr] = useState(false);
  const [discErr, setDiscErr] = useState(false);
  const [weightPriceErr, setWeightPriceErr] = useState(false);
  const [weightBudgetErr, setWeightBudgetErr] = useState(false);
  const [weightTargetErr, setWeightTargetErr] = useState(false);
  const [unitInputErr, setUnitInputErr] = useState(false);

  const handleToggleFavoriteHistory = useCallback(
    (itemId: string) => {
      triggerVibration('click');
      const updated = toggleCalculationHistoryFavorite(itemId, currentUser?.id);
      setHistory(updated);
    },
    [currentUser?.id]
  );

  // Export History to CSV Handler
  const exportHistoryCSV = (itemsToExport?: HistoryItem[]) => {
    const sourceItems = Array.isArray(itemsToExport) ? itemsToExport : history;
    if (sourceItems.length === 0) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');

    const headers = ['ID', 'Database ID', 'Sync Status', 'Type', 'Result', 'Details', 'Timestamp', 'Favorite'];
    const rows = sourceItems.map((item) => [
      sanitizeCsvCell(item.id),
      sanitizeCsvCell(item.dbId || (item.syncStatus === 'synced' ? 'Synced' : 'Not in DB')),
      sanitizeCsvCell(item.syncStatus || (item.dbId ? 'synced' : 'local')),
      sanitizeCsvCell(item.type),
      sanitizeCsvCell(item.result),
      sanitizeCsvCell(item.details),
      sanitizeCsvCell(item.timestamp),
      sanitizeCsvCell(item.isFavorite ? 'Yes' : 'No'),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `retail_calculations_history_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export History to PDF Handler (All or Filtered Records)
  const handleDownloadAllPDF = (itemsToExport?: HistoryItem[]) => {
    const sourceItems = Array.isArray(itemsToExport) ? itemsToExport : history;
    if (sourceItems.length === 0) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');
    exportAllHistoryPDF(sourceItems);
  };

  // Export Single History Item PDF Handler
  const handleDownloadSinglePDF = (item: HistoryItem) => {
    triggerVibration('click');
    exportSingleItemPDF(item);
  };

  const calculateDiscount = () => {
    const price = safeEvaluate(originalPrice);
    const disc = safeEvaluate(discount);

    const priceInvalid = isNaN(price) || price <= 0 || originalPrice.trim() === '';
    const discInvalid = isNaN(disc) || disc < 0 || disc > 100 || discount.trim() === '';

    setDiscPriceErr(priceInvalid);
    setDiscErr(discInvalid);

    const computed = !priceInvalid && !discInvalid ? computeDiscount(price, disc) : null;
    if (computed) {
      triggerVibration('success');
      setDiscountSaved(computed.saved);
      setFinalPrice(computed.finalPrice);

      saveHistoryItem(
        'Discount',
        `Original Item Price: ${currency}${computed.originalPrice.toFixed(2)} | Discount Percentage: ${computed.discountPercent}%`,
        `Discounted Final Price: ${currency}${computed.finalPrice.toFixed(2)} | Total Savings: ${currency}${computed.saved.toFixed(2)} (${computed.discountPercent}% off)`,
        computed.saved
      );
    } else {
      triggerVibration('error');
    }
  };

  const calculateWeight = () => {
    const priceKg = safeEvaluate(pricePerKg);
    const priceKgInvalid = isNaN(priceKg) || priceKg <= 0 || pricePerKg.trim() === '';
    setWeightPriceErr(priceKgInvalid);

    if (weightMode === 'price') {
      const targetWt = safeEvaluate(targetWeight);
      const targetInvalid = isNaN(targetWt) || targetWt <= 0 || targetWeight.trim() === '';
      setWeightBudgetErr(false);
      setWeightTargetErr(targetInvalid);

      const computedCost =
        !priceKgInvalid && !targetInvalid
          ? computeWeightPrice(priceKg, targetWt, targetWeightUnit, unitSystem)
          : null;

      if (computedCost) {
        triggerVibration('success');
        setQuantityGrams(null);
        setCalculatedWeightPrice(computedCost.totalCost);
        const unitLabel = computedCost.unitSystem === 'imperial' ? 'lb' : 'kg';
        saveHistoryItem(
          'Weight',
          `Price Rate: ${currency}${computedCost.pricePerUnit.toFixed(2)} / ${unitLabel} | Target Weight: ${computedCost.formattedWeight}`,
          `Price = ${currency}${computedCost.totalCost.toFixed(2)}`
        );
      } else {
        triggerVibration('error');
      }
      return;
    }

    const bdgt = safeEvaluate(budget);
    const budgetInvalid = isNaN(bdgt) || bdgt <= 0 || budget.trim() === '';
    setWeightTargetErr(false);
    setWeightBudgetErr(budgetInvalid);

    const computed =
      !priceKgInvalid && !budgetInvalid
        ? computeWeightQuantity(priceKg, bdgt, unitSystem)
        : null;

    if (computed) {
      triggerVibration('success');
      setCalculatedWeightPrice(null);
      setQuantityGrams(computed.quantityBaseUnit);
      const unitLabel = computed.unitSystem === 'imperial' ? 'lb' : 'kg';
      saveHistoryItem(
        'Weight',
        `Price Rate: ${currency}${computed.pricePerUnit.toFixed(2)} / ${unitLabel} | Shopping Budget: ${currency}${computed.budget.toFixed(2)}`,
        `Quantity = ${computed.formattedQty}`
      );
    } else {
      triggerVibration('error');
    }
  };

  const calculateUnit = () => {
    const input = safeEvaluate(unitInput);
    const isErr = isNaN(input) || unitInput.trim() === '';
    setUnitInputErr(isErr);

    const converted = !isErr ? convertRetailUnit(input, unitType) : null;
    if (converted) {
      triggerVibration('success');
      setUnitResult(converted.formattedResult);
      saveHistoryItem('Unit', converted.details, `Converted Result: ${converted.formattedResult}`);
    } else {
      triggerVibration('error');
    }
  };

  const resetDiscount = () => {
    triggerVibration('reset');
    setOriginalPrice('');
    setDiscount('');
    setFinalPrice(null);
    setDiscountSaved(null);
    setDiscPriceErr(false);
    setDiscErr(false);
  };

  const resetWeight = () => {
    triggerVibration('reset');
    setPricePerKg('');
    setBudget('');
    setTargetWeight('');
    setQuantityGrams(null);
    setCalculatedWeightPrice(null);
    setWeightPriceErr(false);
    setWeightBudgetErr(false);
    setWeightTargetErr(false);
  };

  const resetUnit = () => {
    triggerVibration('reset');
    setUnitInput('');
    setUnitResult(null);
    setUnitInputErr(false);
  };

  const handleRequestDeleteItem = (item: HistoryItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    triggerVibration('click');
    setDeleteConfirmTarget({ type: 'single', item });
  };

  const handleRequestDeleteBatch = (items: HistoryItem[]) => {
    if (!items || items.length === 0) return;
    triggerVibration('click');
    if (items.length === 1) {
      setDeleteConfirmTarget({ type: 'single', item: items[0] });
    } else {
      setDeleteConfirmTarget({ type: 'batch', items });
    }
  };

  const handleRequestClearHistory = () => {
    triggerVibration('click');
    setDeleteConfirmTarget({ type: 'all' });
  };

  const executeDeleteBatchHistoryItems = async (itemsToDelete: HistoryItem[]) => {
    setIsDeleting(true);
    try {
      triggerVibration('reset');
      const userId = currentUser?.id;
      let updated = [...history];
      for (const itemToDelete of itemsToDelete) {
        updated = deleteCalculationHistoryItem(itemToDelete, userId);
      }
      setHistory(updated);

      if (currentUser) {
        for (const itemToDelete of itemsToDelete) {
          const delOpKey = `delete_calculation:${itemToDelete.dbId || itemToDelete.id}`;
          enqueueCalculationOfflineSync(
            {
              opKey: delOpKey,
              type: 'delete_calculation',
              deletePayload: {
                id: itemToDelete.id,
                dbId: itemToDelete.dbId,
                details: itemToDelete.details,
                result: itemToDelete.result,
                type: itemToDelete.type,
              },
            },
            currentUser.id
          );

          if (navigator.onLine) {
            let directDeleted = false;
            try {
              const supabase = createClient();
              if (itemToDelete.dbId) {
                const numId = parseInt(itemToDelete.dbId.toString(), 10);
                if (!isNaN(numId)) {
                  await supabase.from('calculations').delete().eq('user_id', currentUser.id).eq('id', numId);
                }
                await supabase.from('calculations').delete().eq('user_id', currentUser.id).eq('id', itemToDelete.dbId);
              }
              if (itemToDelete.details && itemToDelete.result) {
                await supabase
                  .from('calculations')
                  .delete()
                  .eq('user_id', currentUser.id)
                  .eq('details', itemToDelete.details)
                  .eq('result', itemToDelete.result);
              }
              directDeleted = true;
            } catch (sErr) {
              console.warn('Direct client batch deletion notice:', sErr);
            }

            if (directDeleted) {
              clearCalculationOfflineOp(delOpKey, currentUser.id);
            }
          }
        }
      }
    } finally {
      refreshLocalStorageSnapshot(currentUser?.id);
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  const executeDeleteHistoryItem = async (itemToDelete: HistoryItem, silent: boolean = false) => {
    if (!silent) {
      setIsDeleting(true);
    }
    try {
      triggerVibration(silent ? 'success' : 'reset');
      const userId = currentUser?.id;
      const updated = deleteCalculationHistoryItem(itemToDelete, userId);
      setHistory(updated);

      if (currentUser) {
        const delOpKey = `delete_calculation:${itemToDelete.dbId || itemToDelete.id}`;
        enqueueCalculationOfflineSync(
          {
            opKey: delOpKey,
            type: 'delete_calculation',
            deletePayload: {
              id: itemToDelete.id,
              dbId: itemToDelete.dbId,
              details: itemToDelete.details,
              result: itemToDelete.result,
              type: itemToDelete.type,
            },
          },
          currentUser.id
        );

        if (navigator.onLine) {
          let directDeleted = false;
          // 1. Direct Supabase deletion using active client session
          try {
            const supabase = createClient();
            if (itemToDelete.dbId) {
              const numId = parseInt(itemToDelete.dbId.toString(), 10);
              if (!isNaN(numId)) {
                await supabase.from('calculations').delete().eq('user_id', currentUser.id).eq('id', numId);
              }
              await supabase.from('calculations').delete().eq('user_id', currentUser.id).eq('id', itemToDelete.dbId);
            }
            if (itemToDelete.details && itemToDelete.result) {
              await supabase
                .from('calculations')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('details', itemToDelete.details)
                .eq('result', itemToDelete.result);
            }
            directDeleted = true;
          } catch (sErr) {
            console.warn('Direct client deletion notice:', sErr);
          }

          // 2. Delete from database via API (matches ID, and fallback details/result/type)
          try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
              'Content-Type': 'application/json',
              'x-user-id': currentUser.id,
            };
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            await fetch('/api/calculations', {
              method: 'DELETE',
              headers,
              body: JSON.stringify({
                id: itemToDelete.dbId || itemToDelete.id,
                details: itemToDelete.details,
                result: itemToDelete.result,
                type: itemToDelete.type,
              }),
            });
            directDeleted = true;
          } catch (err) {
            console.warn('Note on deleting calculation from cloud database:', err);
          }

          if (directDeleted) {
            clearCalculationOfflineOp(delOpKey, currentUser.id);
          }
        }

        // 3. Clear user metadata calculation_history array on Supabase Auth
        try {
          const supabase = createClient();
          await supabase.auth.updateUser({
            data: {
              calculation_history: [],
            },
          });
        } catch (err) {
          console.warn('Note on updating user metadata after deletion:', err);
        }

        // 4. Update localStorage demo/guest user snapshot if present
        if (typeof window !== 'undefined') {
          const storedUser = localStorage.getItem('retail_calc_auth_user');
          if (storedUser) {
            try {
              const parsed = JSON.parse(storedUser);
              parsed.user_metadata = {
                ...(parsed.user_metadata || {}),
                calculation_history: [],
              };
              localStorage.setItem('retail_calc_auth_user', JSON.stringify(parsed));
            } catch {}
          }
        }
      }
    } finally {
      refreshLocalStorageSnapshot(currentUser?.id);
      if (!silent) {
        setIsDeleting(false);
        setDeleteConfirmTarget(null);
      }
    }
  };

  const executeClearAllHistory = async () => {
    setIsDeleting(true);
    try {
      triggerVibration('reset');
      const userId = currentUser?.id;
      setHistory(clearCalculationHistory(userId));

      if (currentUser) {
        enqueueCalculationOfflineSync(
          {
            opKey: 'delete_calculation:all',
            type: 'delete_calculation',
            deletePayload: {
              id: 'all',
              all: true,
            },
          },
          currentUser.id
        );

        if (navigator.onLine) {
          let directCleared = false;
          // 1. Direct Supabase deletion for all records of user
          try {
            const supabase = createClient();
            await supabase.from('calculations').delete().eq('user_id', currentUser.id);
            directCleared = true;
          } catch (sErr) {
            console.warn('Direct client clear notice:', sErr);
          }

          // 2. Delete all records from database via API
          try {
            const supabase = createClient();
            const { data: { session } } = await supabase.auth.getSession();
            const headers: Record<string, string> = {
              'x-user-id': currentUser.id,
            };
            if (session?.access_token) {
              headers['Authorization'] = `Bearer ${session.access_token}`;
            }
            await fetch('/api/calculations?all=true', {
              method: 'DELETE',
              headers,
            });
            directCleared = true;
          } catch (err) {
            console.warn('Note on clearing calculations in database:', err);
          }

          if (directCleared) {
            clearCalculationOfflineOp('delete_calculation:all', currentUser.id);
          }
        }

        // 3. Clear user metadata calculation_history array on Supabase Auth
        try {
          const supabase = createClient();
          await supabase.auth.updateUser({
            data: {
              calculation_history: [],
            },
          });
        } catch (err) {
          console.warn('Note on clearing user metadata history:', err);
        }

        // 4. Clear localStorage demo/guest user snapshot if present
        if (typeof window !== 'undefined') {
          const storedUser = localStorage.getItem('retail_calc_auth_user');
          if (storedUser) {
            try {
              const parsed = JSON.parse(storedUser);
              parsed.user_metadata = {
                ...(parsed.user_metadata || {}),
                calculation_history: [],
              };
              localStorage.setItem('retail_calc_auth_user', JSON.stringify(parsed));
            } catch {}
          }
        }
      }
    } finally {
      refreshLocalStorageSnapshot(currentUser?.id);
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  const renderDiscountCard = (isGrid = false) => (
    <div className={`bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden flex flex-col justify-between ${isGrid ? 'h-full' : 'max-w-xl mx-auto'}`}>
      <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-bl-full -mr-10 -mt-10 z-0 pointer-events-none"></div>
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center text-sky-600">
            <Percent className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800 leading-tight">Discount Calculator</h2>
            <p className="text-xs text-slate-500">Calculate net price and total amount saved</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Original Price</span>
              {discPriceErr && (
                <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> invalid
                </span>
              )}
            </label>
            <motion.div
              animate={discPriceErr ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                {currency}
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={originalPrice}
                onChange={(e) => {
                  setOriginalPrice(e.target.value);
                  if (discPriceErr) setDiscPriceErr(false);
                }}
                className={`w-full border rounded-2xl py-3.5 pl-8 pr-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                  discPriceErr
                    ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                    : 'bg-slate-50 border-none focus:ring-sky-200'
                }`}
                placeholder="0"
              />
            </motion.div>
            {discPriceErr && (
              <p className="text-[10px] text-red-500 font-medium mt-1">Enter a price &gt; 0</p>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Discount %</span>
              {discErr && (
                <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> invalid
                </span>
              )}
            </label>
            <motion.div
              animate={discErr ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="relative"
            >
              <input
                type="text"
                inputMode="decimal"
                value={discount}
                onChange={(e) => {
                  setDiscount(e.target.value);
                  if (discErr) setDiscErr(false);
                }}
                className={`w-full border rounded-2xl py-3.5 px-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                  discErr
                    ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                    : 'bg-slate-50 border-none focus:ring-sky-200'
                }`}
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                %
              </span>
            </motion.div>
            {discErr && (
              <p className="text-[10px] text-red-500 font-medium mt-1">Enter 0-100%</p>
            )}
          </div>
        </div>

        {/* Quick discount percentage presets */}
        <div>
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
            Quick Presets:
          </span>
          <div className="flex flex-wrap gap-1.5">
            {['5', '10', '15', '20', '25', '30', '50'].map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => {
                  setDiscount(pct);
                  if (discErr) setDiscErr(false);
                  triggerVibration('click');
                }}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  discount === pct
                    ? 'bg-sky-600 text-white shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={calculateDiscount}
            className="flex-1 bg-sky-500 hover:bg-sky-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            Calculate Discount
          </button>
          <button
            onClick={resetDiscount}
            className="w-14 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors cursor-pointer"
            aria-label="Reset discount calculator"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {finalPrice !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-100 mt-4 overflow-hidden"
            >
              <div className="bg-emerald-50 rounded-2xl p-4 flex justify-between items-center border border-emerald-100/50">
                <div>
                  <p className="text-emerald-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    Final Price
                  </p>
                  <p className="text-2xl font-black text-emerald-600">
                    {currency}
                    {finalPrice.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    You Save
                  </p>
                  <p className="text-lg font-bold text-emerald-500">
                    {currency}
                    {discountSaved?.toFixed(2)}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderWeightCard = (isGrid = false) => (
    <div className={`bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden flex flex-col justify-between ${isGrid ? 'h-full' : 'max-w-xl mx-auto'}`}>
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center text-orange-600">
            <Scale className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800 leading-tight">Price by Weight</h2>
            <p className="text-xs text-slate-500">
              {weightMode === 'quantity'
                ? `Calculate quantity based on price per ${unitSystem === 'imperial' ? 'lb' : 'kg'} and budget`
                : `Calculate total cost based on price per ${unitSystem === 'imperial' ? 'lb' : 'kg'} and target weight`}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Price per {unitSystem === 'imperial' ? 'Lb' : 'Kg'}</span>
            {weightPriceErr && (
              <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> invalid
              </span>
            )}
          </label>
          <motion.div
            animate={weightPriceErr ? { x: [-4, 4, -4, 4, 0] } : {}}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
              {currency}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={pricePerKg}
              onChange={(e) => {
                setPricePerKg(e.target.value);
                if (weightPriceErr) setWeightPriceErr(false);
              }}
              className={`w-full border rounded-2xl py-3.5 pl-8 pr-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                weightPriceErr
                  ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                  : 'bg-slate-50 border-none focus:ring-orange-200'
              }`}
              placeholder="0"
            />
          </motion.div>
          {weightPriceErr && (
            <p className="text-[10px] text-red-500 font-medium mt-1">Enter a price &gt; 0</p>
          )}
        </div>

        <div className="flex gap-3 items-start">
          <div className="flex-1 min-w-0">
            {weightMode === 'quantity' ? (
              <>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center gap-1">
                  <span className="truncate">Your Budget</span>
                  {weightBudgetErr && (
                    <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1 shrink-0">
                      <AlertCircle className="w-3 h-3" /> invalid
                    </span>
                  )}
                </label>
                <motion.div
                  animate={weightBudgetErr ? { x: [-4, 4, -4, 4, 0] } : {}}
                  transition={{ duration: 0.3 }}
                  className="relative"
                >
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={budget}
                    onChange={(e) => {
                      setBudget(e.target.value);
                      if (weightBudgetErr) setWeightBudgetErr(false);
                    }}
                    className={`w-full border rounded-2xl py-3.5 pl-8 pr-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                      weightBudgetErr
                        ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                        : 'bg-slate-50 border-none focus:ring-orange-200'
                    }`}
                    placeholder="0"
                  />
                </motion.div>
                {weightBudgetErr && (
                  <p className="text-[10px] text-red-500 font-medium mt-1">Enter budget &gt; 0</p>
                )}
              </>
            ) : (
              <>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center gap-1">
                  <span className="truncate">Target Weight</span>
                  {weightTargetErr && (
                    <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1 shrink-0">
                      <AlertCircle className="w-3 h-3" /> invalid
                    </span>
                  )}
                </label>
                <motion.div
                  animate={weightTargetErr ? { x: [-4, 4, -4, 4, 0] } : {}}
                  transition={{ duration: 0.3 }}
                  className="relative flex items-center"
                >
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetWeight}
                    onChange={(e) => {
                      setTargetWeight(e.target.value);
                      if (weightTargetErr) setWeightTargetErr(false);
                    }}
                    className={`w-full border rounded-2xl py-3.5 pl-4 pr-16 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                      weightTargetErr
                        ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                        : 'bg-slate-50 border-none focus:ring-orange-200'
                    }`}
                    placeholder="0"
                  />
                  <select
                    aria-label="Target weight unit"
                    value={targetWeightUnit}
                    onChange={(e) => {
                      setTargetWeightUnit(e.target.value as WeightTargetUnit);
                      setCalculatedWeightPrice(null);
                    }}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 bg-white border border-slate-200/80 rounded-xl px-2 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-200 cursor-pointer"
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="lb">lb</option>
                    <option value="oz">oz</option>
                  </select>
                </motion.div>
                {weightTargetErr && (
                  <p className="text-[10px] text-red-500 font-medium mt-1">Enter weight &gt; 0</p>
                )}
              </>
            )}
          </div>

          <div className="w-[44%] sm:w-44 shrink-0">
            <label
              htmlFor={isGrid ? 'weight-mode-grid' : 'weight-mode-single'}
              className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 truncate"
            >
              Mode
            </label>
            <div className="relative">
              <select
                id={isGrid ? 'weight-mode-grid' : 'weight-mode-single'}
                aria-label="Price by weight calculation mode"
                value={weightMode}
                onChange={(e) => {
                  const nextMode = e.target.value as 'quantity' | 'price';
                  setWeightMode(nextMode);
                  setQuantityGrams(null);
                  setCalculatedWeightPrice(null);
                  setWeightBudgetErr(false);
                  setWeightTargetErr(false);
                  triggerVibration('click');
                }}
                className="w-full bg-slate-50 border-none rounded-2xl py-3.5 pl-3.5 pr-8 text-xs sm:text-sm font-semibold text-slate-800 focus:ring-2 focus:ring-orange-200 appearance-none cursor-pointer outline-none"
              >
                <option value="quantity">Qty for Budget</option>
                <option value="price">Cost for Weight</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2" />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={calculateWeight}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            {weightMode === 'quantity' ? 'Calculate Quantity' : 'Calculate Price'}
          </button>
          <button
            onClick={resetWeight}
            className="w-14 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors cursor-pointer"
            aria-label="Reset weight calculator"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {weightMode === 'quantity' && quantityGrams !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-100 mt-4 overflow-hidden"
            >
              <div className="bg-orange-50 rounded-2xl p-4 flex justify-between items-center border border-orange-100/50">
                <div>
                  <p className="text-orange-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    You Receive
                  </p>
                  <p className="text-2xl font-black text-orange-600">
                    {unitSystem === 'imperial'
                      ? quantityGrams >= 16
                        ? `${(quantityGrams / 16).toFixed(2)} lb`
                        : `${quantityGrams.toFixed(1)} oz`
                      : quantityGrams >= 1000
                      ? `${(quantityGrams / 1000).toFixed(2)} kg`
                      : `${quantityGrams.toFixed(0)} g`}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
          {weightMode === 'price' && calculatedWeightPrice !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-100 mt-4 overflow-hidden"
            >
              <div className="bg-orange-50 rounded-2xl p-4 flex justify-between items-center border border-orange-100/50">
                <div>
                  <p className="text-orange-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    Total Cost
                  </p>
                  <p className="text-2xl font-black text-orange-600">
                    {currency}
                    {calculatedWeightPrice.toFixed(2)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-orange-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    Target Weight
                  </p>
                  <p className="text-sm font-bold text-orange-700">
                    {targetWeight.trim()} {targetWeightUnit}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderUnitCard = (isGrid = false) => (
    <div className={`bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden flex flex-col justify-between ${isGrid ? 'h-full' : 'max-w-xl mx-auto'}`}>
      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center text-purple-600">
            <ArrowRightLeft className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800 leading-tight">Unit Converter</h2>
            <p className="text-xs text-slate-500">Convert between grams, kilograms, milliliters & liters</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Value</span>
              {unitInputErr && (
                <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> invalid
                </span>
              )}
            </label>
            <motion.div
              animate={unitInputErr ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
            >
              <input
                type="text"
                inputMode="decimal"
                value={unitInput}
                onChange={(e) => {
                  setUnitInput(e.target.value);
                  if (unitInputErr) setUnitInputErr(false);
                }}
                className={`w-full border rounded-2xl py-3.5 px-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                  unitInputErr
                    ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                    : 'bg-slate-50 border-none focus:ring-purple-200'
                }`}
                placeholder="0"
              />
            </motion.div>
            {unitInputErr && (
              <p className="text-[10px] text-red-500 font-medium mt-1">Enter a valid number</p>
            )}
          </div>
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Conversion Type
            </label>
            <select
              value={unitType}
              onChange={(e) => setUnitType(e.target.value)}
              className="w-full bg-slate-50 border-none rounded-2xl py-3.5 px-4 font-semibold text-slate-800 focus:ring-2 focus:ring-purple-200 appearance-none cursor-pointer"
            >
              <option value="g_to_kg">Grams to Kg</option>
              <option value="kg_to_g">Kg to Grams</option>
              <option value="ml_to_l">mL to Liters</option>
              <option value="l_to_ml">Liters to mL</option>
              <option value="lb_to_kg">Pounds (lb) to Kg</option>
              <option value="kg_to_lb">Kg to Pounds (lb)</option>
              <option value="oz_to_g">Ounces (oz) to Grams</option>
              <option value="ft_to_m">Feet (ft) to Meters (m)</option>
              <option value="m_to_ft">Meters (m) to Feet (ft)</option>
              <option value="floz_to_ml">Fluid Oz to mL</option>
            </select>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={calculateUnit}
            className="flex-1 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            Convert Unit
          </button>
          <button
            onClick={resetUnit}
            className="w-14 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors cursor-pointer"
            aria-label="Reset unit converter"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        <AnimatePresence>
          {unitResult !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-4 border-t border-slate-100 mt-4 overflow-hidden"
            >
              <div className="bg-purple-50 rounded-2xl p-4 flex justify-between items-center border border-purple-100/50">
                <div>
                  <p className="text-purple-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    Converted Result
                  </p>
                  <p className="text-2xl font-black text-purple-600">{unitResult}</p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  return (
    <div className="min-h-[100dvh] w-full bg-gradient-to-br from-[#eef7ff] via-[#f6faf7] to-[#fdf6ef] text-slate-800 flex flex-col sm:items-center font-sans antialiased m-0 p-0">
      <div className="mobile-edge-shell w-full max-w-5xl relative flex-1 flex flex-col min-h-[100dvh] m-0 p-0">
        {/* Global Auth & Session Modal Manager (stays mounted across Home and all secondary screens) */}
        <AuthHeader
          headless
          openSignal={profileOpenSignal}
          closeSignal={profileCloseSignal}
          requestedAuthTab={requestedAuthTab}
          signOutSignal={signOutSignal}
          onRequestSignOut={() => setShowSignOutConfirm(true)}
          onSyncHistory={handleSyncFromCloudSql}
          onUserChanged={handleUserChanged}
          onModalOpenChange={(isOpen) => {
            setIsAuthModalOpen(isOpen);
          }}
        />

        {/* Main Header: Rendered only on Home Dashboard; secondary screens have no top back button or excess header bar */}
        {activeTab === 'home' && (
          <header className="mobile-edge-header w-full shrink-0 bg-white/90 backdrop-blur-md border-b border-slate-200/70 shadow-[0_2px_14px_rgba(15,23,42,0.04)] sticky top-0 z-40 transition-colors">
            <div className="h-14 px-4 sm:px-6 flex justify-between items-center gap-3">
              {/* Left: App Icon + Calculator Max Title */}
              <h1 className="m-0 flex items-center min-w-0">
                <button
                  type="button"
                  onClick={() => handleTabChange('home')}
                  className="flex items-center gap-2.5 text-left cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded-xl min-w-0"
                >
                  <Image
                    src="/pwa-192x192.png"
                    alt="Calculator Max"
                    width={32}
                    height={32}
                    className="w-8 h-8 rounded-xl shadow-xs shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <span className="text-base sm:text-lg font-extrabold tracking-tight text-slate-900 whitespace-nowrap leading-none">
                    Calculator Max
                  </span>
                </button>
              </h1>

              {/* Right: Install App (when available) + Offline Wi-Fi Indicator + Profile Avatar */}
              <div className="flex items-center gap-1.5 shrink-0">
                <PWAInstallButton compact />
                <OfflineWifiIndicator />
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.92 }}
                  whileHover={{ scale: 1.04 }}
                  onClick={() => handleTabChange('profile')}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-slate-100/80 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                  aria-label="Open Profile & Account Settings"
                  title={
                    currentUser
                      ? `Profile: ${currentUser.user_metadata?.full_name || currentUser.email}`
                      : 'Profile & Account Settings'
                  }
                >
                  {currentUser?.user_metadata?.avatar_url ? (
                    <img
                      src={currentUser.user_metadata.avatar_url}
                      alt={currentUser.user_metadata?.full_name || 'Profile'}
                      className="w-9 h-9 rounded-full border border-slate-200 object-cover shadow-xs"
                      referrerPolicy="no-referrer"
                    />
                  ) : currentUser ? (
                    <span className="w-9 h-9 rounded-full bg-slate-900 text-white font-bold text-sm flex items-center justify-center shadow-xs">
                      {(
                        (currentUser.user_metadata?.full_name || currentUser.email || 'U')[0] ||
                        'U'
                      ).toUpperCase()}
                    </span>
                  ) : (
                    <span className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-xs">
                      <User className="w-4.5 h-4.5" />
                    </span>
                  )}
                </motion.button>
              </div>
            </div>

            {/* Sticky Full-Width Search Bar pinned inside the Main Header on Home Dashboard */}
            <div className="px-4 sm:px-6 pb-3 pt-0.5">
              <div className="relative w-full">
                <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="search"
                  value={dashboardSearch}
                  onChange={(e) => setDashboardSearch(e.target.value)}
                  placeholder="Search calculators, tools..."
                  aria-label="Search calculators, tools, and notes"
                  className="w-full min-h-[44px] bg-slate-50/90 border border-slate-200/80 rounded-2xl pl-11 pr-10 py-2 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-[0_1px_6px_rgba(15,23,42,0.03)] focus:bg-white focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
                />
                {dashboardSearch && (
                  <button
                    type="button"
                    onClick={() => setDashboardSearch('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </header>
        )}

        {/* Main Content Area */}
        <main
          className={`flex-1 flex flex-col relative overflow-x-clip ${
            activeTab === 'calculator'
              ? 'p-0 pb-20 sm:px-6 sm:pt-3 sm:pb-24 md:px-8 space-y-0 sm:space-y-4'
              : activeTab === 'home'
              ? 'p-0 pb-20'
              : activeTab === 'notes' || activeTab === 'tasks'
              ? 'px-3 sm:px-6 md:px-8 pt-0 pb-24'
              : activeTab === 'history'
              ? 'px-3 sm:px-6 md:px-8 pt-0 pb-24'
              : 'px-3 sm:px-6 md:px-8 pt-2.5 sm:pt-4 pb-24 space-y-3 sm:space-y-5'
          }`}
        >
          {/* Pull-to-Refresh Visual Pill Indicator (Scoped strictly to the active view) */}
          {(pullDistance > 8 || isPullRefreshing || pullRefreshNotice) && !isNoteFullScreen && (
            <div
              role="status"
              aria-live="polite"
              style={{
                transform: `translate(-50%, ${isPullRefreshing ? 12 : Math.max(4, Math.min(28, pullDistance * 0.35))}px)`,
              }}
              className="fixed top-14 left-1/2 z-50 pointer-events-none transition-transform duration-150"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/95 border border-slate-200 shadow-lg text-xs font-bold text-slate-800 whitespace-nowrap">
                {isPullRefreshing ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                    <span>Refreshing view...</span>
                  </>
                ) : pullRefreshNotice ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{pullRefreshNotice}</span>
                  </>
                ) : (
                  <>
                    <ArrowDown
                      className={`w-3.5 h-3.5 transition-transform duration-150 ${
                        pullDistance >= 54 ? 'rotate-180 text-blue-600' : 'text-slate-500'
                      }`}
                    />
                    <span>{pullDistance >= 54 ? 'Release to refresh' : 'Pull to refresh'}</span>
                  </>
                )}
              </div>
            </div>
          )}
          <AnimatePresence
            mode="popLayout"
            initial={false}
            custom={{ dir: direction, mode: tabTransitionMode }}
          >
            <motion.div
              key={activeTab}
              custom={{ dir: direction, mode: tabTransitionMode }}
              variants={{
                enter: ({ dir, mode }: { dir: number; mode: 'slide' | 'zoom' }) =>
                  mode === 'zoom'
                    ? {
                        opacity: 0,
                        scale: 0.92,
                        y: 14,
                      }
                    : {
                        opacity: 0,
                        x: dir > 0 ? 56 : -56,
                      },
                center: {
                  opacity: 1,
                  x: 0,
                  y: 0,
                  scale: 1,
                },
                exit: ({ dir, mode }: { dir: number; mode: 'slide' | 'zoom' }) =>
                  mode === 'zoom'
                    ? {
                        opacity: 0,
                        scale: 0.96,
                        y: 6,
                      }
                    : {
                        opacity: 0,
                        x: dir > 0 ? -40 : 40,
                      },
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
              className={`w-full flex-1 flex flex-col ${
                activeTab === 'calculator' ||
                activeTab === 'home' ||
                activeTab === 'history' ||
                activeTab === 'notes' ||
                activeTab === 'tasks'
                  ? 'space-y-0'
                  : 'space-y-3 sm:space-y-5'
              }`}
            >
              {/* TAB: CALCULATOR MAX HOME DASHBOARD */}
              {activeTab === 'home' && (
                <DashboardHome
                  searchQuery={dashboardSearch}
                  onSearchChange={setDashboardSearch}
                  onSelectTool={(toolTab) => handleTabChange(toolTab)}
                  notes={dashboardNotes}
                  tasksCount={dashboardTasksCount}
                />
              )}

              {/* TAB: AGE CALCULATOR */}
              {activeTab === 'age' && (
                <section>
                  <AgeCalculator
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                  />
                </section>
              )}

              {/* TAB: SCIENTIFIC CALCULATOR */}
              {activeTab === 'calculator' && (
                <section className="w-full flex-1 flex flex-col m-0 p-0">
                  <CalculatorErrorBoundary>
                    <ScientificCalculator
                      triggerVibration={triggerVibration}
                      onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                    />
                  </CalculatorErrorBoundary>
                </section>
              )}

              {/* TAB 1: EMI CALCULATOR */}
              {activeTab === 'emi' && (
                <section>
                  <EmiCalculator
                    currency={currency}
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                  />
                </section>
              )}

              {/* TAB 2: WISHLIST SAVINGS PLANNER */}
              {activeTab === 'wishlist' && (
                <section>
                  <WishlistPlanner
                    currency={currency}
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result, savedAmount) =>
                      saveHistoryItem(type, details, result, savedAmount)
                    }
                  />
                </section>
              )}

              {/* TAB: DISCOUNT CALCULATOR */}
              {activeTab === 'discount' && (
                <section className="py-2">
                  {renderDiscountCard(false)}
                </section>
              )}

              {/* TAB: PRICE BY WEIGHT */}
              {activeTab === 'weight' && (
                <section className="py-2">
                  {renderWeightCard(false)}
                </section>
              )}

              {/* TAB: UNIT CONVERTER */}
              {activeTab === 'unit' && (
                <section className="py-2">
                  {renderUnitCard(false)}
                </section>
              )}

              {/* TAB: CURRENCY EXCHANGE */}
              {activeTab === 'currency' && (
                <section className="py-2 max-w-2xl mx-auto">
                  <CurrencyExchange
                    appCurrency={currency}
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                  />
                </section>
              )}

              {/* TAB 3: QUICK TOOLS (Combined Overview) */}
              {activeTab === 'quick' && (
                <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6 items-start">
                  {renderDiscountCard(true)}
                  {renderWeightCard(true)}
                  {renderUnitCard(true)}
                  <CurrencyExchange
                    appCurrency={currency}
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                  />
                </section>
              )}

              {/* TAB: NOTES (Google Keep-style) */}
              {activeTab === 'notes' && (
                <section className="pt-0 pb-2">
                  <NotesView
                    currentUser={currentUser}
                    triggerVibration={triggerVibration}
                    onFullScreenChange={(isFullscreen) => setIsNoteFullScreen(isFullscreen)}
                    onSubOverlayChange={(hasOverlay) => setIsManagerSubOverlayOpen(hasOverlay)}
                    closeEditorSignal={noteEditorCloseSignal}
                    refreshSignal={notesRefreshSignal}
                    onOpenProfile={() => handleTabChange('profile')}
                    onBack={() => {
                      if (!handleStepBackHierarchy()) {
                        handleTabChange('home');
                      }
                    }}
                    onReturnToHistory={(source) => handleRestoreToHistory(source)}
                  />
                </section>
              )}

              {/* TAB: TASKS (Google Tasks-style) */}
              {activeTab === 'tasks' && (
                <section className="pt-0 pb-2">
                  <TasksView
                    currentUser={currentUser}
                    triggerVibration={triggerVibration}
                    onFullScreenChange={(isFullscreen) => setIsNoteFullScreen(isFullscreen)}
                    onSubOverlayChange={(hasOverlay) => setIsManagerSubOverlayOpen(hasOverlay)}
                    closeEditorSignal={noteEditorCloseSignal}
                    refreshSignal={tasksRefreshSignal}
                    onOpenProfile={() => handleTabChange('profile')}
                    onBack={() => {
                      if (!handleStepBackHierarchy()) {
                        handleTabChange('home');
                      }
                    }}
                    onReturnToHistory={(source) => handleRestoreToHistory(source)}
                  />
                </section>
              )}

              {/* TAB 4: REDESIGNED DATE-GROUPED CALCULATOR HISTORY */}
              {activeTab === 'history' && (
                <section className="pt-0 pb-2">
                  <HistoryView
                    history={history}
                    currency={currency}
                    currentUser={currentUser}
                    refreshNotice={historyRefreshNotice}
                    onRefreshHistory={handleManualRefreshHistory}
                    onInspectItem={(item) => {
                      triggerVibration('click');
                      setPreviewHistoryItem(item);
                    }}
                    onToggleFavorite={handleToggleFavoriteHistory}
                    onRequestDeleteItem={(item) => handleRequestDeleteItem(item)}
                    onRequestDeleteBatch={(items) => handleRequestDeleteBatch(items)}
                    onRequestClearAll={handleRequestClearHistory}
                    onDownloadSinglePDF={handleDownloadSinglePDF}
                    onDownloadAllPDF={(items) => handleDownloadAllPDF(items)}
                    onExportCSV={(items) => exportHistoryCSV(items)}
                    onRetrySyncItem={retrySyncItem}
                    onRemoveItemSilent={(item) => executeDeleteHistoryItem(item, true)}
                    onOpenProfile={() => handleTabChange('profile')}
                  />
                </section>
              )}

              {/* TAB 5: COMPREHENSIVE PROFILE & ACCOUNT SETTINGS */}
              {activeTab === 'profile' && (
                <section aria-label="Profile and Account Settings" className="py-1">
                  <ProfileSettingsView
                    currentUser={currentUser}
                    currency={currency}
                    currencies={CURRENCIES}
                    onCurrencyChange={(sym) => {
                      setCurrency(sym);
                      triggerVibration('click');
                    }}
                    unitSystem={unitSystem}
                    onUnitSystemChange={(sys) => {
                      setUnitSystem(sys);
                      setUnitType(sys === 'imperial' ? 'lb_to_kg' : 'g_to_kg');
                      setTargetWeightUnit(sys === 'imperial' ? 'lb' : 'kg');
                      setQuantityGrams(null);
                      setCalculatedWeightPrice(null);
                      setUnitResult(null);
                      triggerVibration('click');
                    }}
                    onOpenAuthModal={(mode = 'signin') => {
                      setRequestedAuthTab(mode);
                      setProfileOpenSignal((n) => n + 1);
                    }}
                    onSignOut={() => {
                      setShowSignOutConfirm(true);
                    }}
                    onSyncHistory={handleSyncFromCloudSql}
                    onExportCalculations={() => exportHistoryCSV()}
                    onBuildLocalBackup={() => ({
                      calculations: history,
                      notes: getLocalNotes(currentUser?.id),
                      tasks: getLocalTasks(currentUser?.id),
                    })}
                    onRestoreBackup={(payload: BackupPayload) => {
                      let count = 0;
                      const uid = currentUser?.id;
                      if (Array.isArray(payload.calculations) && payload.calculations.length > 0) {
                        const validCalcs = payload.calculations
                          .filter((c) => c && typeof c.type === 'string' && typeof c.result === 'string')
                          .map((c) => ({
                            id: c.id ? String(c.id) : `restored-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                            type: c.type,
                            details: typeof c.details === 'string' ? c.details : '',
                            result: c.result,
                            timestamp: c.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                            createdAt: c.createdAt || new Date().toISOString(),
                            syncStatus: 'local' as const,
                            dbId: c.dbId || null,
                            savedAmount: c.savedAmount,
                          }));
                        if (validCalcs.length > 0) {
                          const merged = [...validCalcs, ...history]
                            .filter((item, idx, arr) => arr.findIndex((x) => x.id === item.id) === idx)
                            .slice(0, 50);
                          setHistory(merged);
                          setCalculationHistory(merged, uid);
                          count += validCalcs.length;
                        }
                      }
                      if (Array.isArray(payload.notes) && payload.notes.length > 0) {
                        const existingNotes = getLocalNotes(uid);
                        const validNotes = payload.notes.filter((n) => n && typeof n.id === 'string');
                        if (validNotes.length > 0) {
                          const mergedNotes = [...validNotes, ...existingNotes].filter(
                            (n, idx, arr) => arr.findIndex((x) => x.id === n.id) === idx
                          );
                          saveLocalNotes(mergedNotes, uid);
                          setDashboardNotes(mergedNotes);
                          count += validNotes.length;
                        }
                      }
                      if (Array.isArray(payload.tasks) && payload.tasks.length > 0) {
                        const existingTasks = getLocalTasks(uid);
                        const validTasks = payload.tasks.filter((t) => t && typeof t.id === 'string');
                        if (validTasks.length > 0) {
                          const mergedTasks = [...validTasks, ...existingTasks].filter(
                            (t, idx, arr) => arr.findIndex((x) => x.id === t.id) === idx
                          );
                          saveLocalTasks(mergedTasks, uid);
                          setDashboardTasksCount(mergedTasks.length);
                          count += validTasks.length;
                        }
                      }
                      return count;
                    }}
                    onUserUpdated={(updatedUser) => setCurrentUser(updatedUser)}
                    calculationsCount={history.length}
                    onSubOverlayChange={(hasOverlay) => setIsManagerSubOverlayOpen(hasOverlay)}
                    closeSubViewSignal={noteEditorCloseSignal}
                    refreshSignal={profileRefreshSignal}
                  />
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>

        {/* Bottom Navigation Bar: Home, History, Search, Notes, Tasks (hidden when viewing/editing an individual note or full-screen detail) */}
        {!isNoteFullScreen && (
          <nav
            aria-label="Primary bottom navigation"
            className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/80 shadow-[0_-4px_20px_rgba(15,23,42,0.04)] pb-[env(safe-area-inset-bottom)] transition-colors"
          >
            <div className="max-w-5xl mx-auto grid grid-cols-5 items-center h-14 px-2">
              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -1.5 }}
                onClick={() => handleTabChange('home')}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer rounded-xl ${
                  activeTab === 'home' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
                }`}
              >
                {activeTab === 'home' && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-1 w-6 h-1 rounded-full bg-blue-600"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <Home className={`w-5 h-5 ${activeTab === 'home' ? 'text-blue-600' : ''}`} />
                <span className="text-[10px] tracking-tight">Home</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -1.5 }}
                onClick={() => handleTabChange('history')}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer rounded-xl ${
                  activeTab === 'history' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
                }`}
              >
                {activeTab === 'history' && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-1 w-6 h-1 rounded-full bg-blue-600"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <Clock className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">History</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -1.5 }}
                onClick={handleFocusDashboardSearch}
                className="relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-slate-700 font-medium transition-colors cursor-pointer rounded-xl"
              >
                <Search className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">Search</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -1.5 }}
                onClick={() => handleTabChange('notes')}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer rounded-xl ${
                  activeTab === 'notes' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
                }`}
              >
                {activeTab === 'notes' && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-1 w-6 h-1 rounded-full bg-blue-600"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <FileText className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">Notes</span>
              </motion.button>

              <motion.button
                type="button"
                whileTap={{ scale: 0.9 }}
                whileHover={{ y: -1.5 }}
                onClick={() => handleTabChange('tasks')}
                className={`relative min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer rounded-xl ${
                  activeTab === 'tasks' ? 'text-blue-600 font-bold' : 'text-slate-400 hover:text-slate-700 font-medium'
                }`}
              >
                {activeTab === 'tasks' && (
                  <motion.span
                    layoutId="bottom-nav-indicator"
                    className="absolute -top-1 w-6 h-1 rounded-full bg-blue-600"
                    transition={{ type: 'spring', stiffness: 420, damping: 30 }}
                  />
                )}
                <ListTodo className="w-5 h-5" />
                <span className="text-[10px] tracking-tight">Tasks</span>
              </motion.button>
            </div>
          </nav>
        )}
      </div>

      {/* Delete Confirmation Modal Dialog */}
      <AnimatePresence>
        {deleteConfirmTarget && (
          <div
            id="delete-confirmation-backdrop"
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => {
              if (!isDeleting) setDeleteConfirmTarget(null);
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl border border-slate-100 max-w-md w-full p-6 relative overflow-hidden"
            >
              {/* Decorative subtle ambient accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-bl-full pointer-events-none" />

              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 shadow-xs">
                  <Trash2 className="w-6 h-6 text-rose-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 leading-tight">
                    {deleteConfirmTarget.type === 'single'
                      ? 'Delete History Record?'
                      : deleteConfirmTarget.type === 'batch'
                      ? `Delete ${deleteConfirmTarget.items.length} Selected Records?`
                      : 'Clear All History?'}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    {deleteConfirmTarget.type === 'single'
                      ? 'Confirm deletion of this calculation record'
                      : deleteConfirmTarget.type === 'batch'
                      ? `Confirm deletion of ${deleteConfirmTarget.items.length} selected calculation records`
                      : 'Confirm clearing all calculation history'}
                  </p>
                </div>

                {!isDeleting && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmTarget(null)}
                    className="text-slate-400 hover:text-slate-600 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                    aria-label="Close dialog"
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>

              {/* Content preview & warning */}
              <div className="mt-4 space-y-3">
                {deleteConfirmTarget.type === 'single' ? (
                  <>
                    <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-white border border-slate-200 px-2 py-0.5 rounded-md">
                          {deleteConfirmTarget.item.type}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {deleteConfirmTarget.item.timestamp}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-slate-800 break-words">
                        {deleteConfirmTarget.item.result}
                      </div>
                      <div className="text-xs text-slate-500 line-clamp-2">
                        {deleteConfirmTarget.item.details}
                      </div>
                    </div>

                    <p className="text-xs text-slate-600 leading-relaxed">
                      Are you sure you want to delete this calculation record? It will be permanently removed from both your device and the <strong>cloud database</strong>.
                    </p>
                  </>
                ) : deleteConfirmTarget.type === 'batch' ? (
                  <div className="bg-rose-50/80 border border-rose-200/70 rounded-2xl p-3.5 space-y-1">
                    <div className="text-xs font-bold text-rose-900">
                      {deleteConfirmTarget.items.length} selected {deleteConfirmTarget.items.length === 1 ? 'record' : 'records'} will be deleted
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Are you sure you want to delete the selected calculation records? They will be permanently removed from local storage and the cloud database.
                    </p>
                  </div>
                ) : (
                  <div className="bg-rose-50/80 border border-rose-200/70 rounded-2xl p-3.5 space-y-1">
                    <div className="text-xs font-bold text-rose-900">
                      Total {history.length} {history.length === 1 ? 'record' : 'records'} will be deleted
                    </div>
                    <p className="text-xs text-rose-700 leading-relaxed">
                      Are you sure you want to delete all saved calculation records? All records will be permanently removed from local storage and the cloud database, and this action cannot be undone.
                    </p>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              <div className="mt-6 flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    triggerVibration('click');
                    setDeleteConfirmTarget(null);
                  }}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    if (deleteConfirmTarget.type === 'single') {
                      executeDeleteHistoryItem(deleteConfirmTarget.item);
                    } else if (deleteConfirmTarget.type === 'batch') {
                      executeDeleteBatchHistoryItems(deleteConfirmTarget.items);
                    } else {
                      executeClearAllHistory();
                    }
                  }}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs shadow-md shadow-rose-600/20 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Deleting...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>
                        {deleteConfirmTarget.type === 'single'
                          ? 'Confirm Delete'
                          : deleteConfirmTarget.type === 'batch'
                          ? `Delete ${deleteConfirmTarget.items.length} Records`
                          : 'Clear All'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Android Back Exit Guard Toast */}
      <AnimatePresence>
        {exitPromptVisible && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            role="status"
            aria-live="polite"
            className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900/95 text-white text-xs font-semibold shadow-lg pointer-events-none whitespace-nowrap"
          >
            Press back again to exit
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sign Out Confirmation Modal Dialog */}
      <AnimatePresence>
        {showSignOutConfirm && (
          <div
            id="signout-confirmation-backdrop"
            className="fixed inset-0 z-[100001] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
            onClick={() => setShowSignOutConfirm(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl shadow-2xl border border-slate-200 max-w-sm w-full p-6 space-y-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <LogOut className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-extrabold text-slate-900 leading-tight">
                    Sign Out of Calculator Max?
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                    Your locally saved notes, tasks, and calculation history will remain on this device. Cloud sync will pause until you sign back in.
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSignOutConfirm(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 font-bold text-xs transition-colors cursor-pointer min-h-[40px]"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowSignOutConfirm(false);
                    setSignOutSignal((n) => n + 1);
                  }}
                  className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold text-xs shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer min-h-[40px]"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Comprehensive Calculation History Session Preview Modal */}
      <HistoryPreviewModal
        item={
          previewHistoryItem
            ? history.find((h) => h.id === previewHistoryItem.id) || previewHistoryItem
            : null
        }
        currency={currency}
        onClose={() => setPreviewHistoryItem(null)}
      />

      {/* Detailed Storage Full Usage Modal with Direct History Link */}
      <StorageFullModal
        isOpen={!!storageFullSnapshot}
        snapshot={storageFullSnapshot}
        onClose={() => setStorageFullSnapshot(null)}
        onManageStorage={() => {
          setStorageFullSnapshot(null);
          handleTabChange('history');
        }}
      />
    </div>
  );
}
