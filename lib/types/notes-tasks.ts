export interface ChecklistItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface NoteItem {
  id: string;
  userId?: string;
  title: string;
  content: string;
  color: string;
  isPinned: boolean;
  isChecklist: boolean;
  checklistItems: ChecklistItem[];
  labels: string[];
  reminderAt?: string | null;
  isEmergency?: boolean;
  syncStatus?: 'synced' | 'unsynced';
  createdAt: string;
  updatedAt: string;
}

export interface TaskItem {
  id: string;
  userId?: string;
  listId?: string;
  parentId?: string | null;
  title: string;
  description?: string;
  completed: boolean;
  isStarred: boolean;
  dueDate?: string | null;
  reminderAt?: string | null;
  syncStatus?: 'synced' | 'unsynced';
  createdAt: string;
  updatedAt: string;
  subtasks?: TaskItem[];
}

export interface TaskList {
  id: string;
  userId?: string;
  name: string;
  color?: string;
  isDefault?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NoteColorOption {
  id: string;
  name: string;
  hex: string;
  borderHex: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
}

export const NOTE_COLORS: NoteColorOption[] = [
  { id: 'default', name: 'White', hex: '#ffffff', borderHex: '#94a3b8', textClass: 'text-slate-900', borderClass: 'border-slate-300', bgClass: 'bg-white' },
  { id: 'coral', name: 'Coral Red', hex: '#fecdd3', borderHex: '#f43f5e', textClass: 'text-rose-950', borderClass: 'border-rose-400', bgClass: 'bg-rose-200' },
  { id: 'peach', name: 'Peach Orange', hex: '#fed7aa', borderHex: '#f97316', textClass: 'text-orange-950', borderClass: 'border-orange-400', bgClass: 'bg-orange-200' },
  { id: 'sand', name: 'Sand Yellow', hex: '#fef08a', borderHex: '#eab308', textClass: 'text-amber-950', borderClass: 'border-amber-400', bgClass: 'bg-yellow-200' },
  { id: 'mint', name: 'Mint Green', hex: '#a7f3d0', borderHex: '#10b981', textClass: 'text-emerald-950', borderClass: 'border-emerald-400', bgClass: 'bg-emerald-200' },
  { id: 'sage', name: 'Sage Teal', hex: '#99f6e4', borderHex: '#0d9488', textClass: 'text-teal-950', borderClass: 'border-teal-400', bgClass: 'bg-teal-200' },
  { id: 'sky', name: 'Sky Blue', hex: '#bae6fd', borderHex: '#0284c7', textClass: 'text-sky-950', borderClass: 'border-sky-400', bgClass: 'bg-sky-200' },
  { id: 'dusk', name: 'Dusk Blue', hex: '#bfdbfe', borderHex: '#2563eb', textClass: 'text-blue-950', borderClass: 'border-blue-400', bgClass: 'bg-blue-200' },
  { id: 'lavender', name: 'Lavender Violet', hex: '#e9d5ff', borderHex: '#9333ea', textClass: 'text-purple-950', borderClass: 'border-purple-400', bgClass: 'bg-purple-200' },
  { id: 'blossom', name: 'Blossom Pink', hex: '#fbcfe8', borderHex: '#db2777', textClass: 'text-pink-950', borderClass: 'border-pink-400', bgClass: 'bg-pink-200' },
  { id: 'clay', name: 'Clay Brown', hex: '#e7e5e4', borderHex: '#78716c', textClass: 'text-stone-950', borderClass: 'border-stone-400', bgClass: 'bg-stone-200' },
  { id: 'charcoal', name: 'Charcoal Gray', hex: '#cbd5e1', borderHex: '#64748b', textClass: 'text-slate-950', borderClass: 'border-slate-400', bgClass: 'bg-slate-300' },
];
