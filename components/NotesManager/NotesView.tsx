'use client';

import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Pin,
  CheckSquare,
  Square,
  Plus,
  Trash2,
  Tag,
  Bell,
  Palette,
  Search,
  X,
  Clock,
  AlertTriangle,
  RotateCw,
  StickyNote,
  Check,
  ArrowLeft,
  CheckCircle2,
  MoreVertical,
  MoreHorizontal,
  Save,
  User,
  ChevronRight,
  History,
  Share2,
  CloudOff,
} from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'motion/react';
import { NoteItem, NOTE_COLORS, type SourceHistoryMeta } from '@/lib/types/notes-tasks';
import { formatNotesForShare, shareTextContent } from '@/lib/shareUtils';
import { showNotification, suppressOfflineSyncNotifications } from '@/lib/notifications';
import {
  fetchNotes,
  getLocalNotes,
  saveLocalNotes,
  upsertNoteToSupabase,
  deleteNoteFromSupabase,
  deleteNotesBatchFromSupabase,
} from '@/lib/notesTasksStorage';
import {
  checkAndFireDueReminders,
  requestNotificationPermission,
} from '@/lib/reminderService';
import { useTheme } from '@/components/ThemeProvider';
import { OfflineWifiIndicator } from '@/components/PwaRuntime';
import {
  checkStorageQuotaBeforeAdd,
  refreshLocalStorageSnapshot,
  triggerStorageFullPopup,
} from '@/lib/storageSyncClient';
import { resolveNoteSourceHistory } from '@/lib/historyProvenance';
import { getBackupPermissions } from '@/lib/backupPermissions';

interface NotesViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
  onFullScreenChange?: (isFullscreen: boolean) => void;
  onSubOverlayChange?: (hasOverlay: boolean) => void;
  closeEditorSignal?: number;
  refreshSignal?: number;
  onOpenProfile?: () => void;
  onBack?: () => void;
  onReturnToHistory?: (source: SourceHistoryMeta, note: NoteItem) => Promise<void> | void;
}

function getCompactNoteSurface(colorId: string, isDark = false): { bg: string; border: string } {
  if (isDark) {
    switch (colorId) {
      case 'mint':
      case 'sage':
        return { bg: '#132a23', border: '#1f493b' };
      case 'coral':
      case 'blossom':
      case 'peach':
        return { bg: '#2c1a1e', border: '#4c2930' };
      case 'sky':
      case 'dusk':
        return { bg: '#15253b', border: '#243f66' };
      case 'lavender':
        return { bg: '#231c38', border: '#3c2e61' };
      case 'sand':
        return { bg: '#2b2415', border: '#4c3f22' };
      case 'clay':
      case 'charcoal':
        return { bg: '#1e293b', border: '#334155' };
      default:
        return { bg: '#1e293b', border: '#334155' };
    }
  }
  switch (colorId) {
    case 'mint':
    case 'sage':
      return { bg: '#e6f7ec', border: '#ccead6' };
    case 'coral':
    case 'blossom':
    case 'peach':
      return { bg: '#fdebe6', border: '#f6d5cc' };
    case 'sky':
    case 'dusk':
      return { bg: '#eaf3ff', border: '#d2e2fb' };
    case 'lavender':
      return { bg: '#f2ebff', border: '#e1d3fb' };
    case 'sand':
      return { bg: '#fbf2d4', border: '#efe1b3' };
    case 'clay':
    case 'charcoal':
      return { bg: '#f1f5f9', border: '#cbd5e1' };
    default:
      return { bg: '#ffffff', border: '#e2e8f0' };
  }
}

const TAG_COLOR_PALETTES = [
  'bg-[#b9ecc7] text-[#14532d]', // Soft green (Food / Store)
  'bg-[#f5bdb7] text-[#7f1d1d]', // Soft coral (Shopping)
  'bg-[#bae1f7] text-[#0c4a6e]', // Soft blue (Work / Finance)
  'bg-[#dfcdf7] text-[#581c87]', // Soft lavender (Personal / Vendors)
  'bg-[#f5df8c] text-[#713f12]', // Soft amber (Math / Ideas)
  'bg-[#baeae2] text-[#134e4a]', // Soft teal
];

function getTagColorClass(label: string): string {
  const lower = label.trim().toLowerCase();
  if (lower.includes('food') || lower.includes('grocery') || lower.includes('store')) {
    return TAG_COLOR_PALETTES[0];
  }
  if (lower.includes('shop') || lower.includes('gift') || lower.includes('b-day')) {
    return TAG_COLOR_PALETTES[1];
  }
  if (lower.includes('work') || lower.includes('finan') || lower.includes('calc') || lower.includes('unit')) {
    return TAG_COLOR_PALETTES[2];
  }
  if (lower.includes('personal') || lower.includes('goal') || lower.includes('vendor')) {
    return TAG_COLOR_PALETTES[3];
  }
  if (lower.includes('math') || lower.includes('idea') || lower.includes('formula')) {
    return TAG_COLOR_PALETTES[4];
  }
  let hash = 0;
  for (let i = 0; i < lower.length; i++) {
    hash = (hash * 31 + lower.charCodeAt(i)) >>> 0;
  }
  return TAG_COLOR_PALETTES[hash % TAG_COLOR_PALETTES.length];
}

function formatDynamicItemDateTime(isoString?: string | null, fallbackMs?: number): string {
  const rawDate = isoString ? new Date(isoString) : new Date(fallbackMs ?? Date.now());
  const validDate = Number.isNaN(rawDate.getTime()) ? new Date(fallbackMs ?? Date.now()) : rawDate;
  const datePart = validDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const timePart = validDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart} • ${timePart}`;
}

export default function NotesView({
  currentUser,
  triggerVibration,
  onFullScreenChange,
  onSubOverlayChange,
  closeEditorSignal = 0,
  refreshSignal = 0,
  onOpenProfile,
  onBack,
  onReturnToHistory,
}: NotesViewProps) {
  const { isDark } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const [onlyPinned, setOnlyPinned] = useState(false);

  // Batch Selection State (Activated by Long-Press)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  // Deletion Safeguard Modal State
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    { type: 'single'; note: NoteItem } | { type: 'batch'; ids: string[] } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isReturningToHistory, setIsReturningToHistory] = useState(false);

  // Unified Full-Page Note Editing View State
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [hasSavedCurrentNote, setHasSavedCurrentNote] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const [showColorPaletteSubmenu, setShowColorPaletteSubmenu] = useState(false);
  const [checklistDraftItem, setChecklistDraftItem] = useState('');
  const [fullPageNewTag, setFullPageNewTag] = useState('');
  const [showFullPageTagInput, setShowFullPageTagInput] = useState(false);
  const [showFullPageReminder, setShowFullPageReminder] = useState(false);
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission | 'unsupported'>('default');
  const [liveClockMs, setLiveClockMs] = useState<number>(() => Date.now());

  const managerMenuRef = useRef<HTMLDivElement>(null);
  const threeDotMenuRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressFiredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Hydration mount & notification permission tracker
  useEffect(() => {
    setIsMounted(true);
    const updatePerm = () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        setNotificationPerm(Notification.permission);
      } else {
        setNotificationPerm('unsupported');
      }
    };
    updatePerm();
    window.addEventListener('focus', updatePerm);
    return () => window.removeEventListener('focus', updatePerm);
  }, []);

  // Close manager or editor three-dot popover when clicking outside
  useEffect(() => {
    if (!showThreeDotMenu && !showManagerMenu) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (showThreeDotMenu && threeDotMenuRef.current && !threeDotMenuRef.current.contains(event.target as Node)) {
        setShowThreeDotMenu(false);
        setShowColorPaletteSubmenu(false);
      }
      if (showManagerMenu && managerMenuRef.current && !managerMenuRef.current.contains(event.target as Node)) {
        setShowManagerMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showThreeDotMenu, showManagerMenu]);

  // Layout Optimization: Hide Main Header while full-screen note editor is open and lock background scroll
  useEffect(() => {
    if (editingNote) {
      onFullScreenChange?.(true);
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      const originalBodyOverscroll = document.body.style.overscrollBehavior;
      const originalHtmlOverscroll = document.documentElement.style.overscrollBehavior;

      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';
      document.documentElement.style.overscrollBehavior = 'none';

      return () => {
        onFullScreenChange?.(false);
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.overscrollBehavior = originalBodyOverscroll;
        document.documentElement.style.overscrollBehavior = originalHtmlOverscroll;
      };
    } else {
      onFullScreenChange?.(false);
    }
  }, [editingNote, onFullScreenChange]);

  // Keep dynamic timestamp fresh while full-page note editor is open
  const isEditingNoteOpen = Boolean(editingNote);
  useEffect(() => {
    if (!isEditingNoteOpen) return;
    setLiveClockMs(Date.now());
    const interval = setInterval(() => {
      setLiveClockMs(Date.now());
    }, 15000);
    return () => clearInterval(interval);
  }, [isEditingNoteOpen]);

  const hasOpenSubOverlay = Boolean(editingNote || confirmDeleteTarget || selectedNoteIds.length > 0);
  useEffect(() => {
    onSubOverlayChange?.(hasOpenSubOverlay);
    return () => {
      onSubOverlayChange?.(false);
    };
  }, [hasOpenSubOverlay, onSubOverlayChange]);

  const lastCloseSignalRef = useRef(closeEditorSignal);
  const handleCloseEditorRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (closeEditorSignal > lastCloseSignalRef.current) {
      lastCloseSignalRef.current = closeEditorSignal;
      if (confirmDeleteTarget) {
        setConfirmDeleteTarget(null);
      } else if (showThreeDotMenu) {
        setShowThreeDotMenu(false);
        setShowColorPaletteSubmenu(false);
      } else if (editingNote) {
        handleCloseEditorRef.current?.();
      } else if (selectedNoteIds.length > 0) {
        setSelectedNoteIds([]);
      }
    }
  }, [closeEditorSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Synchronously seed local notes before first paint so switching to Notes never flashes a collapsed loader
  useLayoutEffect(() => {
    const localNotes = getLocalNotes(currentUser?.id);
    setNotes(localNotes);
    setLoading(false);
  }, [currentUser?.id]);

  // Background-sync notes on mount or user change & subscribe to offline sync updates
  useEffect(() => {
    let isSubscribed = true;
    fetchNotes(currentUser?.id).then((data) => {
      if (isSubscribed) {
        setNotes(data);
        setLoading(false);
      }
    });

    const handleSyncUpdated = () => {
      const freshLocal = getLocalNotes(currentUser?.id);
      setNotes(freshLocal);
    };

    window.addEventListener('calcmax:sync-updated', handleSyncUpdated);
    window.addEventListener('calcmax:notes-tasks-updated', handleSyncUpdated);
    return () => {
      isSubscribed = false;
      window.removeEventListener('calcmax:sync-updated', handleSyncUpdated);
      window.removeEventListener('calcmax:notes-tasks-updated', handleSyncUpdated);
    };
  }, [currentUser]);

  // Trigger unified Service Worker reminder check when notes update
  useEffect(() => {
    if (notes.some((n) => Boolean(n.reminderAt))) {
      void checkAndFireDueReminders();
    }
  }, [notes]);

  // Long-press detection helpers for touch and desktop
  const handleStartLongPress = (id: string, clientX?: number, clientY?: number) => {
    if (selectedNoteIds.length > 0) return; // In selection mode already
    isLongPressFiredRef.current = false;
    if (clientX !== undefined && clientY !== undefined) {
      touchStartPosRef.current = { x: clientX, y: clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressFiredRef.current = true;
      setSelectedNoteIds([id]);
    }, 500);
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

  // Pull-to-refresh / external signal scoped purely to Notes Manager
  const handleManualRefresh = async () => {
    try {
      const freshNotes = await fetchNotes(currentUser?.id);
      setNotes(freshNotes);
      showNotification({
        id: 'notes-refresh',
        message: 'Notes updated',
        type: 'success',
        duration: 2200,
      });
    } catch (err) {
      console.warn('Notes refresh notice:', err);
    }
  };

  const lastRefreshSignalRef = useRef(0);
  useEffect(() => {
    if (refreshSignal > lastRefreshSignalRef.current) {
      lastRefreshSignalRef.current = refreshSignal;
      void handleManualRefresh();
    }
  }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  const openNewNoteEditor = () => {
    const quota = checkStorageQuotaBeforeAdd(currentUser?.id);
    if (!quota.allowed) {
      triggerStorageFullPopup(quota.snapshot, currentUser?.id);
      return;
    }

    const nowIso = new Date().toISOString();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const notesBackupEnabled = currentUser?.id ? getBackupPermissions(currentUser.id).notes : false;
    const blankDraft: NoteItem = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      title: '',
      content: '',
      color: 'default',
      isPinned: false,
      isChecklist: false,
      checklistItems: [],
      labels: [],
      reminderAt: null,
      isEmergency: false,
      syncStatus: currentUser?.id && !isOffline && notesBackupEnabled ? 'synced' : 'unsynced',
      createdOffline: isOffline,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    setEditingNote(blankDraft);
    setIsNewDraft(true);
    setHasSavedCurrentNote(false);
    setHasUnsavedChanges(false);
    setShowThreeDotMenu(false);
    setChecklistDraftItem('');
    setFullPageNewTag('');
    setShowFullPageTagInput(false);
    setShowFullPageReminder(false);
  };

  const openExistingNoteEditor = (note: NoteItem) => {
    setEditingNote({
      ...note,
      checklistItems: note.checklistItems.map((ci) => ({ ...ci })),
      labels: [...note.labels],
      sourceHistory: note.sourceHistory ? { ...note.sourceHistory } : null,
    });
    setIsNewDraft(false);
    setHasSavedCurrentNote(true);
    setHasUnsavedChanges(false);
    setShowThreeDotMenu(false);
    setShowColorPaletteSubmenu(false);
    setChecklistDraftItem('');
    setFullPageNewTag('');
    setShowFullPageTagInput(false);
    setShowFullPageReminder(false);
  };

  const updateEditingNote = (updater: (prev: NoteItem) => NoteItem) => {
    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    setLiveClockMs(nowMs);
    setEditingNote((prev) => {
      if (!prev) return prev;
      return {
        ...updater(prev),
        updatedAt: nowIso,
      };
    });
    setHasUnsavedChanges(true);
  };

  // Deletion Safeguards (Requires explicit confirmation modal)
  const promptDeleteSingle = (note: NoteItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDeleteTarget({ type: 'single', note });
  };

  const promptDeleteBatch = () => {
    if (selectedNoteIds.length === 0) return;
    setConfirmDeleteTarget({ type: 'batch', ids: selectedNoteIds });
  };

  const executeConfirmedDeletion = async () => {
    if (!confirmDeleteTarget) return;
    setIsDeleting(true);

    if (confirmDeleteTarget.type === 'single') {
      const noteId = confirmDeleteTarget.note.id;
      const updated = notes.filter((n) => n.id !== noteId);
      setNotes(updated);
      saveLocalNotes(updated, currentUser?.id);

      if (editingNote?.id === noteId) {
        setEditingNote(null);
      }
      setSelectedNoteIds((prev) => prev.filter((id) => id !== noteId));

      if (currentUser?.id) {
        await deleteNoteFromSupabase(noteId, currentUser.id);
      }
    } else {
      const idsToDelete = confirmDeleteTarget.ids;
      const updated = notes.filter((n) => !idsToDelete.includes(n.id));
      setNotes(updated);
      saveLocalNotes(updated, currentUser?.id);

      if (editingNote && idsToDelete.includes(editingNote.id)) {
        setEditingNote(null);
      }
      setSelectedNoteIds([]);

      if (currentUser?.id) {
        await deleteNotesBatchFromSupabase(idsToDelete, currentUser.id);
      }
    }

    const deletedCount =
      confirmDeleteTarget.type === 'single' ? 1 : confirmDeleteTarget.ids.length;
    setIsDeleting(false);
    setConfirmDeleteTarget(null);
    refreshLocalStorageSnapshot(currentUser?.id);
    showNotification({
      id: 'notes-delete',
      message: deletedCount === 1 ? 'Note deleted' : `Deleted ${deletedCount} notes`,
      type: 'success',
      duration: 2200,
    });
  };

  // Batch Selection Handlers
  const handleToggleSelectNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleShareNotes = async (targetNotes: NoteItem[], _inEditor = false) => {
    if (targetNotes.length === 0) return;
    const payload = formatNotesForShare(targetNotes);
    const outcome = await shareTextContent(payload);
    if (outcome === 'shared' || outcome === 'copied') {
      const msg = outcome === 'shared' ? 'Shared' : 'Copied to share';
      showNotification({
        id: 'notes-share',
        message: msg,
        type: 'success',
        duration: 2000,
      });
    }
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredNotes.map((n) => n.id);
    if (selectedNoteIds.length === allFilteredIds.length) {
      setSelectedNoteIds([]);
    } else {
      setSelectedNoteIds(allFilteredIds);
    }
  };

  const handleCancelSelection = () => {
    setSelectedNoteIds([]);
  };

  const handleTogglePin = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    suppressOfflineSyncNotifications(3000);
    const updated = notes.map((n) =>
      n.id === id ? { ...n, isPinned: !n.isPinned, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === id);
    if (target) {
      showNotification({
        id: 'notes-pin',
        message: target.isPinned ? 'Note pinned' : 'Note unpinned',
        type: 'info',
        duration: 1800,
      });
    }
    if (target && currentUser?.id) {
      const res = await upsertNoteToSupabase(target, currentUser.id);
      if (res.success) {
        setNotes((prev) =>
          prev.map((n) =>
            n.id === id ? { ...n, syncStatus: 'synced', createdOffline: false } : n
          )
        );
      }
    }
  };

  const handleBatchUpdateColor = async (newColor: string) => {
    if (selectedNoteIds.length === 0) return;
    const nowIso = new Date().toISOString();
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const notesBackupEnabled = currentUser?.id ? getBackupPermissions(currentUser.id).notes : false;
    const updated = notes.map((n) =>
      selectedNoteIds.includes(n.id)
        ? {
            ...n,
            color: newColor,
            syncStatus:
              isOffline || !currentUser?.id || !notesBackupEnabled
                ? ('unsynced' as const)
                : (n.syncStatus ?? ('synced' as const)),
            updatedAt: nowIso,
          }
        : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    for (const id of selectedNoteIds) {
      const target = updated.find((n) => n.id === id);
      if (target && currentUser?.id) {
        const res = await upsertNoteToSupabase(target, currentUser.id);
        setNotes((prev) => {
          const next = prev.map((n) =>
            n.id === id
              ? {
                  ...n,
                  syncStatus: res.syncStatus,
                  createdOffline: res.success ? false : n.createdOffline,
                }
              : n
          );
          if (!res.success) {
            saveLocalNotes(next, currentUser.id);
          }
          return next;
        });
      }
    }
  };

  const handleAddChecklistItemToEditor = () => {
    if (!editingNote || !checklistDraftItem.trim()) return;
    const textToAdd = checklistDraftItem.trim();
    updateEditingNote((prev) => ({
      ...prev,
      checklistItems: [
        ...prev.checklistItems,
        { id: 'item-' + Date.now() + '-' + Math.random().toString(36).substring(2, 5), text: textToAdd, completed: false },
      ],
    }));
    setChecklistDraftItem('');
  };

  const handleAddTagInEditor = (tagText?: string) => {
    if (!editingNote) return;
    const tag = (tagText ?? fullPageNewTag).trim();
    if (!tag) return;
    if (!editingNote.labels.includes(tag)) {
      updateEditingNote((prev) => ({
        ...prev,
        labels: [...prev.labels, tag],
      }));
    }
    if (!tagText) {
      setFullPageNewTag('');
    }
  };

  // Unified Persist Action (keeps editor open so user sees Saved badge & 3-dot Color Menu)
  const persistNoteInEditor = async (closeAfter: boolean = false) => {
    if (!editingNote) return;

    const isBlankDraft =
      !editingNote.title.trim() &&
      !editingNote.content.trim() &&
      editingNote.checklistItems.length === 0 &&
      editingNote.labels.length === 0 &&
      !editingNote.reminderAt;

    if (isNewDraft && !hasSavedCurrentNote && isBlankDraft && closeAfter) {
      setEditingNote(null);
      setShowThreeDotMenu(false);
      return;
    }

    const normalizedTitle =
      editingNote.title.trim() || (!closeAfter && isBlankDraft ? 'Untitled Note' : editingNote.title.trim());
    const existingNote = notes.find((n) => n.id === editingNote.id);
    const isPinOnlyEdit = Boolean(
      existingNote &&
        existingNote.title === normalizedTitle &&
        existingNote.content === editingNote.content &&
        existingNote.color === editingNote.color &&
        existingNote.isChecklist === editingNote.isChecklist &&
        existingNote.reminderAt === editingNote.reminderAt &&
        Boolean(existingNote.isEmergency) === Boolean(editingNote.isEmergency) &&
        JSON.stringify(existingNote.checklistItems) === JSON.stringify(editingNote.checklistItems) &&
        JSON.stringify(existingNote.labels) === JSON.stringify(editingNote.labels)
    );
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const notesBackupEnabled = currentUser?.id ? getBackupPermissions(currentUser.id).notes : false;
    const nextSyncStatus: 'synced' | 'unsynced' = isPinOnlyEdit
      ? (existingNote?.syncStatus ?? 'synced')
      : isOffline || !currentUser?.id || !notesBackupEnabled
        ? 'unsynced'
        : (existingNote?.syncStatus ?? 'synced');
    const nextCreatedOffline = isPinOnlyEdit
      ? Boolean(existingNote?.createdOffline)
      : Boolean(existingNote?.createdOffline || isOffline);

    const noteToSave: NoteItem = {
      ...editingNote,
      title: normalizedTitle,
      syncStatus: nextSyncStatus,
      createdOffline: nextCreatedOffline,
      updatedAt: new Date().toISOString(),
    };

    if (isNewDraft && !hasSavedCurrentNote) {
      const quota = checkStorageQuotaBeforeAdd(currentUser?.id, noteToSave);
      if (!quota.allowed) {
        triggerStorageFullPopup(quota.snapshot, currentUser?.id);
        return;
      }
    }

    const updated = [
      noteToSave,
      ...notes.filter((n) => n.id !== noteToSave.id),
    ];

    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    refreshLocalStorageSnapshot(currentUser?.id);
    setIsNewDraft(false);
    setHasSavedCurrentNote(true);
    setHasUnsavedChanges(false);

    if (closeAfter) {
      setEditingNote(null);
      setShowThreeDotMenu(false);
    } else {
      setEditingNote(noteToSave);
    }

    if (currentUser?.id) {
      const res = await upsertNoteToSupabase(noteToSave, currentUser.id);
      if (res.success || !isPinOnlyEdit) {
        const finalSyncStatus = res.success ? 'synced' : res.syncStatus;
        const finalCreatedOffline = res.success ? false : nextCreatedOffline;
        setNotes((prev) => {
          const next = prev.map((n) =>
            n.id === noteToSave.id
              ? { ...n, syncStatus: finalSyncStatus, createdOffline: finalCreatedOffline }
              : n
          );
          if (!res.success) {
            saveLocalNotes(next, currentUser.id);
          }
          return next;
        });
        if (!closeAfter) {
          setEditingNote((prev) =>
            prev && prev.id === noteToSave.id
              ? { ...prev, syncStatus: finalSyncStatus, createdOffline: finalCreatedOffline }
              : prev
          );
        }
      }
    }
  };

  const handleChangeSavedNoteColor = async (colorId: string) => {
    if (!editingNote) return;
    const isOffline = typeof navigator !== 'undefined' && navigator.onLine === false;
    const notesBackupEnabled = currentUser?.id ? getBackupPermissions(currentUser.id).notes : false;
    const updatedNote: NoteItem = {
      ...editingNote,
      color: colorId,
      syncStatus:
        isOffline || !currentUser?.id || !notesBackupEnabled
          ? 'unsynced'
          : (editingNote.syncStatus ?? 'synced'),
      updatedAt: new Date().toISOString(),
    };

    const updated = [
      updatedNote,
      ...notes.filter((n) => n.id !== updatedNote.id),
    ];

    setEditingNote(updatedNote);
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    setHasUnsavedChanges(false);
    setShowColorPaletteSubmenu(false);
    setShowThreeDotMenu(false);
    showNotification({
      id: 'notes-color',
      message: 'Note color updated',
      type: 'success',
      duration: 1800,
    });

    if (currentUser?.id) {
      const res = await upsertNoteToSupabase(updatedNote, currentUser.id);
      const finalCreatedOffline = res.success ? false : updatedNote.createdOffline;
      setNotes((prev) => {
        const next = prev.map((n) =>
          n.id === updatedNote.id
            ? { ...n, syncStatus: res.syncStatus, createdOffline: finalCreatedOffline }
            : n
        );
        if (!res.success) {
          saveLocalNotes(next, currentUser.id);
        }
        return next;
      });
      setEditingNote((prev) =>
        prev && prev.id === updatedNote.id
          ? { ...prev, syncStatus: res.syncStatus, createdOffline: finalCreatedOffline }
          : prev
      );
    }
  };

  const activeNoteSourceHistory = useMemo(
    () => resolveNoteSourceHistory(editingNote),
    [editingNote]
  );

  const handleReturnNoteToHistory = async () => {
    if (!editingNote || !activeNoteSourceHistory || isReturningToHistory) return;

    const source = activeNoteSourceHistory;
    const noteSnapshot = editingNote;

    const restoredCandidate = {
      id: source.id || 'item-' + Date.now(),
      type: source.type,
      details: source.details,
      result: source.result,
      savedAmount: source.savedAmount,
      isFavorite: Boolean(source.isFavorite),
      createdAt: source.createdAt || new Date().toISOString(),
      timestamp:
        source.timestamp ||
        new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const quota = checkStorageQuotaBeforeAdd(currentUser?.id, restoredCandidate, noteSnapshot);
    if (!quota.allowed) {
      triggerStorageFullPopup(quota.snapshot, currentUser?.id);
      return;
    }

    setIsReturningToHistory(true);
    suppressOfflineSyncNotifications(5000);
    try {
      const updated = notes.filter((n) => n.id !== noteSnapshot.id);
      setNotes(updated);
      saveLocalNotes(updated, currentUser?.id);
      setSelectedNoteIds((prev) => prev.filter((id) => id !== noteSnapshot.id));
      setShowThreeDotMenu(false);
      setEditingNote(null);
      setIsNewDraft(false);
      setHasSavedCurrentNote(false);
      setHasUnsavedChanges(false);

      if (currentUser?.id) {
        await deleteNoteFromSupabase(noteSnapshot.id, currentUser.id);
      }
      refreshLocalStorageSnapshot(currentUser?.id);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('calcmax:notes-tasks-updated'));
      }

      triggerVibration?.('success');
      if (onReturnToHistory) {
        await onReturnToHistory(source, noteSnapshot);
      } else {
        showNotification({
          id: 'notes-return-history',
          message: 'Returned to History',
          type: 'success',
          duration: 2200,
        });
      }
    } finally {
      setIsReturningToHistory(false);
    }
  };

  const handleCloseEditor = () => {
    if (!editingNote) return;
    const isBlankDraft =
      isNewDraft &&
      !hasSavedCurrentNote &&
      !editingNote.title.trim() &&
      !editingNote.content.trim() &&
      editingNote.checklistItems.length === 0 &&
      editingNote.labels.length === 0 &&
      !editingNote.reminderAt;

    if (isBlankDraft) {
      setEditingNote(null);
      setShowThreeDotMenu(false);
      return;
    }

    if (hasUnsavedChanges || !hasSavedCurrentNote) {
      void persistNoteInEditor(true);
    } else {
      setEditingNote(null);
      setShowThreeDotMenu(false);
    }
  };

  handleCloseEditorRef.current = handleCloseEditor;

  // Distinct labels across all notes
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.labels.forEach((l) => set.add(l)));
    return Array.from(set);
  }, [notes]);

  // Filter & sort notes (Pinned first for unified compact multi-column grid)
  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes
      .filter((n) => {
        const matchPinned = onlyPinned ? n.isPinned : true;
        const matchSearch =
          q === '' ||
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.labels.some((lbl) => lbl.toLowerCase().includes(q)) ||
          n.checklistItems.some((ci) => ci.text.toLowerCase().includes(q));
        const matchLabel = selectedLabel === null || n.labels.includes(selectedLabel);
        return matchPinned && matchSearch && matchLabel;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) {
          return a.isPinned ? -1 : 1;
        }
        const timeA = Math.max(
          new Date(a.createdAt || 0).getTime() || 0,
          new Date(a.updatedAt || 0).getTime() || 0
        );
        const timeB = Math.max(
          new Date(b.createdAt || 0).getTime() || 0,
          new Date(b.updatedAt || 0).getTime() || 0
        );
        return timeB - timeA;
      });
  }, [notes, searchQuery, selectedLabel, onlyPinned]);

  const filterBarScrollRef = useRef<HTMLDivElement | null>(null);
  const handleScrollFilterRight = () => {
    filterBarScrollRef.current?.scrollBy({ left: 150, behavior: 'smooth' });
  };

  const editingColorTheme = editingNote
    ? NOTE_COLORS.find((c) => c.id === editingNote.color) || NOTE_COLORS[0]
    : NOTE_COLORS[0];

  return (
    <div className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-4 pb-6">
      {/* Sticky Header: Back + Title + Profile Avatar, Search Bar + Three-Dot Menu, and Filter Chips */}
      <div
        data-sticky-secondary-header="notes"
        className="sticky top-0 z-30 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 pt-2.5 pb-2.5 bg-[#f2f8fc]/95 backdrop-blur-md border-b border-slate-200/70 shadow-[0_2px_10px_rgba(15,23,42,0.03)] space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="min-w-[38px] min-h-[38px] -ml-1 flex items-center justify-center rounded-xl text-slate-700 hover:bg-slate-200/60 active:scale-95 transition-all cursor-pointer shrink-0"
                aria-label="Back"
                title="Back"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
              Notes Manager
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search your notes..."
              aria-label="Search your notes"
              className="w-full min-h-[42px] bg-white/95 border border-slate-200/90 text-slate-900 font-medium text-xs sm:text-sm rounded-2xl py-2 pl-10 pr-9 shadow-[0_1px_4px_rgba(15,23,42,0.03)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Clear notes search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative shrink-0" ref={managerMenuRef}>
            <button
              type="button"
              id="notes-header-menu-btn"
              onClick={() => setShowManagerMenu((prev) => !prev)}
              className="min-w-[42px] min-h-[42px] rounded-2xl bg-white/95 border border-slate-200/90 text-slate-700 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition-all cursor-pointer"
              aria-label="Notes actions menu"
              aria-expanded={showManagerMenu}
              title="Notes actions"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>

            <AnimatePresence>
              {showManagerMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: -6 }}
                  transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40 origin-top-right"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowManagerMenu(false);
                      setOnlyPinned((prev) => !prev);
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <span className="flex items-center gap-2">
                      <Pin className="w-3.5 h-3.5 text-slate-500" />
                      <span>Pinned Only</span>
                    </span>
                    {onlyPinned && <Check className="w-3.5 h-3.5 text-blue-600" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowManagerMenu(false);
                      handleSelectAll();
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
                    <span>{selectedNoteIds.length > 0 ? 'Clear Selection' : 'Select All Notes'}</span>
                  </button>

                  <div className="my-1 border-t border-slate-100" />

                  <button
                    type="button"
                    onClick={() => {
                      setShowManagerMenu(false);
                      void handleManualRefresh();
                    }}
                    className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                  >
                    <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                    <span>Sync & Refresh Notes</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Interactive Filter Pills: All Notes, Pinned, + Labels with right-side scroll indicator icon */}
        <div className="relative flex items-center min-w-0 min-h-[34px]">
          <div
            ref={filterBarScrollRef}
            className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pr-9 scrollbar-none min-h-[34px]"
          >
            <button
              type="button"
              onClick={() => {
                setSelectedLabel(null);
                setOnlyPinned(false);
              }}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                selectedLabel === null && !onlyPinned
                  ? 'bg-slate-300/90 text-slate-900 font-bold shadow-2xs'
                  : 'bg-white/90 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              All Notes
            </button>

            <button
              type="button"
              onClick={() => setOnlyPinned((prev) => !prev)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                onlyPinned
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white/90 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              <Pin className={`w-3 h-3 ${onlyPinned ? 'fill-white text-white' : 'text-slate-700 fill-slate-700'}`} />
              <span>Pinned</span>
            </button>

            {allLabels.map((lbl) => (
              <button
                key={lbl}
                type="button"
                onClick={() => setSelectedLabel(selectedLabel === lbl ? null : lbl)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                  selectedLabel === lbl
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white/90 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
                }`}
              >
                {lbl}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleScrollFilterRight}
            aria-label="More categories to the right"
            title="More categories"
            className="absolute right-0 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full bg-white/95 border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 shadow-xs flex items-center justify-center cursor-pointer shrink-0 z-10"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Pinned Batch Selection Action Bar inside Sticky Header */}
        {selectedNoteIds.length > 0 && (
          <div
            data-multi-select-bar="notes"
            className="bg-slate-900 text-white p-2.5 sm:px-3.5 sm:py-2.5 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-2 border border-slate-700"
          >
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-black">
                {selectedNoteIds.length}
              </span>
              <span className="text-xs font-bold">
                {selectedNoteIds.length} {selectedNoteIds.length === 1 ? 'note' : 'notes'} selected
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
              <button
                type="button"
                onClick={handleSelectAll}
                className="px-2.5 sm:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {selectedNoteIds.length === filteredNotes.length ? 'Deselect All' : 'Select All'}
              </button>

              <div className="hidden sm:flex items-center gap-1 bg-slate-800/90 px-2.5 py-1 rounded-xl border border-slate-700">
                <span className="text-[10px] font-bold text-slate-300 mr-0.5">Color:</span>
                {NOTE_COLORS.slice(0, 6).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleBatchUpdateColor(c.id)}
                    style={{ backgroundColor: c.hex }}
                    className="w-4 h-4 rounded-full border border-slate-500 hover:scale-125 transition-transform cursor-pointer"
                    title={`Color selected notes ${c.name}`}
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => {
                  const selectedNotes = notes.filter((n) => selectedNoteIds.includes(n.id));
                  void handleShareNotes(selectedNotes, false);
                }}
                className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </button>

              <button
                type="button"
                onClick={promptDeleteBatch}
                disabled={selectedNoteIds.length === 0}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({selectedNoteIds.length})</span>
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

      {/* Compact Multi-Column Notes Grid */}
      {loading ? (
        <div
          aria-busy="true"
          aria-label="Loading notes"
          className="min-h-[420px] grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0 items-start"
        >
          {[0, 1, 2, 3].map((slot) => (
            <div
              key={slot}
              className="rounded-2xl p-3 sm:p-3.5 border border-slate-200/70 bg-white/60 min-h-[132px] sm:min-h-[144px] animate-pulse flex flex-col justify-between"
            >
              <div className="space-y-2">
                <div className="h-3.5 w-3/4 rounded-md bg-slate-200/80" />
                <div className="h-2.5 w-full rounded-md bg-slate-100" />
                <div className="h-2.5 w-5/6 rounded-md bg-slate-100" />
              </div>
              <div className="h-4 w-14 rounded-md bg-slate-200/70 mt-4" />
            </div>
          ))}
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="min-h-[360px] flex flex-col items-center justify-center py-14 text-center max-w-sm mx-auto space-y-3 bg-white/80 rounded-2xl border border-slate-200/70 p-6">
          <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/60">
            <StickyNote className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {searchQuery || selectedLabel || onlyPinned ? 'No matching notes found' : 'No notes yet'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchQuery || selectedLabel || onlyPinned
              ? 'Try clearing your search or filter selection.'
              : 'Tap the + button below to capture formulas, shopping lists, or quick notes.'}
          </p>
        </div>
      ) : (
        <LayoutGroup id="notes-grid">
          <motion.div
            layout
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0 items-stretch"
          >
            <AnimatePresence mode="popLayout" initial={false}>
              {filteredNotes.map((note) => renderNoteCard(note))}
            </AnimatePresence>
          </motion.div>
        </LayoutGroup>
      )}

      {/* Large Fixed Floating + Action Button (Portaled to body so parent transforms never unpin it) */}
      {isMounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <>
            {!editingNote && selectedNoteIds.length === 0 && (
              <button
                type="button"
                onClick={openNewNoteEditor}
                aria-label="Create new note"
                title="New Note"
                className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] right-4 sm:right-6 z-[90] w-14 h-14 sm:w-16 sm:h-16 min-w-[56px] min-h-[56px] rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white shadow-[0_10px_28px_rgba(15,23,42,0.36)] border-2 border-white/90 flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="w-7 h-7 stroke-[2.75]" />
              </button>
            )}
          </>,
          document.body
        )}

      {/* UNIFIED MINIMALIST NOTE EDITING VIEW (Clutter-free workspace with Back Button, Tag Chips, and Three-Dot Action Menu) */}
      {isMounted && typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {editingNote && (
            <motion.div
              key={editingNote.id}
              initial={{ opacity: 0, x: '100%' }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: '100%' }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              data-note-card="true"
              data-note-editor="true"
              data-note-color={editingNote.color || 'default'}
              style={{
                backgroundColor: getCompactNoteSurface(editingNote.color, isDark).bg,
                willChange: 'transform, opacity',
              }}
              className="fixed inset-0 z-[99999] w-screen h-[100dvh] flex flex-col overscroll-none select-text touch-manipulation transition-colors duration-200"
            >
          {/* Minimalist Top Bar: Back Trigger + Dynamic Date & 12h AM/PM Timestamp on Left, Three-Dot Menu Trigger on Right */}
          <header className="sticky top-0 z-30 px-3 sm:px-6 pt-[max(0.75rem,env(safe-area-inset-top))] pb-1.5 flex items-center justify-between gap-2 shrink-0">
            <div className="flex items-center gap-1.5 sm:gap-2 min-w-0">
              <button
                type="button"
                onClick={handleCloseEditor}
                className={`min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer active:scale-95 shrink-0 ${
                  isDark
                    ? 'text-slate-100 hover:bg-white/10'
                    : 'text-slate-700 hover:bg-black/5'
                }`}
                aria-label="Back to notes"
                title="Back to notes"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <time
                dateTime={editingNote.updatedAt || editingNote.createdAt || undefined}
                data-item-edit-timestamp="note"
                className={`text-xs sm:text-[13px] font-semibold tabular-nums tracking-tight truncate select-none ${
                  isDark ? 'text-slate-300' : 'text-slate-600'
                }`}
              >
                {formatDynamicItemDateTime(
                  isNewDraft || hasUnsavedChanges
                    ? new Date(liveClockMs).toISOString()
                    : editingNote.updatedAt || editingNote.createdAt,
                  liveClockMs
                )}
              </time>
            </div>

            {/* Three-Dot Overflow Menu (Delete, Pin, Save, Add Label/Tags, Set Reminder, Note Color, Return to History) */}
            <div ref={threeDotMenuRef} className="relative shrink-0">
              <button
                type="button"
                id="note-edit-three-dot-btn"
                onClick={() => {
                  setShowThreeDotMenu((prev) => {
                    const next = !prev;
                    if (!next) setShowColorPaletteSubmenu(false);
                    return next;
                  });
                }}
                aria-label="Note actions menu"
                aria-expanded={showThreeDotMenu}
                title="More actions"
                className={`min-h-[40px] min-w-[44px] px-2.5 rounded-xl border flex items-center justify-center transition-all cursor-pointer shrink-0 active:scale-95 shadow-2xs ${
                  showThreeDotMenu
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white/85 backdrop-blur-sm border-black/10 text-slate-700 hover:bg-white'
                }`}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>

              <AnimatePresence>
                {showThreeDotMenu && (
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -6, scale: 0.9 }}
                    transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                    className="absolute right-0 top-full mt-2 w-60 sm:w-64 z-50 space-y-2 origin-top-right"
                  >
                    <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl overflow-hidden divide-y divide-slate-100">
                      {/* 1. Delete */}
                      <button
                        type="button"
                        onClick={(e) => {
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                          const isBlankUnsavedDraft =
                            isNewDraft &&
                            !hasSavedCurrentNote &&
                            !editingNote.title.trim() &&
                            !editingNote.content.trim() &&
                            editingNote.checklistItems.length === 0;
                          if (isBlankUnsavedDraft) {
                            setEditingNote(null);
                            return;
                          }
                          promptDeleteSingle(editingNote, e);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-rose-50 hover:text-rose-700 flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4 text-slate-700 shrink-0" />
                        <span>Delete</span>
                      </button>

                      {/* 2. Pin */}
                      <button
                        type="button"
                        onClick={() => {
                          updateEditingNote((prev) => ({ ...prev, isPinned: !prev.isPinned }));
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <Pin
                            className={`w-4 h-4 rotate-45 shrink-0 ${
                              editingNote.isPinned ? 'fill-slate-900 text-slate-900' : 'text-slate-700'
                            }`}
                          />
                          <span>{editingNote.isPinned ? 'Unpin' : 'Pin'}</span>
                        </span>
                        {editingNote.isPinned && <Check className="w-4 h-4 text-blue-600 shrink-0" />}
                      </button>

                      {/* 3. Save */}
                      <button
                        type="button"
                        onClick={async () => {
                          await persistNoteInEditor(false);
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                          showNotification({
                            id: 'notes-save',
                            message: 'Note saved',
                            type: 'success',
                            duration: 2000,
                          });
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <Save className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>{!hasSavedCurrentNote || hasUnsavedChanges ? 'Save' : 'Saved'}</span>
                        </span>
                        {hasSavedCurrentNote && !hasUnsavedChanges && (
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                        )}
                      </button>

                      {/* 4. Share */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                          void handleShareNotes([editingNote], true);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-sky-50/70 flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <Share2 className="w-4 h-4 text-sky-600 shrink-0" />
                        <span>Share</span>
                      </button>

                      {/* 4. Add Label/Tags */}
                      <button
                        type="button"
                        onClick={() => {
                          setShowFullPageTagInput(true);
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <Tag className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>Add Label/Tags</span>
                        </span>
                        {editingNote.labels.length > 0 && (
                          <span className="text-[11px] font-bold text-slate-500">
                            {editingNote.labels.length}
                          </span>
                        )}
                      </button>

                      {/* 5. Set Reminder */}
                      <button
                        type="button"
                        onClick={async () => {
                          const perm = await requestNotificationPermission(currentUser?.id);
                          setNotificationPerm(perm);
                          setShowFullPageReminder(true);
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <Bell className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>{editingNote.reminderAt ? 'Edit Reminder' : 'Set Reminder'}</span>
                        </span>
                        {editingNote.reminderAt && <Check className="w-4 h-4 text-amber-600 shrink-0" />}
                      </button>

                      {/* 6. Note Color Submenu Trigger */}
                      <button
                        type="button"
                        onClick={() => setShowColorPaletteSubmenu((prev) => !prev)}
                        aria-expanded={showColorPaletteSubmenu}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center justify-between gap-3 transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-3">
                          <Palette className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>Note Color</span>
                        </span>
                        <span className="flex items-center gap-1.5 shrink-0">
                          <span
                            style={{ backgroundColor: getCompactNoteSurface(editingNote.color, false).bg }}
                            className="w-3.5 h-3.5 rounded-full border border-slate-300"
                          />
                          <ChevronRight
                            className={`w-4 h-4 text-slate-400 transition-transform duration-150 ${
                              showColorPaletteSubmenu ? 'rotate-90 text-slate-700' : ''
                            }`}
                          />
                        </span>
                      </button>

                      {/* 7. Checklist Toggle */}
                      <button
                        type="button"
                        onClick={() => {
                          updateEditingNote((prev) => ({ ...prev, isChecklist: !prev.isChecklist }));
                          setShowThreeDotMenu(false);
                          setShowColorPaletteSubmenu(false);
                        }}
                        className="w-full px-4 py-3 text-left text-sm font-medium text-slate-800 hover:bg-slate-50 flex items-center gap-3 transition-colors cursor-pointer"
                      >
                        <CheckSquare className="w-4 h-4 text-slate-700 shrink-0" />
                        <span>{editingNote.isChecklist ? 'Switch to Text Note' : 'Switch to Checklist'}</span>
                      </button>

                      {/* 8. Conditional Return to History (Only for notes imported from History) */}
                      {activeNoteSourceHistory && (
                        <button
                          type="button"
                          onClick={() => void handleReturnNoteToHistory()}
                          disabled={isReturningToHistory}
                          className="w-full px-4 py-3 text-left text-sm font-semibold text-blue-700 hover:bg-blue-50 flex items-center gap-3 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <History className="w-4 h-4 text-blue-600 shrink-0" />
                          <span>{isReturningToHistory ? 'Returning...' : 'Return to History'}</span>
                        </button>
                      )}
                    </div>

                    {/* Floating Note Color Sub-Card (Matches Reference Design) */}
                    <AnimatePresence>
                      {showColorPaletteSubmenu && (
                        <motion.div
                          initial={{ opacity: 0, y: -4, scale: 0.92 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.92 }}
                          transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                          className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/90 shadow-2xl p-3.5 space-y-2.5 origin-top-right"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-slate-900">Note Color</span>
                            <span className="text-[11px] font-medium text-slate-500">
                              {editingColorTheme.name}
                            </span>
                          </div>
                          <div className="grid grid-cols-4 gap-2.5 place-items-center">
                            {NOTE_COLORS.map((c) => {
                              const isSelectedColor = editingNote.color === c.id;
                              return (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => void handleChangeSavedNoteColor(c.id)}
                                  style={{ backgroundColor: c.hex }}
                                  className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center shadow-2xs ${
                                    isSelectedColor
                                      ? 'border-slate-900 scale-105'
                                      : 'border-slate-300/90'
                                  }`}
                                  title={c.name}
                                  aria-label={`Set note color to ${c.name}`}
                                >
                                  {isSelectedColor && <Check className="w-4 h-4 text-slate-900 stroke-[3]" />}
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </header>

          {/* Relocated Tag Chips Directly Below Header Near Back Button */}
          {(editingNote.labels.length > 0 || showFullPageTagInput) && (
            <div className="w-full px-3 sm:px-6 pb-2 shrink-0 space-y-2">
              {editingNote.labels.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pl-1">
                  {editingNote.labels.map((lbl) => (
                    <span
                      key={lbl}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold shadow-2xs ${getTagColorClass(
                        lbl
                      )}`}
                    >
                      <span>{lbl}</span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEditingNote((prev) => ({
                            ...prev,
                            labels: prev.labels.filter((l) => l !== lbl),
                          }))
                        }
                        aria-label={`Remove tag ${lbl}`}
                        className="hover:opacity-70 cursor-pointer p-0.5"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {showFullPageTagInput && (
                <div className="w-full max-w-md bg-white/90 rounded-2xl border border-black/10 p-3 space-y-2.5 shadow-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Tag className="w-3.5 h-3.5 text-slate-500" />
                      <span>Add Label / Tags</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowFullPageTagInput(false)}
                      className="text-xs font-bold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg cursor-pointer"
                    >
                      Done
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      autoFocus
                      value={fullPageNewTag}
                      onChange={(e) => setFullPageNewTag(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddTagInEditor();
                        }
                      }}
                      placeholder="Type tag name (e.g. Work, Math, Shopping)"
                      className="flex-1 min-w-0 min-h-[38px] bg-slate-50 border border-slate-200 rounded-xl px-3 text-xs font-medium text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-slate-400"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTagInEditor()}
                      disabled={!fullPageNewTag.trim()}
                      className="min-h-[38px] px-3.5 bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {['Work', 'Personal', 'Shopping', 'Food', 'Math']
                      .filter((preset) => !editingNote.labels.includes(preset))
                      .map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => handleAddTagInEditor(preset)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-semibold cursor-pointer transition-colors"
                        >
                          + {preset}
                        </button>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Clutter-Free Minimalist Note Content Workspace */}
          <div className="flex-1 overflow-y-auto overscroll-contain w-full max-w-2xl mx-auto px-5 sm:px-8 pt-2 pb-10 flex flex-col gap-4 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            <section className="space-y-3.5 flex-1 flex flex-col">
              <input
                type="text"
                autoFocus={isNewDraft}
                value={editingNote.title}
                onChange={(e) => updateEditingNote((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Title"
                className={`w-full bg-transparent font-black text-2xl sm:text-3xl placeholder:text-slate-400 focus:outline-none tracking-tight ${
                  isDark ? 'text-slate-100' : 'text-slate-900'
                }`}
              />

              {!editingNote.isChecklist ? (
                <textarea
                  value={editingNote.content}
                  onChange={(e) => updateEditingNote((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Start writing your note..."
                  rows={12}
                  className={`w-full flex-1 min-h-[280px] bg-transparent text-sm sm:text-base placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed ${
                    isDark ? 'text-slate-200' : 'text-slate-800'
                  }`}
                />
              ) : (
                <div className="bg-white/85 rounded-2xl border border-black/10 divide-y divide-black/5 overflow-hidden shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
                  {editingNote.checklistItems.map((ci) => (
                    <div key={ci.id} className="flex items-center gap-2.5 px-3 py-2 group">
                      <button
                        type="button"
                        onClick={() => {
                          updateEditingNote((prev) => ({
                            ...prev,
                            checklistItems: prev.checklistItems.map((item) =>
                              item.id === ci.id ? { ...item, completed: !item.completed } : item
                            ),
                          }));
                        }}
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center text-slate-600 hover:text-blue-600 cursor-pointer shrink-0"
                        aria-label={ci.completed ? 'Mark incomplete' : 'Mark complete'}
                      >
                        {ci.completed ? (
                          <CheckSquare className="w-5 h-5 text-blue-600" />
                        ) : (
                          <Square className="w-5 h-5" />
                        )}
                      </button>
                      <input
                        type="text"
                        value={ci.text}
                        onChange={(e) => {
                          const val = e.target.value;
                          updateEditingNote((prev) => ({
                            ...prev,
                            checklistItems: prev.checklistItems.map((item) =>
                              item.id === ci.id ? { ...item, text: val } : item
                            ),
                          }));
                        }}
                        className={`flex-1 min-w-0 bg-transparent text-sm sm:text-base focus:outline-none ${
                          ci.completed ? 'line-through text-slate-400' : 'text-slate-900 font-medium'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          updateEditingNote((prev) => ({
                            ...prev,
                            checklistItems: prev.checklistItems.filter((item) => item.id !== ci.id),
                          }));
                        }}
                        className="min-h-[38px] min-w-[38px] flex items-center justify-center text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                        aria-label="Remove checklist item"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center gap-2 px-3 py-2 bg-slate-50/70">
                    <Plus className="w-4 h-4 text-slate-400 shrink-0 ml-2.5" />
                    <input
                      type="text"
                      value={checklistDraftItem}
                      onChange={(e) => setChecklistDraftItem(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddChecklistItemToEditor();
                        }
                      }}
                      placeholder="Add list item..."
                      className="flex-1 min-w-0 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none py-2"
                    />
                    <button
                      type="button"
                      onClick={handleAddChecklistItemToEditor}
                      disabled={!checklistDraftItem.trim()}
                      className="min-h-[36px] px-3 rounded-lg bg-slate-900 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                    >
                      Add
                    </button>
                  </div>
                </div>
              )}

              {/* Contextual Reminder Strip (Only displayed when a reminder is active or user opened Set Reminder from 3-dot menu) */}
              {(editingNote.reminderAt || showFullPageReminder) && (
                <div className="pt-2 space-y-2.5">
                  {editingNote.reminderAt && (
                    <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50/95 text-amber-950 rounded-xl border border-amber-200/90 text-xs font-semibold">
                      <span className="flex items-center gap-2 min-w-0">
                        <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                        <span className="truncate">
                          {new Date(editingNote.reminderAt).toLocaleString([], {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                        {editingNote.isEmergency && (
                          <span className="text-rose-700 font-bold shrink-0">· Urgent</span>
                        )}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateEditingNote((prev) => ({ ...prev, reminderAt: null, isEmergency: false }))
                        }
                        className="text-xs font-bold text-rose-600 hover:text-rose-700 px-2 py-1 rounded-lg hover:bg-rose-50 cursor-pointer shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  )}

                  {showFullPageReminder && (
                    <div className="bg-white/90 rounded-2xl border border-black/10 p-3 space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                          <Bell className="w-3.5 h-3.5 text-slate-500" />
                          <span>Set Reminder</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setShowFullPageReminder(false)}
                          className="text-xs font-bold text-blue-700 hover:bg-blue-50 px-2 py-1 rounded-lg cursor-pointer"
                        >
                          Done
                        </button>
                      </div>

                      {notificationPerm !== 'granted' && notificationPerm !== 'unsupported' && (
                        <div className="flex items-center justify-between gap-2 p-2.5 bg-indigo-50/90 text-indigo-950 rounded-xl border border-indigo-200/80 text-[11px]">
                          <span className="font-medium leading-snug">
                            {notificationPerm === 'denied'
                              ? 'Notifications are blocked in browser settings.'
                              : 'Allow push notifications so reminders alert you offline.'}
                          </span>
                          {notificationPerm !== 'denied' && (
                            <button
                              type="button"
                              onClick={async () => {
                                const perm = await requestNotificationPermission(currentUser?.id);
                                setNotificationPerm(perm);
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-[11px] shrink-0 cursor-pointer"
                            >
                              Allow
                            </button>
                          )}
                        </div>
                      )}

                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <input
                          type="datetime-local"
                          value={editingNote.reminderAt ? editingNote.reminderAt.substring(0, 16) : ''}
                          onChange={async (e) => {
                            const perm = await requestNotificationPermission(currentUser?.id);
                            setNotificationPerm(perm);
                            updateEditingNote((prev) => ({
                              ...prev,
                              reminderAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                            }));
                          }}
                          className="flex-1 min-h-[40px] bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:outline-none focus:border-slate-400"
                        />
                        <label className="flex items-center gap-2 text-xs font-semibold text-rose-700 cursor-pointer select-none min-h-[36px]">
                          <input
                            type="checkbox"
                            checked={!!editingNote.isEmergency}
                            onChange={(e) =>
                              updateEditingNote((prev) => ({ ...prev, isEmergency: e.target.checked }))
                            }
                            className="rounded text-rose-600"
                          />
                          <span>Emergency Alarm</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </section>
          </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}

      {/* EXPLICIT CONFIRMATION DIALOG (DELETION SAFEGUARD, Portaled to document.body at z-[100000]) */}
      {confirmDeleteTarget && isMounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                <AlertTriangle className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900">
                  {confirmDeleteTarget.type === 'single'
                    ? 'Delete Note Permanently?'
                    : `Delete ${confirmDeleteTarget.ids.length} Selected Notes?`}
                </h3>
                <p className="text-xs text-slate-500">
                  This action requires explicit approval and cannot be reversed.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
              {confirmDeleteTarget.type === 'single' ? (
                <span>
                  Are you sure you want to delete{' '}
                  <strong className="text-slate-900 font-bold">
                    &quot;{confirmDeleteTarget.note.title || 'Untitled Note'}&quot;
                  </strong>
                  ? It will be permanently removed from your device storage and cloud database.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete all{' '}
                  <strong className="text-rose-700 font-bold">{confirmDeleteTarget.ids.length}</strong> selected
                  notes? All their contents, checklists, and labels will be deleted permanently.
                </span>
              )}
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTarget(null)}
                disabled={isDeleting}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer min-h-[40px]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedDeletion}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 min-h-[40px]"
              >
                {isDeleting ? (
                  <>
                    <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>
                      {confirmDeleteTarget.type === 'single'
                        ? 'Delete Permanently'
                        : `Delete ${confirmDeleteTarget.ids.length} Notes`}
                    </span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );

  function renderNoteCard(note: NoteItem) {
    const surface = getCompactNoteSurface(note.color, isDark);
    const isOverdue = note.reminderAt && new Date(note.reminderAt) < new Date();
    const isSelected = selectedNoteIds.includes(note.id);

    const previewText = note.isChecklist
      ? note.checklistItems.length > 0
        ? note.checklistItems
            .slice(0, 3)
            .map((ci) => `${ci.completed ? '✓' : '○'} ${ci.text}`)
            .join(', ')
        : 'Empty checklist'
      : note.content.trim() || 'Tap to add details...';

    const primaryLabel = note.labels[0] || null;
    const extraLabelsCount = note.labels.length > 1 ? note.labels.length - 1 : 0;

    return (
      <motion.article
        key={note.id}
        layout
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: isSelected ? 1.01 : 1 }}
        exit={{ opacity: 0, scale: 0.92 }}
        whileHover={selectedNoteIds.length === 0 ? { y: -2 } : undefined}
        transition={{
          layout: { type: 'spring', stiffness: 400, damping: 32, mass: 0.85 },
          opacity: { duration: 0.18 },
          scale: { duration: 0.18 },
        }}
        data-note-card="true"
        data-note-color={note.color || 'default'}
        onTouchStart={(e) => handleStartLongPress(note.id, e.touches[0]?.clientX, e.touches[0]?.clientY)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleCancelLongPress}
        onMouseDown={(e) => handleStartLongPress(note.id, e.clientX, e.clientY)}
        onMouseUp={handleCancelLongPress}
        onMouseLeave={handleCancelLongPress}
        onClick={(e) => {
          if (isLongPressFiredRef.current) {
            isLongPressFiredRef.current = false;
            return;
          }
          if (selectedNoteIds.length > 0) {
            handleToggleSelectNote(note.id, e);
          } else {
            openExistingNoteEditor(note);
          }
        }}
        style={{
          backgroundColor: surface.bg,
          borderColor: isSelected ? '#3b82f6' : surface.border,
          borderRadius: 16,
        }}
        className={`group relative h-full rounded-2xl p-3 sm:p-3.5 border transition-shadow duration-150 hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[132px] sm:min-h-[144px] shadow-[0_2px_8px_rgba(15,23,42,0.04)] select-none overflow-hidden ${
          isSelected ? 'ring-2 ring-blue-500 shadow-md' : ''
        }`}
      >
        {/* Top Section: Title + Concise Body Preview */}
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <div className="flex items-start gap-1.5 min-w-0 flex-1">
              {selectedNoteIds.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => handleToggleSelectNote(note.id, e)}
                  className={`mt-0.5 rounded-md transition-transform hover:scale-110 cursor-pointer shrink-0 ${
                    isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  aria-label={isSelected ? 'Deselect note' : 'Select note'}
                >
                  {isSelected ? (
                    <CheckCircle2 className="w-4 h-4 fill-blue-600 text-white" />
                  ) : (
                    <Square className="w-4 h-4 bg-white/90 rounded-sm" />
                  )}
                </button>
              )}

              <h4 className="font-bold text-slate-900 text-[13px] sm:text-sm tracking-tight leading-snug line-clamp-2 break-words">
                {note.title || 'Untitled Note'}
              </h4>
            </div>

            {note.reminderAt && (
              <span
                className={`shrink-0 mt-0.5 ${
                  note.isEmergency
                    ? 'text-rose-600'
                    : isOverdue
                    ? 'text-amber-600'
                    : 'text-blue-600'
                }`}
                title={`Reminder: ${new Date(note.reminderAt).toLocaleString([], {
                  dateStyle: 'short',
                  timeStyle: 'short',
                })}`}
              >
                <Bell className="w-3.5 h-3.5" />
              </span>
            )}
          </div>

          <p className="mt-1.5 text-[11px] sm:text-xs text-slate-600 leading-relaxed line-clamp-3 break-words font-normal">
            {previewText}
          </p>
        </div>

        {/* Footer Row: Color-Coded Tag Pill + Single-Tap Pin Status */}
        <div className="pt-2.5 mt-auto flex items-center justify-between gap-1.5 min-w-0">
          <div className="flex items-center gap-1 min-w-0">
            {primaryLabel ? (
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold truncate max-w-[100px] sm:max-w-[120px] ${getTagColorClass(
                  primaryLabel
                )}`}
              >
                {primaryLabel}
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-semibold bg-slate-900/10 text-slate-700 truncate">
                {note.isChecklist ? 'Checklist' : 'Note'}
              </span>
            )}

            {extraLabelsCount > 0 && (
              <span className="text-[10px] font-bold text-slate-500 shrink-0">
                +{extraLabelsCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={(e) => handleTogglePin(note.id, e)}
              aria-label={note.isPinned ? 'Unpin note' : 'Pin note'}
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
              className={`w-7 h-7 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer active:scale-90 ${
                note.isPinned
                  ? 'text-slate-900 hover:bg-black/5'
                  : 'text-slate-400 hover:text-slate-700 hover:bg-black/5'
              }`}
            >
              <Pin
                className={`w-3.5 h-3.5 rotate-45 transition-transform ${
                  note.isPinned
                    ? 'fill-slate-900 text-slate-900'
                    : 'fill-slate-300/75 text-slate-400'
                }`}
              />
            </button>
            {(currentUser?.id ? note.syncStatus === 'unsynced' : Boolean(note.createdOffline)) && (
              <span
                title="Not backed up to cloud"
                aria-label="Not backed up to cloud"
                className="text-red-500 flex items-center justify-center shrink-0"
              >
                <CloudOff className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
      </motion.article>
    );
  }
}
