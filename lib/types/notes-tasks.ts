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

export const NOTE_COLORS: { id: string; name: string; bgClass: string; borderClass: string; hex: string }[] = [
  { id: 'default', name: 'Default', bgClass: 'bg-white', borderClass: 'border-slate-200', hex: '#ffffff' },
  { id: 'coral', name: 'Coral', bgClass: 'bg-rose-50/90', borderClass: 'border-rose-200', hex: '#ffe4e6' },
  { id: 'peach', name: 'Peach', bgClass: 'bg-orange-50/90', borderClass: 'border-orange-200', hex: '#ffedd5' },
  { id: 'sand', name: 'Sand', bgClass: 'bg-amber-50/90', borderClass: 'border-amber-200', hex: '#fef3c7' },
  { id: 'mint', name: 'Mint', bgClass: 'bg-emerald-50/90', borderClass: 'border-emerald-200', hex: '#d1fae5' },
  { id: 'sage', name: 'Sage', bgClass: 'bg-teal-50/90', borderClass: 'border-teal-200', hex: '#ccfbf1' },
  { id: 'sky', name: 'Sky', bgClass: 'bg-sky-50/90', borderClass: 'border-sky-200', hex: '#e0f2fe' },
  { id: 'dusk', name: 'Dusk', bgClass: 'bg-blue-50/90', borderClass: 'border-blue-200', hex: '#dbeafe' },
  { id: 'lavender', name: 'Lavender', bgClass: 'bg-purple-50/90', borderClass: 'border-purple-200', hex: '#f3e8ff' },
  { id: 'blossom', name: 'Blossom', bgClass: 'bg-pink-50/90', borderClass: 'border-pink-200', hex: '#fce7f3' },
  { id: 'clay', name: 'Clay', bgClass: 'bg-stone-100/90', borderClass: 'border-stone-200', hex: '#f5f5f4' },
  { id: 'charcoal', name: 'Charcoal', bgClass: 'bg-slate-100/90', borderClass: 'border-slate-200', hex: '#f1f5f9' },
];
