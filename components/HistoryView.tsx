'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock,
  Search,
  X,
  MoreHorizontal,
  MoreVertical,
  Star,
  Trash2,
  Copy,
  Check,
  Eye,
  FileText,
  Download,
  RefreshCw,
  Calculator,
  CreditCard,
  ArrowRightLeft,
  Percent,
  Scale,
  Target,
  Coins,
  CalendarDays,
  AlertCircle,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoryItem, parseSavedAmountFromText } from '../lib/historyStorage';

export type HistoryCategoryFilter =
  | 'all'
  | 'favorites'
  | 'Calculator'
  | 'Unit'
  | 'EMI'
  | 'Discount'
  | 'Financial'
  | 'Age';

interface HistoryViewProps {
  history: HistoryItem[];
  currency: string;
  currentUser: any;
  refreshNotice?: string | null;
  onRefreshHistory: () => Promise<void> | void;
  onInspectItem: (item: HistoryItem) => void;
  onToggleFavorite: (itemId: string) => void;
  onRequestDeleteItem: (item: HistoryItem) => void;
  onRequestClearAll: () => void;
  onDownloadSinglePDF: (item: HistoryItem) => void;
  onDownloadAllPDF: (items: HistoryItem[]) => void;
  onExportCSV: (items: HistoryItem[]) => void;
  onRetrySyncItem: (item: HistoryItem) => void;
}

interface CategoryVisual {
  label: string;
  iconBg: string;
  iconText: string;
  labelText: string;
  Icon: React.ComponentType<{ className?: string }>;
}

function getCategoryVisual(type: string): CategoryVisual {
  switch (type) {
    case 'Calculator':
    case 'Basic':
      return {
        label: 'Scientific',
        iconBg: 'bg-violet-50',
        iconText: 'text-violet-600',
        labelText: 'text-violet-700',
        Icon: Calculator,
      };
    case 'EMI':
      return {
        label: 'EMI',
        iconBg: 'bg-emerald-50',
        iconText: 'text-emerald-600',
        labelText: 'text-emerald-700',
        Icon: CreditCard,
      };
    case 'Unit':
      return {
        label: 'Unit',
        iconBg: 'bg-amber-50',
        iconText: 'text-amber-600',
        labelText: 'text-amber-700',
        Icon: ArrowRightLeft,
      };
    case 'Weight':
      return {
        label: 'Weight',
        iconBg: 'bg-orange-50',
        iconText: 'text-orange-600',
        labelText: 'text-orange-700',
        Icon: Scale,
      };
    case 'Discount':
      return {
        label: 'Discount',
        iconBg: 'bg-rose-50',
        iconText: 'text-rose-600',
        labelText: 'text-rose-700',
        Icon: Percent,
      };
    case 'Wishlist':
      return {
        label: 'Wishlist',
        iconBg: 'bg-indigo-50',
        iconText: 'text-indigo-600',
        labelText: 'text-indigo-700',
        Icon: Target,
      };
    case 'Currency':
      return {
        label: 'Currency',
        iconBg: 'bg-teal-50',
        iconText: 'text-teal-600',
        labelText: 'text-teal-700',
        Icon: Coins,
      };
    case 'Age':
      return {
        label: 'Age',
        iconBg: 'bg-sky-50',
        iconText: 'text-sky-600',
        labelText: 'text-sky-700',
        Icon: CalendarDays,
      };
    default:
      return {
        label: type || 'Calculation',
        iconBg: 'bg-slate-100',
        iconText: 'text-slate-600',
        labelText: 'text-slate-700',
        Icon: Calculator,
      };
  }
}

function resolveItemDate(item: HistoryItem): Date | null {
  if (item.createdAt) {
    const parsed = new Date(item.createdAt);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const idMatch = item.id?.match(/(\d{13})/);
  if (idMatch) {
    const ms = Number(idMatch[1]);
    if (!Number.isNaN(ms) && ms > 1500000000000) {
      return new Date(ms);
    }
  }
  return null;
}

function getDateGroupMeta(item: HistoryItem): {
  groupKey: string;
  groupLabel: string;
  isToday: boolean;
  displayTime: string;
  sortMs: number;
} {
  const dateObj = resolveItemDate(item);
  if (!dateObj) {
    return {
      groupKey: 'today',
      groupLabel: 'Today',
      isToday: true,
      displayTime: item.timestamp || '',
      sortMs: Date.now(),
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfItemDay = new Date(dateObj.getFullYear(), dateObj.getMonth(), dateObj.getDate()).getTime();

  const timeStr =
    item.timestamp ||
    dateObj.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });

  if (startOfItemDay === startOfToday) {
    return {
      groupKey: `day-${startOfItemDay}`,
      groupLabel: 'Today',
      isToday: true,
      displayTime: timeStr,
      sortMs: dateObj.getTime(),
    };
  }

  if (startOfItemDay === startOfYesterday) {
    return {
      groupKey: `day-${startOfItemDay}`,
      groupLabel: 'Yesterday',
      isToday: false,
      displayTime: `Yesterday, ${timeStr}`,
      sortMs: dateObj.getTime(),
    };
  }

  const sameYear = dateObj.getFullYear() === now.getFullYear();
  const formattedDate = dateObj.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  });

  return {
    groupKey: `day-${startOfItemDay}`,
    groupLabel: formattedDate,
    isToday: false,
    displayTime: `${formattedDate}, ${timeStr}`,
    sortMs: dateObj.getTime(),
  };
}

function formatCleanResult(rawResult: string): string {
  const cleaned = (rawResult || '').replace(/^Converted Result:\s*/i, '').trim();
  if (!cleaned) return '=';
  return cleaned.startsWith('=') ? cleaned : `= ${cleaned}`;
}

export default function HistoryView({
  history,
  currency,
  currentUser,
  refreshNotice,
  onRefreshHistory,
  onInspectItem,
  onToggleFavorite,
  onRequestDeleteItem,
  onRequestClearAll,
  onDownloadSinglePDF,
  onDownloadAllPDF,
  onExportCSV,
  onRetrySyncItem,
}: HistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HistoryCategoryFilter>('all');
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isRefreshingLocal, setIsRefreshingLocal] = useState(false);

  const headerMenuRef = useRef<HTMLDivElement | null>(null);

  // Close menus on outside pointer click or Escape
  useEffect(() => {
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (isHeaderMenuOpen && headerMenuRef.current && !headerMenuRef.current.contains(target)) {
        setIsHeaderMenuOpen(false);
      }
      if (openCardMenuId && !target?.closest('[data-card-menu-root="true"]')) {
        setOpenCardMenuId(null);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsHeaderMenuOpen(false);
        setOpenCardMenuId(null);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderMenuOpen, openCardMenuId]);

  const favoritesCount = useMemo(
    () => history.filter((item) => Boolean(item.isFavorite)).length,
    [history]
  );

  const categoryChips: {
    id: HistoryCategoryFilter;
    label: string;
    activeClass: string;
    inactiveClass: string;
  }[] = [
    {
      id: 'all',
      label: 'All',
      activeClass: 'bg-slate-900 text-white border-slate-900 shadow-xs',
      inactiveClass: 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100',
    },
    {
      id: 'favorites',
      label: favoritesCount > 0 ? `Favorites (${favoritesCount})` : 'Favorites',
      activeClass: 'bg-amber-500 text-white border-amber-500 shadow-xs',
      inactiveClass: 'bg-amber-50/70 text-amber-800 border-amber-200/80 hover:bg-amber-100/70',
    },
    {
      id: 'Calculator',
      label: 'Scientific',
      activeClass: 'bg-violet-600 text-white border-violet-600 shadow-xs',
      inactiveClass: 'bg-slate-100/90 text-slate-700 border-slate-200 hover:bg-violet-50',
    },
    {
      id: 'Unit',
      label: 'Unit',
      activeClass: 'bg-amber-600 text-white border-amber-600 shadow-xs',
      inactiveClass: 'bg-amber-50/80 text-amber-800 border-amber-200 hover:bg-amber-100',
    },
    {
      id: 'EMI',
      label: 'EMI',
      activeClass: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
      inactiveClass: 'bg-emerald-50/80 text-emerald-800 border-emerald-200 hover:bg-emerald-100',
    },
    {
      id: 'Discount',
      label: 'Discount',
      activeClass: 'bg-rose-600 text-white border-rose-600 shadow-xs',
      inactiveClass: 'bg-rose-50/80 text-rose-800 border-rose-200 hover:bg-rose-100',
    },
    {
      id: 'Financial',
      label: 'Financial',
      activeClass: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
      inactiveClass: 'bg-violet-50/80 text-violet-800 border-violet-200 hover:bg-violet-100',
    },
    {
      id: 'Age',
      label: 'Age',
      activeClass: 'bg-sky-600 text-white border-sky-600 shadow-xs',
      inactiveClass: 'bg-sky-50/80 text-sky-800 border-sky-200 hover:bg-sky-100',
    },
  ];

  const filteredHistory = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return history.filter((item) => {
      if (selectedCategory === 'favorites' && !item.isFavorite) return false;
      if (selectedCategory === 'Calculator' && item.type !== 'Calculator' && item.type !== 'Basic') {
        return false;
      }
      if (selectedCategory === 'Unit' && item.type !== 'Unit' && item.type !== 'Weight') {
        return false;
      }
      if (selectedCategory === 'EMI' && item.type !== 'EMI') return false;
      if (selectedCategory === 'Discount' && item.type !== 'Discount') return false;
      if (
        selectedCategory === 'Financial' &&
        item.type !== 'Wishlist' &&
        item.type !== 'Currency' &&
        item.type !== 'Financial'
      ) {
        return false;
      }
      if (selectedCategory === 'Age' && item.type !== 'Age') return false;

      if (q !== '') {
        return (
          item.type.toLowerCase().includes(q) ||
          item.details.toLowerCase().includes(q) ||
          item.result.toLowerCase().includes(q) ||
          item.timestamp.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [history, searchQuery, selectedCategory]);

  // Group filtered items chronologically by calendar date
  const groupedHistory = useMemo(() => {
    const groupsMap = new Map<
      string,
      {
        key: string;
        label: string;
        sortMs: number;
        items: { item: HistoryItem; displayTime: string }[];
      }
    >();

    for (const item of filteredHistory) {
      const meta = getDateGroupMeta(item);
      const existing = groupsMap.get(meta.groupKey);
      if (existing) {
        existing.items.push({ item, displayTime: meta.displayTime });
      } else {
        groupsMap.set(meta.groupKey, {
          key: meta.groupKey,
          label: meta.groupLabel,
          sortMs: meta.sortMs,
          items: [{ item, displayTime: meta.displayTime }],
        });
      }
    }

    return Array.from(groupsMap.values()).sort((a, b) => b.sortMs - a.sortMs);
  }, [filteredHistory]);

  const handleCopyItem = async (item: HistoryItem) => {
    try {
      const text = `${item.details} ${formatCleanResult(item.result)}`;
      await navigator.clipboard.writeText(text);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // Ignore clipboard failures
    }
    setOpenCardMenuId(null);
  };

  const handleMenuRefresh = async () => {
    setIsHeaderMenuOpen(false);
    setIsRefreshingLocal(true);
    try {
      await onRefreshHistory();
    } finally {
      setTimeout(() => setIsRefreshingLocal(false), 350);
    }
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-4 sm:space-y-5 pb-12">
      {/* Header Title + Inline Status */}
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
          Calculator History
        </h2>

        {(refreshNotice || isRefreshingLocal) && (
          <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 shrink-0">
            {isRefreshingLocal ? (
              <RefreshCw className="w-3 h-3 text-emerald-600 animate-spin" />
            ) : (
              <Check className="w-3 h-3 text-emerald-600" />
            )}
            <span>{isRefreshingLocal ? 'Refreshing...' : refreshNotice}</span>
          </span>
        )}
      </div>

      {/* Shortened Search Bar + Three-Dot Overflow Menu */}
      <div className="flex items-center gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search calculations..."
            aria-label="Search calculation history"
            className="w-full min-h-[44px] bg-white border border-slate-200/90 text-slate-900 font-medium text-xs sm:text-sm rounded-2xl py-2 pl-10 pr-9 shadow-[0_1px_4px_rgba(15,23,42,0.03)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
              aria-label="Clear calculation search"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Three-Dot Overflow Action Menu replacing dedicated refresh & toolbar clutter */}
        <div className="relative shrink-0" ref={headerMenuRef}>
          <button
            type="button"
            id="history-header-menu-btn"
            onClick={() => setIsHeaderMenuOpen((prev) => !prev)}
            className="min-w-[44px] min-h-[44px] rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition-all cursor-pointer"
            aria-label="History actions menu"
            aria-expanded={isHeaderMenuOpen}
            title="More options"
          >
            <MoreVertical className="w-5 h-5" />
          </button>

          <AnimatePresence>
            {isHeaderMenuOpen && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                transition={{ duration: 0.14 }}
                className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSelectedCategory((prev) => (prev === 'favorites' ? 'all' : 'favorites'));
                    setIsHeaderMenuOpen(false);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
                >
                  <span className="flex items-center gap-2">
                    <Star
                      className={`w-4 h-4 ${
                        selectedCategory === 'favorites'
                          ? 'text-amber-500 fill-amber-400'
                          : 'text-slate-400'
                      }`}
                    />
                    <span>Favorites Only</span>
                  </span>
                  {selectedCategory === 'favorites' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                </button>

                <button
                  type="button"
                  onClick={handleMenuRefresh}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                  <span>Sync & Refresh View</span>
                </button>

                {filteredHistory.length > 0 && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        onDownloadAllPDF(filteredHistory);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span>Download PDF Report</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        onExportCSV(filteredHistory);
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Download className="w-4 h-4 text-indigo-600" />
                      <span>Export CSV Spreadsheet</span>
                    </button>
                  </>
                )}

                {history.length > 0 && (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        onRequestClearAll();
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>Clear All History</span>
                    </button>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Category Filter Chips (Horizontal Single-Line Interactive Controls) */}
      <div
        role="tablist"
        aria-label="Filter history by category"
        className="flex items-center gap-2 overflow-x-auto pb-1.5 -mx-0.5 px-0.5"
      >
        {categoryChips.map((chip) => {
          const isActive = selectedCategory === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-history-chip-active={isActive ? 'true' : undefined}
              onClick={() => setSelectedCategory(chip.id)}
              className={`px-3.5 py-2 min-h-[36px] rounded-full text-xs font-semibold border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                isActive ? chip.activeClass : chip.inactiveClass
              }`}
            >
              {chip.id === 'favorites' && (
                <Star
                  className={`w-3.5 h-3.5 ${
                    isActive ? 'fill-white text-white' : 'fill-amber-400 text-amber-500'
                  }`}
                />
              )}
              <span>{chip.label}</span>
            </button>
          );
        })}
      </div>

      {/* Empty States or Chronological Date-Grouped Cards */}
      {history.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 text-center shadow-xs">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400 border border-slate-100">
            <Clock className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">No calculation history yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Results from your Scientific Calculator, EMI, Discount, and Unit tools will be organized here by date.
          </p>
        </div>
      ) : filteredHistory.length === 0 ? (
        <div className="bg-white border border-slate-200/80 rounded-3xl p-8 text-center shadow-xs space-y-2">
          <p className="text-sm font-bold text-slate-700">
            {searchQuery
              ? `No calculations matching "${searchQuery}"`
              : 'No calculations in this category'}
          </p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setSelectedCategory('all');
            }}
            className="px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedHistory.map((group) => (
            <section key={group.key} aria-label={group.label} className="space-y-3">
              <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-0.5">
                {group.label}
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {group.items.map(({ item, displayTime }) => {
                  const visual = getCategoryVisual(item.type);
                  const IconComponent = visual.Icon;
                  const cleanResult = formatCleanResult(item.result);
                  const itemSavings =
                    item.savedAmount !== undefined
                      ? item.savedAmount
                      : parseSavedAmountFromText(item.type, item.details, item.result);
                  const isMenuOpen = openCardMenuId === item.id;

                  return (
                    <motion.article
                      key={item.id}
                      layout="position"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.16 }}
                      onClick={() => onInspectItem(item)}
                      className="bg-white rounded-2xl p-4 border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.04)] hover:border-slate-300 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between gap-2.5 text-left relative"
                    >
                      {/* Top Card Row: Category Badge + Timestamp + Favorite Indicator + Card 3-Dot Menu */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <span
                            className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${visual.iconBg} ${visual.iconText}`}
                          >
                            <IconComponent className="w-4 h-4" />
                          </span>
                          <span className={`text-xs font-bold truncate ${visual.labelText}`}>
                            {visual.label}
                          </span>
                          <span className="text-slate-300 text-xs" aria-hidden="true">
                            ·
                          </span>
                          <span className="text-[11px] font-medium text-slate-500 truncate tabular-nums">
                            {displayTime}
                          </span>
                          {item.isFavorite && (
                            <Star
                              className="w-3.5 h-3.5 text-amber-500 fill-amber-400 shrink-0"
                              aria-label="Favorited calculation"
                            />
                          )}
                        </div>

                        {/* Card Three-Dot Action Menu */}
                        <div
                          className="relative shrink-0"
                          data-card-menu-root="true"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setOpenCardMenuId((prev) => (prev === item.id ? null : item.id))
                            }
                            className="w-9 h-9 -mr-1.5 -mt-1 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Calculation actions"
                            aria-expanded={isMenuOpen}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </button>

                          <AnimatePresence>
                            {isMenuOpen && (
                              <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-full mt-1 w-44 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-30"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleFavorite(item.id);
                                    setOpenCardMenuId(null);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <Star
                                    className={`w-3.5 h-3.5 ${
                                      item.isFavorite
                                        ? 'text-amber-500 fill-amber-400'
                                        : 'text-slate-400'
                                    }`}
                                  />
                                  <span>{item.isFavorite ? 'Remove Favorite' : 'Favorite'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => void handleCopyItem(item)}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                >
                                  {copiedId === item.id ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  ) : (
                                    <Copy className="w-3.5 h-3.5 text-slate-400" />
                                  )}
                                  <span>{copiedId === item.id ? 'Copied!' : 'Copy Result'}</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenCardMenuId(null);
                                    onInspectItem(item);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <Eye className="w-3.5 h-3.5 text-slate-400" />
                                  <span>View Details</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenCardMenuId(null);
                                    onDownloadSinglePDF(item);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <FileText className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Download PDF</span>
                                </button>

                                <div className="my-1 border-t border-slate-100" />

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenCardMenuId(null);
                                    onRequestDeleteItem(item);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-bold text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                  <span>Delete</span>
                                </button>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      </div>

                      {/* Equation / Input Summary */}
                      <p className="text-xs sm:text-sm font-medium text-slate-600 line-clamp-2 leading-snug">
                        {item.details}
                      </p>

                      {/* Primary Result Display */}
                      <div className="flex items-baseline justify-between gap-2 pt-0.5">
                        <p className="text-lg sm:text-xl font-black text-slate-900 tabular-nums tracking-tight truncate">
                          {cleanResult}
                        </p>

                        {copiedId === item.id && (
                          <span className="text-[11px] font-bold text-emerald-600 shrink-0">
                            Copied
                          </span>
                        )}
                      </div>

                      {/* Quiet Optional Metadata Line (Savings or Retry if sync error) */}
                      {(itemSavings > 0 || item.syncStatus === 'error') && (
                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                          {itemSavings > 0 ? (
                            <span className="font-semibold text-emerald-700 tabular-nums">
                              Saved {currency}
                              {itemSavings.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          ) : (
                            <span />
                          )}

                          {item.syncStatus === 'error' && currentUser && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetrySyncItem(item);
                              }}
                              className="inline-flex items-center gap-1 font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
                            >
                              <AlertCircle className="w-3 h-3" />
                              <span>Retry sync</span>
                            </button>
                          )}
                        </div>
                      )}
                    </motion.article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Footer Total Count matching Calculator Max layout */}
      <div className="pt-2 pb-4 text-center">
        <p className="text-xs font-semibold text-slate-500 tabular-nums">
          Total Items: {filteredHistory.length}
          {filteredHistory.length !== history.length ? ` of ${history.length}` : ''}
        </p>
      </div>
    </div>
  );
}
