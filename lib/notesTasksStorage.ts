import { NoteItem, TaskItem, TaskList, TaskPriority } from './types/notes-tasks';
import { createClient } from '@/utils/supabase/client';
import { syncRemindersToDeviceStore } from './reminderService';
import { getBackupPermissions } from './backupPermissions';

const NOTES_STORAGE_PREFIX = 'retailcalc_notes_';
const TASKS_STORAGE_PREFIX = 'retailcalc_tasks_';
const LISTS_STORAGE_PREFIX = 'retailcalc_lists_';
const TASK_PRIORITIES_PREFIX = 'retailcalc_task_priorities_';
const SYNC_OUTBOX_PREFIX = 'retailcalc_sync_outbox_';

export type OfflineSyncOpType =
  | 'upsert_note'
  | 'delete_note'
  | 'upsert_task'
  | 'delete_task'
  | 'upsert_task_list'
  | 'delete_task_list';

export interface OfflineSyncOperation {
  opKey: string; // `${type}:${entityId}`
  type: OfflineSyncOpType;
  entityId: string;
  updatedAt: string;
}

const inFlightSyncByUser = new Map<string, Promise<{ syncedCount: number; pendingCount: number }>>();

function getStorageKey(prefix: string, userId?: string | null): string {
  return `${prefix}${userId ? userId : 'local_guest'}`;
}

function emitSyncEvent(userId: string | null | undefined, syncedCount: number, pendingCount: number) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('calcmax:sync-updated', {
      detail: { userId: userId || null, syncedCount, pendingCount },
    })
  );
}

function triggerBackgroundSyncRegistration() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready
    .then((reg) => {
      const syncMgr = (reg as unknown as { sync?: { register: (tag: string) => Promise<void> } }).sync;
      if (syncMgr && typeof syncMgr.register === 'function') {
        return syncMgr.register('calcmax-offline-sync').catch(() => {});
      }
    })
    .catch(() => {});
}

// ----------------- PERSISTENT OFFLINE SYNC OUTBOX -----------------

export function getOfflineSyncQueue(userId?: string | null): OfflineSyncOperation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(SYNC_OUTBOX_PREFIX, userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveOfflineSyncQueue(queue: OfflineSyncOperation[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(getStorageKey(SYNC_OUTBOX_PREFIX, userId), JSON.stringify(queue));
  } catch {
    // Ignore quota notices
  }
}

export function getPendingSyncCount(userId?: string | null): number {
  const queue = getOfflineSyncQueue(userId);
  const localNotes = getLocalNotesRaw(userId).filter((n) => n.syncStatus === 'unsynced');
  const localTasks = getLocalTasksRaw(userId).filter((t) => t.syncStatus === 'unsynced');

  const keys = new Set<string>(queue.map((q) => q.opKey));
  localNotes.forEach((n) => keys.add(`upsert_note:${n.id}`));
  localTasks.forEach((t) => keys.add(`upsert_task:${t.id}`));
  return keys.size;
}

function enqueueOfflineOperation(
  type: OfflineSyncOpType,
  entityId: string,
  userId?: string | null
) {
  if (typeof window === 'undefined' || !userId) return;
  const existing = getOfflineSyncQueue(userId);
  const opKey = `${type}:${entityId}`;

  // Coalesce conflicting operations cleanly (e.g., delete removes pending upsert for the same item)
  let nextQueue = existing.filter((op) => op.opKey !== opKey);
  if (type === 'delete_note') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `upsert_note:${entityId}`);
  } else if (type === 'upsert_note') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `delete_note:${entityId}`);
  } else if (type === 'delete_task') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `upsert_task:${entityId}`);
  } else if (type === 'upsert_task') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `delete_task:${entityId}`);
  } else if (type === 'delete_task_list') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `upsert_task_list:${entityId}`);
  } else if (type === 'upsert_task_list') {
    nextQueue = nextQueue.filter((op) => op.opKey !== `delete_task_list:${entityId}`);
  }

  nextQueue.push({
    opKey,
    type,
    entityId,
    updatedAt: new Date().toISOString(),
  });

  saveOfflineSyncQueue(nextQueue, userId);
  triggerBackgroundSyncRegistration();
  emitSyncEvent(userId, 0, nextQueue.length);
}

function clearOfflineOperation(type: OfflineSyncOpType, entityId: string, userId?: string | null) {
  if (typeof window === 'undefined' || !userId) return;
  const existing = getOfflineSyncQueue(userId);
  const opKey = `${type}:${entityId}`;
  const filtered = existing.filter((op) => op.opKey !== opKey);
  if (filtered.length !== existing.length) {
    saveOfflineSyncQueue(filtered, userId);
  }
}

function isOfflineNow(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

// ----------------- PRIORITY MAP HELPERS -----------------

function loadPriorityMap(userId?: string | null): Record<string, TaskPriority> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getStorageKey(TASK_PRIORITIES_PREFIX, userId));
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function savePriorityMapFromTasks(tasks: TaskItem[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadPriorityMap(userId);
    tasks.forEach((t) => {
      if (t.priority) {
        existing[t.id] = t.priority;
      }
    });
    localStorage.setItem(getStorageKey(TASK_PRIORITIES_PREFIX, userId), JSON.stringify(existing));
  } catch {
    // Ignore storage quota notice
  }
}

function resolveTaskPriority(
  task: Pick<TaskItem, 'id' | 'isStarred' | 'priority'>,
  map: Record<string, TaskPriority>
): TaskPriority {
  if (task.priority === 'high' || task.priority === 'medium' || task.priority === 'low') {
    return task.priority;
  }
  if (map[task.id]) return map[task.id];
  return task.isStarred ? 'high' : 'medium';
}

// ----------------- DEFAULT SEED DATA -----------------

const DEFAULT_TASK_LISTS: TaskList[] = [
  { id: 'default-my-tasks', name: 'My Tasks', color: 'blue', isDefault: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'default-work', name: 'Work', color: 'purple', isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: 'default-shopping', name: 'Shopping & Retail', color: 'emerald', isDefault: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const SEED_PAST_ISO_1 = new Date(Date.now() - 86400000 * 3).toISOString();
const SEED_PAST_ISO_2 = new Date(Date.now() - 86400000 * 5).toISOString();

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
    syncStatus: 'unsynced',
    createdAt: SEED_PAST_ISO_1,
    updatedAt: SEED_PAST_ISO_1,
  },
  {
    id: 'seed-note-2',
    title: 'Supplier Contacts & Payment Terms',
    content:
      'Metro Packaging: 30 days credit term.\nGreen Produce: Cash on delivery with 3% instant settlement rebate.\nGST No: 19ABCDE1234F1Z5',
    color: 'sand',
    isPinned: false,
    isChecklist: false,
    checklistItems: [],
    labels: ['Vendors'],
    reminderAt: null,
    isEmergency: false,
    syncStatus: 'unsynced',
    createdAt: SEED_PAST_ISO_2,
    updatedAt: SEED_PAST_ISO_2,
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
    priority: 'high',
    dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
    reminderAt: null,
    syncStatus: 'unsynced',
    createdAt: SEED_PAST_ISO_1,
    updatedAt: SEED_PAST_ISO_1,
    subtasks: [
      {
        id: 'seed-sub-1',
        listId: 'default-my-tasks',
        parentId: 'seed-task-1',
        title: 'Export EMI & Discount calculation history report',
        completed: true,
        isStarred: false,
        createdAt: SEED_PAST_ISO_1,
        updatedAt: SEED_PAST_ISO_1,
      },
      {
        id: 'seed-sub-2',
        listId: 'default-my-tasks',
        parentId: 'seed-task-1',
        title: 'Send audited summaries to accountant',
        completed: false,
        isStarred: false,
        createdAt: SEED_PAST_ISO_1,
        updatedAt: SEED_PAST_ISO_1,
      },
    ],
  },
];

function getLocalNotesRaw(userId?: string | null): NoteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(NOTES_STORAGE_PREFIX, userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function getLocalTasksRaw(userId?: string | null): TaskItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(TASKS_STORAGE_PREFIX, userId));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function syncCombinedDeviceReminders(userId?: string | null, overrideNotes?: NoteItem[], overrideTasks?: TaskItem[]) {
  if (typeof window === 'undefined') return;
  const notes = overrideNotes ?? getLocalNotesRaw(userId);
  const tasks = overrideTasks ?? getLocalTasksRaw(userId);
  void syncRemindersToDeviceStore(notes, tasks);
}

// ----------------- NOTES CRUD (OFFLINE-FIRST) -----------------

export function getLocalNotes(userId?: string | null): NoteItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(getStorageKey(NOTES_STORAGE_PREFIX, userId));
    if (raw) {
      return JSON.parse(raw);
    }
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
    syncCombinedDeviceReminders(userId, notes, undefined);
  } catch (e) {
    console.warn('LocalStorage save notes warning:', e);
  }
}

async function pushNoteDirectlyToSupabase(
  note: NoteItem,
  userId: string
): Promise<{ success: boolean; error?: any }> {
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
      updated_at: note.updatedAt || new Date().toISOString(),
    });
    return { success: !error, error };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function upsertNoteToSupabase(
  note: NoteItem,
  userId?: string | null
): Promise<{ success: boolean; syncStatus: 'synced' | 'unsynced'; error?: any }> {
  if (!userId) {
    return { success: false, syncStatus: 'unsynced' };
  }

  if (!getBackupPermissions(userId).notes) {
    return { success: false, syncStatus: 'unsynced' };
  }

  // Always queue immediately if browser is offline
  if (isOfflineNow()) {
    enqueueOfflineOperation('upsert_note', note.id, userId);
    return { success: false, syncStatus: 'unsynced' };
  }

  const res = await pushNoteDirectlyToSupabase(note, userId);
  if (!res.success) {
    enqueueOfflineOperation('upsert_note', note.id, userId);
    return { success: false, syncStatus: 'unsynced', error: res.error };
  }

  clearOfflineOperation('upsert_note', note.id, userId);
  // Persist synced badge into localStorage cache immediately
  const cached = getLocalNotesRaw(userId);
  if (cached.some((n) => n.id === note.id)) {
    saveLocalNotes(
      cached.map((n) => (n.id === note.id ? { ...n, syncStatus: 'synced' } : n)),
      userId
    );
  }

  // Softly sync scheduled reminder record if note has a reminder
  if (note.reminderAt) {
    void upsertScheduledReminderToSupabase(
      userId,
      'note',
      note.id,
      note.title || 'Note Alert',
      note.content || '',
      note.reminderAt,
      Boolean(note.isEmergency)
    );
  } else {
    void deleteScheduledReminderFromSupabase(userId, 'note', note.id);
  }

  return { success: true, syncStatus: 'synced' };
}

export async function deleteNoteFromSupabase(
  noteId: string,
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };

  if (isOfflineNow()) {
    enqueueOfflineOperation('delete_note', noteId, userId);
    return { success: false };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').delete().eq('id', noteId).eq('user_id', userId);
    if (error) {
      enqueueOfflineOperation('delete_note', noteId, userId);
      return { success: false };
    }
    clearOfflineOperation('delete_note', noteId, userId);
    clearOfflineOperation('upsert_note', noteId, userId);
    void deleteScheduledReminderFromSupabase(userId, 'note', noteId);
    return { success: true };
  } catch {
    enqueueOfflineOperation('delete_note', noteId, userId);
    return { success: false };
  }
}

export async function deleteNotesBatchFromSupabase(
  noteIds: string[],
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId || !noteIds || noteIds.length === 0) return { success: false };

  if (isOfflineNow()) {
    noteIds.forEach((id) => enqueueOfflineOperation('delete_note', id, userId));
    return { success: false };
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from('notes').delete().in('id', noteIds).eq('user_id', userId);
    if (error) {
      noteIds.forEach((id) => enqueueOfflineOperation('delete_note', id, userId));
      return { success: false };
    }
    noteIds.forEach((id) => {
      clearOfflineOperation('delete_note', id, userId);
      clearOfflineOperation('upsert_note', id, userId);
      void deleteScheduledReminderFromSupabase(userId, 'note', id);
    });
    return { success: true };
  } catch {
    noteIds.forEach((id) => enqueueOfflineOperation('delete_note', id, userId));
    return { success: false };
  }
}

export async function fetchNotes(userId?: string | null): Promise<NoteItem[]> {
  const local = getLocalNotes(userId);
  syncCombinedDeviceReminders(userId, local, undefined);

  if (!userId) {
    return local.map((n) => ({ ...n, syncStatus: 'unsynced' as const }));
  }

  if (isOfflineNow()) {
    return local;
  }

  // Ensure any offline creations, edits, or deletions are pushed BEFORE pulling cloud snapshot
  await flushOfflineSyncQueue(userId);

  const localAfterFlush = getLocalNotes(userId);
  const pendingOutbox = getOfflineSyncQueue(userId);
  const pendingDeleteIds = new Set(
    pendingOutbox.filter((op) => op.type === 'delete_note').map((op) => op.entityId)
  );
  const pendingUpsertIds = new Set(
    pendingOutbox.filter((op) => op.type === 'upsert_note').map((op) => op.entityId)
  );
  const unsyncedLocalMap = new Map<string, NoteItem>();
  localAfterFlush.forEach((n) => {
    if (n.syncStatus === 'unsynced' || pendingUpsertIds.has(n.id)) {
      unsyncedLocalMap.set(n.id, n);
    }
  });

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const mappedCloud: NoteItem[] = data
        .filter((n: any) => !pendingDeleteIds.has(n.id))
        .map((n: any) => ({
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

      const mergedById = new Map<string, NoteItem>();
      mappedCloud.forEach((cloudNote) => mergedById.set(cloudNote.id, cloudNote));

      // Preserve any local item that is still unsynced or newer than cloud snapshot
      unsyncedLocalMap.forEach((localNote, id) => {
        const cloudNote = mergedById.get(id);
        if (!cloudNote || new Date(localNote.updatedAt).getTime() >= new Date(cloudNote.updatedAt).getTime()) {
          mergedById.set(id, { ...localNote, syncStatus: 'unsynced' });
        }
      });

      const merged = Array.from(mergedById.values()).sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      saveLocalNotes(merged, userId);
      return merged;
    }
  } catch (err) {
    console.warn('Supabase fetch notes notice:', err);
  }

  return localAfterFlush;
}

// ----------------- TASK LISTS CRUD (OFFLINE-FIRST) -----------------

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

async function pushTaskListDirectlyToSupabase(list: TaskList, userId: string): Promise<boolean> {
  try {
    const supabase = createClient();
    const { error } = await supabase.from('task_lists').upsert({
      id: list.id,
      user_id: userId,
      name: list.name,
      color: list.color || 'blue',
      is_default: !!list.isDefault,
      updated_at: list.updatedAt || new Date().toISOString(),
    });
    return !error;
  } catch {
    return false;
  }
}

export async function fetchTaskLists(userId?: string | null): Promise<TaskList[]> {
  const local = getLocalTaskLists(userId);
  if (!userId || isOfflineNow()) {
    return local;
  }

  await flushOfflineSyncQueue(userId);
  const pendingDeleteLists = new Set(
    getOfflineSyncQueue(userId)
      .filter((op) => op.type === 'delete_task_list')
      .map((op) => op.entityId)
  );

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('task_lists')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
      const mapped: TaskList[] = data
        .filter((l: any) => !pendingDeleteLists.has(l.id))
        .map((l: any) => ({
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

  if (isOfflineNow()) {
    enqueueOfflineOperation('upsert_task_list', list.id, userId);
    return;
  }

  const ok = await pushTaskListDirectlyToSupabase(list, userId);
  if (!ok) {
    enqueueOfflineOperation('upsert_task_list', list.id, userId);
  } else {
    clearOfflineOperation('upsert_task_list', list.id, userId);
  }
}

export async function deleteTaskListFromSupabase(listId: string, userId?: string | null): Promise<void> {
  if (!userId) return;

  if (isOfflineNow()) {
    enqueueOfflineOperation('delete_task_list', listId, userId);
    return;
  }

  try {
    const supabase = createClient();
    const { error } = await supabase.from('task_lists').delete().eq('id', listId).eq('user_id', userId);
    if (error) {
      enqueueOfflineOperation('delete_task_list', listId, userId);
    } else {
      clearOfflineOperation('delete_task_list', listId, userId);
      clearOfflineOperation('upsert_task_list', listId, userId);
    }
  } catch {
    enqueueOfflineOperation('delete_task_list', listId, userId);
  }
}

// ----------------- TASKS CRUD (OFFLINE-FIRST) -----------------

export function getLocalTasks(userId?: string | null): TaskItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const pMap = loadPriorityMap(userId);
    const raw = localStorage.getItem(getStorageKey(TASKS_STORAGE_PREFIX, userId));
    if (raw) {
      const parsed: TaskItem[] = JSON.parse(raw);
      return parsed.map((t) => ({ ...t, priority: resolveTaskPriority(t, pMap) }));
    }
    const initial = DEFAULT_TASKS;
    localStorage.setItem(getStorageKey(TASKS_STORAGE_PREFIX, userId), JSON.stringify(initial));
    savePriorityMapFromTasks(initial, userId);
    return initial;
  } catch {
    return [];
  }
}

export function saveLocalTasks(tasks: TaskItem[], userId?: string | null) {
  if (typeof window === 'undefined') return;
  try {
    savePriorityMapFromTasks(tasks, userId);
    localStorage.setItem(getStorageKey(TASKS_STORAGE_PREFIX, userId), JSON.stringify(tasks));
    syncCombinedDeviceReminders(userId, undefined, tasks);
  } catch (e) {
    console.warn('LocalStorage save tasks warning:', e);
  }
}

async function upsertSingleTaskRowWithFallback(
  supabase: ReturnType<typeof createClient>,
  task: TaskItem,
  userId: string,
  parentIdOverride?: string | null
): Promise<{ success: boolean; error?: any }> {
  const priority = task.priority || (task.isStarred ? 'high' : 'medium');
  const payloadWithPriority: Record<string, any> = {
    id: task.id,
    user_id: userId,
    list_id: task.listId || null,
    parent_id: parentIdOverride !== undefined ? parentIdOverride : task.parentId || null,
    title: task.title,
    description: task.description || '',
    completed: !!task.completed,
    is_starred: !!task.isStarred,
    priority,
    due_date: task.dueDate || null,
    reminder_at: task.reminderAt || null,
    updated_at: task.updatedAt || new Date().toISOString(),
  };

  let { error } = await supabase.from('tasks').upsert(payloadWithPriority);

  // Fallback if SQL migration for `priority` column hasn't been run on Supabase yet
  if (
    error &&
    (error.code === 'PGRST204' ||
      error.code === '42703' ||
      String(error.message || '').toLowerCase().includes('priority'))
  ) {
    const { priority: _omitted, ...legacyPayload } = payloadWithPriority;
    void _omitted;
    const retryRes = await supabase.from('tasks').upsert(legacyPayload);
    error = retryRes.error;
  }

  // Fallback if foreign key on list_id failed
  if (error && error.code === '23503' && payloadWithPriority.list_id) {
    const { priority: _omitted, ...legacyPayload } = payloadWithPriority;
    void _omitted;
    const fkRetry = await supabase.from('tasks').upsert({ ...legacyPayload, list_id: null });
    error = fkRetry.error;
  }

  return { success: !error, error };
}

async function pushTaskDirectlyToSupabase(
  task: TaskItem,
  userId: string
): Promise<{ success: boolean; error?: any }> {
  try {
    const supabase = createClient();

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
      } catch {
        // Ignore non-critical list ensure notice
      }
    }

    const mainRes = await upsertSingleTaskRowWithFallback(supabase, task, userId);
    if (!mainRes.success) {
      return mainRes;
    }

    if (task.subtasks && task.subtasks.length > 0) {
      for (const sub of task.subtasks) {
        const subRes = await upsertSingleTaskRowWithFallback(supabase, sub, userId, task.id);
        if (!subRes.success) {
          return subRes;
        }
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err };
  }
}

export async function upsertTaskToSupabase(
  task: TaskItem,
  userId?: string | null
): Promise<{ success: boolean; syncStatus: 'synced' | 'unsynced'; error?: any }> {
  if (!userId) {
    return { success: false, syncStatus: 'unsynced' };
  }

  if (!getBackupPermissions(userId).tasks) {
    return { success: false, syncStatus: 'unsynced' };
  }

  if (isOfflineNow()) {
    enqueueOfflineOperation('upsert_task', task.id, userId);
    return { success: false, syncStatus: 'unsynced' };
  }

  const res = await pushTaskDirectlyToSupabase(task, userId);
  if (!res.success) {
    enqueueOfflineOperation('upsert_task', task.id, userId);
    return { success: false, syncStatus: 'unsynced', error: res.error };
  }

  clearOfflineOperation('upsert_task', task.id, userId);
  const cached = getLocalTasksRaw(userId);
  if (cached.some((t) => t.id === task.id)) {
    saveLocalTasks(
      cached.map((t) =>
        t.id === task.id
          ? {
              ...t,
              syncStatus: 'synced',
              subtasks: (t.subtasks || []).map((st) => ({ ...st, syncStatus: 'synced' })),
            }
          : t
      ),
      userId
    );
  }

  const remindIso = !task.completed ? task.reminderAt || task.dueDate : null;
  if (remindIso) {
    void upsertScheduledReminderToSupabase(
      userId,
      'task',
      task.id,
      task.title,
      task.description || '',
      remindIso,
      task.priority === 'high' || Boolean(task.isStarred)
    );
  } else {
    void deleteScheduledReminderFromSupabase(userId, 'task', task.id);
  }

  return { success: true, syncStatus: 'synced' };
}

export async function deleteTaskFromSupabase(
  taskId: string,
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId) return { success: false };

  if (isOfflineNow()) {
    enqueueOfflineOperation('delete_task', taskId, userId);
    return { success: false };
  }

  try {
    const supabase = createClient();
    await supabase.from('tasks').delete().eq('parent_id', taskId).eq('user_id', userId);
    const { error } = await supabase.from('tasks').delete().eq('id', taskId).eq('user_id', userId);
    if (error) {
      enqueueOfflineOperation('delete_task', taskId, userId);
      return { success: false };
    }
    clearOfflineOperation('delete_task', taskId, userId);
    clearOfflineOperation('upsert_task', taskId, userId);
    void deleteScheduledReminderFromSupabase(userId, 'task', taskId);
    return { success: true };
  } catch {
    enqueueOfflineOperation('delete_task', taskId, userId);
    return { success: false };
  }
}

export async function deleteTasksBatchFromSupabase(
  taskIds: string[],
  userId?: string | null
): Promise<{ success: boolean }> {
  if (!userId || !taskIds || taskIds.length === 0) return { success: false };

  if (isOfflineNow()) {
    taskIds.forEach((id) => enqueueOfflineOperation('delete_task', id, userId));
    return { success: false };
  }

  try {
    const supabase = createClient();
    await supabase.from('tasks').delete().in('parent_id', taskIds).eq('user_id', userId);
    const { error } = await supabase.from('tasks').delete().in('id', taskIds).eq('user_id', userId);
    if (error) {
      taskIds.forEach((id) => enqueueOfflineOperation('delete_task', id, userId));
      return { success: false };
    }
    taskIds.forEach((id) => {
      clearOfflineOperation('delete_task', id, userId);
      clearOfflineOperation('upsert_task', id, userId);
      void deleteScheduledReminderFromSupabase(userId, 'task', id);
    });
    return { success: true };
  } catch {
    taskIds.forEach((id) => enqueueOfflineOperation('delete_task', id, userId));
    return { success: false };
  }
}

export async function fetchTasks(userId?: string | null): Promise<TaskItem[]> {
  const local = getLocalTasks(userId);
  const pMap = loadPriorityMap(userId);
  syncCombinedDeviceReminders(userId, undefined, local);

  if (!userId) {
    return local.map((t) => ({
      ...t,
      priority: resolveTaskPriority(t, pMap),
      syncStatus: 'unsynced' as const,
      subtasks: (t.subtasks || []).map((st) => ({ ...st, syncStatus: 'unsynced' as const })),
    }));
  }

  if (isOfflineNow()) {
    return local;
  }

  await flushOfflineSyncQueue(userId);

  const localAfterFlush = getLocalTasks(userId);
  const pendingOutbox = getOfflineSyncQueue(userId);
  const pendingDeleteIds = new Set(
    pendingOutbox.filter((op) => op.type === 'delete_task').map((op) => op.entityId)
  );
  const pendingUpsertIds = new Set(
    pendingOutbox.filter((op) => op.type === 'upsert_task').map((op) => op.entityId)
  );
  const unsyncedLocalMap = new Map<string, TaskItem>();
  localAfterFlush.forEach((t) => {
    if (t.syncStatus === 'unsynced' || pendingUpsertIds.has(t.id)) {
      unsyncedLocalMap.set(t.id, t);
    }
  });

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from('tasks')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && Array.isArray(data)) {
      const allItems: TaskItem[] = data
        .filter((t: any) => !pendingDeleteIds.has(t.id))
        .map((t: any) => ({
          id: t.id,
          userId: t.user_id,
          listId: t.list_id || 'default-my-tasks',
          parentId: t.parent_id || null,
          title: t.title || '',
          description: t.description || '',
          completed: !!t.completed,
          isStarred: !!t.is_starred,
          priority: resolveTaskPriority(
            { id: t.id, isStarred: !!t.is_starred, priority: t.priority },
            pMap
          ),
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

      const mergedById = new Map<string, TaskItem>();
      topLevel.forEach((cloudTask) => mergedById.set(cloudTask.id, cloudTask));

      unsyncedLocalMap.forEach((localTask, id) => {
        const cloudTask = mergedById.get(id);
        if (!cloudTask || new Date(localTask.updatedAt).getTime() >= new Date(cloudTask.updatedAt).getTime()) {
          mergedById.set(id, { ...localTask, syncStatus: 'unsynced' });
        }
      });

      const merged = Array.from(mergedById.values()).sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      saveLocalTasks(merged, userId);
      return merged;
    }
  } catch (err) {
    console.warn('Supabase fetch tasks notice:', err);
  }

  return localAfterFlush;
}

// ----------------- SCHEDULED REMINDER CLOUD MIRROR (OPTIONAL SQL) -----------------

async function upsertScheduledReminderToSupabase(
  userId: string,
  sourceType: 'note' | 'task',
  sourceId: string,
  title: string,
  body: string,
  remindAt: string,
  isEmergency: boolean
): Promise<void> {
  if (!userId || isOfflineNow()) return;
  try {
    const supabase = createClient();
    await supabase.from('scheduled_reminders').upsert(
      {
        user_id: userId,
        source_type: sourceType,
        source_id: sourceId,
        title: title.slice(0, 200),
        body: body.slice(0, 1000),
        remind_at: remindAt,
        is_emergency: isEmergency,
        sent_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,source_type,source_id' }
    );
  } catch {
    // Graceful no-op if scheduled_reminders table hasn't been migrated yet
  }
}

async function deleteScheduledReminderFromSupabase(
  userId: string,
  sourceType: 'note' | 'task',
  sourceId: string
): Promise<void> {
  if (!userId || isOfflineNow()) return;
  try {
    const supabase = createClient();
    await supabase
      .from('scheduled_reminders')
      .delete()
      .eq('user_id', userId)
      .eq('source_type', sourceType)
      .eq('source_id', sourceId);
  } catch {
    // Graceful no-op
  }
}

// ----------------- AUTOMATIC OFFLINE-TO-CLOUD SYNC FLUSHER -----------------

export async function flushOfflineSyncQueue(
  userId?: string | null
): Promise<{ syncedCount: number; pendingCount: number }> {
  if (typeof window === 'undefined' || !userId || isOfflineNow()) {
    return { syncedCount: 0, pendingCount: getPendingSyncCount(userId) };
  }

  const existingPromise = inFlightSyncByUser.get(userId);
  if (existingPromise) {
    return existingPromise;
  }

  const syncTask = (async () => {
    let syncedCount = 0;
    const supabase = createClient();
    const queue = getOfflineSyncQueue(userId);
    const localNotes = getLocalNotesRaw(userId);
    const localTasks = getLocalTasksRaw(userId);
    const localLists = getLocalTaskLists(userId);

    const backupPerms = getBackupPermissions(userId);

    // Ensure every local unsynced note or task is represented in the work set (when permitted)
    const opMap = new Map<string, OfflineSyncOperation>();
    queue.forEach((op) => opMap.set(op.opKey, op));

    if (backupPerms.notes) {
      localNotes.forEach((n) => {
        const delKey = `delete_note:${n.id}`;
        if (n.syncStatus === 'unsynced' && !opMap.has(delKey)) {
          opMap.set(`upsert_note:${n.id}`, {
            opKey: `upsert_note:${n.id}`,
            type: 'upsert_note',
            entityId: n.id,
            updatedAt: n.updatedAt || new Date().toISOString(),
          });
        }
      });
    }

    if (backupPerms.tasks) {
      localTasks.forEach((t) => {
        const delKey = `delete_task:${t.id}`;
        if (t.syncStatus === 'unsynced' && !opMap.has(delKey)) {
          opMap.set(`upsert_task:${t.id}`, {
            opKey: `upsert_task:${t.id}`,
            type: 'upsert_task',
            entityId: t.id,
            updatedAt: t.updatedAt || new Date().toISOString(),
          });
        }
      });
    }

    const ops = Array.from(opMap.values()).filter((op) => {
      if ((op.type === 'upsert_note' || op.type === 'delete_note') && !backupPerms.notes) {
        return false;
      }
      if (
        (op.type === 'upsert_task' ||
          op.type === 'delete_task' ||
          op.type === 'upsert_task_list' ||
          op.type === 'delete_task_list') &&
        !backupPerms.tasks
      ) {
        return false;
      }
      return true;
    });
    if (ops.length === 0) {
      return { syncedCount: 0, pendingCount: queue.length };
    }

    const remainingQueue: OfflineSyncOperation[] = [];
    const syncedNoteIds = new Set<string>();
    const syncedTaskIds = new Set<string>();

    // Execute lists first so foreign keys on task.list_id succeed
    const orderedOps = [...ops].sort((a, b) => {
      const rank: Record<OfflineSyncOpType, number> = {
        upsert_task_list: 0,
        upsert_note: 1,
        upsert_task: 2,
        delete_task: 3,
        delete_note: 4,
        delete_task_list: 5,
      };
      return rank[a.type] - rank[b.type];
    });

    for (const op of orderedOps) {
      let ok = false;
      try {
        if (op.type === 'upsert_task_list') {
          const list = localLists.find((l) => l.id === op.entityId);
          ok = list ? await pushTaskListDirectlyToSupabase(list, userId) : true;
        } else if (op.type === 'delete_task_list') {
          const { error } = await supabase
            .from('task_lists')
            .delete()
            .eq('id', op.entityId)
            .eq('user_id', userId);
          ok = !error;
        } else if (op.type === 'upsert_note') {
          const note = localNotes.find((n) => n.id === op.entityId);
          if (!note) {
            ok = true;
          } else {
            const res = await pushNoteDirectlyToSupabase(note, userId);
            ok = res.success;
            if (ok) {
              syncedNoteIds.add(note.id);
              if (note.reminderAt) {
                void upsertScheduledReminderToSupabase(
                  userId,
                  'note',
                  note.id,
                  note.title || 'Note Alert',
                  note.content || '',
                  note.reminderAt,
                  Boolean(note.isEmergency)
                );
              }
            }
          }
        } else if (op.type === 'delete_note') {
          const { error } = await supabase
            .from('notes')
            .delete()
            .eq('id', op.entityId)
            .eq('user_id', userId);
          ok = !error;
          if (ok) {
            void deleteScheduledReminderFromSupabase(userId, 'note', op.entityId);
          }
        } else if (op.type === 'upsert_task') {
          const task = localTasks.find((t) => t.id === op.entityId);
          if (!task) {
            ok = true;
          } else {
            const res = await pushTaskDirectlyToSupabase(task, userId);
            ok = res.success;
            if (ok) {
              syncedTaskIds.add(task.id);
              const remindIso = !task.completed ? task.reminderAt || task.dueDate : null;
              if (remindIso) {
                void upsertScheduledReminderToSupabase(
                  userId,
                  'task',
                  task.id,
                  task.title,
                  task.description || '',
                  remindIso,
                  task.priority === 'high' || Boolean(task.isStarred)
                );
              }
            }
          }
        } else if (op.type === 'delete_task') {
          await supabase.from('tasks').delete().eq('parent_id', op.entityId).eq('user_id', userId);
          const { error } = await supabase
            .from('tasks')
            .delete()
            .eq('id', op.entityId)
            .eq('user_id', userId);
          ok = !error;
          if (ok) {
            void deleteScheduledReminderFromSupabase(userId, 'task', op.entityId);
          }
        }
      } catch {
        ok = false;
      }

      if (ok) {
        syncedCount += 1;
      } else {
        remainingQueue.push(op);
      }
    }

    saveOfflineSyncQueue(remainingQueue, userId);

    if (syncedNoteIds.size > 0) {
      const latestNotes = getLocalNotesRaw(userId);
      saveLocalNotes(
        latestNotes.map((n) => (syncedNoteIds.has(n.id) ? { ...n, syncStatus: 'synced' } : n)),
        userId
      );
    }

    if (syncedTaskIds.size > 0) {
      const latestTasks = getLocalTasksRaw(userId);
      saveLocalTasks(
        latestTasks.map((t) =>
          syncedTaskIds.has(t.id)
            ? {
                ...t,
                syncStatus: 'synced',
                subtasks: (t.subtasks || []).map((st) => ({ ...st, syncStatus: 'synced' })),
              }
            : t
        ),
        userId
      );
    }

    const pendingCount = remainingQueue.length;
    emitSyncEvent(userId, syncedCount, pendingCount);
    return { syncedCount, pendingCount };
  })();

  inFlightSyncByUser.set(userId, syncTask);
  try {
    return await syncTask;
  } finally {
    inFlightSyncByUser.delete(userId);
  }
}
