import type { NoteItem, SourceHistoryMeta, TaskItem } from './types/notes-tasks';

const KNOWN_VISUAL_LABELS: Record<string, string> = {
  discount: 'Discount',
  weight: 'Weight',
  unit: 'Unit',
  emi: 'EMI',
  wishlist: 'Wishlist',
  currency: 'Currency',
  age: 'Age',
  calculator: 'Calculator',
  scientific: 'Scientific',
  financial: 'Financial',
  basic: 'Basic',
};

function mapVisualLabelToCalculationType(visualLabel: string): string {
  const key = visualLabel.trim().toLowerCase();
  if (key === 'scientific') return 'Calculator';
  if (key === 'financial') return 'Wishlist';
  return KNOWN_VISUAL_LABELS[key] || visualLabel.trim();
}

/**
 * Resolves History origin metadata for a Note, supporting both explicit `sourceHistory`
 * and Notes previously imported via HistoryView before `sourceHistory` existed.
 */
export function resolveNoteSourceHistory(note?: NoteItem | null): SourceHistoryMeta | null {
  if (!note) return null;
  if (
    note.sourceHistory &&
    typeof note.sourceHistory === 'object' &&
    note.sourceHistory.type &&
    note.sourceHistory.details &&
    note.sourceHistory.result
  ) {
    return note.sourceHistory;
  }

  if (note.id.startsWith('seed-')) return null;

  const titleMatch = note.title.trim().match(/^([A-Za-z]+)\s+Calculation$/i);
  if (!titleMatch) return null;

  const rawVisualLabel = titleMatch[1];
  if (!KNOWN_VISUAL_LABELS[rawVisualLabel.toLowerCase()]) return null;

  const lines = (note.content || '').split(/\r?\n/);
  const resultIdx = lines.findIndex((line) => /^Result:\s*/i.test(line.trim()));
  const recordedIdx = lines.findIndex((line) => /^Recorded:\s*/i.test(line.trim()));

  if (resultIdx === -1 || recordedIdx === -1) return null;

  const detailsLines = lines
    .slice(0, resultIdx)
    .map((l) => l.trimEnd())
    .filter((l, idx, arr) => !(idx === arr.length - 1 && l === ''));

  const result = lines[resultIdx].trim().replace(/^Result:\s*/i, '').trim();
  const timestamp = lines[recordedIdx].trim().replace(/^Recorded:\s*/i, '').trim();
  const details = detailsLines.join('\n').trim() || note.title;

  if (!result) return null;

  let savedAmount: number | undefined;
  const savedLine = lines.find((line) => /^Saved:\s*/i.test(line.trim()));
  if (savedLine) {
    const numMatch = savedLine.replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
    if (numMatch) {
      const parsed = Number(numMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) savedAmount = parsed;
    }
  }

  return {
    type: mapVisualLabelToCalculationType(rawVisualLabel),
    details,
    result,
    ...(savedAmount !== undefined ? { savedAmount } : {}),
    createdAt: note.createdAt,
    timestamp: timestamp || undefined,
  };
}

/**
 * Resolves History origin metadata for a Task, supporting both explicit `sourceHistory`
 * and Tasks previously imported via HistoryView before `sourceHistory` existed.
 */
export function resolveTaskSourceHistory(task?: TaskItem | null): SourceHistoryMeta | null {
  if (!task) return null;
  if (
    task.sourceHistory &&
    typeof task.sourceHistory === 'object' &&
    task.sourceHistory.type &&
    task.sourceHistory.details &&
    task.sourceHistory.result
  ) {
    return task.sourceHistory;
  }

  if (task.id.startsWith('seed-')) return null;

  const titleMatch = task.title.trim().match(/^([A-Za-z]+):\s+(.+)$/);
  if (!titleMatch) return null;

  const rawVisualLabel = titleMatch[1];
  const result = titleMatch[2].trim();
  if (!KNOWN_VISUAL_LABELS[rawVisualLabel.toLowerCase()] || !result) return null;

  const lines = (task.description || '').split(/\r?\n/);
  const recordedIdx = lines.findIndex((line) => /^Recorded:\s*/i.test(line.trim()));
  if (recordedIdx === -1) return null;

  const savedIdx = lines.findIndex((line) => /^Saved:\s*/i.test(line.trim()));
  const detailEndIdx = savedIdx !== -1 && savedIdx < recordedIdx ? savedIdx : recordedIdx;
  const details = lines.slice(0, detailEndIdx).join('\n').trim();
  const timestamp = lines[recordedIdx].trim().replace(/^Recorded:\s*/i, '').trim();

  if (!details) return null;

  let savedAmount: number | undefined;
  if (savedIdx !== -1) {
    const numMatch = lines[savedIdx].replace(/,/g, '').match(/([0-9]+(?:\.[0-9]+)?)/);
    if (numMatch) {
      const parsed = Number(numMatch[1]);
      if (Number.isFinite(parsed) && parsed > 0) savedAmount = parsed;
    }
  }

  return {
    type: mapVisualLabelToCalculationType(rawVisualLabel),
    details,
    result,
    ...(savedAmount !== undefined ? { savedAmount } : {}),
    createdAt: task.createdAt,
    timestamp: timestamp || undefined,
  };
}

export interface FormattedDetailLine {
  label?: string;
  text: string;
  isGap?: boolean;
}

/**
 * Normalizes saved note/task body strings (converting inline ` | ` parameter separators
 * into clean line breaks and collapsing excessive blank lines) so saved entries align neatly.
 */
export function formatCleanBodyText(raw?: string | null): string {
  if (!raw) return '';
  const normalized = raw.replace(/\r\n?/g, '\n');
  const rawLines = normalized.split('\n');
  const expanded: string[] = [];

  for (const line of rawLines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (expanded.length > 0 && expanded[expanded.length - 1] !== '') {
        expanded.push('');
      }
      continue;
    }
    if (/\s\|\s/.test(trimmed)) {
      const parts = trimmed
        .split(/\s*\|\s*/)
        .map((p) => p.trim())
        .filter(Boolean);
      expanded.push(...parts);
    } else {
      expanded.push(line.trimEnd());
    }
  }

  while (expanded.length > 0 && expanded[0] === '') expanded.shift();
  while (expanded.length > 0 && expanded[expanded.length - 1] === '') expanded.pop();

  return expanded.join('\n');
}

/**
 * Parses body text into cleanly structured lines for detail views, detecting optional `Label: Value`
 * pairs (e.g. Expression, View Mode, Memory Status, Result, Recorded) without altering plain prose.
 */
export function parseFormattedDetailLines(raw?: string | null): FormattedDetailLine[] {
  const cleaned = formatCleanBodyText(raw);
  if (!cleaned) return [];

  return cleaned.split('\n').map((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { text: '', isGap: true };
    }
    const kvMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9 &/%().-]{1,32}):\s+(.+)$/);
    if (kvMatch) {
      return {
        label: kvMatch[1].trim(),
        text: kvMatch[2].trim(),
      };
    }
    return { text: line };
  });
}
