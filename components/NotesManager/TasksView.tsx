'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  CheckCircle2,
  Circle,
  Star,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Bell,
  BellOff,
  ListTodo,
  ChevronDown,
  ChevronRight,
  Check,
  X,
  FolderPlus,
  AlertTriangle,
  RotateCw,
  Square,
} from 'lucide-react';
import { TaskItem, TaskList } from '@/lib/types/notes-tasks';
import {
  fetchTasks,
  saveLocalTasks,
  upsertTaskToSupabase,
  deleteTaskFromSupabase,
  deleteTasksBatchFromSupabase,
  fetchTaskLists,
  saveLocalTaskLists,
  upsertTaskListToSupabase,
  deleteTaskListFromSupabase,
} from '@/lib/notesTasksStorage';
import { playReminderChime, sendDeviceNotification, requestNotificationPermission } from '@/lib/reminderService';

interface TasksViewProps {
  currentUser: any;
  triggerVibration?: (type: 'success' | 'error' | 'click' | 'reset') => void;
}

const ALERTS_STORAGE_KEY = 'retailcalc_tasks_alerts_enabled';

export default function TasksView({ currentUser }: TasksViewProps) {
  const [taskLists, setTaskLists] = useState<TaskList[]>([]);
  const [activeListId, setActiveListId] = useState<string>('default-my-tasks');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState<string | null>(null);

  // Filter & UI states
  const [onlyStarred, setOnlyStarred] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  // Batch Selection State (Activated by Long-Press)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);

  // Deletion Safeguard Modal State
  const [confirmDeleteTarget, setConfirmDeleteTarget] = useState<
    { type: 'single'; task: TaskItem } | { type: 'batch'; ids: string[] } | null
  >(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Reliable Notification Toggle State
  const [alertsEnabled, setAlertsEnabled] = useState<boolean>(true);

  // Quick Task Input
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskDueDate, setNewTaskDueDate] = useState('');
  const [newTaskIsStarred, setNewTaskIsStarred] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);

  // New List Modal
  const [showNewListModal, setShowNewListModal] = useState(false);
  const [newListName, setNewListName] = useState('');

  // Subtask creation state
  const [addingSubtaskForId, setAddingSubtaskForId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');

  // Active Reminder In-App Banner
  const [activeAlert, setActiveAlert] = useState<{ id: string; title: string; due: string } | null>(null);

  // Long-press refs
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressFiredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Initialize notification toggle preference
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(ALERTS_STORAGE_KEY);
      if (stored !== null) {
        setAlertsEnabled(stored === 'true');
      }
    }
  }, []);

  // Fetch lists & tasks
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

    return () => {
      isSubscribed = false;
    };
  }, [currentUser]);

  // Interval check for due tasks and reminder notifications
  useEffect(() => {
    const interval = setInterval(() => {
      if (!alertsEnabled) return;

      const now = new Date();
      tasks.forEach((task) => {
        if (!task.completed && (task.reminderAt || task.dueDate)) {
          const targetTime = new Date(task.reminderAt || task.dueDate!);
          const diff = now.getTime() - targetTime.getTime();

          if (diff >= 0 && diff <= 60000 && !(task as any)._alerted) {
            (task as any)._alerted = true;
            playReminderChime(false);
            sendDeviceNotification(`Task Due: ${task.title}`, {
              body: task.description || 'Your scheduled Google Task reminder has arrived.',
            });
            setActiveAlert({
              id: task.id,
              title: task.title,
              due: targetTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            });
          }
        }
      });
    }, 20000);

    return () => clearInterval(interval);
  }, [tasks, alertsEnabled]);

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

  // Manual Real-Time Tasks Refresh (No page reload)
  const handleManualRefreshTasks = async () => {
    setIsRefreshing(true);
    try {
      const [freshLists, freshTasks] = await Promise.all([
        fetchTaskLists(currentUser?.id),
        fetchTasks(currentUser?.id),
      ]);
      setTaskLists(freshLists);
      setTasks(freshTasks);
      setRefreshNotice('Tasks synchronized in real-time');
      setTimeout(() => setRefreshNotice(null), 3000);
    } catch (err) {
      console.warn('Manual tasks refresh notice:', err);
    } finally {
      setTimeout(() => {
        setIsRefreshing(false);
      }, 500);
    }
  };

  // Reliable Notification Toggle Switch Handler
  const handleToggleAlerts = async () => {
    if (!alertsEnabled) {
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission !== 'granted') {
        const res = await requestNotificationPermission();
        if (res === 'granted') {
          playReminderChime(false);
          sendDeviceNotification('Task Alerts Activated!', {
            body: 'You will receive device alerts when your scheduled tasks are due.',
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

  // Create Task with immediate Supabase real-time sync
  const handleCreateTask = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!newTaskTitle.trim()) return;

    const newTask: TaskItem = {
      id: 'task-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      listId: activeListId,
      parentId: null,
      title: newTaskTitle.trim(),
      description: newTaskDesc.trim(),
      completed: false,
      isStarred: newTaskIsStarred,
      dueDate: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
      reminderAt: newTaskDueDate ? new Date(newTaskDueDate).toISOString() : null,
      syncStatus: currentUser?.id ? 'synced' : 'unsynced',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      subtasks: [],
    };

    const updated = [newTask, ...tasks];
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

    setNewTaskTitle('');
    setNewTaskDesc('');
    setNewTaskDueDate('');
    setNewTaskIsStarred(false);
    setIsInputExpanded(false);

    if (currentUser?.id) {
      const res = await upsertTaskToSupabase(newTask, currentUser.id);
      if (res.syncStatus !== newTask.syncStatus) {
        setTasks((prev) => prev.map((t) => (t.id === newTask.id ? { ...t, syncStatus: res.syncStatus } : t)));
      }
    }
  };

  // Toggle Complete (Main Task) with real-time Supabase sync
  const handleToggleComplete = async (taskId: string) => {
    const updated = tasks.map((t) => {
      if (t.id === taskId) {
        const nextCompleted = !t.completed;
        const updatedSubs = (t.subtasks || []).map((st) => ({ ...st, completed: nextCompleted }));
        return { ...t, completed: nextCompleted, subtasks: updatedSubs, updatedAt: new Date().toISOString() };
      }
      return t;
    });

    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

    const target = updated.find((t) => t.id === taskId);
    if (target && currentUser?.id) {
      const res = await upsertTaskToSupabase(target, currentUser.id);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, syncStatus: res.syncStatus } : t)));
    }
  };

  // Toggle Star (Priority Marking) with real-time Supabase sync
  const handleToggleStar = async (taskId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const updated = tasks.map((t) =>
      t.id === taskId ? { ...t, isStarred: !t.isStarred, updatedAt: new Date().toISOString() } : t
    );
    setTasks(updated);
    saveLocalTasks(updated, currentUser?.id);

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

      if (currentUser?.id) {
        await deleteTaskFromSupabase(taskId, currentUser.id);
      }
    } else {
      const idsToDelete = confirmDeleteTarget.ids;
      const updated = tasks.filter((n) => !idsToDelete.includes(n.id));
      setTasks(updated);
      saveLocalTasks(updated, currentUser?.id);
      setSelectedTaskIds([]);

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
    const allFilteredIds = listTasks.map((t) => t.id);
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
  const handleAddSubtask = async (parentId: string) => {
    if (!subtaskTitle.trim()) return;

    const newSubtask: TaskItem = {
      id: 'sub-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
      userId: currentUser?.id,
      listId: activeListId,
      parentId,
      title: subtaskTitle.trim(),
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
    setSubtaskTitle('');
    setAddingSubtaskForId(null);

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
        const subs = (t.subtasks || []).map((s) => s.id !== subtaskId);
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

  // Filter tasks by active list & stars
  const listTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchStarred = onlyStarred ? t.isStarred : true;
      const matchCategory = onlyStarred ? true : t.listId === activeListId || (!t.listId && activeListId === 'default-my-tasks');
      return matchStarred && matchCategory;
    });
  }, [tasks, activeListId, onlyStarred]);

  const activeTasks = useMemo(() => listTasks.filter((t) => !t.completed), [listTasks]);
  const completedTasks = useMemo(() => listTasks.filter((t) => t.completed), [listTasks]);

  const activeListName = useMemo(() => {
    if (onlyStarred) return 'Starred Tasks';
    const found = taskLists.find((l) => l.id === activeListId);
    return found ? found.name : 'My Tasks';
  }, [taskLists, activeListId, onlyStarred]);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Active In-App Reminder Alert Banner */}
      {activeAlert && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white p-4 rounded-3xl shadow-xl flex items-center justify-between gap-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-white animate-bounce" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-blue-200">
                Scheduled Reminder • {activeAlert.due}
              </div>
              <div className="text-sm font-extrabold text-white">{activeAlert.title}</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                handleToggleComplete(activeAlert.id);
                setActiveAlert(null);
              }}
              className="px-3 py-1.5 bg-white text-blue-700 font-bold text-xs rounded-xl hover:bg-blue-50 transition-colors shadow-xs cursor-pointer"
            >
              Mark Done
            </button>
            <button
              type="button"
              onClick={() => setActiveAlert(null)}
              className="p-1.5 hover:bg-white/20 rounded-lg text-white/80 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Header Container with Notification Toggle and Corresponding Refresh Button Positioned to its Right */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 sm:p-6 rounded-3xl border border-slate-200/80 shadow-xs">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <ListTodo className="w-4 h-4" />
            </span>
            <span>Tasks Manager</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Google Tasks-style nested sub-tasks, priority stars &amp; long-press batch selection.
          </p>
        </div>

        {/* Right Action Group: Notification Toggle + Refresh Button Positioned to its Right */}
        <div className="flex items-center gap-2.5 flex-wrap">
          {refreshNotice && (
            <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 animate-in fade-in">
              <Check className="w-3 h-3 text-emerald-600" />
              <span>{refreshNotice}</span>
            </span>
          )}

          {/* Reliable Interactive Notification Toggle Switch */}
          <button
            type="button"
            id="tasks-notification-toggle-btn"
            onClick={handleToggleAlerts}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold border transition-all flex items-center gap-2.5 cursor-pointer shadow-xs active:scale-95 select-none ${
              alertsEnabled
                ? 'bg-emerald-50 border-emerald-300 text-emerald-800 hover:bg-emerald-100'
                : 'bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200'
            }`}
            title={`Click to ${alertsEnabled ? 'disable' : 'enable'} task device alerts`}
          >
            {alertsEnabled ? (
              <Bell className="w-4 h-4 text-emerald-600" />
            ) : (
              <BellOff className="w-4 h-4 text-slate-400" />
            )}

            <span>Alerts: {alertsEnabled ? 'ON' : 'OFF'}</span>

            {/* Visual Sliding Switch Knob */}
            <div
              className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-colors duration-200 ${
                alertsEnabled ? 'bg-emerald-600' : 'bg-slate-300'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-xs transform transition-transform duration-200 ${
                  alertsEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </div>
          </button>

          {/* Corresponding Distinct Round Refresh Button Placed Specifically to the Right of the Alert Toggle */}
          <button
            type="button"
            id="tasks-realtime-refresh-btn"
            onClick={handleManualRefreshTasks}
            disabled={isRefreshing}
            className="w-10 h-10 rounded-full bg-slate-50 hover:bg-blue-50 border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-700 flex items-center justify-center shadow-xs transition-all cursor-pointer active:scale-90 disabled:opacity-50"
            title="Refresh tasks data in real-time (no page reload)"
          >
            <RotateCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Floating or Top Batch Action Bar for Tasks (Activated by Long-Press) */}
      {selectedTaskIds.length > 0 && (
        <div className="sticky top-3 z-30 bg-slate-900 text-white p-3 sm:p-4 rounded-3xl shadow-2xl flex flex-wrap items-center justify-between gap-3 animate-in slide-in-from-top-2 duration-200 border border-slate-700">
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
              {selectedTaskIds.length === listTasks.length ? 'Deselect All' : 'Select All'}
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

      {/* Custom Lists Tabs & Starred Filter */}
      <div className="flex items-center justify-between gap-2 overflow-x-auto pb-1 scrollbar-none">
        <div className="flex items-center gap-1.5 min-w-0">
          {/* Starred High-Priority Tab */}
          <button
            type="button"
            onClick={() => setOnlyStarred(!onlyStarred)}
            className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all shrink-0 cursor-pointer flex items-center gap-1.5 ${
              onlyStarred
                ? 'bg-amber-500 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Star className={`w-3.5 h-3.5 ${onlyStarred ? 'fill-white text-white' : 'text-amber-500'}`} />
            <span>Starred</span>
          </button>

          {/* User Custom Lists */}
          {!onlyStarred &&
            taskLists.map((list) => (
              <div key={list.id} className="relative group shrink-0">
                <button
                  type="button"
                  onClick={() => setActiveListId(list.id)}
                  className={`px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                    activeListId === list.id
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                  }`}
                >
                  <span>{list.name}</span>
                  {!list.isDefault && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteList(list.id);
                      }}
                      className="ml-1 text-white/70 hover:text-white p-0.5 cursor-pointer"
                      title="Delete list"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </button>
              </div>
            ))}

          {/* "+ New List" Button */}
          {!onlyStarred && (
            <button
              type="button"
              onClick={() => setShowNewListModal(true)}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-all shrink-0 cursor-pointer flex items-center gap-1"
            >
              <FolderPlus className="w-3.5 h-3.5 text-blue-600" />
              <span>+ New List</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Task Creator & List Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-md p-4 sm:p-6 space-y-5 sm:space-y-6">
        {/* Active List Heading */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">{activeListName}</h3>
            <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
              {activeTasks.length} active
            </span>
          </div>
        </div>

        {/* Quick Task Creation Box (Google Tasks style) */}
        <form
          onSubmit={handleCreateTask}
          className="bg-slate-50 border border-slate-200 rounded-2xl p-3 sm:p-4 transition-all focus-within:ring-2 focus-within:ring-blue-100 focus-within:border-blue-500"
        >
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5 text-blue-600 shrink-0" />
            <input
              type="text"
              value={newTaskTitle}
              onChange={(e) => {
                setNewTaskTitle(e.target.value);
                if (!isInputExpanded) setIsInputExpanded(true);
              }}
              onFocus={() => setIsInputExpanded(true)}
              placeholder="Add a task..."
              className="w-full bg-transparent font-medium text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setNewTaskIsStarred(!newTaskIsStarred)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                newTaskIsStarred ? 'text-amber-500 bg-amber-50' : 'text-slate-300 hover:text-amber-500'
              }`}
              title="Star priority task"
            >
              <Star className={`w-4 h-4 ${newTaskIsStarred ? 'fill-amber-500' : ''}`} />
            </button>
          </div>

          {isInputExpanded && (
            <div className="mt-3 pt-3 border-t border-slate-200/70 space-y-3">
              <textarea
                value={newTaskDesc}
                onChange={(e) => setNewTaskDesc(e.target.value)}
                placeholder="Details & notes..."
                rows={2}
                className="w-full bg-transparent text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none resize-none leading-relaxed"
              />

              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1 text-xs text-slate-600">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    <input
                      type="datetime-local"
                      value={newTaskDueDate}
                      onChange={(e) => setNewTaskDueDate(e.target.value)}
                      className="bg-transparent text-xs text-slate-700 font-medium focus:outline-none"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsInputExpanded(false);
                      setNewTaskTitle('');
                      setNewTaskDesc('');
                      setNewTaskDueDate('');
                    }}
                    className="px-3 py-1.5 text-xs font-semibold text-slate-500 hover:text-slate-700 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!newTaskTitle.trim()}
                    className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    Save Task
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>

        {/* Task Items List */}
        {loading ? (
          <div className="py-8 text-center text-slate-400 text-xs font-semibold">
            Loading your tasks...
          </div>
        ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
          <div className="py-12 text-center max-w-sm mx-auto space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
              <Check className="w-6 h-6" />
            </div>
            <h4 className="text-sm font-bold text-slate-800">All tasks completed!</h4>
            <p className="text-xs text-slate-500">
              Nice work! Add a new task above or organize with custom lists.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Active (Uncompleted) Tasks */}
            {activeTasks.map((task) => renderTaskRow(task))}

            {/* Completed Tasks Accordion */}
            {completedTasks.length > 0 && (
              <div className="pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCompleted(!showCompleted)}
                  className="flex items-center gap-1.5 text-xs font-bold text-slate-500 hover:text-slate-800 py-1 cursor-pointer select-none"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${showCompleted ? '' : '-rotate-90'}`} />
                  <span>Completed ({completedTasks.length})</span>
                </button>

                {showCompleted && (
                  <div className="mt-2 space-y-1.5 pl-2 opacity-75">
                    {completedTasks.map((task) => renderTaskRow(task))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* New List Modal */}
      {showNewListModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
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
                className="px-5 py-2 text-xs font-bold bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl shadow-xs cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EXPLICIT CONFIRMATION DIALOG (DELETION SAFEGUARD FOR TASKS) */}
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
        </div>
      )}
    </div>
  );

  function renderTaskRow(task: TaskItem) {
    const isAddingSub = addingSubtaskForId === task.id;
    const subtaskCount = task.subtasks?.length || 0;
    const completedSubtaskCount = (task.subtasks || []).filter((s) => s.completed).length;
    const isSelected = selectedTaskIds.includes(task.id);

    return (
      <div
        key={task.id}
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
          }
        }}
        className={`group border-2 rounded-2xl p-3 sm:p-3.5 transition-all select-none ${
          isSelected
            ? 'border-blue-500 bg-blue-50/50 ring-2 ring-blue-400 shadow-sm'
            : task.completed
            ? 'border-slate-200/80 bg-slate-50/60'
            : 'border-slate-200/80 bg-white hover:border-slate-300 hover:shadow-xs'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Batch Selection Checkbox, Checkbox and Title */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            {/* Batch Selection Checkbox shown when in selection mode */}
            {selectedTaskIds.length > 0 && (
              <button
                type="button"
                onClick={(e) => handleToggleSelectTask(task.id, e)}
                className={`mt-0.5 text-blue-600 shrink-0 cursor-pointer hover:scale-110 transition-transform ${
                  isSelected ? 'text-blue-600' : 'text-slate-400 hover:text-slate-600'
                }`}
                title={isSelected ? 'Deselect task' : 'Select task'}
              >
                {isSelected ? (
                  <CheckCircle2 className="w-5 h-5 fill-blue-600 text-white" />
                ) : (
                  <Square className="w-5 h-5 bg-white rounded-md" />
                )}
              </button>
            )}

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleComplete(task.id);
              }}
              className="mt-0.5 text-slate-400 hover:text-blue-600 transition-colors shrink-0 cursor-pointer"
            >
              {task.completed ? (
                <CheckCircle2 className="w-5 h-5 text-blue-600" />
              ) : (
                <Circle className="w-5 h-5 hover:scale-105" />
              )}
            </button>

            <div className="min-w-0 flex-1">
              <div
                className={`text-sm font-bold tracking-tight leading-snug break-words ${
                  task.completed ? 'line-through text-slate-400 font-normal' : 'text-slate-900'
                }`}
              >
                {task.title}
              </div>

              {task.description && (
                <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 leading-relaxed">
                  {task.description}
                </p>
              )}

              {/* Due date & Reminder tags */}
              {(task.dueDate || task.reminderAt) && (
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    <Calendar className="w-3 h-3 text-blue-600" />
                    <span>
                      {new Date(task.dueDate || task.reminderAt!).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Sync Status Badge, Star Priority & Safe Delete Action */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Visual Sync Status Indicator for Task */}
            {task.syncStatus === 'synced' ? (
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

            {/* Star Priority Button */}
            <button
              type="button"
              onClick={(e) => handleToggleStar(task.id, e)}
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                task.isStarred
                  ? 'text-amber-500 bg-amber-50 ring-1 ring-amber-300'
                  : 'text-slate-300 hover:text-amber-500 opacity-60 group-hover:opacity-100'
              }`}
              title="Toggle priority star"
            >
              <Star className={`w-4 h-4 ${task.isStarred ? 'fill-amber-500' : ''}`} />
            </button>

            {/* Safe Delete Task Button (triggers confirmation dialog) */}
            <button
              type="button"
              onClick={(e) => promptDeleteSingle(task, e)}
              className="p-1.5 text-slate-300 hover:text-rose-500 rounded-lg hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Delete task permanently"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tasks Section */}
        <div className="mt-2.5 pl-8 space-y-1.5 border-t border-slate-100 pt-2">
          {/* Subtask list */}
          {task.subtasks && task.subtasks.length > 0 && (
            <div className="space-y-1">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1 flex items-center gap-1">
                <span>Sub-tasks</span>
                <span className="text-blue-600 font-bold">
                  ({completedSubtaskCount}/{subtaskCount})
                </span>
              </div>
              {task.subtasks.map((sub) => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 py-0.5 group/sub text-xs"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <button
                      type="button"
                      onClick={() => handleToggleSubtask(task.id, sub.id)}
                      className="text-slate-400 hover:text-blue-600 cursor-pointer"
                    >
                      {sub.completed ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                      ) : (
                        <Circle className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <span
                      className={`truncate ${
                        sub.completed ? 'line-through text-slate-400' : 'text-slate-700 font-medium'
                      }`}
                    >
                      {sub.title}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteSubtask(task.id, sub.id)}
                    className="text-slate-300 hover:text-rose-500 p-0.5 opacity-0 group-hover/sub:opacity-100 transition-opacity cursor-pointer"
                    title="Delete subtask"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Add Subtask input / toggle */}
          {isAddingSub ? (
            <div className="flex items-center gap-1.5 pt-1">
              <input
                type="text"
                autoFocus
                value={subtaskTitle}
                onChange={(e) => setSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddSubtask(task.id);
                  }
                }}
                placeholder="Sub-task title (Enter to add)"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => handleAddSubtask(task.id)}
                className="px-2.5 py-1 bg-blue-600 text-white font-bold text-xs rounded-lg shrink-0 cursor-pointer"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => setAddingSubtaskForId(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setAddingSubtaskForId(task.id);
                setSubtaskTitle('');
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-blue-600 transition-colors flex items-center gap-1 py-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" />
              <span>Add sub-task</span>
            </button>
          )}
        </div>
      </div>
    );
  }
}
