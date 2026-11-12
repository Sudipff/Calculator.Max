import { NoteItem, TaskItem, TaskList } from './types/notes-tasks';
import { createClient } from '@/utils/supabase/client';

const NOTES_STORAGE_PREFIX = 'retailcalc_notes_';
const TASKS_STORAGE_PREFIX = 'retailcalc_tasks_';
const LISTS_STORAGE_PREFIX = 'retailcalc_lists_';

function getStorageKey(prefix: string, userId?: string | null): string {
  return `${prefix}${userId ? userId : 'local_guest'}`;
}

// ----------------- DEFAULT SEED DATA (If empty) -----------------
const DEFAULT_TASK_LISTS: TaskList[] = [
  { id: 'default-my-tasks', name: 'My Tasks', color: 'blue', isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'default-work', name: 'Work', color: 'purple', isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'default-shopping', name: 'Shopping & Retail', color: 'emerald', isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const DEFAULT_NOTES: NoteItem[] = [
  {
    id: 'seed-note-1',
    title: 'Retail Store Checklist',
    content: '',
    color: 'mint',
    isPinned: true,
    isChecklist: true,
    checklistItems: [
      { id: 'c1', text: 'Verify daily closing balance & till', completed: true },
      { id: 'c2', text: 'Check incoming wholesale shipment invoices', completed: false },
      { id: 'c3', text: 'Apply weekend 15% discount tags on winter stock', completed: false },
    ],
    labels: ['Store Ops', 'Finance'],
    reminderAt: null,
    isEmergency: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'seed-note-2',
    title: 'Supplier Contacts & Payment Terms',
    content: 'Metro Packaging: 30 days credit term.\nGreen Produce: Cash on delivery with 3% instant settlement rebate.\nGST No: 19ABCDE1234F1Z5',
    color: 'sand',
    isPinned: false,
    isChecklist: false,
    checklistItems: [],
    labels: ['Vendors'],
    reminderAt: null,
    isEmergency: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

const DEFAULT_TASKS: TaskItem[] = [
  {
    id: 'seed-task-1',
    listId: 'default-my-tasks',
    parentId: null,
    title: 'Review Quarterly Retail Profit Margins',
    description: 'Compare gross margins across fashion apparel vs electronics.',
    completed: false,
    isStarred: true,
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    reminderAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    subtasks: [
      {
        id: 'seed-sub-1',
        listId: 'default-my-tasks',
        parentId: 'seed-task-1',
        title: 'Export EMI & Discount calculation history report',
        completed: true,
        isStarred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'seed-sub-2',
        listId: 'default-my-tasks',
        parentId: 'seed-task-1',
        title: 'Send audited summaries to accountant',
        completed: false,
        isStarred: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ],
  },
];

// ----------------- NOTES CRUD -----------------

export function getLocalNotes(userId?: string | null): NoteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(NOTES_STORAGE_PREFIX, userId));
    if (raw) {
      return JSON.parse(raw);
    }
    // For fresh session, seed default
    const initial = DEFAULT_NOTES;
    localStorage.setItem(getStorageKey(NOTES_STORAGE_PREFIX, userId), JSON.stringify(initial));
    return initial;
  } catch {
    return [];
  }
}

export function saveLocalNotes(notes: NoteItem[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(NOTES_STORAGE_PREFIX, userId), JSON.stringify(notes));
  } catch (e) {
    console.warn('LocalStorage save notes warning:', e);
  }
}

export async function fetchNotes(userId?: string | null): Promise<NoteItem[]> {
  const local = getLocalNotes(userId);

  if (!userId) {
    return local.map((n) => ({ ...n, syncStatus: 'unsynced' as const }));
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const mapped: NoteItem[] = data.map((n: any) => ({
        id: n.id,
        userId: n.user_id,
        title: n.title || '',
        content: n.content || '',
        color: n.color || 'default',
        isPinned: !!n.is_pinned,
        isChecklist: !!n.is_checklist,
        checklistItems: Array.isArray(n.checklist_items) ? n.checklist_items : [],
        labels: Array.isArray(n.labels) ? n.labels : [],
        reminderAt: n.reminder_at || null,
        isEmergency: !!n.is_emergency,
        syncStatus: 'synced' as const,
        createdAt: n.created_at || new Date().toISOString(),
        updatedAt: n.updated_at || new Date().toISOString(),
      }));

      // Cache locally
      saveLocalNotes(mapped, userId);
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase fetch notes notice:', err);
  }

  return local.map((n) => ({ ...n, syncStatus: 'unsynced' as const }));
}

export async function upsertNoteToSupabase(
  note: NoteItem,
  userId?: string | null
): Promise<{ success: boolean; syncStatus: 'synced' | 'unsynced'; error?: any }> {
  if (!userId) {
    return { success: false, syncStatus: 'unsynced' };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').upsert({
      id: note.id,
      user_id: userId,
      title: note.title,
      content: note.content,
      color: note.color,
      is_pinned: !!note.isPinned,
      is_checklist: !!note.isChecklist,
      checklist_items: note.checklistItems || [],
      labels: note.labels || [],
      reminder_at: note.reminderAt || null,
      is_emergency: !!note.isEmergency,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Supabase upsert note error:', error);
      return { success: false, syncStatus: 'unsynced', error };
    }

    return { success: true, syncStatus: 'synced' };
  } catch (err) {
    console.warn('Supabase upsert note exception:', err);
    return { success: false, syncStatus: 'unsynced', error: err };
  }
}

export async function deleteNoteFromSupabase(
  noteId: string,
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };

  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').delete().eq('id', noteId).eq('user_id', userId);
    return { success: !error };
  } catch (err) {
    console.warn('Supabase delete note notice:', err);
    return { success: false };
  }
}

export async function deleteNotesBatchFromSupabase(
  noteIds: string[],
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId || !noteIds || noteIds.length === 0) return { success: false };

  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').delete().in('id', noteIds).eq('user_id', userId);
    return { success: !error };
  } catch (err) {
    console.warn('Supabase batch delete notes notice:', err);
    return { success: false };
  }
}

// ----------------- TASK LISTS CRUD -----------------

export function getLocalTaskLists(userId?: string | null): TaskList[] {
  if (typeof window === 'undefined') return DEFAULT_TASK_LISTS;
  try {
    const raw = localStorage.getItem(getStorageKey(LISTS_STORAGE_PREFIX, userId));
    if (raw) {
      return JSON.parse(raw);
    }
    const initial = DEFAULT_TASK_LISTS;
    localStorage.setItem(getStorageKey(LISTS_STORAGE_PREFIX, userId), JSON.stringify(initial));
    return initial;
  } catch {
    return DEFAULT_TASK_LISTS;
  }
}

export function saveLocalTaskLists(lists: TaskList[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(LISTS_STORAGE_PREFIX, userId), JSON.stringify(lists));
  } catch (e) {
    console.warn('LocalStorage save lists warning:', e);
  }
}

export async function fetchTaskLists(userId?: string | null): Promise<TaskList[]> {
  const local = getLocalTaskLists(userId);

  if (!userId) {
    return local;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped: TaskList[] = data.map((l: any) => ({
        id: l.id,
        userId: l.user_id,
        name: l.name,
        color: l.color || 'blue',
        isDefault: !!l.is_default,
        createdAt: l.created_at || new Date().toISOString(),
        updatedAt: l.updated_at || new Date().toISOString(),
      }));

      saveLocalTaskLists(mapped, userId);
      return mapped;
    }
  } catch (err) {
    console.warn('Supabase fetch task lists notice:', err);
  }

  return local;
}

export async function upsertTaskListToSupabase(list: TaskList, userId?: string | null): Promise<void> {
  if (!userId) return;

  try {
    const supabase = createClient();
    await supabase.from('task_lists').upsert({
      id: list.id,
      user_id: userId,
      name: list.name,
      color: list.color || 'blue',
      is_default: !!list.isDefault,
      updated_at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Supabase upsert task list notice:', err);
  }
}

export async function deleteTaskListFromSupabase(listId: string, userId?: string | null): Promise<void> {
  if (!userId) return;

  try {
    const supabase = createClient();
    await supabase.from('task_lists').delete().eq('id', listId).eq('user_id', userId);
  } catch (err) {
    console.warn('Supabase delete task list notice:', err);
  }
}

// ----------------- TASKS CRUD -----------------

export function getLocalTasks(userId?: string | null): TaskItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(TASKS_STORAGE_PREFIX, userId));
    if (raw) {
      return JSON.parse(raw);
    }
    const initial = DEFAULT_TASKS;
    localStorage.setItem(getStorageKey(TASKS_STORAGE_PREFIX, userId), JSON.stringify(initial));
    return initial;
  } catch {
    return [];
  }
}

export function saveLocalTasks(tasks: TaskItem[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(TASKS_STORAGE_PREFIX, userId), JSON.stringify(tasks));
  } catch (e) {
    console.warn('LocalStorage save tasks warning:', e);
  }
}

export async function fetchTasks(userId?: string | null): Promise<TaskItem[]> {
  const local = getLocalTasks(userId);

  if (!userId) {
    return local.map((t) => ({
      ...t,
      syncStatus: 'unsynced' as const,
      subtasks: (t.subtasks || []).map((st) => ({ ...st, syncStatus: 'unsynced' as const })),
    }));
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      // Assemble top-level tasks and nested sub-tasks
      const allItems: TaskItem[] = data.map((t: any) => ({
        id: t.id,
        userId: t.user_id,
        listId: t.list_id || 'default-my-tasks',
        parentId: t.parent_id || null,
        title: t.title || '',
        description: t.description || '',
        completed: !!t.completed,
        isStarred: !!t.is_starred,
        dueDate: t.due_date || null,
        reminderAt: t.reminder_at || null,
        syncStatus: 'synced' as const,
        createdAt: t.created_at || new Date().toISOString(),
        updatedAt: t.updated_at || new Date().toISOString(),
        subtasks: [],
      }));

      const topLevel: TaskItem[] = [];
      const subtaskMap: Record<string, TaskItem[]> = {};

      allItems.forEach((t) => {
        if (t.parentId) {
          if (!subtaskMap[t.parentId]) subtaskMap[t.parentId] = [];
          subtaskMap[t.parentId].push(t);
        } else {
          topLevel.push(t);
        }
      });

      topLevel.forEach((t) => {
        t.subtasks = subtaskMap[t.id] || [];
      });

      saveLocalTasks(topLevel, userId);
      return topLevel;
    }
  } catch (err) {
    console.warn('Supabase fetch tasks notice:', err);
  }

  return local.map((t) => ({
    ...t,
    syncStatus: 'unsynced' as const,
    subtasks: (t.subtasks || []).map((st) => ({ ...st, syncStatus: 'unsynced' as const })),
  }));
}

export async function upsertTaskToSupabase(
  task: TaskItem,
  userId?: string | null
): Promise<{ success: boolean; syncStatus: 'synced' | 'unsynced'; error?: any }> {
  if (!userId) {
    return { success: false, syncStatus: 'unsynced' };
  }

  try {
    const supabase = createClient();

    // Ensure list exists in public.task_lists if listId is supplied
    if (task.listId) {
      try {
        await supabase.from('task_lists').upsert(
          {
            id: task.listId,
            user_id: userId,
            name: task.listId === 'default-my-tasks' ? 'My Tasks' : 'Tasks List',
            color: 'blue',
            is_default: task.listId === 'default-my-tasks',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch (e) {
        // Continue even if list creation had a non-critical notice
      }
    }

    const { error } = await supabase.from('tasks').upsert({
      id: task.id,
      user_id: userId,
      list_id: task.listId || null,
      parent_id: task.parentId || null,
      title: task.title,
      description: task.description || '',
      completed: !!task.completed,
      is_starred: !!task.isStarred,
      due_date: task.dueDate || null,
      reminder_at: task.reminderAt || null,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('Supabase upsert task error:', error);
      // Fallback: If foreign key on list_id failed, retry with list_id = null
      if (error.code === '23503' && task.listId) {
        const { error: retryErr } = await supabase.from('tasks').upsert({
          id: task.id,
          user_id: userId,
          list_id: null,
          parent_id: task.parentId || null,
          title: task.title,
          description: task.description || '',
          completed: !!task.completed,
          is_starred: !!task.isStarred,
          due_date: task.dueDate || null,
          reminder_at: task.reminderAt || null,
          updated_at: new Date().toISOString(),
        });
        if (retryErr) {
          return { success: false, syncStatus: 'unsynced', error: retryErr };
        }
      } else {
        return { success: false, syncStatus: 'unsynced', error };
      }
    }

    // Also upsert any nested subtasks
    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        await supabase.from('tasks').upsert({
          id: sub.id,
          user_id: userId,
          list_id: task.listId || null,
          parent_id: task.id,
          title: sub.title,
          description: sub.description || '',
          completed: !!sub.completed,
          is_starred: !!sub.isStarred,
          due_date: sub.dueDate || null,
          reminder_at: sub.reminderAt || null,
          updated_at: new Date().toISOString(),
        });
      }
    }

    return { success: true, syncStatus: 'synced' };
  } catch (err) {
    console.warn('Supabase upsert task exception:', err);
    return { success: false, syncStatus: 'unsynced', error: err };
  }
}

export async function deleteTaskFromSupabase(
  taskId: string,
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };

  try {
    const supabase = createClient();
    // Delete any subtasks first to guarantee clean cleanup
    await supabase.from('tasks').delete().eq('parent_id', taskId).eq('user_id', userId);
    // Delete main task
    const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('user_id', userId);
    return { success: !error };
  } catch (err) {
    console.warn('Supabase delete task notice:', err);
    return { success: false };
  }
}

export async function deleteTasksBatchFromSupabase(
  taskIds: string[],
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId || !taskIds || taskIds.length === 0) return { success: false };

  try {
    const supabase = createClient();
    // Delete subtasks of any of the selected tasks
    await supabase.from('tasks').delete().in('parent_id', taskIds).eq('user_id', userId);
    // Delete selected tasks
    const { error } = await supabase.from('tasks').delete().in('id', taskIds).eq('user_id', userId);
    return { success: !error };
  } catch (err) {
    console.warn('Supabase batch delete tasks notice:', err);
    return { success: false };
  }
}
