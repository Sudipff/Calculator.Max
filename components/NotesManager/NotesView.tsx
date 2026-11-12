'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Sparkles,
  Check,
  Calendar,
  ChevronDown,
  ArrowLeft,
  CheckCircle2,
} from 'lucide-react';
import { NoteItem, ChecklistItem, NOTE_COLORS } from '@/lib/types/notes-tasks';
import {
  fetchNotes,
  saveLocalNotes,
  upsertNoteToSupabase,
  deleteNoteFromSupabase,
  deleteNotesBatchFromSupabase,
} from '@/lib/notesTasksStorage';
import { playReminderChime, sendDeviceNotification, requestNotificationPermission } from '@/lib/reminderService';

interface NotesViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
}

export default function NotesView({ currentUser }: NotesViewProps) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Batch Selection State (Activated by Long-Press)
  const [selectedNoteIds, setSelectedNoteIds] = useState<string[]>([]);

  // Deletion Safeguard Modal State
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    { type: 'single'; note: NoteItem } | { type: 'batch'; ids: string[] } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Quick Creator states
  const [isEditorExpanded, setIsEditorExpanded] = useState(false);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [color, setColor] = useState('default');
  const [isPinned, setIsPinned] = useState(false);
  const [isChecklist, setIsChecklist] = useState(false);
  const [checklistItems, setChecklistItems] = useState<ChecklistItem[]>([]);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [labels, setLabels] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState('');
  const [showTagInput, setShowTagInput] = useState(false);
  const [reminderAt, setReminderAt] = useState<string>('');
  const [isEmergency, setIsEmergency] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showReminderPicker, setShowReminderPicker] = useState(false);

  // Full-Page View state
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [fullPageNewTag, setFullPageNewTag] = useState('');
  const [showFullPageTagInput, setShowFullPageTagInput] = useState(false);
  const [showFullPageReminder, setShowFullPageReminder] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressFiredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Layout Optimization: Prevent Background Scrolling when Full-Page View is active
  useEffect(() => {
    if (editingNote) {
      const originalOverflow = document.body.style.overflow;
      const originalOverscroll = document.body.style.overscrollBehavior;
      document.body.style.overflow = 'hidden';
      document.body.style.overscrollBehavior = 'none';

      return () => {
        document.body.style.overflow = originalOverflow;
        document.body.style.overscrollBehavior = originalOverscroll;
      };
    }
  }, [editingNote]);

  // Load notes on mount or user change
  useEffect(() => {
    let isSubscribed = true;
    setLoading(true);
    fetchNotes(currentUser?.id).then((data) => {
      if (isSubscribed) {
        setNotes(data);
        setLoading(false);
      }
    });

    return () => {
      isSubscribed = false;
    };
  }, [currentUser]);

  // Click outside quick creator to collapse/save
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (editorRef.current && !editorRef.current.contains(e.target as Node)) {
        if (title.trim() || content.trim() || checklistItems.length > 0) {
          handleCreateNote();
        } else {
          resetEditor();
        }
      }
    }

    if (isEditorExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isEditorExpanded, title, content, checklistItems, color, isPinned, isChecklist, labels, reminderAt, isEmergency]);

  // Active reminder listener
  useEffect(() => {
    const interval = setInterval(() => {
      const now = new Date();
      notes.forEach((note) => {
        if (note.reminderAt) {
          const reminderTime = new Date(note.reminderAt);
          const diff = Math.abs(now.getTime() - reminderTime.getTime());
          if (diff <= 35000 && !(note as any)._notified) {
            (note as any)._notified = true;
            playReminderChime(note.isEmergency);
            sendDeviceNotification(`Reminder: ${note.title || 'Note Alert'}`, {
              body: note.content || `${note.checklistItems.length} checklist items due`,
            });
          }
        }
      });
    }, 30000);

    return () => clearInterval(interval);
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

  // Manual Real-Time Data Refresh (No page reload)
  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      const freshNotes = await fetchNotes(currentUser?.id);
      setNotes(freshNotes);
      setRefreshNotice('Notes synchronized in real-time');
      setTimeout(() => setRefreshNotice(null), 3000);
    } catch (err) {
      console.warn('Manual refresh notice:', err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  const resetEditor = () => {
    setTitle('');
    setContent('');
    setColor('default');
    setIsPinned(false);
    setIsChecklist(false);
    setChecklistItems([]);
    setNewChecklistText('');
    setLabels([]);
    setReminderAt('');
    setIsEmergency(false);
    setShowTagInput(false);
    setShowColorPicker(false);
    setShowReminderPicker(false);
    setIsEditorExpanded(false);
  };

  const handleCreateNote = async () => {
    if (!title.trim() && !content.trim() && checklistItems.length === 0) {
      resetEditor();
      return;
    }

    const newNote: NoteItem = {
      id: 'note-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      title: title.trim(),
      content: content.trim(),
      color,
      isPinned,
      isChecklist,
      checklistItems,
      labels,
      reminderAt: reminderAt ? new Date(reminderAt).toISOString() : null,
      isEmergency,
      syncStatus: currentUser?.id ? 'synced' : 'unsynced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    resetEditor();

    // Immediate Supabase sync
    if (currentUser?.id) {
      const res = await upsertNoteToSupabase(newNote, currentUser.id);
      if (res.syncStatus !== newNote.syncStatus) {
        setNotes((prev) => prev.map((n) => (n.id === newNote.id ? { ...n, syncStatus: res.syncStatus } : n)));
      }
    }
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
      n.id === id ? { ...n, isPinned: !n.isPinned, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === id);
    if (target && currentUser?.id) {
      const res = await upsertNoteToSupabase(target, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, syncStatus: res.syncStatus } : n)));
    }
  };

  const handleUpdateNoteColor = async (id: string, newColor: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = notes.map((n) =>
      n.id === id ? { ...n, color: newColor, updatedAt: new Date().toISOString() } : n
    );
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === id);
    if (target && currentUser?.id) {
      const res = await upsertNoteToSupabase(target, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, syncStatus: res.syncStatus } : n)));
    }
  };

  const handleToggleChecklistItem = async (noteId: string, itemId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = notes.map((n) => {
      if (n.id === noteId) {
        const items = n.checklistItems.map((ci) => (ci.id === itemId ? { ...ci, completed: !ci.completed } : ci));
        return { ...n, checklistItems: items, updatedAt: new Date().toISOString() };
      }
      return n;
    });

    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === noteId);
    if (target && currentUser?.id) {
      const res = await upsertNoteToSupabase(target, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, syncStatus: res.syncStatus } : n)));
    }
  };

  const handleAddChecklistItemToEditor = () => {
    if (!newChecklistText.trim()) return;
    setChecklistItems([
      ...checklistItems,
      { id: 'item-' + Date.now(), text: newChecklistText.trim(), completed: false },
    ]);
    setNewChecklistText('');
  };

  const handleRemoveChecklistItemFromEditor = (id: string) => {
    setChecklistItems(checklistItems.filter((i) => i.id !== id));
  };

  const handleAddTagToEditor = () => {
    if (!newTagInput.trim()) return;
    const tag = newTagInput.trim();
    if (!labels.includes(tag)) {
      setLabels([...labels, tag]);
    }
    setNewTagInput('');
    setShowTagInput(false);
  };

  // Full-Page View save changes
  const handleSaveEditedNote = async () => {
    if (!editingNote) return;

    const noteToSave: NoteItem = {
      ...editingNote,
      updatedAt: new Date().toISOString(),
    };

    const updated = notes.map((n) => (n.id === noteToSave.id ? noteToSave : n));
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    setEditingNote(null);

    if (currentUser?.id) {
      const res = await upsertNoteToSupabase(noteToSave, currentUser.id);
      setNotes((prev) => prev.map((n) => (n.id === noteToSave.id ? { ...n, syncStatus: res.syncStatus } : n)));
    }
  };

  // Distinct labels across all notes
  const allLabels = useMemo(() => {
    const set = new Set<string>();
    notes.forEach((n) => n.labels.forEach((l) => set.add(l)));
    return Array.from(set);
  }, [notes]);

  // Filter notes
  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchSearch =
        searchQuery === '' ||
        n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
        n.checklistItems.some((ci) => ci.text.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchLabel = selectedLabel === null || n.labels.includes(selectedLabel);

      return matchSearch && matchLabel;
    });
  }, [notes, searchQuery, selectedLabel]);

  const pinnedNotes = useMemo(() => filteredNotes.filter((n) => n.isPinned), [filteredNotes]);
  const otherNotes = useMemo(() => filteredNotes.filter((n) => !n.isPinned), [filteredNotes]);

  const activeColorTheme = NOTE_COLORS.find((c) => c.id === color) || NOTE_COLORS[0];
  const editingColorTheme = editingNote
    ? NOTE_COLORS.find((c) => c.id === editingNote.color) || NOTE_COLORS[0]
    : NOTE_COLORS[0];

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header Bar with Distinct Round Refresh Button Positioned Above Search */}
      <div className="bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs space-y-3 sm:space-y-4">
        {/* Top Header Row: Title & Top-Right Round Refresh Button */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5 truncate">
              <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <Sparkles className="w-4 h-4" />
              </span>
              <span className="truncate">Notes Manager</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1 line-clamp-1 sm:line-clamp-none">
              Google Keep-style full-page notes, entire card colors &amp; long-press batch selection.
            </p>
          </div>

          {/* Distinct Round Refresh Button Positioned at Top Right Above Search Option */}
          <div className="flex items-center gap-2 shrink-0">
            {refreshNotice && (
              <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 animate-in fade-in">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>{refreshNotice}</span>
              </span>
            )}
            <button
              type="button"
              id="notes-realtime-refresh-btn"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="w-10 h-10 rounded-full bg-slate-50 hover:bg-amber-50 border border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-700 flex items-center justify-center shadow-xs transition-all cursor-pointer active:scale-90 disabled:opacity-50"
              title="Refresh notes data in real-time (no page reload)"
            >
              <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-amber-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Search Bar (Positioned Below the Refresh Button) */}
        <div className="pt-2 border-t border-slate-100 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search notes & checklists..."
              className="w-full bg-slate-50 border border-slate-200 text-slate-800 font-medium text-xs rounded-2xl py-2.5 pl-10 pr-8 focus:outline-none focus:ring-2 focus:ring-amber-200 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Floating or Sticky Batch Action Bar when items are selected via Long-Press */}
      {selectedNoteIds.length > 0 && (
        <div className="sticky top-3 z-30 bg-slate-900 text-white p-3 sm:p-4 rounded-3xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200 border border-slate-700">
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

      {/* Label Filter Pills */}
      {allLabels.length > 0 && (
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
          <button
            type="button"
            onClick={() => setSelectedLabel(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer ${
              selectedLabel === null
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All Notes ({notes.length})
          </button>
          {allLabels.map((lbl) => (
            <button
              key={lbl}
              type="button"
              onClick={() => setSelectedLabel(selectedLabel === lbl ? null : lbl)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
                selectedLabel === lbl
                  ? 'bg-amber-500 text-white shadow-xs'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              <Tag className="w-3 h-3" />
              <span>{lbl}</span>
            </button>
          ))}
        </div>
      )}

      {/* Note Creator Box with Rich Background Color */}
      <div
        ref={editorRef}
        style={{
          backgroundColor: activeColorTheme.hex,
          borderColor: activeColorTheme.borderHex,
        }}
        className="max-w-2xl mx-auto rounded-3xl transition-colors duration-200 shadow-md border-2"
      >
        {!isEditorExpanded ? (
          <div
            onClick={() => setIsEditorExpanded(true)}
            className="flex items-center justify-between p-3.5 sm:p-4 cursor-text"
          >
            <span className="text-sm font-semibold text-slate-700 pl-2">
              Take a note...
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsChecklist(true);
                  setIsEditorExpanded(true);
                }}
                className="p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-black/5 transition-colors cursor-pointer"
                title="New checklist"
              >
                <CheckSquare className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsEditorExpanded(true);
                  setShowColorPicker(true);
                }}
                className="p-2 rounded-xl text-slate-700 hover:text-slate-950 hover:bg-black/5 transition-colors cursor-pointer"
                title="Color palette"
              >
                <Palette className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 sm:p-5 space-y-3.5">
            {/* Title & Pin Toggle */}
            <div className="flex items-center justify-between gap-2">
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className="w-full bg-transparent font-extrabold text-base text-slate-900 placeholder:text-slate-500 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`p-2 rounded-xl transition-all cursor-pointer shadow-xs ${
                  isPinned
                    ? 'text-white bg-amber-500 ring-2 ring-amber-300 scale-105'
                    : 'text-slate-800 bg-white border-2 border-slate-300 hover:bg-slate-50 hover:text-amber-600'
                }`}
                title={isPinned ? 'Unpin note' : 'Pin note to top'}
              >
                <Pin className={`w-4 h-4 ${isPinned ? 'rotate-45 fill-white' : ''}`} />
              </button>
            </div>

            {/* Note Content OR Interactive Checklist Editor */}
            {!isChecklist ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Take a note..."
                rows={3}
                className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed"
              />
            ) : (
              <div className="space-y-2 pt-1">
                {checklistItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 group">
                    <button
                      type="button"
                      onClick={() => {
                        setChecklistItems(
                          checklistItems.map((ci) => (ci.id === item.id ? { ...ci, completed: !ci.completed } : ci))
                        );
                      }}
                      className="text-slate-600 hover:text-blue-600 cursor-pointer"
                    >
                      {item.completed ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <span className={`text-sm flex-1 ${item.completed ? 'line-through text-slate-500' : 'text-slate-900 font-semibold'}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItemFromEditor(item.id)}
                      className="text-slate-500 hover:text-rose-600 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add new checklist item line */}
                <div className="flex items-center gap-2 pt-1">
                  <Plus className="w-4 h-4 text-slate-600" />
                  <input
                    type="text"
                    value={newChecklistText}
                    onChange={(e) => setNewChecklistText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddChecklistItemToEditor();
                      }
                    }}
                    placeholder="List item (press Enter to add)"
                    className="w-full bg-transparent text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddChecklistItemToEditor}
                    className="text-xs font-bold text-blue-700 hover:text-blue-800 px-2 py-1 shrink-0 cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              </div>
            )}

            {/* Labels Chips in Editor */}
            {labels.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                {labels.map((lbl) => (
                  <span
                    key={lbl}
                    className="inline-flex items-center gap-1 bg-black/10 text-slate-800 text-[11px] font-bold px-2 py-0.5 rounded-md"
                  >
                    #{lbl}
                    <button
                      type="button"
                      onClick={() => setLabels(labels.filter((l) => l !== lbl))}
                      className="hover:text-rose-600 ml-0.5 cursor-pointer"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Reminder Badge in Editor */}
            {reminderAt && (
              <div className="flex items-center justify-between text-xs font-semibold bg-amber-100/90 text-amber-950 px-3 py-1.5 rounded-xl border border-amber-300">
                <span className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-700" />
                  <span>Reminder: {new Date(reminderAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {isEmergency && <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold uppercase tracking-wider ml-1">Emergency</span>}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReminderAt('');
                    setIsEmergency(false);
                  }}
                  className="text-amber-900 hover:text-rose-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Palette Selector Dropdown */}
            {showColorPicker && (
              <div className="pt-2 border-t border-black/10 flex flex-wrap gap-2 items-center">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider mr-1">Card Color:</span>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setColor(c.id);
                      setShowColorPicker(false);
                    }}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      color === c.id ? 'border-slate-900 scale-110 shadow-md ring-2 ring-slate-400' : 'border-slate-400'
                    }`}
                    title={c.name}
                  >
                    {color === c.id && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[3]" />}
                  </button>
                ))}
              </div>
            )}

            {/* Tag Input Dropdown */}
            {showTagInput && (
              <div className="flex items-center gap-2 pt-2 border-t border-black/10">
                <Tag className="w-3.5 h-3.5 text-slate-600" />
                <input
                  type="text"
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTagToEditor();
                    }
                  }}
                  placeholder="Enter tag name (e.g. Work, Store, Budget)"
                  className="text-xs bg-transparent border-b border-slate-400 focus:border-blue-600 focus:outline-none flex-1 py-1 text-slate-900 placeholder:text-slate-500"
                />
                <button
                  type="button"
                  onClick={handleAddTagToEditor}
                  className="text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-lg cursor-pointer"
                >
                  Add Tag
                </button>
              </div>
            )}

            {/* Reminder Date Picker Dropdown */}
            {showReminderPicker && (
              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-md space-y-2.5 text-xs">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-blue-600" />
                  <span>Set Time Reminder</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="datetime-local"
                    value={reminderAt}
                    onChange={(e) => setReminderAt(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-2 text-xs font-medium text-slate-800 focus:outline-none flex-1"
                  />
                  <label className="flex items-center gap-1.5 text-slate-700 font-semibold cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isEmergency}
                      onChange={(e) => setIsEmergency(e.target.checked)}
                      className="rounded text-rose-600 focus:ring-rose-500"
                    />
                    <span className="text-rose-700 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Emergency Alarm
                    </span>
                  </label>
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      requestNotificationPermission();
                      setShowReminderPicker(false);
                    }}
                    className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700 cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions Toolbar */}
            <div className="flex items-center justify-between pt-2 border-t border-black/10">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="p-2 text-slate-800 hover:text-slate-950 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Card Color Palette"
                >
                  <Palette className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsChecklist(!isChecklist)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    isChecklist ? 'text-blue-700 bg-blue-100' : 'text-slate-800 hover:text-slate-950 hover:bg-black/5'
                  }`}
                  title={isChecklist ? 'Switch to text note' : 'Switch to checklist'}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReminderPicker(!showReminderPicker)}
                  className="p-2 text-slate-800 hover:text-slate-950 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Add reminder"
                >
                  <Bell className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTagInput(!showTagInput)}
                  className="p-2 text-slate-800 hover:text-slate-950 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Add label/tag"
                >
                  <Tag className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetEditor}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-800 px-3 py-1.5 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleCreateNote}
                  className="text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-xl transition-all shadow-xs cursor-pointer active:scale-95"
                >
                  Add Note
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm font-semibold flex items-center justify-center gap-2">
          <RotateCcw className="w-4 h-4 animate-spin text-amber-500" />
          <span>Loading your notes...</span>
        </div>
      ) : filteredNotes.length === 0 ? (
        <div className="py-16 text-center max-w-sm mx-auto space-y-3">
          <div className="w-16 h-16 rounded-3xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto border border-amber-200/60 shadow-xs">
            <Sparkles className="w-7 h-7" />
          </div>
          <h3 className="text-base font-bold text-slate-800">
            {searchQuery || selectedLabel ? 'No matching notes found' : 'No notes yet'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchQuery || selectedLabel
              ? 'Try adjusting your search query or label filter.'
              : 'Keep track of retail thoughts, supplier terms, and daily checklists.'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Pinned Notes Section */}
          {pinnedNotes.length > 0 && (
            <div className="space-y-3">
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-600 px-1 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-amber-600 fill-amber-500" />
                <span>Pinned ({pinnedNotes.length})</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pinnedNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}

          {/* Other Notes Section */}
          {otherNotes.length > 0 && (
            <div className="space-y-3">
              {pinnedNotes.length > 0 && (
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-600 px-1">
                  <span>Others ({otherNotes.length})</span>
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {otherNotes.map((note) => renderNoteCard(note))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* FULL-PAGE VIEW (Optimized for Mobile, Solid Background, No Background Scrolling) */}
      {editingNote && (
        <div
          style={{ backgroundColor: editingColorTheme.hex }}
          className="fixed inset-0 z-50 w-full h-[100dvh] flex flex-col overscroll-none select-text"
        >
          {/* Top Full-Page Navigation & Action Bar */}
          <div className="sticky top-0 z-20 bg-white/70 backdrop-blur-md border-b border-black/10 px-3 sm:px-8 py-3 flex items-center justify-between gap-2 shadow-xs shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveEditedNote}
                className="flex items-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="font-extrabold">Back</span>
              </button>

              {/* Sync Status Tick in Full Page */}
              <div className="flex items-center">
                {editingNote.syncStatus === 'synced' ? (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs select-none"
                    title="All changes synced to cloud database"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 stroke-[3]" />
                    <span className="hidden sm:inline">Database Synced</span>
                  </span>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs select-none"
                    title={currentUser?.id ? "Local copy (sync pending)" : "Saved in browser storage"}
                  >
                    <X className="w-3.5 h-3.5 text-rose-600 stroke-[3]" />
                    <span className="hidden sm:inline">Unsynced (Local)</span>
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Pin Toggle Button in Full-Page View */}
              <button
                type="button"
                onClick={() => setEditingNote({ ...editingNote, isPinned: !editingNote.isPinned })}
                className={`px-3 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                  editingNote.isPinned
                    ? 'bg-amber-500 text-white ring-2 ring-amber-300 hover:bg-amber-600 scale-105'
                    : 'bg-white text-slate-800 border-2 border-slate-300 hover:bg-slate-50 hover:text-amber-600'
                }`}
                title={editingNote.isPinned ? 'Unpin note' : 'Pin note to top'}
              >
                <Pin className={`w-4 h-4 ${editingNote.isPinned ? 'rotate-45 fill-white' : ''}`} />
                <span className="hidden sm:inline">{editingNote.isPinned ? 'Pinned' : 'Pin Note'}</span>
              </button>

              {/* Delete Note with Confirmation Safeguard */}
              <button
                type="button"
                onClick={(e) => promptDeleteSingle(editingNote, e)}
                className="p-2 text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                title="Delete note"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Done / Save Button */}
              <button
                type="button"
                onClick={handleSaveEditedNote}
                className="px-4 sm:px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all cursor-pointer active:scale-95"
              >
                Done
              </button>
            </div>
          </div>

          {/* Full-Page Content Workspace (Optimized for Mobile scroll & touch) */}
          <div className="flex-1 overflow-y-auto w-full max-w-4xl mx-auto px-4 sm:px-8 py-5 sm:py-8 flex flex-col space-y-5 sm:space-y-6">
            {/* Color Palette Strip - Changes ENTIRE PAGE background */}
            <div className="p-3 bg-white/70 backdrop-blur-md rounded-2xl border border-black/10 shadow-xs flex flex-wrap items-center gap-2">
              <span className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mr-1 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                <span>Card Background Color:</span>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEditingNote({ ...editingNote, color: c.id })}
                    style={{ backgroundColor: c.hex }}
                    className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      editingNote.color === c.id
                        ? 'border-slate-900 scale-110 shadow-md ring-2 ring-slate-400'
                        : 'border-slate-400'
                    }`}
                    title={c.name}
                  >
                    {editingNote.color === c.id && <Check className="w-3.5 h-3.5 text-slate-900 stroke-[3]" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Note Title Input */}
            <div className="border-b border-black/10 pb-3">
              <input
                type="text"
                value={editingNote.title}
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                placeholder="Title"
                className="w-full bg-transparent font-black text-xl sm:text-3xl text-slate-900 placeholder:text-slate-500 focus:outline-none tracking-tight"
              />
            </div>

            {/* Note Content / Checklist Body */}
            <div className="flex-1 flex flex-col min-h-[260px]">
              {!editingNote.isChecklist ? (
                <textarea
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  placeholder="Type your detailed notes here..."
                  className="w-full flex-1 bg-transparent text-base sm:text-lg text-slate-900 placeholder:text-slate-500 focus:outline-none resize-none leading-relaxed min-h-[35vh]"
                />
              ) : (
                <div className="space-y-3 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
                    Interactive Checklist ({editingNote.checklistItems.filter((i) => i.completed).length}/{editingNote.checklistItems.length} completed)
                  </div>
                  {editingNote.checklistItems.map((ci) => (
                    <div
                      key={ci.id}
                      className="flex items-center gap-3 p-2 bg-white/60 backdrop-blur-xs rounded-xl border border-black/5 group"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          const items = editingNote.checklistItems.map((i) =>
                            i.id === ci.id ? { ...i, completed: !i.completed } : i
                          );
                          setEditingNote({ ...editingNote, checklistItems: items });
                        }}
                        className="text-slate-600 hover:text-blue-600 cursor-pointer shrink-0"
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
                          const items = editingNote.checklistItems.map((i) =>
                            i.id === ci.id ? { ...i, text: e.target.value } : i
                          );
                          setEditingNote({ ...editingNote, checklistItems: items });
                        }}
                        className={`text-sm sm:text-base flex-1 bg-transparent focus:outline-none ${
                          ci.completed ? 'line-through text-slate-500' : 'text-slate-900 font-semibold'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote({
                            ...editingNote,
                            checklistItems: editingNote.checklistItems.filter((i) => i.id !== ci.id),
                          });
                        }}
                        className="text-slate-500 hover:text-rose-600 p-1 opacity-60 group-hover:opacity-100 transition-opacity cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => {
                      setEditingNote({
                        ...editingNote,
                        checklistItems: [
                          ...editingNote.checklistItems,
                          { id: 'item-' + Date.now(), text: 'New task item', completed: false },
                        ],
                      });
                    }}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-white/90 hover:bg-white text-blue-700 font-bold text-xs rounded-xl border border-blue-200 shadow-2xs mt-3 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Add Checklist Item</span>
                  </button>
                </div>
              )}
            </div>

            {/* Labels & Tags Manager */}
            <div className="pt-4 border-t border-black/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <Tag className="w-3.5 h-3.5 text-slate-600" />
                  <span>Labels &amp; Tags</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullPageTagInput(!showFullPageTagInput)}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 cursor-pointer"
                >
                  {showFullPageTagInput ? 'Close' : '+ Add Label'}
                </button>
              </div>

              {showFullPageTagInput && (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={fullPageNewTag}
                    onChange={(e) => setFullPageNewTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (fullPageNewTag.trim() && !editingNote.labels.includes(fullPageNewTag.trim())) {
                          setEditingNote({ ...editingNote, labels: [...editingNote.labels, fullPageNewTag.trim()] });
                          setFullPageNewTag('');
                        }
                      }
                    }}
                    placeholder="Enter new label (e.g. Finance, Warehouse)..."
                    className="text-xs bg-white border border-slate-300 rounded-xl px-3 py-2 flex-1 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (fullPageNewTag.trim() && !editingNote.labels.includes(fullPageNewTag.trim())) {
                        setEditingNote({ ...editingNote, labels: [...editingNote.labels, fullPageNewTag.trim()] });
                        setFullPageNewTag('');
                      }
                    }}
                    className="px-3.5 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Add
                  </button>
                </div>
              )}

              <div className="flex flex-wrap gap-1.5">
                {editingNote.labels.length === 0 ? (
                  <span className="text-xs text-slate-600 italic">No labels assigned yet.</span>
                ) : (
                  editingNote.labels.map((lbl) => (
                    <span
                      key={lbl}
                      className="inline-flex items-center gap-1.5 bg-black/10 text-slate-900 text-xs font-bold px-2.5 py-1 rounded-lg"
                    >
                      #{lbl}
                      <button
                        type="button"
                        onClick={() =>
                          setEditingNote({
                            ...editingNote,
                            labels: editingNote.labels.filter((l) => l !== lbl),
                          })
                        }
                        className="text-slate-600 hover:text-rose-600 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Reminder Section */}
            <div className="pt-4 border-t border-black/10 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <Bell className="w-3.5 h-3.5 text-slate-600" />
                  <span>Scheduled Reminder</span>
                </span>
                <button
                  type="button"
                  onClick={() => setShowFullPageReminder(!showFullPageReminder)}
                  className="text-xs font-bold text-blue-700 hover:text-blue-800 cursor-pointer"
                >
                  {showFullPageReminder ? 'Hide' : editingNote.reminderAt ? 'Change Time' : '+ Set Reminder'}
                </button>
              </div>

              {editingNote.reminderAt && (
                <div className="flex items-center justify-between p-3 bg-amber-100/90 text-amber-950 rounded-xl text-xs font-bold border border-amber-300">
                  <span className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-700" />
                    <span>{new Date(editingNote.reminderAt).toLocaleString()}</span>
                    {editingNote.isEmergency && (
                      <span className="bg-rose-600 text-white px-2 py-0.5 rounded text-[10px] uppercase font-black">
                        Emergency Alarm
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditingNote({ ...editingNote, reminderAt: null, isEmergency: false })}
                    className="text-amber-900 hover:text-rose-600 font-bold cursor-pointer"
                  >
                    Remove
                  </button>
                </div>
              )}

              {showFullPageReminder && (
                <div className="p-3.5 bg-white border border-slate-200 rounded-2xl space-y-3">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="datetime-local"
                      value={editingNote.reminderAt ? editingNote.reminderAt.substring(0, 16) : ''}
                      onChange={(e) =>
                        setEditingNote({
                          ...editingNote,
                          reminderAt: e.target.value ? new Date(e.target.value).toISOString() : null,
                        })
                      }
                      className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-800 flex-1 focus:outline-none"
                    />
                    <label className="flex items-center gap-2 text-xs font-bold text-rose-700 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!editingNote.isEmergency}
                        onChange={(e) => setEditingNote({ ...editingNote, isEmergency: e.target.checked })}
                        className="rounded text-rose-600"
                      />
                      <span>Emergency Alarm</span>
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Meta & Save */}
            <div className="pt-6 pb-8 border-t border-black/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs text-slate-700">
              <div>
                <span>Last updated: {new Date(editingNote.updatedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-4 py-2 font-bold text-slate-700 hover:bg-black/5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedNote}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-extrabold text-xs rounded-xl shadow-md transition-all cursor-pointer active:scale-95"
                >
                  Save &amp; Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EXPLICIT CONFIRMATION DIALOG (DELETION SAFEGUARD) */}
      {confirmDeleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
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
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={executeConfirmedDeletion}
                disabled={isDeleting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
        </div>
      )}
    </div>
  );

  function renderNoteCard(note: NoteItem) {
    const colorTheme = NOTE_COLORS.find((c) => c.id === note.color) || NOTE_COLORS[0];
    const isOverdue = note.reminderAt && new Date(note.reminderAt) < new Date();
    const isSelected = selectedNoteIds.includes(note.id);

    return (
      <div
        key={note.id}
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
            setEditingNote(note);
          }
        }}
        style={{
          backgroundColor: colorTheme.hex,
          borderColor: isSelected ? '#2563eb' : colorTheme.borderHex,
        }}
        className={`group relative rounded-3xl p-4 sm:p-5 border-2 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between select-none ${
          isSelected ? 'ring-3 ring-blue-500 shadow-lg scale-[1.01]' : ''
        }`}
      >
        <div>
          {/* Header with Batch Checkbox (if active), Title, Sync Indicator & High Visibility Pin */}
          <div className="flex items-start justify-between gap-2 mb-2.5">
            <div className="flex items-start gap-2 min-w-0 flex-1">
              {/* Batch Selection Checkbox shown when in selection mode */}
              {selectedNoteIds.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => handleToggleSelectNote(note.id, e)}
                  className={`mt-0.5 p-0.5 rounded-lg transition-transform hover:scale-110 cursor-pointer shrink-0 ${
                    isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                  }`}
                  title={isSelected ? 'Deselect note' : 'Select note'}
                >
                  {isSelected ? (
                    <CheckCircle2 className="w-5 h-5 fill-blue-600 text-white" />
                  ) : (
                    <Square className="w-5 h-5 bg-white/90 rounded-md" />
                  )}
                </button>
              )}

              <h4 className="font-black text-slate-950 text-sm sm:text-base tracking-tight leading-snug line-clamp-2">
                {note.title || 'Untitled Note'}
              </h4>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {/* Visual Sync Indicator Next to Pin */}
              {note.syncStatus === 'synced' ? (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs select-none"
                  title="Synced to cloud database"
                >
                  <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                  <span className="hidden sm:inline">Synced</span>
                </span>
              ) : (
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-100 text-rose-800 border border-rose-300 shadow-2xs select-none"
                  title={currentUser?.id ? "Local copy (sync pending)" : "Local storage only"}
                >
                  <X className="w-3 h-3 text-rose-600 stroke-[3]" />
                  <span className="hidden sm:inline">Unsynced</span>
                </span>
              )}

              {/* High Visibility Pin Button: Bold amber when pinned, solid white/dark border when unpinned */}
              <button
                type="button"
                onClick={(e) => handleTogglePin(note.id, e)}
                className={`p-1.5 sm:p-2 rounded-xl transition-all shrink-0 cursor-pointer shadow-xs flex items-center justify-center ${
                  note.isPinned
                    ? 'bg-amber-500 text-white ring-2 ring-amber-300 hover:bg-amber-600 scale-105'
                    : 'bg-white text-slate-900 border-2 border-slate-300 hover:border-amber-500 hover:text-amber-700 hover:bg-amber-50'
                }`}
                title={note.isPinned ? 'Unpin note' : 'Pin note to top'}
              >
                <Pin className={`w-3.5 h-3.5 sm:w-4 sm:h-4 ${note.isPinned ? 'rotate-45 fill-white' : ''}`} />
              </button>
            </div>
          </div>

          {/* Body Content */}
          {!note.isChecklist ? (
            <p className="text-xs sm:text-sm text-slate-900 leading-relaxed whitespace-pre-wrap line-clamp-6 mb-3 font-medium">
              {note.content}
            </p>
          ) : (
            <div className="space-y-1.5 mb-3">
              {note.checklistItems.slice(0, 5).map((ci) => (
                <div
                  key={ci.id}
                  onClick={(e) => handleToggleChecklistItem(note.id, ci.id, e)}
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <button type="button" className="text-slate-600 hover:text-blue-700 shrink-0">
                    {ci.completed ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-700" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span
                    className={`text-xs sm:text-sm truncate ${
                      ci.completed ? 'line-through text-slate-500' : 'text-slate-950 font-semibold'
                    }`}
                  >
                    {ci.text}
                  </span>
                </div>
              ))}
              {note.checklistItems.length > 5 && (
                <div className="text-[10px] font-bold text-slate-600 pl-5">
                  +{note.checklistItems.length - 5} more items...
                </div>
              )}
            </div>
          )}

          {/* Labels */}
          {note.labels.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2">
              {note.labels.map((lbl) => (
                <span
                  key={lbl}
                  className="text-[10px] font-extrabold bg-black/10 text-slate-900 px-2 py-0.5 rounded-md"
                >
                  #{lbl}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer info: Reminders, Quick Color Swatches & Delete Safeguard Prompt */}
        <div className="pt-2 border-t border-black/10 space-y-2">
          {note.reminderAt && (
            <div
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                note.isEmergency
                  ? 'bg-rose-100 text-rose-900 border border-rose-300'
                  : isOverdue
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-blue-100 text-blue-900'
              }`}
            >
              <Bell className="w-3 h-3" />
              <span>
                {new Date(note.reminderAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {note.isEmergency && <span className="text-[9px] uppercase tracking-wider font-black">EMERGENCY</span>}
            </div>
          )}

          <div className="flex items-center justify-between text-slate-600 text-[10px] font-semibold">
            <span>
              {new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>

            {/* Quick Card Color Palette on Hover */}
            <div className="flex items-center gap-1">
              <div
                className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                onClick={(e) => e.stopPropagation()}
              >
                {NOTE_COLORS.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={(e) => handleUpdateNoteColor(note.id, c.id, e)}
                    style={{ backgroundColor: c.hex }}
                    className={`w-4 h-4 rounded-full border border-slate-500 hover:scale-125 transition-transform cursor-pointer ${
                      note.color === c.id ? 'ring-1 ring-slate-900' : ''
                    }`}
                    title={c.name}
                  />
                ))}
              </div>

              {/* Single Delete Button with Confirmation Safeguard */}
              <button
                type="button"
                onClick={(e) => promptDeleteSingle(note, e)}
                className="p-1 hover:text-rose-600 rounded-lg hover:bg-black/5 transition-colors cursor-pointer opacity-0 group-hover:opacity-100"
                title="Delete note permanently"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
