'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  CheckCircle2,
  Circle,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Bell,
  BellOff,
  ListTodo,
  ChevronDown,
  ChevronUp,
  Check,
  X,
  FolderPlus,
  AlertTriangle,
  RotateCw,
  Square,
  Search,
  ArrowLeft,
  FileText,
  Flag,
  MoreVertical,
  CloudOff,
} from 'lucide-react';
import { TaskItem, TaskList, TaskPriority } from '@/lib/types/notes-tasks';
import {
  fetchTasks,
  getLocalTasks,
  saveLocalTasks,
  upsertTaskToSupabase,
  deleteTaskFromSupabase,
  deleteTasksBatchFromSupabase,
  fetchTaskLists,
  getLocalTaskLists,
  saveLocalTaskLists,
  upsertTaskListToSupabase,
  deleteTaskListFromSupabase,
} from '@/lib/notesTasksStorage';
import {
  checkAndFireDueReminders,
  playReminderChime,
  sendDeviceNotification,
  requestNotificationPermission,
} from '@/lib/reminderService';
import { useTheme } from '@/components/ThemeProvider';

interface TasksViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
  onFullScreenChange?: (isFullscreen: boolean) => void;
  onSubOverlayChange?: (hasOverlay: boolean) => void;
  closeEditorSignal?: number;
  refreshSignal?: number;
}

type TaskFilterTab = 'all' | 'active' | 'completed' | 'priority';

const ALERTS_STORAGE_KEY = 'retailcalc_tasks_alerts_enabled';

function resolvePriority(task: Pick<TaskItem, 'priority' | 'isStarred'>): TaskPriority {
  if (task.priority === 'high' || task.priority === 'medium' || task.priority === 'low') {
    return task.priority;
  }
  return task.isStarred ? 'high' : 'medium';
}

function getTaskCardSurface(priority: TaskPriority, completed: boolean, isDark = false): { bg: string; border: string } {
  if (isDark) {
    if (completed) {
      return { bg: '#162235', border: '#253959' };
    }
    switch (priority) {
      case 'high':
        return { bg: '#2a1820', border: '#4c2633' };
      case 'low':
        return { bg: '#132820', border: '#1f4435' };
      case 'medium':
      default:
        return { bg: '#282315', border: '#473d21' };
    }
  }
  if (completed) {
    return { bg: '#eaf3ff', border: '#d1e2fb' };
  }
  switch (priority) {
    case 'high':
      return { bg: '#fdebed', border: '#f7d0d5' };
    case 'low':
      return { bg: '#e7f6ec', border: '#cdebd7' };
    case 'medium':
    default:
      return { bg: '#fbf3d5', border: '#efe2b0' };
  }
}

function getPriorityBadgeConfig(priority: TaskPriority): { label: string; className: string } {
  switch (priority) {
    case 'high':
      return { label: 'High', className: 'bg-[#ef6b73] text-white' };
    case 'low':
      return { label: 'Low', className: 'bg-[#a6e3b5] text-[#14532d]' };
    case 'medium':
    default:
      return { label: 'Medium', className: 'bg-[#f3da6b] text-[#5c4204]' };
  }
}

function formatDueDateShort(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function TasksView({
  currentUser,
  triggerVibration,
  onFullScreenChange,
  onSubOverlayChange,
  closeEditorSignal = 0,
  refreshSignal = 0,
}: TasksViewProps) {
  const { isDark } = useTheme();
  const [isMounted, setIsMounted] = useState(false);
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('default-my-tasks');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState<TaskFilterTab>('all');

  // Batch Selection State (Activated by Long-Press)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Deletion Safeguard Modal State
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    { type: 'single'; task: TaskItem } | { type: 'batch'; ids: string[] } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reliable Notification Toggle State
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);

  // Quick Task Creator Modal (Triggered by Floating + FAB)
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');

  // Full-Page Task Detail & Editor Modal
  const [detailTaskId, setDetailTaskId] = useState<string | null>(null);
  const [isEditingDetail, setIsEditingDetail] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editPriority, setEditPriority] = useState<TaskPriority>('medium');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(true);
  const [isAddingSubtaskInDetail, setIsAddingSubtaskInDetail] = useState(false);
  const [detailSubtaskTitle, setDetailSubtaskTitle] = useState('');
  const [isAddingNoteInDetail, setIsAddingNoteInDetail] = useState(false);
  const [detailQuickNote, setDetailQuickNote] = useState('');

  // New List Modal
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Active Reminder In-App Banner
  const [activeAlert, setActiveAlert] = useState<{ id: string; title: string; due: string } | null>(null);
  const [showManagerMenu, setShowManagerMenu] = useState(false);

  // Long-press refs
  const managerMenuRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressFiredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!showManagerMenu) return;
    const onOutsideClick = (event: MouseEvent) => {
      if (managerMenuRef.current && !managerMenuRef.current.contains(event.target as Node)) {
        setShowManagerMenu(false);
      }
    };
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, [showManagerMenu]);

  useEffect(() => {
    setIsMounted(true);
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (stored !== null) {
        setAlertsEnabled(stored === 'true');
      }
    }
  }, []);

  const detailTask = useMemo(
    () => (detailTaskId ? tasks.find((t) => t.id === detailTaskId) || null : null),
    [detailTaskId, tasks]
  );

  // Sync full-screen overlay flag with app/page.tsx for hardware Back button & scroll lock
  useEffect(() => {
    if (detailTask) {
      onFullScreenChange?.(true);
      const originalBodyOverflow = document.body.style.overflow;
      const originalHtmlOverflow = document.documentElement.style.overflow;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.overflow = 'hidden';

      return () => {
        onFullScreenChange?.(false);
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
      };
    } else {
      onFullScreenChange?.(false);
    }
  }, [detailTask, onFullScreenChange]);

  const hasOpenSubOverlay = Boolean(
    detailTaskId || isCreateModalOpen || showNewListModal || confirmDeleteTarget || selectedTaskIds.length > 0
  );
  useEffect(() => {
    onSubOverlayChange?.(hasOpenSubOverlay);
    return () => {
      onSubOverlayChange?.(false);
    };
  }, [hasOpenSubOverlay, onSubOverlayChange]);

  const handleCloseDetailFromBackRef = useRef<(() => void) | null>(null);

  // Close overlays cleanly when back navigation fires so user returns to Tasks Manager
  useEffect(() => {
    if (closeEditorSignal > 0) {
      if (confirmDeleteTarget) {
        setConfirmDeleteTarget(null);
      } else if (showNewListModal) {
        setShowNewListModal(false);
      } else if (isCreateModalOpen) {
        setIsCreateModalOpen(false);
      } else if (detailTaskId) {
        handleCloseDetailFromBackRef.current?.();
      } else if (selectedTaskIds.length > 0) {
        setSelectedTaskIds([]);
      }
    }
  }, [closeEditorSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch lists & tasks & subscribe to automatic offline-to-cloud sync updates
  useEffect(() => {
    let isSubscribed = true;
    setLoading(true);

    Promise.all([fetchTaskLists(currentUser?.id), fetchTasks(currentUser?.id)]).then(
      ([listsData, tasksData]) => {
        if (isSubscribed) {
          setTaskLists(listsData);
          if (listsData.length > 0 && !listsData.some((l) => l.id === activeListId)) {
            setActiveListId(listsData[0].id);
          }
          setTasks(tasksData);
          setLoading(false);
        }
      }
    );

    const handleSyncUpdated = (event: Event) => {
      const detail = (event as CustomEvent)?.detail;
      setTaskLists(getLocalTaskLists(currentUser?.id));
      setTasks(getLocalTasks(currentUser?.id));
      if (detail?.syncedCount > 0) {
        setRefreshNotice(`Synced ${detail.syncedCount} offline item${detail.syncedCount === 1 ? '' : 's'}`);
        setTimeout(() => setRefreshNotice(null), 2600);
      }
    };

    window.addEventListener('calcmax:sync-updated', handleSyncUpdated);
    return () => {
      isSubscribed = false;
      window.removeEventListener('calcmax:sync-updated', handleSyncUpdated);
    };
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  // Trigger unified Service Worker due task alerts & inline banner
  useEffect(() => {
    if (!alertsEnabled) return;

    const checkTasksNow = async () => {
      const fired = await checkAndFireDueReminders();
      const firstDueTask = fired.find((r) => r.sourceType === 'task');
      if (firstDueTask) {
        const dueDateObj = new Date(firstDueTask.remindAt);
        setActiveAlert({
          id: firstDueTask.sourceId,
          title: firstDueTask.title.replace(/^Task Due:\s*/i, ''),
          due: Number.isNaN(dueDateObj.getTime())
            ? 'Now'
            : dueDateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        });
      }
    };

    void checkTasksNow();
  }, [tasks, alertsEnabled]);

  // Open Detail View for a task card
  const openTaskDetail = (task: TaskItem) => {
    const pri = resolvePriority(task);
    setDetailTaskId(task.id);
    setIsEditingDetail(false);
    setEditTitle(task.title);
    setEditDesc(task.description || '');
    setEditPriority(pri);
    setEditDueDate(task.dueDate ? new Date(task.dueDate).toISOString().slice(0, 16) : '');
    setIsDescriptionExpanded(true);
    setIsAddingSubtaskInDetail(false);
    setDetailSubtaskTitle('');
    setIsAddingNoteInDetail(false);
    setDetailQuickNote('');
  };

  // Long-press helpers for Tasks
  const handleStartLongPress = (id: string, clientX?: number, clientY?: number) => {
    if (selectedTaskIds.length > 0) return;
    isLongPressFiredRef.current = false;
    if (clientX !== undefined && clientY !== undefined) {
      touchStartPosRef.current = { x: clientX, y: clientY };
    }
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressFiredRef.current = true;
      setSelectedTaskIds([id]);
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

  // Scoped Real-Time Tasks Refresh (triggered via pull-to-refresh on Tasks view)
  const handleManualRefreshTasks = async () => {
    try {
      const [freshLists, freshTasks] = await Promise.all([
        fetchTaskLists(currentUser?.id),
        fetchTasks(currentUser?.id),
      ]);
      setTaskLists(freshLists);
      setTasks(freshTasks);
      setRefreshNotice('Tasks updated');
      setTimeout(() => setRefreshNotice(null), 2200);
    } catch (err) {
      console.warn('Tasks refresh notice:', err);
    }
  };

  const lastRefreshSignalRef = useRef(0);
  useEffect(() => {
    if (refreshSignal > lastRefreshSignalRef.current) {
      lastRefreshSignalRef.current = refreshSignal;
      void handleManualRefreshTasks();
    }
  }, [refreshSignal]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reliable Notification Toggle Switch Handler
  const handleToggleAlerts = async () => {
    if (!alertsEnabled) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        const res = await requestNotificationPermission(currentUser?.id);
        if (res === 'granted') {
          playReminderChime(false);
          sendDeviceNotification('Task Alerts Activated!', {
            body: 'Scheduled task reminders will fire via push alerts even offline.',
          });
        }
      } else {
        playReminderChime(false);
      }
      setAlertsEnabled(true);
      localStorage.setItem(ALERTS_STORAGE_KEY, 'true');
    } else {
      setAlertsEnabled(false);
      localStorage.setItem(ALERTS_STORAGE_KEY, 'false');
    }
  };

  // Reset Quick Create Modal
  const resetCreateModal = () => {
    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDueDate('');
    setNewTaskPriority('medium');
    setIsCreateModalOpen(false);
  };

  // Create Task immediately to localStorage, sync/queue with Supabase
  const handleCreateTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    if (newTaskDueDate && alertsEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void requestNotificationPermission(currentUser?.id);
    }

    const newTask: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      listId: activeListId,
      parentId: null,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      completed: false,
      isStarred: newTaskPriority === 'high',
      priority: newTaskPriority,
      dueDate: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
      reminderAt: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
      syncStatus: 'unsynced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: [],
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);
    triggerVibration?.('success');
    resetCreateModal();

    if (currentUser?.id) {
      const res = await upsertTaskToSupabase(newTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === newTask.id ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Save changes from Detail View
  const handleSaveDetailChanges = async () => {
    if (!detailTask || !editTitle.trim()) return;
    const dueIso = editDueDate ? new Date(editDueDate).toISOString() : null;
    if (dueIso && alertsEnabled && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      void requestNotificationPermission(currentUser?.id);
    }
    const updatedTask: TaskItem = {
      ...detailTask,
      title: editTitle.trim(),
      description: editDesc.trim(),
      priority: editPriority,
      isStarred: editPriority === 'high',
      dueDate: dueIso,
      reminderAt: dueIso,
      syncStatus: 'unsynced',
      updatedAt: new Date().toISOString(),
    };

    const updated = tasks.map((t) => (t.id === detailTask.id ? updatedTask : t));
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);
    setIsEditingDetail(false);
    triggerVibration?.('success');

    if (currentUser?.id) {
      const res = await upsertTaskToSupabase(updatedTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === detailTask.id ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  handleCloseDetailFromBackRef.current = () => {
    if (isEditingDetail) {
      void handleSaveDetailChanges();
    }
    setDetailTaskId(null);
    setIsEditingDetail(false);
  };

  // Append quick note in Detail View
  const handleAppendNoteInDetail = async () => {
    if (!detailTask || !detailQuickNote.trim()) return;
    const combinedDesc = detailTask.description?.trim()
      ? `${detailTask.description.trim()}\n\nNote: ${detailQuickNote.trim()}`
      : detailQuickNote.trim();

    const updatedTask: TaskItem = {
      ...detailTask,
      description: combinedDesc,
      syncStatus: 'unsynced',
      updatedAt: new Date().toISOString(),
    };

    const updated = tasks.map((t) => (t.id === detailTask.id ? updatedTask : t));
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);
    setEditDesc(combinedDesc);
    setDetailQuickNote('');
    setIsAddingNoteInDetail(false);
    setIsDescriptionExpanded(true);

    if (currentUser?.id) {
      const res = await upsertTaskToSupabase(updatedTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === detailTask.id ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Update priority directly from Detail View
  const handleChangeDetailPriority = async (nextPriority: TaskPriority) => {
    setEditPriority(nextPriority);
    if (!detailTask) return;

    const updatedTask: TaskItem = {
      ...detailTask,
      priority: nextPriority,
      isStarred: nextPriority === 'high',
      syncStatus: 'unsynced',
      updatedAt: new Date().toISOString(),
    };
    const updated = tasks.map((t) => (t.id === detailTask.id ? updatedTask : t));
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

    if (currentUser?.id) {
      const res = await upsertTaskToSupabase(updatedTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === detailTask.id ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Toggle Complete (Main Task) with offline-first sync
  const handleToggleComplete = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const nextCompleted = !t.completed;
        const updatedSubs = (t.subtasks || []).map((st) => ({ ...st, completed: nextCompleted }));
        return {
          ...t,
          completed: nextCompleted,
          subtasks: updatedSubs,
          syncStatus: 'unsynced' as const,
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);
    triggerVibration?.('click');

    const target = updated.find((t) => t.id === taskId);
    if (target && currentUser?.id) {
      const res = await upsertTaskToSupabase(target, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Safe Deletion Handlers (Requires explicit confirmation modal)
  const promptDeleteSingle = (task: TaskItem, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setConfirmDeleteTarget({ type: 'single', task });
  };

  const promptDeleteBatch = () => {
    if (selectedTaskIds.length === 0) return;
    setConfirmDeleteTarget({ type: 'batch', ids: selectedTaskIds });
  };

  const executeConfirmedDeletion = async () => {
    if (!confirmDeleteTarget) return;
    setIsDeleting(true);

    if (confirmDeleteTarget.type === 'single') {
      const taskId = confirmDeleteTarget.task.id;
      const updated = tasks.filter((t) => t.id !== taskId);
      setTasks(updated);
      saveLocalTasks(updated, currentUser?.id);
      setSelectedTaskIds((prev) => prev.filter((id) => id !== taskId));
      if (detailTaskId === taskId) {
        setDetailTaskId(null);
      }

      if (currentUser?.id) {
        await deleteTaskFromSupabase(taskId, currentUser.id);
      }
    } else {
      const idsToDelete = confirmDeleteTarget.ids;
      const updated = tasks.filter((n) => !idsToDelete.includes(n.id));
      setTasks(updated);
      saveLocalTasks(updated, currentUser?.id);
      setSelectedTaskIds([]);
      if (detailTaskId && idsToDelete.includes(detailTaskId)) {
        setDetailTaskId(null);
      }

      if (currentUser?.id) {
        await deleteTasksBatchFromSupabase(idsToDelete, currentUser.id);
      }
    }

    setIsDeleting(false);
    setConfirmDeleteTarget(null);
  };

  // Batch Selection Handlers
  const handleToggleSelectTask = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedTaskIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allFilteredIds = filteredTasks.map((t) => t.id);
    if (selectedTaskIds.length === allFilteredIds.length) {
      setSelectedTaskIds([]);
    } else {
      setSelectedTaskIds(allFilteredIds);
    }
  };

  const handleCancelSelection = () => {
    setSelectedTaskIds([]);
  };

  // Add Subtask with real-time Supabase sync
  const handleAddSubtask = async (parentId: string, titleValue: string) => {
    if (!titleValue.trim()) return;

    const newSubtask: TaskItem = {
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      listId: activeListId,
      parentId,
      title: titleValue.trim(),
      completed: false,
      isStarred: false,
      syncStatus: currentUser?.id ? 'synced' : 'unsynced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updated = tasks.map((t) => {
      if (t.id === parentId) {
        return {
          ...t,
          subtasks: [...(t.subtasks || []), newSubtask],
          updatedAt: new Date().toISOString(),
        };
      }
      return t;
    });

    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);
    setDetailSubtaskTitle('');
    setIsAddingSubtaskInDetail(false);

    const parentTask = updated.find((t) => t.id === parentId);
    if (parentTask && currentUser?.id) {
      const res = await upsertTaskToSupabase(parentTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === parentId ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Toggle Subtask with real-time Supabase sync
  const handleToggleSubtask = async (parentId: string, subtaskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === parentId) {
        const subs = (t.subtasks || []).map((s) => (s.id === subtaskId ? { ...s, completed: !s.completed } : s));
        return { ...t, subtasks: subs, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

    const parentTask = updated.find((t) => t.id === parentId);
    if (parentTask && currentUser?.id) {
      const res = await upsertTaskToSupabase(parentTask, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === parentId ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Delete Subtask with real-time Supabase sync
  const handleDeleteSubtask = async (parentId: string, subtaskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === parentId) {
        const subs = (t.subtasks || []).filter((s) => s.id !== subtaskId);
        return { ...t, subtasks: subs, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

    const parentTask = updated.find((t) => t.id === parentId);
    if (parentTask && currentUser?.id) {
      await upsertTaskToSupabase(parentTask, currentUser.id);
    }
    if (currentUser?.id) {
      await deleteTaskFromSupabase(subtaskId, currentUser.id);
    }
  };

  // Create Custom Task List with real-time Supabase sync
  const handleCreateList = async () => {
    if (!newListName.trim()) return;

    const newList: TaskList = {
      id: 'list-' + Date.now(),
      userId: currentUser?.id,
      name: newListName.trim(),
      color: 'blue',
      isDefault: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const updatedLists = [...taskLists, newList];
    setTaskLists(updatedLists);
    saveLocalTaskLists(updatedLists, currentUser?.id);
    setActiveListId(newList.id);
    setNewListName('');
    setShowNewListModal(false);

    if (currentUser?.id) {
      await upsertTaskListToSupabase(newList, currentUser.id);
    }
  };

  // Delete Custom List with real-time Supabase sync
  const handleDeleteList = async (listId: string) => {
    if (taskLists.length <= 1) return;

    const updatedLists = taskLists.filter((l) => l.id !== listId);
    setTaskLists(updatedLists);
    saveLocalTaskLists(updatedLists, currentUser?.id);

    if (activeListId === listId) {
      setActiveListId(updatedLists[0].id);
    }

    if (currentUser?.id) {
      await deleteTaskListFromSupabase(listId, currentUser.id);
    }
  };

  // Filter & sort tasks for compact multi-column grid
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const priorityRank: Record<TaskPriority, number> = { high: 0, medium: 1, low: 2 };

    return tasks
      .filter((t) => {
        const matchList = t.listId === activeListId || (!t.listId && activeListId === 'default-my-tasks');
        if (!matchList) return false;

        const pri = resolvePriority(t);
        if (activeFilter === 'active' && t.completed) return false;
        if (activeFilter === 'completed' && !t.completed) return false;
        if (activeFilter === 'priority' && pri !== 'high') return false;

        if (q !== '') {
          const matchesSub = (t.subtasks || []).some((st) => st.title.toLowerCase().includes(q));
          const matchText =
            t.title.toLowerCase().includes(q) ||
            (t.description || '').toLowerCase().includes(q) ||
            pri.includes(q) ||
            matchesSub;
          if (!matchText) return false;
        }
        return true;
      })
      .sort((a, b) => {
        if (activeFilter === 'priority') {
          const rankDiff = priorityRank[resolvePriority(a)] - priorityRank[resolvePriority(b)];
          if (rankDiff !== 0) return rankDiff;
        }
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
  }, [tasks, activeListId, activeFilter, searchQuery]);

  return (
    <div className="w-full max-w-full min-w-0 space-y-3.5 sm:space-y-4 pb-16">
      {/* Active In-App Reminder Alert Banner */}
      {activeAlert && (
        <div className="mt-2 bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-3.5 rounded-2xl shadow-lg flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-100">
                Reminder · {activeAlert.due}
              </div>
              <div className="text-xs sm:text-sm font-extrabold text-white truncate">{activeAlert.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                handleToggleComplete(activeAlert.id);
                setActiveAlert(null);
              }}
              className="px-3 py-1.5 bg-white text-blue-700 font-bold text-xs rounded-xl hover:bg-blue-50 transition-colors cursor-pointer"
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => setActiveAlert(null)}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white cursor-pointer"
              aria-label="Dismiss reminder"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Header: Title, Search Bar + Three-Dot Menu (with Alert Toggle), Filter Chips, and List Tabs */}
      <div
        data-sticky-secondary-header="tasks"
        className="sticky top-0 z-30 -mx-3 sm:-mx-6 md:-mx-8 px-3 sm:px-6 md:px-8 pt-2.5 pb-2.5 bg-[#f2f8fc]/95 backdrop-blur-md border-b border-slate-200/70 shadow-[0_2px_10px_rgba(15,23,42,0.03)] space-y-2.5"
      >
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h2 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight uppercase truncate">
            Tasks Manager
          </h2>

          <div className="flex items-center gap-2 shrink-0">
            {currentUser?.id && tasks.some((t) => t.syncStatus === 'unsynced') && !refreshNotice && (
              <span
                className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-800 bg-amber-50 px-2 py-1 rounded-full border border-amber-200"
                title="Saved locally — will sync automatically when online"
              >
                <CloudOff className="w-3 h-3 text-amber-600" />
                <span className="hidden sm:inline">Pending Sync</span>
              </span>
            )}

            {refreshNotice && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600" />
                <span>{refreshNotice}</span>
              </span>
            )}
          </div>
        </div>

        {/* Shortened Search Bar + Three-Dot Overflow Menu (contains Alert Toggle) */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              aria-label="Search tasks"
              className="w-full min-h-[42px] bg-white/95 border border-slate-200/90 text-slate-900 font-medium text-xs sm:text-sm rounded-2xl py-2 pl-10 pr-9 shadow-[0_1px_4px_rgba(15,23,42,0.03)] placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                aria-label="Clear task search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="relative shrink-0" ref={managerMenuRef}>
            <button
              type="button"
              id="tasks-header-menu-btn"
              onClick={() => setShowManagerMenu((prev) => !prev)}
              className="min-w-[42px] min-h-[42px] rounded-2xl bg-white/95 border border-slate-200/90 text-slate-700 hover:bg-slate-50 active:scale-95 flex items-center justify-center shadow-[0_1px_4px_rgba(15,23,42,0.03)] transition-all cursor-pointer"
              aria-label="Tasks actions menu"
              aria-expanded={showManagerMenu}
              title="Tasks actions"
            >
              <MoreVertical className="w-4.5 h-4.5" />
            </button>

            {showManagerMenu && (
              <div className="absolute right-0 top-full mt-2 w-52 bg-white rounded-2xl border border-slate-200 shadow-xl py-1.5 z-40">
                {/* Relocated Alert Toggle inside Three-Dot Menu */}
                <button
                  type="button"
                  id="tasks-notification-toggle-btn"
                  onClick={() => {
                    void handleToggleAlerts();
                    setShowManagerMenu(false);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center justify-between gap-2 cursor-pointer"
                  title={`Click to ${alertsEnabled ? 'disable' : 'enable'} task push alerts`}
                >
                  <span className="flex items-center gap-2">
                    {alertsEnabled ? (
                      <Bell className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <BellOff className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{alertsEnabled ? 'Alerts On' : 'Alerts Off'}</span>
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      alertsEnabled
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-100 text-slate-500 border border-slate-200'
                    }`}
                  >
                    {alertsEnabled ? 'ON' : 'OFF'}
                  </span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  onClick={() => {
                    setShowManagerMenu(false);
                    setShowNewListModal(true);
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 text-slate-500" />
                  <span>New Task List</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setShowManagerMenu(false);
                    handleSelectAll();
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedTaskIds.length > 0 ? 'Clear Selection' : 'Select All Tasks'}</span>
                </button>

                <div className="my-1 border-t border-slate-100" />

                <button
                  type="button"
                  onClick={() => {
                    setShowManagerMenu(false);
                    void handleManualRefreshTasks();
                  }}
                  className="w-full px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer"
                >
                  <RotateCw className="w-3.5 h-3.5 text-slate-500" />
                  <span>Sync & Refresh Tasks</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Interactive Status & Priority Filter Bar: All, Active, Completed, Priority */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-0.5 scrollbar-none">
          {(
            [
              { id: 'all', label: 'All' },
              { id: 'active', label: 'Active' },
              { id: 'completed', label: 'Completed' },
              { id: 'priority', label: 'Priority' },
            ] as { id: TaskFilterTab; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveFilter(tab.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                activeFilter === tab.id
                  ? 'bg-slate-900 text-white shadow-2xs font-bold'
                  : 'bg-white/90 text-slate-700 hover:bg-slate-100 border border-slate-200/80'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Compact Task List Tabs Strip (Preserves custom list management) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          {taskLists.map((list) => (
            <div
              key={list.id}
              className={`shrink-0 inline-flex items-center rounded-xl text-[11px] font-bold transition-all ${
                activeListId === list.id
                  ? 'bg-blue-50 text-blue-700 border border-blue-200'
                  : 'bg-white/75 text-slate-600 hover:bg-slate-100 border border-slate-200/70'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveListId(list.id)}
                className={`py-1.5 cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                  !list.isDefault ? 'pl-2.5 pr-1' : 'px-2.5'
                }`}
              >
                <span>{list.name}</span>
              </button>
              {!list.isDefault && (
                <button
                  type="button"
                  onClick={() => handleDeleteList(list.id)}
                  className="mr-1.5 p-0.5 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer transition-colors"
                  aria-label={`Delete ${list.name} list`}
                  title="Delete list"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          <button
            type="button"
            onClick={() => setShowNewListModal(true)}
            className="px-2.5 py-1.5 bg-slate-100/90 hover:bg-slate-200 text-slate-700 font-bold text-[11px] rounded-xl transition-all shrink-0 cursor-pointer flex items-center gap-1 whitespace-nowrap"
          >
            <FolderPlus className="w-3 h-3 text-blue-600" />
            <span>+ List</span>
          </button>
        </div>
      </div>

      {/* Floating Batch Action Bar when items are selected via Long-Press */}
      {selectedTaskIds.length > 0 && (
        <div className="sticky top-[168px] z-20 bg-slate-900 text-white p-3 sm:p-4 rounded-2xl shadow-xl flex flex-wrap items-center justify-between gap-3 border border-slate-700">
          <div className="flex items-center gap-2.5">
            <span className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center text-xs font-black">
              {selectedTaskIds.length}
            </span>
            <span className="text-xs font-bold">
              {selectedTaskIds.length} {selectedTaskIds.length === 1 ? 'task' : 'tasks'} selected
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectAll}
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              {selectedTaskIds.length === filteredTasks.length ? 'Deselect All' : 'Select All'}
            </button>

            <button
              type="button"
              onClick={promptDeleteBatch}
              disabled={selectedTaskIds.length === 0}
              className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete ({selectedTaskIds.length})</span>
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

      {/* Compact Multi-Column Task Grid */}
      {loading ? (
        <div className="py-12 text-center text-slate-400 text-sm font-semibold flex items-center justify-center gap-2">
          <RotateCw className="w-4 h-4 animate-spin text-blue-500" />
          <span>Loading your tasks...</span>
        </div>
      ) : filteredTasks.length === 0 ? (
        <div className="py-14 text-center max-w-sm mx-auto space-y-3 bg-white/80 rounded-2xl border border-slate-200/70 p-6">
          <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto border border-blue-100">
            <ListTodo className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-slate-800">
            {searchQuery || activeFilter !== 'all' ? 'No matching tasks' : 'No tasks in this list'}
          </h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            {searchQuery || activeFilter !== 'all'
              ? 'Try clearing your search or switching the active filter.'
              : 'Tap the + button below to create a task with priority and due date.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3.5 w-full min-w-0">
          {filteredTasks.map((task) => renderTaskCard(task))}
        </div>
      )}

      {/* Floating Dark Circular + Action Button (Bottom Right above Bottom Nav) */}
      {!detailTask && !isCreateModalOpen && selectedTaskIds.length === 0 && (
        <button
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          aria-label="Create new task"
          title="New Task"
          className="fixed bottom-20 right-4 sm:right-6 z-30 w-13 h-13 rounded-full bg-slate-900 hover:bg-slate-800 active:scale-95 text-white shadow-[0_8px_24px_rgba(15,23,42,0.28)] flex items-center justify-center transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <Plus className="w-6 h-6" />
        </button>
      )}

      {/* Quick Create Task Modal / Sheet */}
      {isCreateModalOpen && isMounted && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[99990] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/50 backdrop-blur-xs"
          onClick={resetCreateModal}
        >
          <form
            data-task-card="true"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleCreateTask}
            className="w-full max-w-lg bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-200 p-4 sm:p-6 space-y-4 max-h-[88dvh] overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900">New Task</h3>
              <button
                type="button"
                onClick={resetCreateModal}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg cursor-pointer"
                aria-label="Close new task modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3">
              <input
                type="text"
                autoFocus
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="Task title (e.g. Finish Q3 Report)"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400"
              />

              <textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Description or quick note..."
                rows={3}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 resize-none leading-relaxed"
              />

              {/* Priority Selector */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" />
                  <span>Priority</span>
                </span>
                <div className="grid grid-cols-3 gap-2">
                  {(['high', 'medium', 'low'] as TaskPriority[]).map((pri) => {
                    const badge = getPriorityBadgeConfig(pri);
                    const active = newTaskPriority === pri;
                    return (
                      <button
                        key={pri}
                        type="button"
                        onClick={() => setNewTaskPriority(pri)}
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          active
                            ? 'border-slate-900 ring-2 ring-slate-900/15 bg-slate-900 text-white'
                            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        {badge.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Due Date & Reminder */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Due Date &amp; Reminder</span>
                </span>
                <input
                  type="datetime-local"
                  value={newTaskDueDate}
                  onChange={(e) => setNewTaskDueDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={resetCreateModal}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!newTaskTitle.trim()}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-extrabold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
              >
                Add Task
              </button>
            </div>
          </form>
        </div>,
        document.body
      )}

      {/* FULL-SCREEN TASK DETAIL VIEW (Matching Reference Design Center Screen) */}
      {detailTask && isMounted && typeof document !== 'undefined' && createPortal(
        <div
          data-task-card="true"
          data-task-detail="true"
          data-task-priority={detailTask.completed ? 'completed' : resolvePriority(detailTask)}
          style={{
            backgroundColor: isDark
              ? '#0f172a'
              : getTaskCardSurface(resolvePriority(detailTask), detailTask.completed, false).bg,
          }}
          className="fixed inset-0 z-[99999] w-screen h-[100dvh] flex flex-col overscroll-none touch-manipulation"
        >
          {/* Minimal Detail Top Bar: < Back on left, Edit/Save + Delete on right */}
          <div className="sticky top-0 z-20 bg-white/80 backdrop-blur-md border-b border-black/10 px-4 sm:px-6 py-3 flex items-center justify-between gap-2 shrink-0 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button
              type="button"
              onClick={() => {
                if (isEditingDetail) {
                  handleSaveDetailChanges();
                }
                setDetailTaskId(null);
              }}
              className="w-10 h-10 rounded-full hover:bg-black/5 text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              aria-label="Back to tasks"
              title="Back to tasks"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={(e) => promptDeleteSingle(detailTask, e)}
                className="w-10 h-10 rounded-full text-rose-600 hover:bg-rose-50 flex items-center justify-center transition-colors cursor-pointer"
                aria-label="Delete task"
                title="Delete task"
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {isEditingDetail ? (
                <button
                  type="button"
                  onClick={handleSaveDetailChanges}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
                >
                  Save
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingDetail(true)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer transition-all"
                >
                  Edit
                </button>
              )}
            </div>
          </div>

          {/* Detail Body */}
          <div className="flex-1 overflow-y-auto overscroll-contain w-full max-w-2xl mx-auto px-4 sm:px-6 py-5 space-y-4 pb-[max(2rem,env(safe-area-inset-bottom))]">
            {/* Title, Checkbox & Metadata Row */}
            <div className="space-y-3">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  onClick={(e) => handleToggleComplete(detailTask.id, e)}
                  aria-label={detailTask.completed ? 'Mark task incomplete' : 'Mark task complete'}
                  className="mt-1 shrink-0 cursor-pointer"
                >
                  {detailTask.completed ? (
                    <span className="w-6 h-6 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-2xs">
                      <Check className="w-4 h-4 stroke-[3]" />
                    </span>
                  ) : (
                    <span className="w-6 h-6 rounded-lg border-2 border-slate-500 bg-white/90 flex items-center justify-center hover:border-slate-800" />
                  )}
                </button>

                {isEditingDetail ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Task title"
                    className="w-full bg-white/90 border border-slate-300 rounded-xl px-3 py-2 text-lg sm:text-2xl font-black text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                ) : (
                  <h2
                    className={`text-xl sm:text-2xl font-black tracking-tight leading-snug break-words ${
                      detailTask.completed ? 'line-through text-slate-500' : 'text-slate-900'
                    }`}
                  >
                    {detailTask.title}
                  </h2>
                )}
              </div>

              {/* Priority Selector & Due Date Status */}
              <div className="flex flex-wrap items-center gap-2 pl-9">
                {(['high', 'medium', 'low'] as TaskPriority[]).map((pri) => {
                  const currentPri = isEditingDetail ? editPriority : resolvePriority(detailTask);
                  const badge = getPriorityBadgeConfig(pri);
                  const isCurrent = currentPri === pri;
                  return (
                    <button
                      key={pri}
                      type="button"
                      onClick={() => handleChangeDetailPriority(pri)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        isCurrent
                          ? `${badge.className} ring-2 ring-slate-900/20 shadow-2xs`
                          : 'bg-white/75 text-slate-600 border border-black/10 hover:bg-white'
                      }`}
                    >
                      {badge.label}
                    </button>
                  );
                })}

                {isEditingDetail ? (
                  <input
                    type="datetime-local"
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="bg-white/90 border border-slate-300 rounded-lg px-2.5 py-1 text-[11px] font-semibold text-slate-800"
                  />
                ) : (
                  detailTask.dueDate && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/80 text-slate-700 border border-black/10 text-[11px] font-semibold">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>Due {formatDueDateShort(detailTask.dueDate)}</span>
                    </span>
                  )
                )}

                <span
                  className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold ${
                    detailTask.completed
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-white/80 text-slate-700 border border-black/10'
                  }`}
                >
                  {detailTask.completed ? 'Completed' : 'Active'}
                </span>
              </div>
            </div>

            {/* Collapsible Description Card */}
            <div className="bg-white/90 rounded-2xl border border-black/10 shadow-2xs overflow-hidden">
              <button
                type="button"
                onClick={() => setIsDescriptionExpanded((prev) => !prev)}
                className="w-full px-4 py-3 flex items-center justify-between text-left cursor-pointer hover:bg-black/[0.02]"
              >
                <span className="text-xs font-extrabold text-slate-900">Description</span>
                {isDescriptionExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-500" />
                )}
              </button>

              {isDescriptionExpanded && (
                <div className="px-4 pb-3.5 pt-0.5">
                  {isEditingDetail ? (
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={4}
                      placeholder="Add detailed task description or notes..."
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs sm:text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-200 resize-none leading-relaxed"
                    />
                  ) : (
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                      {detailTask.description?.trim() || 'No description added yet. Tap Edit or Add note below.'}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Subtasks Interactive Section */}
            <div className="bg-white/90 rounded-2xl border border-black/10 shadow-2xs overflow-hidden">
              {(detailTask.subtasks || []).length > 0 && (
                <div className="px-4 pt-3 pb-2 space-y-2 border-b border-slate-100">
                  <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Subtasks ({(detailTask.subtasks || []).filter((s) => s.completed).length}/
                    {(detailTask.subtasks || []).length})
                  </div>
                  {(detailTask.subtasks || []).map((sub) => (
                    <div key={sub.id} className="flex items-center justify-between gap-2 py-1">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => handleToggleSubtask(detailTask.id, sub.id)}
                          className="text-slate-500 hover:text-blue-600 cursor-pointer shrink-0"
                        >
                          {sub.completed ? (
                            <CheckCircle2 className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Circle className="w-4 h-4" />
                          )}
                        </button>
                        <span
                          className={`text-xs sm:text-sm truncate ${
                            sub.completed ? 'line-through text-slate-400' : 'text-slate-800 font-medium'
                          }`}
                        >
                          {sub.title}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubtask(detailTask.id, sub.id)}
                        className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                        title="Delete subtask"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {isAddingSubtaskInDetail ? (
                <div className="p-3 flex items-center gap-2">
                  <input
                    type="text"
                    autoFocus
                    value={detailSubtaskTitle}
                    onChange={(e) => setDetailSubtaskTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddSubtask(detailTask.id, detailSubtaskTitle);
                      }
                    }}
                    placeholder="Subtask title..."
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => handleAddSubtask(detailTask.id, detailSubtaskTitle)}
                    className="px-3.5 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer"
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsAddingSubtaskInDetail(false)}
                    className="p-2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingSubtaskInDetail(true);
                    setDetailSubtaskTitle('');
                  }}
                  className="w-full px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-black/[0.02] cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-slate-600" />
                  <span>Add subtask</span>
                </button>
              )}
            </div>

            {/* Add Note Action Row */}
            <div className="bg-white/90 rounded-2xl border border-black/10 shadow-2xs overflow-hidden">
              {isAddingNoteInDetail ? (
                <div className="p-3 space-y-2">
                  <textarea
                    autoFocus
                    value={detailQuickNote}
                    onChange={(e) => setDetailQuickNote(e.target.value)}
                    rows={2}
                    placeholder="Write a quick note for this task..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setIsAddingNoteInDetail(false)}
                      className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleAppendNoteInDetail}
                      disabled={!detailQuickNote.trim()}
                      className="px-3.5 py-1.5 bg-slate-900 disabled:opacity-40 text-white font-bold text-xs rounded-lg cursor-pointer"
                    >
                      Save Note
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingNoteInDetail(true);
                    setDetailQuickNote('');
                  }}
                  className="w-full px-4 py-3 flex items-center gap-2.5 text-xs sm:text-sm font-semibold text-slate-700 hover:bg-black/[0.02] cursor-pointer"
                >
                  <FileText className="w-4 h-4 text-slate-600" />
                  <span>Add note</span>
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* New List Modal */}
      {showNewListModal && isMounted && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[99995] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Create new list</h3>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">List Title</label>
              <input
                type="text"
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateList();
                  }
                }}
                placeholder="e.g. Retail Orders, Inventory, Personal"
                className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowNewListModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateList}
                disabled={!newListName.trim()}
                className="px-5 py-2 text-xs font-bold bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* EXPLICIT CONFIRMATION DIALOG (DELETION SAFEGUARD FOR TASKS) */}
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
                    ? 'Delete Task Permanently?'
                    : `Delete ${confirmDeleteTarget.ids.length} Selected Tasks?`}
                </h3>
                <p className="text-xs text-slate-500">
                  This action requires explicit approval and cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-slate-600 leading-relaxed">
              {confirmDeleteTarget.type === 'single' ? (
                <span>
                  Are you sure you want to delete{' '}
                  <strong className="text-slate-900 font-bold">
                    &quot;{confirmDeleteTarget.task.title}&quot;
                  </strong>
                  ? Any nested sub-tasks will also be removed permanently.
                </span>
              ) : (
                <span>
                  Are you sure you want to delete all{' '}
                  <strong className="text-rose-700 font-bold">{confirmDeleteTarget.ids.length}</strong> selected
                  tasks? Any of their nested sub-tasks will also be permanently deleted.
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
                        : `Delete ${confirmDeleteTarget.ids.length} Tasks`}
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

  function renderTaskCard(task: TaskItem) {
    const priority = resolvePriority(task);
    const surface = getTaskCardSurface(priority, task.completed, isDark);
    const badge = getPriorityBadgeConfig(priority);
    const dueLabel = formatDueDateShort(task.dueDate || task.reminderAt);
    const isOverdue =
      !task.completed && (task.dueDate || task.reminderAt)
        ? new Date(task.dueDate || task.reminderAt!).getTime() < Date.now()
        : false;
    const subtaskCount = task.subtasks?.length || 0;
    const completedSubCount = (task.subtasks || []).filter((s) => s.completed).length;
    const isSelected = selectedTaskIds.includes(task.id);

    return (
      <article
        key={task.id}
        data-task-card="true"
        data-task-priority={task.completed ? 'completed' : priority}
        onTouchStart={(e) => handleStartLongPress(task.id, e.touches[0]?.clientX, e.touches[0]?.clientY)}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleCancelLongPress}
        onMouseDown={(e) => handleStartLongPress(task.id, e.clientX, e.clientY)}
        onMouseUp={handleCancelLongPress}
        onMouseLeave={handleCancelLongPress}
        onClick={(e) => {
          if (isLongPressFiredRef.current) {
            isLongPressFiredRef.current = false;
            return;
          }
          if (selectedTaskIds.length > 0) {
            handleToggleSelectTask(task.id, e);
          } else {
            openTaskDetail(task);
          }
        }}
        style={{
          backgroundColor: surface.bg,
          borderColor: isSelected ? '#3b82f6' : surface.border,
        }}
        className={`group relative rounded-2xl p-3 sm:p-3.5 border transition-all duration-150 hover:shadow-md hover:-translate-y-0.5 cursor-pointer flex flex-col justify-between min-h-[124px] sm:min-h-[136px] shadow-[0_2px_8px_rgba(15,23,42,0.04)] select-none overflow-hidden ${
          isSelected ? 'ring-2 ring-blue-500 shadow-md scale-[1.01]' : ''
        }`}
      >
        {/* Top Section: Checkbox + Concise Title + Preview */}
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-start gap-2">
            {selectedTaskIds.length > 0 ? (
              <button
                type="button"
                onClick={(e) => handleToggleSelectTask(task.id, e)}
                aria-label={isSelected ? 'Deselect task' : 'Select task'}
                className={`mt-0.5 shrink-0 cursor-pointer transition-transform hover:scale-110 ${
                  isSelected ? 'text-blue-600' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-4.5 h-4.5 fill-blue-600 text-white" />
                ) : (
                  <Square className="w-4.5 h-4.5 bg-white/90 rounded-sm" />
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => handleToggleComplete(task.id, e)}
                aria-label={task.completed ? 'Mark task incomplete' : 'Mark task complete'}
                className="w-7 h-7 -ml-1 -mt-1 rounded-md flex items-center justify-center shrink-0 cursor-pointer active:scale-90 transition-transform"
              >
                {task.completed ? (
                  <span className="w-5 h-5 rounded-md bg-slate-900 text-white flex items-center justify-center shadow-2xs">
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                  </span>
                ) : (
                  <span className="w-5 h-5 rounded-md border-[1.75px] border-slate-500/80 bg-white/85 hover:border-slate-800 transition-colors" />
                )}
              </button>
            )}

            <h4
              className={`font-bold text-[13px] sm:text-sm tracking-tight leading-snug line-clamp-2 break-words min-w-0 flex-1 ${
                task.completed ? 'line-through text-slate-500' : 'text-slate-900'
              }`}
            >
              {task.title}
            </h4>
          </div>

          {/* Concise Preview Line (Description or Due Date) */}
          <div className="pl-7 space-y-0.5">
            {task.description && (
              <p className="text-[11px] text-slate-600 line-clamp-1 leading-snug">
                {task.description}
              </p>
            )}
            <div
              className={`text-[11px] font-medium truncate ${
                isOverdue ? 'text-rose-700 font-semibold' : 'text-slate-600'
              }`}
            >
              {dueLabel ? `${isOverdue ? 'Overdue' : 'Due'} ${dueLabel}` : 'No due date'}
            </div>
          </div>
        </div>

        {/* Bottom Row: Priority Badge + Status Indicator */}
        <div className="pt-2.5 mt-auto pl-7 flex items-center justify-between gap-1.5 min-w-0">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] sm:text-[11px] font-bold shrink-0 ${badge.className}`}
          >
            {badge.label}
          </span>

          <div className="flex items-center gap-1 text-[10px] font-bold shrink-0">
            {currentUser?.id && task.syncStatus === 'unsynced' && (
              <span
                title="Saved offline — pending cloud sync"
                className="text-amber-700 flex items-center justify-center"
              >
                <CloudOff className="w-3 h-3" />
              </span>
            )}
            {task.completed ? (
              <span className="inline-flex items-center gap-0.5 text-emerald-700">
                <CheckCircle2 className="w-3 h-3" />
                <span>Done</span>
              </span>
            ) : subtaskCount > 0 ? (
              <span className="inline-flex items-center gap-0.5 text-slate-600 tabular-nums">
                <ListTodo className="w-3 h-3" />
                <span>
                  {completedSubCount}/{subtaskCount}
                </span>
              </span>
            ) : task.reminderAt || task.dueDate ? (
              <span
                className={`inline-flex items-center gap-0.5 ${
                  isOverdue ? 'text-rose-600' : 'text-slate-500'
                }`}
                title={isOverdue ? 'Overdue task' : 'Scheduled task'}
              >
                <Bell className="w-3 h-3" />
              </span>
            ) : (
              <span className="text-slate-500 font-semibold">Active</span>
            )}
          </div>
        </div>
      </article>
    );
  }
}
