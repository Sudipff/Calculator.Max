'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  RotateCcw,
  RotateCw,
  StickyNote,
  Check,
  ArrowLeft,
  CheckCircle2,
  MoreVertical,
  CloudOff,
  User,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NoteItem, NOTE_COLORS } from '@/lib/types/notes-tasks';
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

interface NotesViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
  onFullScreenChange?: (isFullscreen: boolean) => void;
  onSubOverlayChange?: (hasOverlay: boolean) => void;
  closeEditorSignal?: number;
  refreshSignal?: number;
  onOpenProfile?: () => void;
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

export default function NotesView({
  currentUser,
  onFullScreenChange,
  onSubOverlayChange,
  closeEditorSignal = 0,
  refreshSignal = 0,
  onOpenProfile,
}: NotesViewProps) {
  const { isDark } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
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

  // Unified Full-Page Note Editing View State
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [isNewDraft, setIsNewDraft] = useState(false);
  const [hasSavedCurrentNote, setHasSavedCurrentNote] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showThreeDotMenu, setShowThreeDotMenu] = useState(false);
  const [checklistDraftItem, setChecklistDraftItem] = useState('');
  const [fullPageNewTag, setFullPageNewTag] = useState('');
  const [showFullPageTagInput, setShowFullPageTagInput] = useState(false);
  const [showFullPageReminder, setShowFullPageReminder] = useState(false);
  const [showManagerMenu, setShowManagerMenu] = useState(false);
  const [notificationPerm, setNotificationPerm] = useState<NotificationPermission | 'unsupported'>('default');

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
      }
      if (showManagerMenu && managerMenuRef.current && !managerMenuRef.current.contains(event.target as Node)) {
        setShowManagerMenu(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [showThreeDotMenu, showManagerMenu]);

  // Layout Optimization: Prevent Background Scrolling and Hide Main Header when Note Editing View is active
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

  const hasOpenSubOverlay = Boolean(editingNote || confirmDeleteTarget || selectedNoteIds.length > 0);
  useEffect(() => {
    onSubOverlayChange?.(hasOpenSubOverlay);
    return () => {
      onSubOverlayChange?.(false);
    };
  }, [hasOpenSubOverlay, onSubOverlayChange]);

  const handleCloseEditorRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (closeEditorSignal > 0) {
      if (confirmDeleteTarget) {
        setConfirmDeleteTarget(null);
      } else if (showThreeDotMenu) {
        setShowThreeDotMenu(false);
      } else if (editingNote) {
        handleCloseEditorRef.current?.();
      } else if (selectedNoteIds.length > 0) {
        setSelectedNoteIds([]);
      }
    }
  }, [closeEditorSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load notes on mount or user change & subscribe to background offline sync completion
  useEffect(() => {
    let isSubscribed = true;
    setLoading(true);
    fetchNotes(currentUser?.id).then((data) => {
      if (isSubscribed) {
        setNotes(data);
        setLoading(false);
      }
    });

    const handleSyncUpdated = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      const freshLocal = getLocalNotes(currentUser?.id);
      setNotes(freshLocal);
      if (detail?.syncedCount > 0) {
        setRefreshNotice(`Synced ${detail.syncedCount} offline change${detail.syncedCount === 1 ? '' : 's'}`);
        setTimeout(() => setRefreshNotice(null), 2600);
      }
    };

    window.addEventListener('calcmax:sync-updated', handleSyncUpdated);
    return () => {
      isSubscribed = false;
      window.removeEventListener('calcmax:sync-updated', handleSyncUpdated);
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
      setRefreshNotice('Notes updated');
      setTimeout(() => setRefreshNotice(null), 2200);
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
    const nowIso = new Date().toISOString();
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
      syncStatus: currentUser?.id ? 'synced' : 'unsynced',
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
    });
    setIsNewDraft(false);
    setHasSavedCurrentNote(true);
    setHasUnsavedChanges(false);
    setShowThreeDotMenu(false);
    setChecklistDraftItem('');
    setFullPageNewTag('');
    setShowFullPageTagInput(false);
    setShowFullPageReminder(false);
  };

  const updateEditingNote = (updater: (prev: NoteItem) => NoteItem) => {
    setEditingNote((prev) => {
      if (!prev) return prev;
      return updater(prev);
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

    setIsDeleting(false);
    setConfirmDeleteTarget(null);
  };

  // Batch Selection Handlers
  const handleToggleSelectNote = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedNoteIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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
    const updated = notes.map((n) =>
      n.id === id ? { ...n, isPinned: !n.isPinned, syncStatus: 'unsynced' as const, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === id);
    if (target && currentUser?.id) {
      const res = await upsertNoteToSupabase(target, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, syncStatus: res.syncStatus } : n)));
    }
  };

  const handleBatchUpdateColor = async (newColor: string) => {
    if (selectedNoteIds.length === 0) return;
    const nowIso = new Date().toISOString();
    const updated = notes.map((n) =>
      selectedNoteIds.includes(n.id) ? { ...n, color: newColor, syncStatus: 'unsynced' as const, updatedAt: nowIso } : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    for (const id of selectedNoteIds) {
      const target = updated.find((n) => n.id === id);
      if (target && currentUser?.id) {
        const res = await upsertNoteToSupabase(target, currentUser.id);
        setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, syncStatus: res.syncStatus } : n)));
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

    const noteToSave: NoteItem = {
      ...editingNote,
      title: editingNote.title.trim() || (!closeAfter && isBlankDraft ? 'Untitled Note' : editingNote.title.trim()),
      syncStatus: 'unsynced',
      updatedAt: new Date().toISOString(),
    };

    const existsInList = notes.some((n) => n.id === noteToSave.id);
    const updated = existsInList
      ? notes.map((n) => (n.id === noteToSave.id ? noteToSave : n))
      : [noteToSave, ...notes];

    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
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
      setNotes((prev) => prev.map((n) => (n.id === noteToSave.id ? { ...n, syncStatus: res.syncStatus } : n)));
      if (!closeAfter) {
        setEditingNote((prev) => (prev && prev.id === noteToSave.id ? { ...prev, syncStatus: res.syncStatus } : prev));
      }
    }
  };

  const handleChangeSavedNoteColor = async (colorId: string) => {
    if (!editingNote) return;
    const updatedNote: NoteItem = {
      ...editingNote,
      color: colorId,
      syncStatus: 'unsynced',
      updatedAt: new Date().toISOString(),
    };

    const existsInList = notes.some((n) => n.id === updatedNote.id);
    const updated = existsInList
      ? notes.map((n) => (n.id === updatedNote.id ? updatedNote : n))
      : [updatedNote, ...notes];

    setEditingNote(updatedNote);
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    setShowThreeDotMenu(false);

    if (currentUser?.id) {
      const res = await upsertNoteToSupabase(updatedNote, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? { ...n, syncStatus: res.syncStatus } : n)));
      setEditingNote((prev) => (prev && prev.id === updatedNote.id ? { ...prev, syncStatus: res.syncStatus } : prev));
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
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [notes, searchQuery, selectedLabel, onlyPinned]);

  const editingColorTheme = editingNote
    ? NOTE_COLORS.find((c) => c.id === editingNote.color) || NOTE_COLORS[0]
    : NOTE_COLORS[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
      className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-4 pb-16"
    >
      {/* Sticky Header: Title + Profile Avatar, Search Bar + Three-Dot Menu, and Filter Chips */}
      <div
        data-sticky-secondary-header="notes"
        className="sticky top-0 z-30 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 pt-2.5 pb-2.5 bg-[#f2f8fc]/95 backdrop-blur-md border-b border-slate-200/70 shadow-[0_2px_10px_rgba(15,23,42,0.03)] space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
            Notes Manager
          </h2>

          <div className="flex items-center gap-1.5 shrink-0">
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

            {showManagerMenu && (
              <div className="absolute right-0 top-full mt-2 w-48 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40">
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
              </div>
            )}
          </div>
        </div>

        {/* Interactive Filter Pills: All Notes, Pinned, + Labels */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-none">
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
      </div>

      {/* Floating or Sticky Batch Action Bar when items are selected via Long-Press */}
      {selectedNoteIds.length > 0 && (
        <div className="sticky top-[132px] z-20 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-slate-700">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-amber-500 text-white flex items-center justify-center text-xs font-black">
              {selectedNoteIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedNoteIds.length} {selectedNoteIds.length === 1 ? 'note' : 'notes'} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
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
              onClick={promptDeleteBatch}
              disabled={selectedNoteIds.length === 0}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedNoteIds.length})</span>
            </button>

            <button
              type="button"
              onClick={handleCancelSelection}
              className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              title="Cancel selection"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Compact Multi-Column Notes Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm font-semibold flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4 animate-spin text-amber-500" />
          <span>Loading your notes...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-14 text-center max-w-sm mx-auto space-y-3 bg-white/80 rounded-2xl border border-slate-200/70 p-6">
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0">
          {filteredNotes.map((note) => renderNoteCard(note))}
        </div>
      )}

      {/* Minimized, unobtrusive 'Notes Updated' / Sync Status micro-pill relocated to bottom-left */}
      <AnimatePresence>
        {!editingNote &&
          (refreshNotice || (currentUser?.id && notes.some((n) => n.syncStatus === 'unsynced'))) && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.94 }}
              transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
              className="fixed bottom-20 left-4 sm:left-6 z-30 pointer-events-none"
            >
              {refreshNotice ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-emerald-200/80 shadow-xs">
                  <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
                  <span>{refreshNotice}</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50/95 backdrop-blur-md px-2.5 py-1 rounded-full border border-amber-200/80 shadow-xs"
                  title="Saved offline — will sync automatically when connected"
                >
                  <CloudOff className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                  <span>Pending Sync</span>
                </span>
              )}
            </motion.div>
          )}
      </AnimatePresence>

      {/* Floating + Action Button (Bottom Right above Bottom Nav) */}
      {!editingNote && selectedNoteIds.length === 0 && (
        <button
          type="button"
          onClick={openNewNoteEditor}
          aria-label="Create new note"
          title="New Note"
          className="fixed bottom-20 right-4 sm:right-6 z-30 w-13 h-13 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* NOTE EDITING VIEW (Clean Unified Full-Page Workspace) */}
      {editingNote && isMounted && typeof document !== 'undefined' && createPortal(
        <div
          data-note-card="true"
          data-note-editor="true"
          data-note-color={editingNote.color || 'default'}
          style={{ backgroundColor: isDark ? '#0f172a' : getCompactNoteSurface(editingNote.color, false).bg }}
          className="fixed inset-0 z-[99999] w-screen h-[100dvh] flex flex-col overscroll-none select-text touch-manipulation transition-colors duration-200"
        >
          {/* Consistent Top Toolbar: Back + Subtle Status | Pin, Delete, Save, Post-Save Three-Dot Menu */}
          <header className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-black/10 px-3 sm:px-6 py-2.5 flex items-center justify-between gap-2 shrink-0 pt-[max(0.625rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={handleCloseEditor}
                className="min-h-[42px] min-w-[42px] flex items-center justify-center rounded-xl text-slate-800 hover:bg-black/5 transition-colors cursor-pointer active:scale-95 shrink-0"
                aria-label="Back to notes"
                title="Back to notes"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              <span className="text-xs font-medium text-slate-600 truncate">
                {!hasSavedCurrentNote
                  ? 'New draft'
                  : hasUnsavedChanges
                  ? 'Unsaved edits'
                  : editingNote.syncStatus === 'synced'
                  ? 'Synced'
                  : 'Saved'}
              </span>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* Pin Action */}
              <button
                type="button"
                onClick={() => updateEditingNote((prev) => ({ ...prev, isPinned: !prev.isPinned }))}
                className={`min-h-[40px] min-w-[40px] px-2.5 sm:px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                  editingNote.isPinned
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50'
                }`}
                aria-label={editingNote.isPinned ? 'Unpin note' : 'Pin note'}
                title={editingNote.isPinned ? 'Unpin note' : 'Pin note'}
              >
                <Pin className={`w-4 h-4 rotate-45 ${editingNote.isPinned ? 'fill-white text-white' : ''}`} />
                <span className="hidden sm:inline">{editingNote.isPinned ? 'Pinned' : 'Pin'}</span>
              </button>

              {/* Delete Action */}
              <button
                type="button"
                onClick={(e) => {
                  const isBlankUnsavedDraft =
                    isNewDraft &&
                    !hasSavedCurrentNote &&
                    !editingNote.title.trim() &&
                    !editingNote.content.trim() &&
                    editingNote.checklistItems.length === 0;
                  if (isBlankUnsavedDraft) {
                    setEditingNote(null);
                    setShowThreeDotMenu(false);
                    return;
                  }
                  promptDeleteSingle(editingNote, e);
                }}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-white border border-slate-200/90 text-rose-600 hover:bg-rose-50 hover:border-rose-200 flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95"
                aria-label="Delete note"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Save Action */}
              <button
                type="button"
                onClick={() => void persistNoteInEditor(false)}
                className={`min-h-[40px] px-3.5 sm:px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap shrink-0 active:scale-95 ${
                  !hasSavedCurrentNote || hasUnsavedChanges
                    ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                    : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                }`}
                title={!hasSavedCurrentNote || hasUnsavedChanges ? 'Save note' : 'Note saved'}
              >
                <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                <span>{!hasSavedCurrentNote || hasUnsavedChanges ? 'Save' : 'Saved'}</span>
              </button>

              {/* Three-Dot Color Palette Menu (Appears once saved) */}
              {hasSavedCurrentNote && !hasUnsavedChanges && (
                <div ref={threeDotMenuRef} className="relative">
                  <button
                    type="button"
                    onClick={() => setShowThreeDotMenu((prev) => !prev)}
                    aria-label="More options and color palette"
                    aria-expanded={showThreeDotMenu}
                    title="Color Palette & Options"
                    className={`min-h-[40px] min-w-[40px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer shrink-0 active:scale-95 ${
                      showThreeDotMenu
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white border-slate-200/90 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {showThreeDotMenu && (
                    <div className="absolute right-0 top-full mt-2 w-64 sm:w-72 bg-white rounded-2xl border border-slate-200 shadow-2xl p-3.5 z-50 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <Palette className="w-3.5 h-3.5 text-slate-600" />
                          <span>Note Color</span>
                        </span>
                        <span className="text-[11px] font-medium text-slate-500">
                          {editingColorTheme.name}
                        </span>
                      </div>

                      <div className="grid grid-cols-6 gap-2">
                        {NOTE_COLORS.map((c) => {
                          const swatchSurface = getCompactNoteSurface(c.id);
                          const isSelectedColor = editingNote.color === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => void handleChangeSavedNoteColor(c.id)}
                              style={{ backgroundColor: swatchSurface.bg }}
                              className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                                isSelectedColor
                                  ? 'border-slate-900 scale-105 shadow-xs'
                                  : 'border-slate-300/90'
                              }`}
                              title={c.name}
                              aria-label={`Set note color to ${c.name}`}
                            >
                              {isSelectedColor && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[3]" />}
                            </button>
                          );
                        })}
                      </div>

                      <div className="pt-2 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => {
                            updateEditingNote((prev) => ({ ...prev, isChecklist: !prev.isChecklist }));
                            setShowThreeDotMenu(false);
                          }}
                          className="w-full min-h-[38px] px-2.5 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between cursor-pointer transition-colors"
                        >
                          <span className="flex items-center gap-2">
                            <CheckSquare className="w-3.5 h-3.5 text-slate-500" />
                            <span>{editingNote.isChecklist ? 'Switch to Text Note' : 'Switch to Checklist'}</span>
                          </span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </header>

          {/* Main Scrollable Workspace */}
          <div className="flex-1 overflow-y-auto overscroll-contain w-full max-w-2xl mx-auto px-4 sm:px-8 py-5 sm:py-7 flex flex-col gap-5 pb-[max(2.5rem,env(safe-area-inset-bottom))]">
            {/* Clean Writing Canvas */}
            <section className="space-y-4">
              <div className="border-b border-black/10 pb-3 flex items-center justify-between gap-3">
                <input
                  type="text"
                  autoFocus={isNewDraft}
                  value={editingNote.title}
                  onChange={(e) => updateEditingNote((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Title"
                  className="w-full bg-transparent font-black text-2xl sm:text-3xl text-slate-900 placeholder:text-slate-400 focus:outline-none tracking-tight"
                />
                {(!hasSavedCurrentNote || hasUnsavedChanges) && (
                  <button
                    type="button"
                    onClick={() => updateEditingNote((prev) => ({ ...prev, isChecklist: !prev.isChecklist }))}
                    className={`min-h-[36px] px-2.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                      editingNote.isChecklist
                        ? 'bg-slate-900 text-white'
                        : 'bg-white/80 border border-black/10 text-slate-700 hover:bg-white'
                    }`}
                    title={editingNote.isChecklist ? 'Switch to text note' : 'Switch to checklist'}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    <span>{editingNote.isChecklist ? 'Checklist' : 'List'}</span>
                  </button>
                )}
              </div>

              {!editingNote.isChecklist ? (
                <textarea
                  value={editingNote.content}
                  onChange={(e) => updateEditingNote((prev) => ({ ...prev, content: e.target.value }))}
                  placeholder="Start writing your note..."
                  rows={8}
                  className="w-full min-h-[210px] sm:min-h-[260px] bg-transparent text-sm sm:text-base text-slate-800 placeholder:text-slate-400 focus:outline-none resize-y leading-relaxed"
                />
              ) : (
                <div className="bg-white/90 rounded-2xl border border-black/10 divide-y divide-black/5 overflow-hidden shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
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
            </section>

            {/* Neatly Organized Bottom Cards: Labels & Tags + Reminders */}
            <section className="space-y-3 pt-2">
              {/* 1. Labels & Tags Card */}
              <div className="bg-white/90 rounded-2xl border border-black/10 p-4 space-y-3 shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-slate-500" />
                    <span>Labels &amp; Tags</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowFullPageTagInput((prev) => !prev)}
                    className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                  >
                    {showFullPageTagInput ? 'Done' : '+ Add Tag'}
                  </button>
                </div>

                {editingNote.labels.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {editingNote.labels.map((lbl) => (
                      <span
                        key={lbl}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold ${getTagColorClass(
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
                ) : (
                  <p className="text-xs text-slate-500">No labels or tags assigned yet.</p>
                )}

                {showFullPageTagInput && (
                  <div className="pt-2 border-t border-slate-100 space-y-2.5">
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
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

              {/* 2. Reminders Card */}
              <div className="bg-white/90 rounded-2xl border border-black/10 p-4 space-y-3 shadow-[0_1px_4px_rgba(15,23,42,0.03)]">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Bell className="w-3.5 h-3.5 text-slate-500" />
                    <span>Reminders</span>
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      const perm = await requestNotificationPermission(currentUser?.id);
                      setNotificationPerm(perm);
                      setShowFullPageReminder((prev) => !prev);
                    }}
                    className="min-h-[32px] px-2.5 rounded-lg text-xs font-bold text-blue-700 hover:bg-blue-50 cursor-pointer whitespace-nowrap shrink-0 transition-colors"
                  >
                    {showFullPageReminder
                      ? 'Hide'
                      : editingNote.reminderAt
                      ? 'Edit Time'
                      : '+ Set Reminder'}
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

                {editingNote.reminderAt ? (
                  <div className="flex items-center justify-between gap-2 p-2.5 bg-amber-50 text-amber-950 rounded-xl border border-amber-200/90 text-xs font-semibold">
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
                ) : (
                  <p className="text-xs text-slate-500">No reminder scheduled for this note.</p>
                )}

                {showFullPageReminder && (
                  <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center gap-3">
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
                )}
              </div>

              {/* Clean Footer Meta */}
              <div className="flex items-center justify-between px-1 pt-1 text-[11px] text-slate-600">
                <span>
                  Updated {new Date(editingNote.updatedAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                <span>{editingNote.isChecklist ? 'Checklist' : 'Text Note'}</span>
              </div>
            </section>
          </div>
        </div>,
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
    </motion.div>
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
      <article
        key={note.id}
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
        }}
        className={`group relative rounded-2xl p-3 sm:p-3.5 border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between min-h-[126px] sm:min-h-[138px] shadow-[0_2px_8px_rgba(15,23,42,0.04)] select-none overflow-hidden ${
          isSelected ? 'ring-2 ring-blue-500 shadow-md scale-[1.01]' : ''
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
            {currentUser?.id && note.syncStatus === 'unsynced' && (
              <span
                title="Saved offline — pending cloud sync"
                className="text-amber-700 flex items-center justify-center"
              >
                <CloudOff className="w-3 h-3" />
              </span>
            )}
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
          </div>
        </div>
      </article>
    );
  }
}
