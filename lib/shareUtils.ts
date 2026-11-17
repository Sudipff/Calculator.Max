import type { HistoryItem } from './historyStorage';
import type { NoteItem, TaskItem } from './types/notes-tasks';

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export async function shareTextContent(payload: {
  title: string;
  text: string;
}): Promise<ShareOutcome> {
  const cleanTitle = payload.title.trim() || 'Calculator Max';
  const cleanText = payload.text.trim();
  if (!cleanText) return 'failed';

  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({
        title: cleanTitle,
        text: cleanText,
      });
      return 'shared';
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return 'cancelled';
      }
      // Fall through to clipboard copy when Web Share is blocked (e.g. desktop or sandboxed iframe)
    }
  }

  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(cleanText);
      return 'copied';
    } catch {
      // Fall through to legacy textarea copy
    }
  }

  if (typeof document !== 'undefined') {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = cleanText;
      textarea.setAttribute('readonly', 'true');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(textarea);
      return ok ? 'copied' : 'failed';
    } catch {
      return 'failed';
    }
  }

  return 'failed';
}

export function formatHistoryItemsForShare(
  items: HistoryItem[],
  labelResolver?: (item: HistoryItem) => { label: string; cleanResult: string; displayTime: string; savings: number },
  currency = ''
): { title: string; text: string } {
  if (items.length === 1) {
    const item = items[0];
    const resolved = labelResolver?.(item);
    const label = resolved?.label || item.type;
    const cleanResult = resolved?.cleanResult || item.result;
    const displayTime = resolved?.displayTime || item.timestamp;
    const savings = resolved?.savings ?? item.savedAmount ?? 0;

    const lines = [
      `${label}${displayTime ? ` (${displayTime})` : ''}`,
      item.details ? `Details: ${item.details}` : '',
      `Result: ${cleanResult}`,
      savings > 0
        ? `Saved: ${currency}${savings.toLocaleString(undefined, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 2,
          })}`
        : '',
    ].filter(Boolean);

    return {
      title: `${label} Calculation`,
      text: lines.join('\n'),
    };
  }

  const sections = items.map((item, idx) => {
    const resolved = labelResolver?.(item);
    const label = resolved?.label || item.type;
    const cleanResult = resolved?.cleanResult || item.result;
    const displayTime = resolved?.displayTime || item.timestamp;
    return [
      `${idx + 1}. ${label}${displayTime ? ` (${displayTime})` : ''}`,
      item.details ? `   ${item.details}` : '',
      `   Result: ${cleanResult}`,
    ]
      .filter(Boolean)
      .join('\n');
  });

  return {
    title: `Calculator History (${items.length} records)`,
    text: `Calculator History (${items.length} records)\n\n${sections.join('\n\n')}`,
  };
}

export function formatNotesForShare(notes: NoteItem[]): { title: string; text: string } {
  const formatSingle = (note: NoteItem) => {
    const title = note.title?.trim() || 'Untitled Note';
    const body = note.isChecklist
      ? note.checklistItems.length > 0
        ? note.checklistItems.map((ci) => `${ci.completed ? '[x]' : '[ ]'} ${ci.text}`).join('\n')
        : '(Empty checklist)'
      : note.content?.trim() || '';
    const tags = note.labels?.length ? `Tags: ${note.labels.join(', ')}` : '';
    return [title, body, tags].filter(Boolean).join('\n');
  };

  if (notes.length === 1) {
    return {
      title: notes[0].title?.trim() || 'Shared Note',
      text: formatSingle(notes[0]),
    };
  }

  const blocks = notes.map((n, i) => `${i + 1}. ${formatSingle(n)}`);
  return {
    title: `${notes.length} Shared Notes`,
    text: blocks.join('\n\n---\n\n'),
  };
}

export function formatTasksForShare(tasks: TaskItem[]): { title: string; text: string } {
  const formatSingle = (task: TaskItem) => {
    const status = task.completed ? '[Completed]' : '[Active]';
    const priority = task.priority ? `Priority: ${task.priority.toUpperCase()}` : '';
    const due = task.dueDate
      ? `Due: ${new Date(task.dueDate).toLocaleString([], {
          dateStyle: 'medium',
          timeStyle: 'short',
        })}`
      : '';
    const desc = task.description?.trim() ? task.description.trim() : '';
    const subs =
      task.subtasks && task.subtasks.length > 0
        ? task.subtasks.map((s) => `  ${s.completed ? '[x]' : '[ ]'} ${s.title}`).join('\n')
        : '';

    return [`${status} ${task.title}`, [priority, due].filter(Boolean).join(' · '), desc, subs]
      .filter(Boolean)
      .join('\n');
  };

  if (tasks.length === 1) {
    return {
      title: tasks[0].title || 'Shared Task',
      text: formatSingle(tasks[0]),
    };
  }

  const blocks = tasks.map((t, i) => `${i + 1}. ${formatSingle(t)}`);
  return {
    title: `${tasks.length} Shared Tasks`,
    text: blocks.join('\n\n---\n\n'),
  };
}
