const CONTROL_CHARS_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG_OR_SCRIPT_RE = /<\s*\/?\s*(script|iframe|object|embed|style|link|meta|svg|form|input|button|textarea|select|base)[^>]*>/gi;
const EVENT_HANDLER_OR_JS_URI_RE = /(javascript:|vbscript:|data:text\/html|on\w+\s*=)/gi;

export const ALLOWED_CALCULATION_TYPES = new Set([
  'Discount',
  'Weight',
  'Unit',
  'EMI',
  'Wishlist',
  'Currency',
  'Age',
  'Calculator',
  'Scientific',
]);

export function sanitizePlainText(input: unknown, maxLength = 500): string {
  if (typeof input !== 'string') return '';
  return input
    .replace(CONTROL_CHARS_RE, '')
    .replace(HTML_TAG_OR_SCRIPT_RE, '')
    .replace(EVENT_HANDLER_OR_JS_URI_RE, '')
    .trim()
    .slice(0, maxLength);
}

export function sanitizeEmail(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const cleaned = input.replace(/[\s\u200B-\u200D\uFEFF]+/g, '').toLowerCase();
  if (cleaned.length > 254) return null;
  const emailRegex = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/;
  if (!emailRegex.test(cleaned)) return null;
  return cleaned;
}

export function validatePasswordInput(input: unknown): { valid: boolean; error?: string } {
  if (typeof input !== 'string' || input.length < 6) {
    return { valid: false, error: 'Password must be at least 6 characters long.' };
  }
  if (input.length > 128) {
    return { valid: false, error: 'Password cannot exceed 128 characters.' };
  }
  return { valid: true };
}

export function validateResourceId(input: unknown, maxLength = 128): string | null {
  if (typeof input !== 'string' && typeof input !== 'number') return null;
  const str = String(input).trim();
  if (!str || str.length > maxLength) return null;
  if (!/^[a-zA-Z0-9._:-]+$/.test(str)) return null;
  return str;
}

export function validateCalculationPayload(body: unknown): {
  valid: true;
  data: { type: string; details: string; result: string };
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON request body.' };
  }
  const raw = body as Record<string, unknown>;
  const type = sanitizePlainText(raw.type, 40);
  const details = sanitizePlainText(raw.details, 2000);
  const result = sanitizePlainText(raw.result, 500);

  if (!type || !details || !result) {
    return { valid: false, error: 'Calculation type, details, and result are required.' };
  }

  if (!ALLOWED_CALCULATION_TYPES.has(type)) {
    return { valid: false, error: 'Unsupported calculation category.' };
  }

  return { valid: true, data: { type, details, result } };
}

export interface ValidatedSourceHistory {
  id?: string;
  dbId?: string | number | null;
  type: string;
  details: string;
  result: string;
  savedAmount?: number;
  isFavorite?: boolean;
  createdAt?: string;
  timestamp?: string;
}

export function sanitizeSourceHistory(input: unknown): ValidatedSourceHistory | null {
  if (!input || typeof input !== 'object') return null;
  const raw = input as Record<string, unknown>;
  const type = sanitizePlainText(raw.type, 40);
  const details = sanitizePlainText(raw.details, 2000);
  const result = sanitizePlainText(raw.result, 500);
  if (!type || !details || !result) return null;

  const id = raw.id !== undefined ? validateResourceId(raw.id, 128) || undefined : undefined;
  const dbId =
    typeof raw.dbId === 'number' && Number.isFinite(raw.dbId)
      ? raw.dbId
      : typeof raw.dbId === 'string'
      ? validateResourceId(raw.dbId, 128)
      : null;

  const savedAmount =
    typeof raw.savedAmount === 'number' && Number.isFinite(raw.savedAmount)
      ? raw.savedAmount
      : undefined;

  let createdAt: string | undefined;
  if (typeof raw.createdAt === 'string' && raw.createdAt.trim()) {
    const parsed = new Date(raw.createdAt);
    if (!isNaN(parsed.getTime())) {
      createdAt = parsed.toISOString();
    }
  }

  const timestamp =
    typeof raw.timestamp === 'string' && raw.timestamp.trim()
      ? sanitizePlainText(raw.timestamp, 40)
      : undefined;

  return {
    ...(id ? { id } : {}),
    dbId,
    type,
    details,
    result,
    ...(savedAmount !== undefined ? { savedAmount } : {}),
    ...(raw.isFavorite !== undefined ? { isFavorite: Boolean(raw.isFavorite) } : {}),
    ...(createdAt ? { createdAt } : {}),
    ...(timestamp ? { timestamp } : {}),
  };
}

export function validateNotePayload(body: unknown): {
  valid: true;
  data: {
    id: string;
    title: string;
    content: string;
    color: string;
    isPinned: boolean;
    isChecklist: boolean;
    checklistItems: { id: string; text: string; completed: boolean }[];
    labels: string[];
    reminderAt: string | null;
    isEmergency: boolean;
    sourceHistory: ValidatedSourceHistory | null;
  };
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid note payload.' };
  }
  const raw = body as Record<string, unknown>;
  const id = validateResourceId(raw.id, 100);
  if (!id) {
    return { valid: false, error: 'Valid note ID is required.' };
  }

  const checklistItems = Array.isArray(raw.checklistItems)
    ? raw.checklistItems.slice(0, 100).map((item: unknown, idx: number) => {
        const obj = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          id: validateResourceId(obj.id, 80) || `item-${idx}`,
          text: sanitizePlainText(obj.text, 500),
          completed: Boolean(obj.completed),
        };
      })
    : [];

  const labels = Array.isArray(raw.labels)
    ? raw.labels
        .slice(0, 20)
        .map((l) => sanitizePlainText(l, 40))
        .filter(Boolean)
    : [];

  let reminderAt: string | null = null;
  if (typeof raw.reminderAt === 'string' && raw.reminderAt.trim()) {
    const parsed = new Date(raw.reminderAt);
    if (isNaN(parsed.getTime())) {
      return { valid: false, error: 'Invalid reminder timestamp.' };
    }
    reminderAt = parsed.toISOString();
  }

  const color = sanitizePlainText(raw.color || 'default', 30) || 'default';
  const sourceHistory = sanitizeSourceHistory(raw.sourceHistory);

  return {
    valid: true,
    data: {
      id,
      title: sanitizePlainText(raw.title, 200),
      content: sanitizePlainText(raw.content, 10000),
      color,
      isPinned: Boolean(raw.isPinned),
      isChecklist: Boolean(raw.isChecklist),
      checklistItems,
      labels,
      reminderAt,
      isEmergency: Boolean(raw.isEmergency),
      sourceHistory,
    },
  };
}

export function validateTaskOrListPayload(body: unknown): {
  valid: true;
  kind: 'list';
  data: { id: string; name: string; color: string; isDefault: boolean };
} | {
  valid: true;
  kind: 'task';
  data: {
    id: string;
    listId: string | null;
    parentId: string | null;
    title: string;
    description: string;
    completed: boolean;
    isStarred: boolean;
    dueDate: string | null;
    reminderAt: string | null;
    sourceHistory: ValidatedSourceHistory | null;
  };
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid task payload.' };
  }
  const raw = body as Record<string, unknown>;
  const id = validateResourceId(raw.id, 100);
  if (!id) {
    return { valid: false, error: 'Valid record ID is required.' };
  }

  if (raw.type === 'list') {
    const name = sanitizePlainText(raw.name, 100);
    if (!name) {
      return { valid: false, error: 'Task list name is required.' };
    }
    return {
      valid: true,
      kind: 'list',
      data: {
        id,
        name,
        color: sanitizePlainText(raw.color || 'blue', 30) || 'blue',
        isDefault: Boolean(raw.isDefault),
      },
    };
  }

  const title = sanitizePlainText(raw.title, 240);
  if (!title) {
    return { valid: false, error: 'Task title is required.' };
  }

  const listId = raw.listId ? validateResourceId(raw.listId, 100) : null;
  const parentId = raw.parentId ? validateResourceId(raw.parentId, 100) : null;

  let dueDate: string | null = null;
  if (typeof raw.dueDate === 'string' && raw.dueDate.trim()) {
    const parsed = new Date(raw.dueDate);
    if (isNaN(parsed.getTime())) {
      return { valid: false, error: 'Invalid dueDate timestamp.' };
    }
    dueDate = parsed.toISOString();
  }

  let reminderAt: string | null = null;
  if (typeof raw.reminderAt === 'string' && raw.reminderAt.trim()) {
    const parsed = new Date(raw.reminderAt);
    if (isNaN(parsed.getTime())) {
      return { valid: false, error: 'Invalid reminderAt timestamp.' };
    }
    reminderAt = parsed.toISOString();
  }

  const sourceHistory = sanitizeSourceHistory(raw.sourceHistory);

  return {
    valid: true,
    kind: 'task',
    data: {
      id,
      listId,
      parentId,
      title,
      description: sanitizePlainText(raw.description, 4000),
      completed: Boolean(raw.completed),
      isStarred: Boolean(raw.isStarred),
      dueDate,
      reminderAt,
      sourceHistory,
    },
  };
}

export function validateChatPayload(body: unknown): {
  valid: true;
  data: {
    messages: { role: 'user' | 'model'; text: string }[];
    mode: 'fast' | 'complex' | 'default';
    currency: string;
    latestHistory: Record<string, string> | null;
  };
} | {
  valid: false;
  error: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Invalid JSON request body.' };
  }
  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.messages) || raw.messages.length === 0) {
    return { valid: false, error: 'Messages array is required.' };
  }

  const messages = raw.messages.slice(-20).map((m) => {
    const msg = (m && typeof m === 'object' ? m : {}) as Record<string, unknown>;
    return {
      role: (msg.role === 'user' ? 'user' : 'model') as 'user' | 'model',
      text: sanitizePlainText(msg.text, 4000),
    };
  }).filter((m) => m.text.length > 0);

  if (messages.length === 0) {
    return { valid: false, error: 'At least one non-empty message is required.' };
  }

  const mode = raw.mode === 'fast' ? 'fast' : raw.mode === 'complex' ? 'complex' : 'default';
  const ctx = (raw.context && typeof raw.context === 'object' ? raw.context : {}) as Record<string, unknown>;
  const currency = sanitizePlainText(ctx.currency || '₹', 10) || '₹';

  let latestHistory: Record<string, string> | null = null;
  if (ctx.latestHistory && typeof ctx.latestHistory === 'object') {
    const lh = ctx.latestHistory as Record<string, unknown>;
    latestHistory = {
      type: sanitizePlainText(lh.type, 40),
      details: sanitizePlainText(lh.details, 500),
      result: sanitizePlainText(lh.result, 200),
    };
  }

  return {
    valid: true,
    data: { messages, mode, currency, latestHistory },
  };
}

/**
 * Neutralizes spreadsheet formula injection (=, +, -, @, tab, CR) before CSV export.
 */
export function sanitizeCsvCell(value: unknown): string {
  const str = String(value ?? '');
  const trimmed = str.replace(/\r?\n/g, ' ');
  const safe = /^[=+\-@\t\r]/.test(trimmed) ? `'${trimmed}` : trimmed;
  return `"${safe.replace(/"/g, '""')}"`;
}

/**
 * Allows only safe http/https URLs to prevent javascript: or data: XSS vectors.
 */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}
