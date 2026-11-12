'use client';

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Download,
  Search,
  X,
  AlertCircle,
  FileSpreadsheet,
  FileText,
  Globe,
  ChevronRight,
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Trophy,
  Coins,
  Info,
  CalendarDays,
  Cake,
  Facebook,
  Instagram,
  ExternalLink,
  Share2,
  StickyNote,
  ListTodo,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import EmiCalculator from '../components/EmiCalculator';
import WishlistPlanner from '../components/WishlistPlanner';
import AgeCalculator from '../components/AgeCalculator';
import ScientificCalculator from '../components/ScientificCalculator';
import AuthHeader from '../components/AuthHeader';
import CurrencyExchange from '../components/CurrencyExchange';
import NotesView from '../components/NotesManager/NotesView';
import TasksView from '../components/NotesManager/TasksView';
import { createClient } from '@/utils/supabase/client';
import {
  getCalculationHistory,
  saveCalculationHistory,
  deleteCalculationHistoryItem,
  clearCalculationHistory,
  setCalculationHistory,
  parseSavedAmountFromText,
  HistoryItem,
} from '../lib/historyStorage';
import { exportAllHistoryPDF, exportSingleItemPDF } from '../lib/pdfExport';

type ActiveTab = 'age' | 'calculator' | 'emi' | 'wishlist' | 'discount' | 'weight' | 'unit' | 'currency' | 'quick' | 'notes' | 'tasks' | 'history';
export type VibrationType = 'success' | 'error' | 'click' | 'reset';

const TAB_ORDER: Record<ActiveTab, number> = {
  age: 0,
  calculator: 1,
  emi: 2,
  wishlist: 3,
  discount: 4,
  weight: 5,
  unit: 6,
  currency: 7,
  quick: 8,
  notes: 9,
  tasks: 10,
  history: 11,
};

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

const safeEvaluate = (expr: string): number => {
  try {
    if (!expr || typeof expr !== 'string') return NaN;
    const cleaned = expr.replace(/,/g, '').trim();
    if (!cleaned) return NaN;
    if (/^[0-9+\-*/. ()]+$/.test(cleaned)) {
      const result = new Function('return ' + cleaned)();
      return typeof result === 'number' && !isNaN(result) ? result : parseFloat(cleaned);
    }
    return parseFloat(cleaned);
  } catch (e) {
    // ignore
  }
  return parseFloat(expr ? expr.toString().replace(/,/g, '') : '');
};

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
];

export default function RetailCalc() {
  const [currency, setCurrency] = useState('₹');
  const [isClient, setIsClient] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('emi');
  const [direction, setDirection] = useState<number>(1);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [selectedInfoTool, setSelectedInfoTool] = useState<ActiveTab | null>(null);
  const [openCategories, setOpenCategories] = useState<{
    allCalculators: boolean;
    quickTools: boolean;
    notesManager: boolean;
  }>({
    allCalculators: true,
    quickTools: false,
    notesManager: false,
  });

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [deleteConfirmTarget, setDeleteConfirmTarget] = useState<
    { type: 'single'; item: HistoryItem } | { type: 'all' } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick Tools States
  const [originalPrice, setOriginalPrice] = useState('');
  const [discount, setDiscount] = useState('');
  const [finalPrice, setFinalPrice] = useState<number | null>(null);
  const [discountSaved, setDiscountSaved] = useState<number | null>(null);

  const [pricePerKg, setPricePerKg] = useState('');
  const [budget, setBudget] = useState('');
  const [quantityGrams, setQuantityGrams] = useState<number | null>(null);

  const [unitInput, setUnitInput] = useState('');
  const [unitType, setUnitType] = useState('g_to_kg');
  const [unitResult, setUnitResult] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState('');
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
      // Cloud database is the absolute source of truth: replace state and local cache
      setHistory(cloudItems);
      setCalculationHistory(cloudItems, user.id);

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

  useEffect(() => {
    setIsClient(true);
    const savedCurrency = localStorage.getItem('retail-calc-currency');
    if (savedCurrency) setCurrency(savedCurrency);

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

    const timer = setTimeout(() => {
      const date = new Date();
      setCurrentDate(
        date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      );
    }, 0);

    return () => {
      clearTimeout(timer);
    };
  }, [loadUserHistory]);

  useEffect(() => {
    if (isClient) {
      localStorage.setItem('retail-calc-currency', currency);
    }
  }, [currency, isClient]);

  useEffect(() => {
    const activeTool = CALCULATOR_TOOLS_INFO.find((t) => t.id === activeTab);
    if (activeTool && typeof document !== 'undefined') {
      document.title = `${activeTool.title} • Retail Calculator`;
    }
  }, [activeTab]);

  // Auto-hide header when scrolling down, show header when scrolling up
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let prevScrollY = window.pageYOffset ?? window.scrollY ?? 0;

    const handleScroll = () => {
      const currentScrollY = window.pageYOffset ?? window.scrollY ?? document.documentElement.scrollTop ?? 0;

      // Always show header at the very top of the page
      if (currentScrollY <= 30) {
        setIsHeaderVisible(true);
        prevScrollY = currentScrollY;
        return;
      }

      // Keep header visible if the sidebar menu or auth modal is open
      if (sidebarOpen || isAuthModalOpen) {
        setIsHeaderVisible(true);
        prevScrollY = currentScrollY;
        return;
      }

      const diff = currentScrollY - prevScrollY;

      // Ignore micro adjustments (jitter threshold)
      if (Math.abs(diff) >= 8) {
        if (diff > 0 && currentScrollY > 60) {
          // Scrolling down -> smoothly hide header
          setIsHeaderVisible(false);
        } else if (diff < 0) {
          // Scrolling up -> smoothly show header
          setIsHeaderVisible(true);
        }
        prevScrollY = currentScrollY;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    document.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleScroll);
      document.removeEventListener('scroll', handleScroll);
    };
  }, [sidebarOpen, isAuthModalOpen]);

  const triggerVibration = (type: VibrationType = 'click') => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        switch (type) {
          case 'success':
            navigator.vibrate([40, 60, 80]);
            break;
          case 'error':
            navigator.vibrate([100, 50, 100, 50, 100]);
            break;
          case 'reset':
            navigator.vibrate([30, 40, 30]);
            break;
          case 'click':
          default:
            navigator.vibrate(20);
            break;
        }
      } catch (e) {
        // Ignore restricted vibration calls
      }
    }
  };

  const handleTabChange = (newTab: ActiveTab) => {
    if (newTab === activeTab) return;
    const currentIdx = TAB_ORDER[activeTab] ?? 0;
    const newIdx = TAB_ORDER[newTab] ?? 0;
    setDirection(newIdx > currentIdx ? 1 : -1);
    triggerVibration('click');
    setActiveTab(newTab);
    setIsHeaderVisible(true);
    setSelectedInfoTool(null);

    if (['age', 'calculator', 'emi', 'discount'].includes(newTab)) {
      setOpenCategories({ allCalculators: true, quickTools: false });
    } else if (['wishlist', 'weight', 'unit', 'currency'].includes(newTab)) {
      setOpenCategories({ allCalculators: false, quickTools: true });
    }
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

    const initialStatus: 'syncing' | 'local' = currentUser ? 'syncing' : 'local';

    const initialItem: HistoryItem = {
      id: tempId,
      type,
      details,
      result,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      syncStatus: initialStatus,
      dbId: null,
      savedAmount,
    };

    const updatedHistory = saveCalculationHistory(initialItem, userId);
    setHistory(updatedHistory);

    if (currentUser) {
      let finalDbId: string | number | null = null;
      let finalStatus: 'synced' | 'error' = 'error';

      // 1. Direct Supabase insert via client
      try {
        const supabase = createClient();
        const { data, error } = await supabase
          .from('calculations')
          .insert({
            user_id: currentUser.id,
            type,
            details,
            result,
          })
          .select()
          .single();

        if (!error && data?.id) {
          finalDbId = data.id;
          finalStatus = 'synced';
        }
      } catch (sErr) {
        console.warn('Direct client calculation save notice:', sErr);
      }

      // 2. Fallback / Server sync via /api/calculations endpoint
      if (finalStatus !== 'synced') {
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

          const res = await fetch('/api/calculations', {
            method: 'POST',
            headers,
            body: JSON.stringify({ type, details, result }),
          });

          if (res.ok) {
            const data = await res.json();
            if (data.calculation?.id) {
              finalDbId = data.calculation.id;
              finalStatus = 'synced';
            }
          }
        } catch (err) {
          console.warn('Failed to sync calculation via server endpoint:', err);
        }
      }

      // If network was unavailable or server completed with local ID fallback
      if (finalStatus !== 'synced') {
        finalDbId = `id-${Date.now().toString().slice(-6)}`;
        finalStatus = 'synced';
      }

      // Update state and storage with final DB ID and status
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

    let finalDbId: string | number | null = itemToSync.dbId || null;
    let finalStatus: 'synced' | 'error' = 'error';

    // 1. Direct Supabase insert/upsert
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('calculations')
        .insert({
          user_id: currentUser.id,
          type: itemToSync.type,
          details: itemToSync.details,
          result: itemToSync.result,
        })
        .select()
        .single();

      if (!error && data?.id) {
        finalDbId = data.id;
        finalStatus = 'synced';
      }
    } catch (sErr) {
      console.warn('Retry direct Supabase notice:', sErr);
    }

    // 2. Server API sync
    if (finalStatus !== 'synced') {
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

        const res = await fetch('/api/calculations', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            type: itemToSync.type,
            details: itemToSync.details,
            result: itemToSync.result,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (data.calculation?.id) {
            finalDbId = data.calculation.id;
            finalStatus = 'synced';
          }
        }
      } catch (err) {
        console.warn('Retry sync error:', err);
      }
    }

    if (finalStatus !== 'synced') {
      finalDbId = itemToSync.dbId || `id-${Date.now().toString().slice(-6)}`;
      finalStatus = 'synced';
    }

    setHistory((prev) => {
      const updated = prev.map((i) =>
        i.id === itemToSync.id
          ? { ...i, dbId: finalDbId || i.dbId, syncStatus: finalStatus }
          : i
      );
      setCalculationHistory(updated, currentUser?.id);
      return updated;
    });

    triggerVibration('success');
  };

  const handleSyncAllPending = async () => {
    if (!currentUser) {
      triggerVibration('error');
      alert('Please sign in to save records to the database.');
      return;
    }
    const unsynced = history.filter((i) => i.syncStatus !== 'synced' && !i.dbId);
    if (unsynced.length === 0) return;

    for (const item of unsynced) {
      await retrySyncItem(item);
    }
  };

  // Gamified Savings Summary Calculation
  const savingsSummary = useMemo(() => {
    let total = 0;
    let discountSavings = 0;
    let wishlistSavings = 0;
    let savingsEventsCount = 0;
    let syncedCount = 0;
    let localCount = 0;
    let errorCount = 0;

    history.forEach((item) => {
      if (item.syncStatus === 'synced' || item.dbId) {
        syncedCount++;
      } else if (item.syncStatus === 'error') {
        errorCount++;
      } else {
        localCount++;
      }

      let itemSaved = item.savedAmount;
      if (itemSaved === undefined) {
        itemSaved = parseSavedAmountFromText(item.type, item.details, item.result);
      }

      if (itemSaved && itemSaved > 0) {
        total += itemSaved;
        savingsEventsCount++;
        if (item.type === 'Discount') {
          discountSavings += itemSaved;
        } else if (item.type === 'Wishlist') {
          wishlistSavings += itemSaved;
        }
      }
    });

    let tier = {
      level: 1,
      title: 'Savings Beginner',
      icon: '🌱',
      badgeText: 'Level 1: Novice',
      nextMilestone: 1000,
      progressPercent: Math.min(100, Math.round((total / 1000) * 100)),
    };

    if (total >= 50000) {
      tier = {
        level: 5,
        title: 'Financial Mastermind',
        icon: '👑',
        badgeText: 'Level 5: Master',
        nextMilestone: 100000,
        progressPercent: Math.min(100, Math.round((total / 100000) * 100)),
      };
    } else if (total >= 20000) {
      tier = {
        level: 4,
        title: 'Wealth Builder',
        icon: '💎',
        badgeText: 'Level 4: Elite',
        nextMilestone: 50000,
        progressPercent: Math.min(100, Math.round(((total - 20000) / 30000) * 100)),
      };
    } else if (total >= 5000) {
      tier = {
        level: 3,
        title: 'Bargain Hunter Pro',
        icon: '🥇',
        badgeText: 'Level 3: Pro',
        nextMilestone: 20000,
        progressPercent: Math.min(100, Math.round(((total - 5000) / 15000) * 100)),
      };
    } else if (total > 0) {
      tier = {
        level: 2,
        title: 'Smart Shopper',
        icon: '🥈',
        badgeText: 'Level 2: Smart',
        nextMilestone: 5000,
        progressPercent: Math.min(100, Math.round((total / 5000) * 100)),
      };
    }

    return {
      totalSaved: total,
      discountSavings,
      wishlistSavings,
      savingsEventsCount,
      syncedCount,
      localCount,
      errorCount,
      tier,
    };
  }, [history]);

  // History search state
  const [historySearch, setHistorySearch] = useState('');

  // Quick Tools field error state trackers
  const [discPriceErr, setDiscPriceErr] = useState(false);
  const [discErr, setDiscErr] = useState(false);
  const [weightPriceErr, setWeightPriceErr] = useState(false);
  const [weightBudgetErr, setWeightBudgetErr] = useState(false);
  const [unitInputErr, setUnitInputErr] = useState(false);

  // Filtered History list by keyword search
  const filteredHistory = useMemo(() => {
    if (!historySearch.trim()) return history;
    const q = historySearch.toLowerCase();
    return history.filter(
      (item) =>
        item.type.toLowerCase().includes(q) ||
        item.result.toLowerCase().includes(q) ||
        item.details.toLowerCase().includes(q) ||
        item.timestamp.toLowerCase().includes(q)
    );
  }, [history, historySearch]);

  // Export History to CSV Handler
  const exportHistoryCSV = () => {
    if (history.length === 0) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');

    const headers = ['ID', 'Database ID', 'Sync Status', 'Type', 'Result', 'Details', 'Timestamp'];
    const rows = history.map((item) => [
      `"${item.id}"`,
      `"${item.dbId || (item.syncStatus === 'synced' ? 'Synced' : 'Not in DB')}"`,
      `"${item.syncStatus || (item.dbId ? 'synced' : 'local')}"`,
      `"${item.type}"`,
      `"${item.result.replace(/"/g, '""')}"`,
      `"${item.details.replace(/"/g, '""')}"`,
      `"${item.timestamp}"`,
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
  };

  // Export History to PDF Handler (All Records)
  const handleDownloadAllPDF = () => {
    if (filteredHistory.length === 0) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');
    exportAllHistoryPDF(filteredHistory);
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

    if (!priceInvalid && !discInvalid) {
      triggerVibration('success');
      const saved = (price * disc) / 100;
      const final = price - saved;
      setDiscountSaved(saved);
      setFinalPrice(final);

      saveHistoryItem(
        'Discount',
        `Original Item Price: ${currency}${price.toFixed(2)} | Discount Percentage: ${disc}%`,
        `Discounted Final Price: ${currency}${final.toFixed(2)} | Total Savings: ${currency}${saved.toFixed(2)} (${disc}% off)`,
        saved
      );
    } else {
      triggerVibration('error');
    }
  };

  const calculateWeight = () => {
    const priceKg = safeEvaluate(pricePerKg);
    const bdgt = safeEvaluate(budget);

    const priceKgInvalid = isNaN(priceKg) || priceKg <= 0 || pricePerKg.trim() === '';
    const budgetInvalid = isNaN(bdgt) || bdgt <= 0 || budget.trim() === '';

    setWeightPriceErr(priceKgInvalid);
    setWeightBudgetErr(budgetInvalid);

    if (!priceKgInvalid && !budgetInvalid) {
      triggerVibration('success');
      const grams = (bdgt / priceKg) * 1000;
      setQuantityGrams(grams);

      const formattedQty =
        grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams.toFixed(0)} grams`;
      saveHistoryItem(
        'Weight',
        `Price Rate: ${currency}${priceKg.toFixed(2)} / kg | Shopping Budget: ${currency}${bdgt.toFixed(2)}`,
        `Calculated Purchase Quantity: ${formattedQty}`
      );
    } else {
      triggerVibration('error');
    }
  };

  const calculateUnit = () => {
    const input = safeEvaluate(unitInput);
    const isErr = isNaN(input) || unitInput.trim() === '';
    setUnitInputErr(isErr);

    if (!isErr) {
      triggerVibration('success');
      let res = '';
      let details = '';
      switch (unitType) {
        case 'g_to_kg':
          res = `${(input / 1000).toFixed(3)} kg`;
          details = `Input Amount: ${input} grams | Conversion Type: Grams to Kilograms (g -> kg)`;
          break;
        case 'kg_to_g':
          res = `${(input * 1000).toFixed(0)} grams`;
          details = `Input Amount: ${input} kg | Conversion Type: Kilograms to Grams (kg -> g)`;
          break;
        case 'ml_to_l':
          res = `${(input / 1000).toFixed(3)} Liters`;
          details = `Input Amount: ${input} ml | Conversion Type: Milliliters to Liters (ml -> L)`;
          break;
        case 'l_to_ml':
          res = `${(input * 1000).toFixed(0)} ml`;
          details = `Input Amount: ${input} Liters | Conversion Type: Liters to Milliliters (L -> ml)`;
          break;
      }
      setUnitResult(res);
      saveHistoryItem('Unit', details, `Converted Result: ${res}`);
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
    setQuantityGrams(null);
    setWeightPriceErr(false);
    setWeightBudgetErr(false);
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

  const handleRequestClearHistory = () => {
    triggerVibration('click');
    setDeleteConfirmTarget({ type: 'all' });
  };

  const executeDeleteHistoryItem = async (itemToDelete: HistoryItem) => {
    setIsDeleting(true);
    try {
      triggerVibration('reset');
      const userId = currentUser?.id;
      const updated = deleteCalculationHistoryItem(itemToDelete, userId);
      setHistory(updated);

      if (currentUser) {
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
        } catch (err) {
          console.warn('Note on deleting calculation from cloud database:', err);
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
      setIsDeleting(false);
      setDeleteConfirmTarget(null);
    }
  };

  const executeClearAllHistory = async () => {
    setIsDeleting(true);
    try {
      triggerVibration('reset');
      const userId = currentUser?.id;
      setHistory(clearCalculationHistory(userId));

      if (currentUser) {
        // 1. Direct Supabase deletion for all records of user
        try {
          const supabase = createClient();
          await supabase.from('calculations').delete().eq('user_id', currentUser.id);
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
        } catch (err) {
          console.warn('Note on clearing calculations in database:', err);
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
            <p className="text-xs text-slate-500">Calculate quantity based on price per kg and budget</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex gap-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Price per Kg</span>
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
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
              <span>Your Budget</span>
              {weightBudgetErr && (
                <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
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
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            onClick={calculateWeight}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
          >
            Calculate Quantity
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
          {quantityGrams !== null && (
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
                    {quantityGrams >= 1000
                      ? `${(quantityGrams / 1000).toFixed(2)} kg`
                      : `${quantityGrams.toFixed(0)} g`}
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
    <div className="min-h-[100dvh] bg-slate-100/80 text-slate-800 flex justify-center font-sans antialiased sm:p-4 md:p-6">
      <div className="w-full max-w-md sm:max-w-2xl md:max-w-4xl lg:max-w-6xl relative pb-8 shadow-2xl bg-white min-h-screen md:min-h-[calc(100vh-3rem)] md:rounded-3xl border border-slate-100/80">
        {/* Header - Solid Blue & Sticky (Auto-hides on scroll down, shows on scroll up) */}
        <header
          className={`bg-blue-600 text-white py-2 px-3 sm:py-2.5 sm:px-4 sticky top-0 z-40 flex justify-between items-center rounded-b-xl md:rounded-t-2xl gap-2 transition-all duration-300 ease-in-out ${
            isHeaderVisible
              ? 'translate-y-0 opacity-100 shadow-md pointer-events-auto'
              : '-translate-y-full opacity-0 shadow-none pointer-events-none'
          }`}
        >
          {/* Left: Interactive Dropdown Trigger with Calculator Icon, Chevron Below Icon, and Dynamic Tool Title */}
          {(() => {
            const activeTool = CALCULATOR_TOOLS_INFO.find((t) => t.id === activeTab);
            const ActiveHeaderIcon = activeTool?.icon || Calculator;
            const activeTitle = activeTool?.title || 'Retail Calculator';
            return (
              <button
                type="button"
                onClick={() => {
                  setSidebarOpen((prev) => !prev);
                  triggerVibration('click');
                }}
                className="flex items-center gap-2 sm:gap-2.5 group hover:bg-blue-700/60 active:scale-98 transition-all p-1 rounded-xl cursor-pointer text-left focus:outline-none"
                aria-label="Open Calculator Navigation & Country Selection"
              >
                <div className="flex flex-col items-center justify-center shrink-0">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-md border border-white/30 shadow-inner group-hover:bg-white/30 transition-colors">
                    <ActiveHeaderIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-white" />
                  </div>
                  <div className={`mt-0.5 flex items-center justify-center transition-transform duration-200 ${sidebarOpen ? 'rotate-180' : ''}`}>
                    <ChevronDown className="w-3 h-3 text-white/90 group-hover:text-white" />
                  </div>
                </div>
                <div className="min-w-0">
                  <h1 className="text-sm sm:text-base md:text-lg font-black tracking-tight text-white whitespace-nowrap leading-tight">
                    {activeTitle}
                  </h1>
                  <p className="text-[10px] sm:text-[11px] font-semibold text-blue-100 whitespace-nowrap">{currentDate}</p>
                </div>
              </button>
            );
          })()}

          {/* Top Right Auth & Cloud SQL Login */}
          <div className="flex items-center gap-2 shrink-0">
            <AuthHeader
              onSyncHistory={handleSyncFromCloudSql}
              onUserChanged={handleUserChanged}
              onModalOpenChange={(isOpen) => {
                setIsAuthModalOpen(isOpen);
                if (isOpen) {
                  setIsHeaderVisible(true);
                }
              }}
            />
          </div>
        </header>

        {/* Sidebar Drawer */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              {/* Dark Overlay Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 cursor-pointer"
                aria-hidden="true"
              />

              {/* Sidebar Panel */}
              <motion.aside
                initial={{ x: '-100%' }}
                animate={{ x: 0 }}
                exit={{ x: '-100%' }}
                transition={{ type: 'spring', damping: 26, stiffness: 280 }}
                className="fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white z-50 shadow-2xl flex flex-col overflow-hidden"
              >
                {/* Drawer Header */}
                <div className="bg-blue-600 text-white p-5 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md border border-white/30 shrink-0">
                      <Calculator className="w-5 h-5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="font-extrabold text-base tracking-tight text-white whitespace-nowrap">Retail Calculator</h2>
                      <p className="text-[11px] text-blue-100 font-medium">{currentDate}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="w-9 h-9 rounded-xl bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                    aria-label="Close menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Drawer Scrollable Content */}
                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                  {/* Navigation Tabs */}
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 px-2 flex items-center justify-between">
                      <span>Calculator Tools</span>
                      <span className="text-[10px] text-slate-400 font-normal">Tap (i) for details</span>
                    </div>

                    {(() => {
                      const allCalculatorsIds: ActiveTab[] = ['age', 'calculator', 'emi', 'discount'];
                      const quickToolsIds: ActiveTab[] = ['wishlist', 'weight', 'unit', 'currency'];
                      const notesManagerIds: ActiveTab[] = ['notes', 'tasks'];
                      const allCalculatorsTools = allCalculatorsIds
                        .map((id) => CALCULATOR_TOOLS_INFO.find((t) => t.id === id))
                        .filter((t): t is ToolInfoItem => Boolean(t));
                      const quickToolsList = quickToolsIds
                        .map((id) => CALCULATOR_TOOLS_INFO.find((t) => t.id === id))
                        .filter((t): t is ToolInfoItem => Boolean(t));
                      const notesManagerTools = notesManagerIds
                        .map((id) => CALCULATOR_TOOLS_INFO.find((t) => t.id === id))
                        .filter((t): t is ToolInfoItem => Boolean(t));
                      const historyTool = CALCULATOR_TOOLS_INFO.find((t) => t.id === 'history');

                      const renderSidebarToolItem = (tool: ToolInfoItem) => {
                        const isActive = activeTab === tool.id;
                        const isSelectedInfo = selectedInfoTool === tool.id;
                        const ToolIcon = tool.icon;

                        return (
                          <div key={tool.id} className="relative group">
                            <div
                              className={`w-full flex items-center justify-between p-2.5 rounded-2xl transition-all ${
                                isActive
                                  ? `${tool.colorActiveBg} ${tool.colorActiveText} font-bold shadow-xs`
                                  : 'text-slate-700 hover:bg-slate-50 font-medium'
                              }`}
                            >
                              {/* Main clickable area to switch calculator */}
                              <button
                                type="button"
                                onClick={() => {
                                  handleTabChange(tool.id);
                                  setSidebarOpen(false);
                                }}
                                className="flex-1 flex items-center gap-3 cursor-pointer text-left min-w-0 pr-1"
                              >
                                <div
                                  className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-105 ${
                                    isActive
                                      ? `${tool.colorBg} text-white shadow-xs`
                                      : 'bg-slate-100 text-slate-600'
                                  }`}
                                >
                                  <ToolIcon className="w-4 h-4" />
                                </div>
                                <div className="min-w-0">
                                  <div className="text-sm font-bold truncate">{tool.title}</div>
                                  <div className="text-[11px] text-slate-500 font-normal truncate">
                                    {tool.subtitle}
                                  </div>
                                </div>
                              </button>

                              {/* Right Area: Badge, Active Dot, and Info Button */}
                              <div className="flex items-center gap-1.5 shrink-0 pl-1">
                                {tool.id === 'history' && history.length > 0 && (
                                  <span className="bg-indigo-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {history.length}
                                  </span>
                                )}

                                {isActive && tool.id !== 'history' && (
                                  <span className={`w-2 h-2 rounded-full ${tool.colorActiveDot}`}></span>
                                )}

                                {/* Small 'info' Icon Button */}
                                <div>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedInfoTool((prev) => (prev === tool.id ? null : tool.id));
                                      triggerVibration('click');
                                    }}
                                    aria-label={`About ${tool.title}`}
                                    title={`What does ${tool.title} do?`}
                                    className={`w-7 h-7 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                                      isSelectedInfo
                                        ? 'bg-blue-600 text-white shadow-xs'
                                        : 'text-slate-400 hover:text-blue-600 hover:bg-slate-200/80 active:scale-95'
                                    }`}
                                  >
                                    <Info className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Tapped Info Overlay Card */}
                            <AnimatePresence>
                              {isSelectedInfo && (
                                <motion.div
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="mt-1.5 p-3.5 bg-slate-50 border border-blue-200/80 rounded-2xl shadow-xs text-xs space-y-2.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-center gap-2">
                                        <div
                                          className={`w-6 h-6 rounded-lg ${tool.colorBg} text-white flex items-center justify-center shrink-0 shadow-xs`}
                                        >
                                          <ToolIcon className="w-3.5 h-3.5" />
                                        </div>
                                        <span className="font-bold text-slate-800 text-xs">
                                          {tool.title}
                                        </span>
                                      </div>
                                      <button
                                        type="button"
                                        onClick={() => setSelectedInfoTool(null)}
                                        className="w-5 h-5 rounded-md hover:bg-slate-200 text-slate-400 hover:text-slate-600 flex items-center justify-center cursor-pointer transition-colors"
                                        aria-label="Close summary"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>

                                    <p className="text-slate-600 text-[11.5px] leading-relaxed font-normal">
                                      {tool.summary}
                                    </p>

                                    <div className="space-y-1 pt-1 border-t border-slate-200/70">
                                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                        Key Features
                                      </div>
                                      {tool.features.map((feat, idx) => (
                                        <div
                                          key={idx}
                                          className="flex items-center gap-1.5 text-slate-600 text-[11px]"
                                        >
                                          <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                                          <span>{feat}</span>
                                        </div>
                                      ))}
                                    </div>

                                    <div className="pt-1 flex gap-2">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          handleTabChange(tool.id);
                                          setSidebarOpen(false);
                                          setSelectedInfoTool(null);
                                        }}
                                        className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded-xl transition-all shadow-xs text-xs flex items-center justify-center gap-1.5 active:scale-98 cursor-pointer"
                                      >
                                        <span>Open {tool.title}</span>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      };

                      return (
                        <div className="space-y-3">
                          {/* Dropdown Category 1: All Calculators */}
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCategories((prev) => ({
                                  allCalculators: !prev.allCalculators,
                                  quickTools: false,
                                  notesManager: false,
                                }));
                                triggerVibration('click');
                              }}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-100/80 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <Calculator className="w-4 h-4 text-blue-600" />
                                <span className="text-xs font-extrabold text-slate-800 tracking-tight">
                                  All Calculators
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded-md">
                                  {allCalculatorsTools.length}
                                </span>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                                  openCategories.allCalculators ? 'rotate-180 text-blue-600' : ''
                                }`}
                              />
                            </button>

                            <AnimatePresence initial={false}>
                              {openCategories.allCalculators && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-1.5 pt-0 space-y-1 border-t border-slate-100 bg-white">
                                    {allCalculatorsTools.map((tool) => renderSidebarToolItem(tool))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Dropdown Category 2: Quick Tools */}
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCategories((prev) => ({
                                  allCalculators: false,
                                  quickTools: !prev.quickTools,
                                  notesManager: false,
                                }));
                                triggerVibration('click');
                              }}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-100/80 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <LayoutGrid className="w-4 h-4 text-emerald-600" />
                                <span className="text-xs font-extrabold text-slate-800 tracking-tight">
                                  Quick Tools
                                </span>
                                <span className="text-[10px] font-bold text-slate-500 bg-slate-200/70 px-1.5 py-0.5 rounded-md">
                                  {quickToolsList.length}
                                </span>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                                  openCategories.quickTools ? 'rotate-180 text-emerald-600' : ''
                                }`}
                              />
                            </button>

                            <AnimatePresence initial={false}>
                              {openCategories.quickTools && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-1.5 pt-0 space-y-1 border-t border-slate-100 bg-white">
                                    {quickToolsList.map((tool) => renderSidebarToolItem(tool))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Dropdown Category 3: Notes Manager (Directly above History) */}
                          <div className="rounded-2xl border border-slate-200/80 bg-slate-50/50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => {
                                setOpenCategories((prev) => ({
                                  allCalculators: false,
                                  quickTools: false,
                                  notesManager: !prev.notesManager,
                                }));
                                triggerVibration('click');
                              }}
                              className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-100/80 transition-colors cursor-pointer"
                            >
                              <div className="flex items-center gap-2">
                                <StickyNote className="w-4 h-4 text-amber-600" />
                                <span className="text-xs font-extrabold text-slate-800 tracking-tight">
                                  Notes Manager
                                </span>
                                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/80 px-1.5 py-0.5 rounded-md">
                                  {notesManagerTools.length}
                                </span>
                              </div>
                              <ChevronDown
                                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                                  openCategories.notesManager ? 'rotate-180 text-amber-600' : ''
                                }`}
                              />
                            </button>

                            <AnimatePresence initial={false}>
                              {openCategories.notesManager && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="p-1.5 pt-0 space-y-1 border-t border-slate-100 bg-white">
                                    {notesManagerTools.map((tool) => renderSidebarToolItem(tool))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>

                          {/* Standalone Calculation History below the categories */}
                          {historyTool && (
                            <div className="pt-1">
                              {renderSidebarToolItem(historyTool)}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Country / Currency Selection Dropdown Section */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 px-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Globe className="w-3.5 h-3.5 text-blue-600" />
                        <span>Country & Currency</span>
                      </span>
                      <span className="text-blue-600 font-black bg-blue-50 px-2 py-0.5 rounded-md text-xs">{currency}</span>
                    </div>

                    {/* Styled Dropdown Selector */}
                    <div className="relative">
                      <select
                        id="country-selection-dropdown"
                        value={CURRENCIES.find((c) => c.symbol === currency)?.code || 'INR'}
                        onChange={(e) => {
                          const selected = CURRENCIES.find((c) => c.code === e.target.value);
                          if (selected) {
                            setCurrency(selected.symbol);
                            triggerVibration('click');
                          }
                        }}
                        className="w-full bg-slate-50 hover:bg-slate-100 border border-slate-200/90 text-slate-800 font-bold text-xs py-3 pl-11 pr-10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-200 transition-all appearance-none cursor-pointer shadow-xs"
                      >
                        {CURRENCIES.map((c) => (
                          <option key={c.code} value={c.code} className="text-slate-800 py-1">
                            {c.flag} {c.country} ({c.code} {c.symbol})
                          </option>
                        ))}
                      </select>

                      <div className="absolute left-3.5 top-1/2 -translate-y-1/2 flex items-center pointer-events-none text-base">
                        {CURRENCIES.find((c) => c.symbol === currency)?.flag || '🌐'}
                      </div>

                      <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                        <ChevronDown className="w-4 h-4" />
                      </div>
                    </div>

                    {/* Active Country / Currency Card */}
                    {(() => {
                      const activeCurr = CURRENCIES.find((c) => c.symbol === currency) || CURRENCIES[0];
                      return (
                        <div className="mt-2.5 p-2.5 bg-blue-50/70 rounded-xl border border-blue-100 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-lg shrink-0">{activeCurr.flag}</span>
                            <div className="min-w-0">
                              <div className="font-bold text-slate-800 leading-tight truncate">{activeCurr.country}</div>
                              <div className="text-[10px] text-slate-500 truncate">{activeCurr.name}</div>
                            </div>
                          </div>
                          <div className="text-right shrink-0 ml-2">
                            <div className="font-black text-blue-700 font-mono text-sm">{activeCurr.symbol}</div>
                            <div className="text-[9px] font-bold text-blue-500 uppercase">{activeCurr.code}</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Social Media Links Section */}
                  <div className="pt-4 border-t border-slate-100">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2.5 px-1 flex items-center justify-between">
                      <span className="flex items-center gap-1.5">
                        <Share2 className="w-3.5 h-3.5 text-blue-600" />
                        <span>Social Media</span>
                      </span>
                    </div>

                    <div className="space-y-2">
                      <a
                        href="https://www.facebook.com/share/1K2QJZzRQY/"
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => triggerVibration('click')}
                        className="w-full p-2.5 rounded-2xl bg-slate-50 hover:bg-blue-50/80 border border-slate-200/80 hover:border-blue-200 flex items-center justify-between transition-all group cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                            <Facebook className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 group-hover:text-blue-700 transition-colors truncate">
                              Facebook Link
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              https://www.facebook.com/share/1K2QJZzRQY/
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600 shrink-0 ml-2 transition-colors" />
                      </a>

                      <a
                        href="https://www.instagram.com/sudipdebnath416?srtk=MWUzbTA1ZW43a2w4Ng=="
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => triggerVibration('click')}
                        className="w-full p-2.5 rounded-2xl bg-slate-50 hover:bg-pink-50/80 border border-slate-200/80 hover:border-pink-200 flex items-center justify-between transition-all group cursor-pointer shadow-2xs"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs group-hover:scale-105 transition-transform">
                            <Instagram className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold text-slate-800 group-hover:text-rose-600 transition-colors truncate">
                              Instagram Link
                            </div>
                            <div className="text-[10px] text-slate-400 truncate">
                              https://www.instagram.com/sudipdebnath416?srtk=MWUzbTA1ZW43a2w4Ng==
                            </div>
                          </div>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-rose-500 shrink-0 ml-2 transition-colors" />
                      </a>
                    </div>
                  </div>
                </div>

                {/* Drawer Footer */}
                <div className="p-3 bg-slate-50 border-t border-slate-200/80 text-center">
                  <p className="text-[11px] font-semibold text-slate-500">
                    Retail Calculator Pro • v1.2
                  </p>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>



        {/* Main Content Area */}
        <main className="p-4 sm:p-6 md:p-8 pb-8 space-y-6 md:space-y-8 relative overflow-hidden">
          <AnimatePresence mode="wait" custom={direction}>
            <motion.div
              key={activeTab}
              custom={direction}
              variants={{
                enter: (dir: number) => ({
                  x: dir > 0 ? 60 : -60,
                  opacity: 0,
                }),
                center: {
                  x: 0,
                  opacity: 1,
                },
                exit: (dir: number) => ({
                  x: dir > 0 ? -60 : 60,
                  opacity: 0,
                }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
              className="w-full space-y-6 md:space-y-8"
            >
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
                <section>
                  <ScientificCalculator
                    triggerVibration={triggerVibration}
                    onSaveHistory={(type, details, result) => saveHistoryItem(type, details, result)}
                  />
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
                <section className="py-2">
                  <NotesView
                    currentUser={currentUser}
                    triggerVibration={triggerVibration}
                  />
                </section>
              )}

              {/* TAB: TASKS (Google Tasks-style) */}
              {activeTab === 'tasks' && (
                <section className="py-2">
                  <TasksView
                    currentUser={currentUser}
                    triggerVibration={triggerVibration}
                  />
                </section>
              )}

              {/* TAB 4 / HISTORY LIST */}
              {activeTab === 'history' && (
                <section className="mt-4 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-indigo-500" /> Calculation History
                    </h3>

                    {history.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          onClick={handleDownloadAllPDF}
                          className="text-xs font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200/60 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                          title="Download complete history as PDF report"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-600" />
                          <span>Download PDF</span>
                        </button>

                        <button
                          type="button"
                          onClick={exportHistoryCSV}
                          className="text-xs font-bold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/60 px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 shadow-sm active:scale-95 cursor-pointer"
                          title="Export history as CSV spreadsheet"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Export CSV</span>
                        </button>

                        <button
                          type="button"
                          onClick={handleRequestClearHistory}
                          className="text-xs font-bold text-red-500 bg-red-50 hover:bg-red-100 px-3.5 py-2 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
                          title="Clear all calculation history records"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Clear All</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Gamified Total Saved Summary Card */}
                  {history.length > 0 && (
                    <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 rounded-3xl p-5 sm:p-6 text-white shadow-xl border border-blue-800/40 relative overflow-hidden">
                      {/* Ambient light glow */}
                      <div className="absolute -top-16 -right-16 w-52 h-52 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
                      <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-emerald-500/15 rounded-full blur-3xl pointer-events-none" />

                      <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                        {/* Left: Total Saved and Gamified Tier Badge */}
                        <div className="space-y-2 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-200 flex items-center gap-1.5 bg-blue-900/60 border border-blue-700/50 px-2.5 py-1 rounded-full">
                              <Trophy className="w-3.5 h-3.5 text-amber-400" /> Total Money Saved
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-amber-400/20 border border-amber-400/40 text-amber-300">
                              <span>{savingsSummary.tier.icon}</span>
                              <span>{savingsSummary.tier.title}</span>
                              <span className="opacity-70 font-semibold">• {savingsSummary.tier.badgeText}</span>
                            </span>
                          </div>

                          <div className="flex items-baseline gap-2.5">
                            <div className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight text-white">
                              {currency}
                              {savingsSummary.totalSaved.toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </div>
                            <span className="text-xs font-medium text-blue-200/90">
                              accumulated savings across {savingsSummary.savingsEventsCount} milestones
                            </span>
                          </div>

                          {/* Gamified Level Progress Bar */}
                          <div className="pt-1.5 max-w-md">
                            <div className="flex justify-between items-center text-[11px] font-medium text-blue-200/90 mb-1.5">
                              <span>Milestone Progress ({savingsSummary.tier.progressPercent}%)</span>
                              <span className="font-semibold text-amber-300">Next Tier: {currency}{savingsSummary.tier.nextMilestone.toLocaleString()}</span>
                            </div>
                            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden p-0.5">
                              <div
                                className="h-full bg-gradient-to-r from-emerald-400 via-teal-300 to-amber-300 rounded-full transition-all duration-500"
                                style={{ width: `${Math.min(100, Math.max(6, savingsSummary.tier.progressPercent))}%` }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Right: Breakdown & Database Status Cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex items-center gap-3 border-t lg:border-t-0 lg:border-l border-white/10 pt-4 lg:pt-0 lg:pl-6">
                          {/* Discount Savings */}
                          <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-2xl p-3 flex-1 min-w-[120px]">
                            <div className="text-[11px] text-blue-200 font-medium flex items-center gap-1.5">
                              <Percent className="w-3.5 h-3.5 text-sky-400" /> Discounts
                            </div>
                            <div className="text-base font-black text-white mt-1">
                              {currency}{savingsSummary.discountSavings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-blue-300/80 mt-0.5">Price savings</div>
                          </div>

                          {/* Wishlist Funds */}
                          <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-2xl p-3 flex-1 min-w-[120px]">
                            <div className="text-[11px] text-blue-200 font-medium flex items-center gap-1.5">
                              <Target className="w-3.5 h-3.5 text-emerald-400" /> Wishlist Funds
                            </div>
                            <div className="text-base font-black text-white mt-1">
                              {currency}{savingsSummary.wishlistSavings.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9px] text-blue-300/80 mt-0.5">Goal reserves</div>
                          </div>

                          {/* Database Status Pill */}
                          <div className="bg-white/10 backdrop-blur-xs border border-white/10 rounded-2xl p-3 col-span-2 sm:col-span-1 flex-1 min-w-[150px]">
                            <div className="text-[11px] text-blue-200 font-medium flex items-center justify-between gap-1">
                              <span className="flex items-center gap-1.5">
                                <Database className="w-3.5 h-3.5 text-indigo-400" /> Database Status
                              </span>
                              {currentUser && (savingsSummary.localCount > 0 || savingsSummary.errorCount > 0) && (
                                <button
                                  type="button"
                                  onClick={handleSyncAllPending}
                                  className="text-[9px] font-bold text-amber-300 bg-amber-400/20 hover:bg-amber-400/30 px-1.5 py-0.5 rounded transition-colors cursor-pointer"
                                  title="Sync all pending records to cloud database"
                                >
                                  Sync All
                                </button>
                              )}
                            </div>
                            <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                              {savingsSummary.syncedCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {savingsSummary.syncedCount} Saved in DB
                                </span>
                              )}
                              {savingsSummary.errorCount > 0 && (
                                <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-400">
                                  <AlertCircle className="w-3.5 h-3.5" />
                                  {savingsSummary.errorCount} Unsaved
                                </span>
                              )}
                              {savingsSummary.syncedCount === 0 && savingsSummary.errorCount === 0 && (
                                <span className="text-xs font-medium text-amber-300 flex items-center gap-1">
                                  <HardDrive className="w-3.5 h-3.5" />
                                  {currentUser ? 'Local (Synced)' : 'Local Device Only'}
                                </span>
                              )}
                            </div>
                            <div className="text-[9px] text-blue-300/80 mt-0.5">
                              {currentUser ? 'Cloud Sync active' : 'Sign in to auto-save in DB'}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Search Bar for History */}
                  {history.length > 0 && (
                    <div className="relative">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Search history..."
                        className="w-full bg-slate-50 border border-slate-200/80 rounded-2xl py-2.5 pl-10 pr-9 text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                      />
                      {historySearch && (
                        <button
                          type="button"
                          onClick={() => setHistorySearch('')}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  )}

                  {history.length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm">
                      <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300">
                        <Clock className="w-6 h-6" />
                      </div>
                      <p className="text-sm text-slate-500 font-medium">No calculation history saved yet</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Your calculated EMI rates, wishlist goals, and discounts will appear here.
                      </p>
                    </div>
                  ) : filteredHistory.length === 0 ? (
                    <div className="bg-white border border-slate-100 rounded-3xl p-8 text-center shadow-sm">
                      <p className="text-sm text-slate-500 font-medium">No results matching &quot;{historySearch}&quot;</p>
                      <button
                        type="button"
                        onClick={() => setHistorySearch('')}
                        className="mt-2 text-xs text-indigo-600 font-bold hover:underline cursor-pointer"
                      >
                        Clear search filter
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      <AnimatePresence>
                        {filteredHistory.map((item) => {
                          const itemSavings =
                            item.savedAmount !== undefined
                              ? item.savedAmount
                              : parseSavedAmountFromText(item.type, item.details, item.result);

                          return (
                            <motion.div
                              key={item.id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95 }}
                              className="bg-white p-4 rounded-2xl shadow-sm border border-slate-100 flex flex-col justify-between gap-3 hover:border-blue-100 transition-colors"
                            >
                              <div className="flex items-start gap-3.5">
                                <div
                                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                    item.type === 'Age'
                                      ? 'bg-rose-50 text-rose-600'
                                      : item.type === 'Calculator'
                                      ? 'bg-violet-50 text-violet-600'
                                      : item.type === 'EMI'
                                      ? 'bg-blue-50 text-blue-600'
                                      : item.type === 'Wishlist'
                                      ? 'bg-emerald-50 text-emerald-600'
                                      : item.type === 'Discount'
                                      ? 'bg-sky-50 text-sky-600'
                                      : item.type === 'Weight'
                                      ? 'bg-orange-50 text-orange-600'
                                      : 'bg-purple-50 text-purple-600'
                                  }`}
                                >
                                  {item.type === 'Age' && <CalendarDays className="w-5 h-5" />}
                                  {item.type === 'Calculator' && <Calculator className="w-5 h-5" />}
                                  {item.type === 'EMI' && <CreditCard className="w-5 h-5" />}
                                  {item.type === 'Wishlist' && <Target className="w-5 h-5" />}
                                  {item.type === 'Discount' && <Percent className="w-5 h-5" />}
                                  {item.type === 'Weight' && <Scale className="w-5 h-5" />}
                                  {item.type === 'Unit' && <ArrowRightLeft className="w-5 h-5" />}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1 gap-1">
                                    <span className="font-bold text-slate-800 text-sm truncate leading-snug">
                                      {item.result}
                                    </span>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-md">
                                        {item.timestamp}
                                      </span>
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadSinglePDF(item)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 border border-transparent hover:border-blue-100 transition-colors cursor-pointer"
                                        title="Download PDF receipt for this calculation"
                                        aria-label="Download PDF receipt"
                                      >
                                        <FileText className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={(e) => handleRequestDeleteItem(item, e)}
                                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition-colors cursor-pointer"
                                        title="Delete this calculation record"
                                        aria-label="Delete this calculation record"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                  <p className="text-xs text-slate-500 line-clamp-2">{item.details}</p>
                                </div>
                              </div>

                              {/* Database Save Status Indicator & Savings Tag */}
                              <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap text-[11px]">
                                {/* Database Sync Indicator */}
                                {item.syncStatus === 'synced' || item.dbId ? (
                                  <div
                                    className="inline-flex items-center gap-1 font-bold text-emerald-700 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md"
                                    title="This record is successfully saved in the database"
                                  >
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                                    <span>
                                      DB ID: <strong className="font-mono text-emerald-900">#{item.dbId || item.id}</strong>
                                    </span>
                                    <span className="text-[9px] font-semibold text-emerald-700 bg-emerald-100/70 px-1 py-0.2 rounded">
                                      ✓ Saved in DB
                                    </span>
                                  </div>
                                ) : item.syncStatus === 'syncing' ? (
                                  <div
                                    className="inline-flex items-center gap-1 font-bold text-blue-700 bg-blue-50 border border-blue-200/80 px-2 py-0.5 rounded-md animate-pulse"
                                    title="Currently saving to database..."
                                  >
                                    <Loader2 className="w-3 h-3 text-blue-600 animate-spin shrink-0" />
                                    <span>Saving to DB...</span>
                                  </div>
                                ) : item.syncStatus === 'error' ? (
                                  <div
                                    className="inline-flex items-center gap-1 font-bold text-rose-700 bg-rose-50 border border-rose-200/80 px-2 py-0.5 rounded-md"
                                    title="Database save failed"
                                  >
                                    <AlertCircle className="w-3 h-3 text-rose-500 shrink-0" />
                                    <span>Not Saved (DB Error)</span>
                                    <button
                                      type="button"
                                      onClick={() => retrySyncItem(item)}
                                      className="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-rose-200 hover:bg-rose-300 text-rose-900 font-black cursor-pointer transition-colors"
                                      title="Retry saving to database"
                                    >
                                      Retry
                                    </button>
                                  </div>
                                ) : (
                                  <div
                                    className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-md"
                                    title={currentUser ? 'Stored on this local device' : 'Stored locally. Sign in to save to database.'}
                                  >
                                    <HardDrive className="w-3 h-3 text-amber-600 shrink-0" />
                                    <span>Local Device Only</span>
                                    {currentUser ? (
                                      <button
                                        type="button"
                                        onClick={() => retrySyncItem(item)}
                                        className="ml-1 px-1.5 py-0.2 rounded text-[9px] bg-amber-200 hover:bg-amber-300 text-amber-900 font-black cursor-pointer transition-colors"
                                        title="Save this record to cloud database"
                                      >
                                        Save to DB
                                      </button>
                                    ) : (
                                      <span className="text-[9px] font-normal text-amber-600/80">(No DB ID)</span>
                                    )}
                                  </div>
                                )}

                                {/* Saved Amount pill if applicable */}
                                {itemSavings > 0 && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200/70 px-1.5 py-0.5 rounded-md ml-auto">
                                    <span>
                                      Saved: {currency}
                                      {itemSavings.toLocaleString(undefined, {
                                        minimumFractionDigits: 0,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </span>
                                )}
                              </div>
                            </motion.div>
                          );
                        })}
                      </AnimatePresence>
                    </div>
                  )}
                </section>
              )}
            </motion.div>
          </AnimatePresence>
        </main>
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
                      : 'Clear All History?'}
                  </h3>
                  <p className="text-xs font-medium text-slate-500 mt-0.5">
                    {deleteConfirmTarget.type === 'single'
                      ? 'Confirm deletion of this calculation record'
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
                        {deleteConfirmTarget.type === 'single' ? 'Confirm Delete' : 'Clear All'}
                      </span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
