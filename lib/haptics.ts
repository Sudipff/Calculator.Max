export type VibrationType = 'success' | 'error' | 'click' | 'reset';

export const HAPTIC_STORAGE_KEY = 'calcmax_haptic_enabled';
export const HAPTIC_CHANGED_EVENT = 'calcmax:haptic-changed';

let lastHapticAt = 0;
let lastHapticType: VibrationType | null = null;

const HAPTIC_PATTERNS: Record<VibrationType, number | number[]> = {
  click: 12,
  reset: 20,
  success: [14, 28, 18],
  error: [28, 36, 28],
};

export function getHapticEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const stored = window.localStorage.getItem(HAPTIC_STORAGE_KEY);
    if (stored === 'false') return false;
    return true;
  } catch {
    return true;
  }
}

export function setHapticEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HAPTIC_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // Ignore storage quota or private browsing errors
  }
  window.dispatchEvent(new CustomEvent(HAPTIC_CHANGED_EVENT, { detail: { enabled } }));
}

export function triggerHaptic(
  type: VibrationType = 'click',
  options?: { force?: boolean; source?: 'explicit' | 'global' }
): void {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
  if (!options?.force && !getHapticEnabled()) return;

  const now = Date.now();
  // Deduplicate when both a global button click listener and a component's explicit handler fire
  if (now - lastHapticAt < 70 && lastHapticType === type) {
    return;
  }

  lastHapticAt = now;
  lastHapticType = type;

  if (typeof navigator.vibrate === 'function') {
    try {
      navigator.vibrate(HAPTIC_PATTERNS[type] ?? 12);
    } catch {
      // Ignore vibration API blocks in restricted contexts
    }
  }
}
