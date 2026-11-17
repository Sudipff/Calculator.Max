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
  Cloud,
  CloudOff,
  User,
  ChevronRight,
  CheckSquare,
  StickyNote,
  Share2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { HistoryItem, parseSavedAmountFromText } from '../lib/historyStorage';
import { formatHistoryItemsForShare, shareTextContent } from '../lib/shareUtils';
import {
  getLocalNotes,
  saveLocalNotes,
  upsertNoteToSupabase,
  getLocalTasks,
  saveLocalTasks,
  upsertTaskToSupabase,
  getLocalTaskLists,
} from '../lib/notesTasksStorage';
import {
  checkStorageQuotaBeforeAdd,
  refreshLocalStorageSnapshot,
  triggerStorageFullPopup,
} from '../lib/storageSyncClient';
import type { NoteItem, TaskItem } from '../lib/types/notes-tasks';
import { OfflineWifiIndicator } from '@/components/PwaRuntime';
import { showNotification, suppressOfflineSyncNotifications } from '@/lib/notifications';

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
  onRefreshHistory: () => Promise<void> | void;
  onInspectItem: (item: HistoryItem) => void;
  onToggleFavorite: (itemId: string) => void;
  onRequestDeleteItem: (item: HistoryItem) => void;
  onRequestDeleteBatch?: (items: HistoryItem[]) => void;
  onRequestClearAll: () => void;
  onDownloadSinglePDF: (item: HistoryItem) => void;
  onDownloadAllPDF: (items: HistoryItem[]) => void;
  onExportCSV: (items: HistoryItem[]) => void;
  onRetrySyncItem: (item: HistoryItem) => void;
  onRemoveItemSilent?: (item: HistoryItem) => Promise<void> | void;
  onOpenProfile?: () => void;
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

  const qtyMatch = cleaned.match(/^(?:Calculated Purchase Quantity:\s*|Quantity\s*=\s*)(.+)$/i);
  if (qtyMatch) {
    return `Quantity = ${qtyMatch[1].trim()}`;
  }

  const priceMatch = cleaned.match(/^(?:Calculated Total Price:\s*|Price\s*=\s*)(.+)$/i);
  if (priceMatch) {
    return `Price = ${priceMatch[1].trim()}`;
  }

  return cleaned.startsWith('=') ? cleaned : `= ${cleaned}`;
}

export default function HistoryView({
  history,
  currency,
  currentUser,
  onRefreshHistory,
  onInspectItem,
  onToggleFavorite,
  onRequestDeleteItem,
  onRequestDeleteBatch,
  onRequestClearAll,
  onDownloadSinglePDF,
  onDownloadAllPDF,
  onExportCSV,
  onRetrySyncItem,
  onRemoveItemSilent,
  onOpenProfile,
}: HistoryViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<HistoryCategoryFilter>('all');
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [openCardMenuId, setOpenCardMenuId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [transferringState, setTransferringState] = useState<{
    itemId: string;
    kind: 'note' | 'task';
  } | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
  }, []);

  const showActionToast = (message: string, kind: 'note' | 'task' | 'share') => {
    showNotification({
      id: `history-${kind}`,
      message,
      type: 'success',
      duration: 2000,
    });
  };

  const handleShareHistoryItems = async (items: HistoryItem[]) => {
    if (items.length === 0) return;
    const payload = formatHistoryItemsForShare(
      items,
      (item) => {
        const visual = getCategoryVisual(item.type);
        const cleanResult = formatCleanResult(item.result);
        const savings =
          item.savedAmount !== undefined
            ? item.savedAmount
            : parseSavedAmountFromText(item.type, item.details, item.result);
        const dt = item.createdAt ? new Date(item.createdAt) : null;
        const displayTime =
          dt && !isNaN(dt.getTime())
            ? dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            : item.timestamp || '';
        return { label: visual.label, cleanResult, displayTime, savings };
      },
      currency
    );
    const outcome = await shareTextContent(payload);
    if (outcome === 'shared') {
      showActionToast('Shared', 'share');
    } else if (outcome === 'copied') {
      showActionToast('Copied to share', 'share');
    }
  };

  const handleAddHistoryToNote = async (
    item: HistoryItem,
    cleanResult: string,
    displayTime: string,
    visualLabel: string,
    itemSavings: number
  ) => {
    setOpenCardMenuId(null);
    if (transferringState) return;

    const uid = currentUser?.id;
    const nowIso = new Date().toISOString();
    const lines = [
      item.details,
      '',
      `Result: ${cleanResult}`,
      ...(itemSavings > 0
        ? [
            `Saved: ${currency}${itemSavings.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}`,
          ]
        : []),
      `Recorded: ${displayTime}`,
    ];

    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const newNote: NoteItem = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: uid,
      title: `${visualLabel} Calculation`,
      content: lines.join('\n'),
      color: 'sky',
      isPinned: false,
      isChecklist: false,
      checklistItems: [],
      labels: [visualLabel],
      reminderAt: null,
      isEmergency: false,
      sourceHistory: {
        id: item.id,
        dbId: item.dbId ?? null,
        type: item.type,
        details: item.details,
        result: item.result,
        savedAmount: item.savedAmount,
        isFavorite: Boolean(item.isFavorite),
        createdAt: item.createdAt || nowIso,
        timestamp: item.timestamp || displayTime,
      },
      syncStatus: isOffline || !uid ? 'unsynced' : 'synced',
      createdOffline: isOffline,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const quota = checkStorageQuotaBeforeAdd(uid, newNote, item);
    if (!quota.allowed) {
      triggerStorageFullPopup(quota.snapshot, uid);
      return;
    }

    if (uid) {
      suppressOfflineSyncNotifications(5000);
    }

    const existingNotes = getLocalNotes(uid);
    const updatedNotes = [newNote, ...existingNotes];
    saveLocalNotes(updatedNotes, uid);

    // Immediately remove from History cleanly, stay on History view, and show confirmation toast
    setTransferringState({ itemId: item.id, kind: 'note' });
    const removePromise = Promise.resolve(onRemoveItemSilent?.(item));
    refreshLocalStorageSnapshot(uid);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('calcmax:notes-tasks-updated'));
    }

    showActionToast('Saved to Note', 'note');

    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      setTransferringState(null);
    }, 260);

    if (uid) {
      const [, upsertRes] = await Promise.all([removePromise, upsertNoteToSupabase(newNote, uid)]);
      if (!upsertRes.success) {
        const latestNotes = getLocalNotes(uid);
        saveLocalNotes(
          latestNotes.map((n) => (n.id === newNote.id ? { ...n, syncStatus: 'unsynced' } : n)),
          uid
        );
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('calcmax:notes-tasks-updated'));
        }
      }
    }
  };

  const handleAddHistoryToTask = async (
    item: HistoryItem,
    cleanResult: string,
    displayTime: string,
    visualLabel: string,
    itemSavings: number
  ) => {
    setOpenCardMenuId(null);
    if (transferringState) return;

    const uid = currentUser?.id;
    const nowIso = new Date().toISOString();
    const lists = getLocalTaskLists(uid);
    const targetListId = lists[0]?.id || 'default-my-tasks';

    const descLines = [
      item.details,
      ...(itemSavings > 0
        ? [
            `Saved: ${currency}${itemSavings.toLocaleString(undefined, {
              minimumFractionDigits: 0,
              maximumFractionDigits: 2,
            })}`,
          ]
        : []),
      `Recorded: ${displayTime}`,
    ];

    const newTask: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: uid,
      listId: targetListId,
      parentId: null,
      title: `${visualLabel}: ${cleanResult}`,
      description: descLines.join('\n'),
      completed: false,
      isStarred: false,
      priority: 'medium',
      dueDate: null,
      reminderAt: null,
      sourceHistory: {
        id: item.id,
        dbId: item.dbId ?? null,
        type: item.type,
        details: item.details,
        result: item.result,
        savedAmount: item.savedAmount,
        isFavorite: Boolean(item.isFavorite),
        createdAt: item.createdAt || nowIso,
        timestamp: item.timestamp || displayTime,
      },
      syncStatus: 'unsynced',
      createdAt: nowIso,
      updatedAt: nowIso,
      subtasks: [],
    };

    const quota = checkStorageQuotaBeforeAdd(uid, newTask, item);
    if (!quota.allowed) {
      triggerStorageFullPopup(quota.snapshot, uid);
      return;
    }

    if (uid) {
      suppressOfflineSyncNotifications(5000);
    }

    const existingTasks = getLocalTasks(uid);
    const updatedTasks = [newTask, ...existingTasks];
    saveLocalTasks(updatedTasks, uid);

    // Immediately remove from History cleanly, stay on History view, and show confirmation toast
    setTransferringState({ itemId: item.id, kind: 'task' });
    const removePromise = Promise.resolve(onRemoveItemSilent?.(item));
    refreshLocalStorageSnapshot(uid);

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('calcmax:notes-tasks-updated'));
    }

    showActionToast('Saved to Task', 'task');

    if (navTimerRef.current) clearTimeout(navTimerRef.current);
    navTimerRef.current = setTimeout(() => {
      setTransferringState(null);
    }, 260);

    if (uid) {
      await Promise.all([removePromise, upsertTaskToSupabase(newTask, uid)]);
    }
  };

  // Batch Selection State (Activated by Long-Press)
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const isLongPressFiredRef = useRef(false);

  const headerMenuRef = useRef<HTMLDivElement | null>(null);
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);

  const handleScrollCategoriesRight = () => {
    categoryScrollRef.current?.scrollBy({ left: 160, behavior: 'smooth' });
  };

  // Prune stale selected IDs if history items are deleted
  useEffect(() => {
    const validIds = new Set(history.map((item) => item.id));
    setSelectedItemIds((prev) => {
      const next = prev.filter((id) => validIds.has(id));
      return next.length === prev.length ? prev : next;
    });
  }, [history]);

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
        setSelectedItemIds([]);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHeaderMenuOpen, openCardMenuId]);

  // Long-press detection helpers for touch and mouse
  const handleStartLongPress = (id: string, clientX?: number, clientY?: number) => {
    if (selectedItemIds.length > 0) return;
    isLongPressFiredRef.current = false;
    if (clientX !== undefined && clientY !== undefined) {
      touchStartPosRef.current = { x: clientX, y: clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressFiredRef.current = true;
      setOpenCardMenuId(null);
      setSelectedItemIds([id]);
    }, 450);
  };

  const handleCancelLongPress = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartPosRef.current && e.touches[0]) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      if (dx > 10 || dy > 10) {
        handleCancelLongPress();
      }
    }
  };

  const handleToggleSelectItem = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleCancelSelection = () => {
    setSelectedItemIds([]);
  };

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
      showNotification({
        id: 'history-copy',
        message: 'Copied to clipboard',
        type: 'success',
        duration: 1800,
      });
    } catch {
      showNotification({
        id: 'history-copy',
        message: 'Failed to copy result',
        type: 'error',
        duration: 2400,
      });
    }
    setOpenCardMenuId(null);
  };

  const handleMenuRefresh = async () => {
    setIsHeaderMenuOpen(false);
    await onRefreshHistory();
  };

  return (
    <div className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-4 pb-12">
      {/* Sticky Top Header: Title + Profile Avatar, Shortened Search Bar + 3-Dot Menu, and Category Filter Chips */}
      <div
        data-sticky-secondary-header="history"
        className="sticky top-0 z-30 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 pt-2.5 pb-2.5 bg-[#f2f8fc]/95 backdrop-blur-md border-b border-slate-200/70 shadow-[0_2px_10px_rgba(15,23,42,0.03)] space-y-2.5"
      >
        {/* Header Title + Top-Right Profile Avatar */}
        <div className="flex items-center justify-between gap-3 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
              Calculator History
            </h2>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <OfflineWifiIndicator />
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              whileHover={{ scale: 1.04 }}
              onClick={() => onOpenProfile?.()}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full hover:bg-slate-200/60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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

        {/* Shortened Search Bar + Three-Dot Overflow Menu */}
        <div className="relative flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search calculations..."
              aria-label="Search calculation history"
              className="w-full min-h-[42px] bg-white border border-slate-200/90 text-slate-900 font-medium text-xs sm:text-sm rounded-2xl py-2 pl-10 pr-9 shadow-[0_1px_4px_rgba(15,23,42,0.03)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
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
              className="min-w-[42px] min-h-[42px] rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition-all cursor-pointer"
              aria-label="History actions menu"
              aria-expanded={isHeaderMenuOpen}
              title="More options"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>

            <AnimatePresence>
              {isHeaderMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -6 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40 origin-top-right"
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
                    <button
                      type="button"
                      onClick={() => {
                        setIsHeaderMenuOpen(false);
                        const allIds = filteredHistory.map((item) => item.id);
                        setSelectedItemIds((prev) =>
                          prev.length === allIds.length ? [] : allIds
                        );
                      }}
                      className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                    >
                      <CheckSquare className="w-4 h-4 text-slate-400" />
                      <span>
                        {selectedItemIds.length > 0 ? 'Clear Selection' : 'Select Calculations'}
                      </span>
                    </button>
                  )}

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

        {/* Category Filter Chips (Horizontal Single-Line Controls with Right-Edge More Categories Icon) */}
        <div className="relative flex items-center min-w-0">
          <div
            ref={categoryScrollRef}
            role="tablist"
            aria-label="Filter history by category"
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pr-9 scrollbar-none"
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
                  className={`px-3.5 py-1.5 min-h-[34px] rounded-full text-xs font-semibold border transition-all whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
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

          <button
            type="button"
            onClick={handleScrollCategoriesRight}
            aria-label="More categories to the right"
            title="More categories"
            className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-xs flex items-center justify-center cursor-pointer shrink-0 z-10"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pinned Batch Selection Action Bar inside Sticky Header */}
        {selectedItemIds.length > 0 && (
          <div
            data-multi-select-bar="history"
            className="bg-slate-900 text-white p-2.5 sm:px-3.5 sm:py-2.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-2 border border-slate-700"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center text-xs font-black">
                {selectedItemIds.length}
              </span>
              <span className="text-xs font-bold">
                {selectedItemIds.length} {selectedItemIds.length === 1 ? 'record' : 'records'} selected
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const allIds = filteredHistory.map((item) => item.id);
                  setSelectedItemIds(
                    selectedItemIds.length === allIds.length ? [] : allIds
                  );
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {selectedItemIds.length === filteredHistory.length ? 'Deselect All' : 'Select All'}
              </button>

              <button
                type="button"
                onClick={() => {
                  const selectedItems = history.filter((item) =>
                    selectedItemIds.includes(item.id)
                  );
                  void handleShareHistoryItems(selectedItems);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const selectedItems = history.filter((item) =>
                    selectedItemIds.includes(item.id)
                  );
                  if (selectedItems.length === 0) return;
                  if (onRequestDeleteBatch) {
                    onRequestDeleteBatch(selectedItems);
                  } else if (selectedItems.length === 1) {
                    onRequestDeleteItem(selectedItems[0]);
                  }
                  setSelectedItemIds([]);
                }}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedItemIds.length})</span>
              </button>

              <button
                type="button"
                onClick={handleCancelSelection}
                className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
                title="Cancel selection"
                aria-label="Cancel selection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Empty States or Chronological Date-Grouped Cards */}
      {history.length === 0 && !transferringState ? (
        <div className="min-h-[360px] flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-3xl p-8 sm:p-10 text-center shadow-xs">
          <div className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center mx-auto mb-3 text-slate-400 border border-slate-100">
            <Clock className="w-6 h-6" />
          </div>
          <p className="text-sm font-bold text-slate-700">No calculation history yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
            Results from your Scientific Calculator, EMI, Discount, and Unit tools will be organized here by date.
          </p>
        </div>
      ) : filteredHistory.length === 0 && !transferringState ? (
        <div className="min-h-[360px] flex flex-col items-center justify-center bg-white border border-slate-200/80 rounded-3xl p-8 text-center shadow-xs space-y-2">
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
          <AnimatePresence mode="popLayout" initial={false}>
            {groupedHistory.map((group) => (
              <motion.section
                key={group.key}
                layout
                exit={{ opacity: 0, scale: 0.96, y: -8 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                aria-label={group.label}
                className="space-y-3"
              >
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 px-0.5">
                  {group.label}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {group.items.map(({ item, displayTime }) => {
                      const visual = getCategoryVisual(item.type);
                      const IconComponent = visual.Icon;
                      const cleanResult = formatCleanResult(item.result);
                      const itemSavings =
                        item.savedAmount !== undefined
                          ? item.savedAmount
                          : parseSavedAmountFromText(item.type, item.details, item.result);
                      const isMenuOpen = openCardMenuId === item.id;
                      const isSelected = selectedItemIds.includes(item.id);

                      return (
                        <motion.article
                          key={item.id}
                          layout="position"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, scale: 0.9, x: 28 }}
                          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
                      onTouchStart={(e) =>
                        handleStartLongPress(item.id, e.touches[0]?.clientX, e.touches[0]?.clientY)
                      }
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleCancelLongPress}
                      onMouseDown={(e) => handleStartLongPress(item.id, e.clientX, e.clientY)}
                      onMouseUp={handleCancelLongPress}
                      onMouseLeave={handleCancelLongPress}
                      onClick={(e) => {
                        if (isLongPressFiredRef.current) {
                          isLongPressFiredRef.current = false;
                          return;
                        }
                        if (selectedItemIds.length > 0) {
                          handleToggleSelectItem(item.id, e);
                          return;
                        }
                        onInspectItem(item);
                      }}
                      className={`min-w-0 bg-white rounded-2xl p-4 sm:p-5 border shadow-[0_2px_10px_rgba(15,23,42,0.04)] transition-all cursor-pointer flex flex-col justify-between gap-3 text-left relative select-none ${
                        isSelected
                          ? 'border-indigo-600 ring-2 ring-indigo-600/30 bg-indigo-50/20'
                          : 'border-slate-200/80 hover:border-slate-300 hover:shadow-md'
                      }`}
                    >
                      {/* Top Card Row: Selection Checkbox (when active) + Category Badge + Timestamp + Favorite Indicator + Card 3-Dot Menu */}
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          {selectedItemIds.length > 0 && (
                            <button
                              type="button"
                              onClick={(e) => handleToggleSelectItem(item.id, e)}
                              aria-label={isSelected ? 'Deselect calculation' : 'Select calculation'}
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all shrink-0 cursor-pointer ${
                                isSelected
                                  ? 'bg-indigo-600 border-indigo-600 text-white'
                                  : 'bg-white border-slate-300 text-transparent'
                              }`}
                            >
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </button>
                          )}
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
                                initial={{ opacity: 0, scale: 0.9, y: -6 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.9, y: -6 }}
                                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                                className="absolute right-0 top-full mt-1 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-30 origin-top-right"
                              >
                                <button
                                  type="button"
                                  onClick={() => {
                                    onToggleFavorite(item.id);
                                    setOpenCardMenuId(null);
                                    showNotification({
                                      id: 'history-favorite',
                                      message: item.isFavorite
                                        ? 'Removed from favorites'
                                        : 'Added to favorites',
                                      type: 'info',
                                      duration: 1800,
                                    });
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
                                  onClick={() =>
                                    void handleAddHistoryToNote(
                                      item,
                                      cleanResult,
                                      displayTime,
                                      visual.label,
                                      itemSavings
                                    )
                                  }
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-emerald-50/70 flex items-center gap-2 cursor-pointer"
                                >
                                  <StickyNote className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Add to Note</span>
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleAddHistoryToTask(
                                      item,
                                      cleanResult,
                                      displayTime,
                                      visual.label,
                                      itemSavings
                                    )
                                  }
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-indigo-50/70 flex items-center gap-2 cursor-pointer"
                                >
                                  <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                                  <span>Add to Task</span>
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

                                <button
                                  type="button"
                                  onClick={() => {
                                    setOpenCardMenuId(null);
                                    void handleShareHistoryItems([item]);
                                  }}
                                  className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50/70 flex items-center gap-2 cursor-pointer"
                                >
                                  <Share2 className="w-3.5 h-3.5 text-sky-600" />
                                  <span>Share</span>
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
                      <p className="min-w-0 text-xs sm:text-sm font-medium text-slate-600 line-clamp-2 leading-snug break-words">
                        {item.details}
                      </p>

                      {/* Primary Result Display */}
                      <div className="min-w-0 flex items-baseline justify-between gap-2 pt-0.5">
                        <p className="min-w-0 flex-1 text-base sm:text-lg font-black text-slate-900 tabular-nums tracking-tight leading-snug break-words">
                          {cleanResult}
                        </p>

                        {copiedId === item.id && (
                          <span className="text-[11px] font-bold text-emerald-600 shrink-0">
                            Copied
                          </span>
                        )}
                      </div>

                      {/* Card Footer: Savings Information (left) & Cloud Sync Status Indicator (bottom right) */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-[11px]">
                        <div className="min-w-0 flex items-center gap-1.5">
                          {itemSavings > 0 ? (
                            <span className="font-semibold text-emerald-700 tabular-nums truncate">
                              Saved {currency}
                              {itemSavings.toLocaleString(undefined, {
                                minimumFractionDigits: 0,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-medium truncate text-[10px]">
                              {visual.label}
                            </span>
                          )}
                        </div>

                        {/* Visual Status Indicator at bottom right displaying cloud sync state */}
                        <div className="shrink-0 flex items-center">
                          {item.syncStatus === 'synced' ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200/80 shadow-2xs"
                              title="Synced to cloud database"
                            >
                              <Cloud className="w-3 h-3 text-emerald-600" />
                              <span>Cloud Synced</span>
                            </span>
                          ) : item.syncStatus === 'syncing' ? (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200/80 shadow-2xs"
                              title="Syncing to cloud database..."
                            >
                              <RefreshCw className="w-3 h-3 text-blue-600 animate-spin" />
                              <span>Syncing...</span>
                            </span>
                          ) : item.syncStatus === 'error' && currentUser ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                onRetrySyncItem(item);
                              }}
                              className="inline-flex items-center gap-1 text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer shadow-2xs"
                              title="Cloud sync failed. Tap to retry."
                            >
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Sync Error · Retry</span>
                            </button>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200/80 shadow-2xs"
                              title={
                                currentUser
                                  ? 'Saved locally (queued for cloud sync on reconnect)'
                                  : 'Saved locally on device'
                              }
                            >
                              <CloudOff className="w-3 h-3 text-amber-600" />
                              <span>Saved Locally</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </motion.article>
                  );
                })}
                  </AnimatePresence>
              </div>
            </motion.section>
          ))}
          </AnimatePresence>
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
