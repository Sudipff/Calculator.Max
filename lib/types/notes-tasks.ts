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
  { id: 'default', name: 'White', hex: '#ffffff', borderHex: '#cbd5e1', textClass: 'text-slate-900', borderClass: 'border-slate-300', bgClass: 'bg-white' },
  { id: 'coral', name: 'Coral Red', hex: '#ffe4e6', borderHex: '#fda4af', textClass: 'text-rose-950', borderClass: 'border-rose-300', bgClass: 'bg-rose-100' },
  { id: 'peach', name: 'Peach Orange', hex: '#ffedd5', borderHex: '#fdba74', textClass: 'text-orange-950', borderClass: 'border-orange-300', bgClass: 'bg-orange-100' },
  { id: 'sand', name: 'Sand Yellow', hex: '#fef3c7', borderHex: '#fcd34d', textClass: 'text-amber-950', borderClass: 'border-amber-300', bgClass: 'bg-amber-100' },
  { id: 'mint', name: 'Mint Green', hex: '#d1fae5', borderHex: '#6ee7b7', textClass: 'text-emerald-950', borderClass: 'border-emerald-300', bgClass: 'bg-emerald-100' },
  { id: 'sage', name: 'Sage Teal', hex: '#ccfbf1', borderHex: '#5eead4', textClass: 'text-teal-950', borderClass: 'border-teal-300', bgClass: 'bg-teal-100' },
  { id: 'sky', name: 'Sky Blue', hex: '#e0f2fe', borderHex: '#7dd3fc', textClass: 'text-sky-950', borderClass: 'border-sky-300', bgClass: 'bg-sky-100' },
  { id: 'dusk', name: 'Dusk Blue', hex: '#dbeafe', borderHex: '#93c5fd', textClass: 'text-blue-950', borderClass: 'border-blue-300', bgClass: 'bg-blue-100' },
  { id: 'lavender', name: 'Lavender Violet', hex: '#f3e8ff', borderHex: '#d8b4fe', textClass: 'text-purple-950', borderClass: 'border-purple-300', bgClass: 'bg-purple-100' },
  { id: 'blossom', name: 'Blossom Pink', hex: '#fce7f3', borderHex: '#f472b6', textClass: 'text-pink-950', borderClass: 'border-pink-300', bgClass: 'bg-pink-100' },
  { id: 'clay', name: 'Clay Brown', hex: '#f5f5f4', borderHex: '#a8a29e', textClass: 'text-stone-950', borderClass: 'border-stone-400', bgClass: 'bg-stone-200' },
  { id: 'charcoal', name: 'Charcoal Gray', hex: '#e2e8f0', borderHex: '#94a3b8', textClass: 'text-slate-950', borderClass: 'border-slate-400', bgClass: 'bg-slate-200' },
];
