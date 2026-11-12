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
  Sparkles,
  Check,
  Calendar,
  ChevronDown,
} from 'lucide-react';
import { NoteItem, ChecklistItem, NOTE_COLORS } from '@/lib/types/notes-tasks';
import {
  fetchNotes,
  saveLocalNotes,
  upsertNoteToSupabase,
  deleteNoteFromSupabase,
} from '@/lib/notesTasksStorage';
import { playReminderChime, sendDeviceNotification, requestNotificationPermission } from '@/lib/reminderService';

interface NotesViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
}

export default function NotesView({ currentUser, triggerVibration }: NotesViewProps) {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Editor states
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

  // Edit modal
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);

  const editorRef = useRef<HTMLDivElement>(null);

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

  // Click outside editor to collapse/save
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
          // Check if due in the current minute (within 60 seconds)
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
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = [newNote, ...notes];
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    resetEditor();
    triggerVibration?.('success');

    // Immediate Supabase sync
    if (currentUser?.id) {
      await upsertNoteToSupabase(newNote, currentUser.id);
    }
  };

  const handleDeleteNote = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    triggerVibration?.('click');

    if (currentUser?.id) {
      await deleteNoteFromSupabase(id, currentUser.id);
    }
  };

  const handleTogglePin = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = notes.map((n) => (n.id === id ? { ...n, isPinned: !n.isPinned, updatedAt: new Date().toISOString() } : n));
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    triggerVibration?.('click');

    const target = updated.find((n) => n.id === id);
    if (target && currentUser?.id) {
      await upsertNoteToSupabase(target, currentUser.id);
    }
  };

  const handleUpdateNoteColor = async (id: string, newColor: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = notes.map((n) => (n.id === id ? { ...n, color: newColor, updatedAt: new Date().toISOString() } : n));
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);

    const target = updated.find((n) => n.id === id);
    if (target && currentUser?.id) {
      await upsertNoteToSupabase(target, currentUser.id);
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
    triggerVibration?.('click');

    const target = updated.find((n) => n.id === noteId);
    if (target && currentUser?.id) {
      await upsertNoteToSupabase(target, currentUser.id);
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

  // Save changes from Edit Modal
  const handleSaveEditedNote = async () => {
    if (!editingNote) return;

    const updated = notes.map((n) => (n.id === editingNote.id ? { ...editingNote, updatedAt: new Date().toISOString() } : n));
    setNotes(updated);
    saveLocalNotes(updated, currentUser?.id);
    setEditingNote(null);
    triggerVibration?.('success');

    if (currentUser?.id) {
      await upsertNoteToSupabase(editingNote, currentUser.id);
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

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs">
              <Sparkles className="w-4 h-4" />
            </span>
            <span>Notes Manager</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Google Keep-style color notes, interactive checklists, labels &amp; emergency reminders.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px] max-w-sm">
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
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

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

      {/* Google Keep-style New Note Creator */}
      <div
        ref={editorRef}
        className={`max-w-2xl mx-auto rounded-3xl transition-all duration-200 shadow-md border ${
          NOTE_COLORS.find((c) => c.id === color)?.bgClass || 'bg-white'
        } ${NOTE_COLORS.find((c) => c.id === color)?.borderClass || 'border-slate-200'}`}
      >
        {!isEditorExpanded ? (
          <div
            onClick={() => setIsEditorExpanded(true)}
            className="flex items-center justify-between p-3.5 sm:p-4 cursor-text"
          >
            <span className="text-sm font-semibold text-slate-400 pl-2">
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
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-black/5 transition-colors cursor-pointer"
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
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-black/5 transition-colors cursor-pointer"
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
                className="w-full bg-transparent font-extrabold text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setIsPinned(!isPinned)}
                className={`p-1.5 rounded-full transition-all cursor-pointer ${
                  isPinned ? 'text-amber-600 bg-amber-100 hover:bg-amber-200' : 'text-slate-400 hover:text-slate-700 hover:bg-black/5'
                }`}
                title={isPinned ? 'Unpin note' : 'Pin note'}
              >
                <Pin className={`w-4 h-4 ${isPinned ? 'rotate-45 fill-amber-500' : ''}`} />
              </button>
            </div>

            {/* Note Content OR Interactive Checklist Editor */}
            {!isChecklist ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Take a note..."
                rows={3}
                className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
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
                      className="text-slate-400 hover:text-blue-600 cursor-pointer"
                    >
                      {item.completed ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4" />}
                    </button>
                    <span className={`text-sm flex-1 ${item.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'}`}>
                      {item.text}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveChecklistItemFromEditor(item.id)}
                      className="text-slate-300 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}

                {/* Add new checklist item line */}
                <div className="flex items-center gap-2 pt-1">
                  <Plus className="w-4 h-4 text-slate-400" />
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
                    className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddChecklistItemToEditor}
                    className="text-xs font-bold text-blue-600 hover:text-blue-700 px-2 py-1 shrink-0"
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
                    className="inline-flex items-center gap-1 bg-black/5 text-slate-700 text-[11px] font-bold px-2 py-0.5 rounded-md"
                  >
                    #{lbl}
                    <button
                      type="button"
                      onClick={() => setLabels(labels.filter((l) => l !== lbl))}
                      className="hover:text-rose-600 ml-0.5"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Reminder Badge in Editor */}
            {reminderAt && (
              <div className="flex items-center justify-between text-xs font-semibold bg-amber-100/70 text-amber-900 px-3 py-1.5 rounded-xl">
                <span className="flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-amber-600" />
                  <span>Reminder: {new Date(reminderAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}</span>
                  {isEmergency && <span className="bg-rose-600 text-white text-[10px] px-1.5 py-0.2 rounded-md font-bold uppercase tracking-wider ml-1">Emergency</span>}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setReminderAt('');
                    setIsEmergency(false);
                  }}
                  className="text-amber-800 hover:text-rose-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Palette Selector Dropdown */}
            {showColorPicker && (
              <div className="pt-2 border-t border-black/5 flex flex-wrap gap-2 items-center">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">Color:</span>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => {
                      setColor(c.id);
                      setShowColorPicker(false);
                    }}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center ${
                      color === c.id ? 'border-slate-800 scale-110 shadow-xs' : 'border-slate-300'
                    }`}
                    title={c.name}
                  >
                    {color === c.id && <Check className="w-3 h-3 text-slate-800" />}
                  </button>
                ))}
              </div>
            )}

            {/* Tag Input Dropdown */}
            {showTagInput && (
              <div className="flex items-center gap-2 pt-2 border-t border-black/5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
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
                  className="text-xs bg-transparent border-b border-slate-300 focus:border-blue-600 focus:outline-none flex-1 py-1"
                />
                <button
                  type="button"
                  onClick={handleAddTagToEditor}
                  className="text-xs font-bold bg-blue-600 text-white px-2.5 py-1 rounded-lg"
                >
                  Add Tag
                </button>
              </div>
            )}

            {/* Reminder Date Picker Dropdown */}
            {showReminderPicker && (
              <div className="p-3 bg-white/90 backdrop-blur-sm border border-slate-200 rounded-2xl shadow-md space-y-2.5 text-xs">
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
                    className="px-3 py-1 bg-blue-600 text-white font-bold rounded-lg hover:bg-blue-700"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {/* Bottom Actions Toolbar */}
            <div className="flex items-center justify-between pt-2 border-t border-black/5">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowColorPicker(!showColorPicker)}
                  className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Color palette"
                >
                  <Palette className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setIsChecklist(!isChecklist)}
                  className={`p-2 rounded-xl transition-colors cursor-pointer ${
                    isChecklist ? 'text-blue-600 bg-blue-100/50' : 'text-slate-600 hover:text-slate-900 hover:bg-black/5'
                  }`}
                  title={isChecklist ? 'Switch to text note' : 'Switch to checklist'}
                >
                  <CheckSquare className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowReminderPicker(!showReminderPicker)}
                  className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Add reminder"
                >
                  <Bell className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowTagInput(!showTagInput)}
                  className="p-2 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-black/5 transition-colors cursor-pointer"
                  title="Add label/tag"
                >
                  <Tag className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={resetEditor}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-700 px-3 py-1.5 cursor-pointer"
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

      {/* Loading state */}
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
              <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1 flex items-center gap-1.5">
                <Pin className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
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
                <div className="text-[11px] font-black uppercase tracking-widest text-slate-400 px-1">
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

      {/* Edit Note Modal */}
      {editingNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className={`w-full max-w-lg rounded-3xl p-6 shadow-2xl border ${NOTE_COLORS.find((c) => c.id === editingNote.color)?.bgClass || 'bg-white'} ${NOTE_COLORS.find((c) => c.id === editingNote.color)?.borderClass || 'border-slate-200'}`}>
            <div className="flex items-center justify-between pb-3 border-b border-black/5">
              <input
                type="text"
                value={editingNote.title}
                onChange={(e) => setEditingNote({ ...editingNote, title: e.target.value })}
                placeholder="Title"
                className="w-full bg-transparent font-extrabold text-lg text-slate-900 placeholder:text-slate-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setEditingNote({ ...editingNote, isPinned: !editingNote.isPinned })}
                className="p-1 text-slate-400 hover:text-amber-600"
              >
                <Pin className={`w-4 h-4 ${editingNote.isPinned ? 'rotate-45 fill-amber-500 text-amber-500' : ''}`} />
              </button>
            </div>

            <div className="py-4 space-y-3 max-h-[50vh] overflow-y-auto">
              {!editingNote.isChecklist ? (
                <textarea
                  value={editingNote.content}
                  onChange={(e) => setEditingNote({ ...editingNote, content: e.target.value })}
                  placeholder="Note text..."
                  rows={6}
                  className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
                />
              ) : (
                <div className="space-y-2">
                  {editingNote.checklistItems.map((ci) => (
                    <div key={ci.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const items = editingNote.checklistItems.map((i) =>
                            i.id === ci.id ? { ...i, completed: !i.completed } : i
                          );
                          setEditingNote({ ...editingNote, checklistItems: items });
                        }}
                      >
                        {ci.completed ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-slate-400" />}
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
                        className={`text-sm flex-1 bg-transparent focus:outline-none ${ci.completed ? 'line-through text-slate-400' : 'text-slate-800'}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setEditingNote({
                            ...editingNote,
                            checklistItems: editingNote.checklistItems.filter((i) => i.id !== ci.id),
                          });
                        }}
                        className="text-slate-400 hover:text-rose-500"
                      >
                        <X className="w-3.5 h-3.5" />
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
                          { id: 'item-' + Date.now(), text: 'New item', completed: false },
                        ],
                      });
                    }}
                    className="text-xs font-bold text-blue-600 flex items-center gap-1 mt-2"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add checklist item
                  </button>
                </div>
              )}

              {/* Color options */}
              <div className="flex flex-wrap gap-2 pt-2 border-t border-black/5 items-center">
                <span className="text-xs font-bold text-slate-600">Color:</span>
                {NOTE_COLORS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setEditingNote({ ...editingNote, color: c.id })}
                    style={{ backgroundColor: c.hex }}
                    className={`w-6 h-6 rounded-full border-2 cursor-pointer ${
                      editingNote.color === c.id ? 'border-slate-800 scale-110 shadow-xs' : 'border-slate-300'
                    }`}
                  />
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-black/5">
              <button
                type="button"
                onClick={() => handleDeleteNote(editingNote.id)}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" /> Delete Note
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditingNote(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-black/5 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditedNote}
                  className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  function renderNoteCard(note: NoteItem) {
    const colorTheme = NOTE_COLORS.find((c) => c.id === note.color) || NOTE_COLORS[0];
    const isOverdue = note.reminderAt && new Date(note.reminderAt) < new Date();

    return (
      <div
        key={note.id}
        onClick={() => setEditingNote(note)}
        className={`group relative rounded-3xl p-5 border transition-all duration-200 hover:shadow-lg cursor-pointer flex flex-col justify-between ${colorTheme.bgClass} ${colorTheme.borderClass}`}
      >
        <div>
          {/* Header & Pin Action */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <h4 className="font-extrabold text-slate-900 text-sm tracking-tight leading-snug line-clamp-2">
              {note.title || 'Untitled Note'}
            </h4>
            <button
              type="button"
              onClick={(e) => handleTogglePin(note.id, e)}
              className={`p-1.5 rounded-full transition-all shrink-0 cursor-pointer ${
                note.isPinned
                  ? 'text-amber-600 bg-amber-100 hover:bg-amber-200'
                  : 'text-slate-300 hover:text-slate-600 group-hover:opacity-100 opacity-60'
              }`}
              title={note.isPinned ? 'Unpin note' : 'Pin note'}
            >
              <Pin className={`w-3.5 h-3.5 ${note.isPinned ? 'rotate-45 fill-amber-500' : ''}`} />
            </button>
          </div>

          {/* Body Content */}
          {!note.isChecklist ? (
            <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap line-clamp-6 mb-3">
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
                  <button type="button" className="text-slate-400 hover:text-blue-600 shrink-0">
                    {ci.completed ? (
                      <CheckSquare className="w-3.5 h-3.5 text-blue-600" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <span
                    className={`text-xs truncate ${
                      ci.completed ? 'line-through text-slate-400' : 'text-slate-800'
                    }`}
                  >
                    {ci.text}
                  </span>
                </div>
              ))}
              {note.checklistItems.length > 5 && (
                <div className="text-[10px] font-bold text-slate-400 pl-5">
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
                  className="text-[10px] font-bold bg-black/5 text-slate-600 px-2 py-0.5 rounded-md"
                >
                  #{lbl}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Footer info: Reminders & Action Toolbar */}
        <div className="pt-2 border-t border-black/5 space-y-2">
          {note.reminderAt && (
            <div
              className={`flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-lg ${
                note.isEmergency
                  ? 'bg-rose-100 text-rose-800 border border-rose-200'
                  : isOverdue
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-blue-50 text-blue-800'
              }`}
            >
              <Bell className="w-3 h-3" />
              <span>
                {new Date(note.reminderAt).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' })}
              </span>
              {note.isEmergency && <span className="text-[9px] uppercase tracking-wider font-black">EMERGENCY</span>}
            </div>
          )}

          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] text-slate-400 font-medium">
              {new Date(note.updatedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
            </span>

            {/* Quick hover toolbar */}
            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => handleDeleteNote(note.id, e)}
                className="p-1 hover:text-rose-600 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
                title="Delete note"
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
