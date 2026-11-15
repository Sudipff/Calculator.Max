import { createClient } from '@/utils/supabase/client';

export interface BackupPermissions {
  calculatorHistory: boolean;
  notes: boolean;
  tasks: boolean;
}

export const DEFAULT_BACKUP_PERMISSIONS: BackupPermissions = {
  calculatorHistory: true,
  notes: true,
  tasks: true,
};

const BACKUP_PERMS_STORAGE_PREFIX = 'calculator-max-backup-perms-';

function getStorageKey(userId?: string | null): string {
  return `${BACKUP_PERMS_STORAGE_PREFIX}${userId ? userId.trim() : 'guest'}`;
}

export function getBackupPermissions(userId?: string | null): BackupPermissions {
  if (typeof window === 'undefined') {
    return { ...DEFAULT_BACKUP_PERMISSIONS };
  }
  try {
    const raw = localStorage.getItem(getStorageKey(userId));
    if (!raw) {
      return { ...DEFAULT_BACKUP_PERMISSIONS };
    }
    const parsed = JSON.parse(raw);
    return {
      calculatorHistory:
        typeof parsed?.calculatorHistory === 'boolean' ? parsed.calculatorHistory : true,
      notes: typeof parsed?.notes === 'boolean' ? parsed.notes : true,
      tasks: typeof parsed?.tasks === 'boolean' ? parsed.tasks : true,
    };
  } catch {
    return { ...DEFAULT_BACKUP_PERMISSIONS };
  }
}

export function saveBackupPermissionsLocal(
  perms: BackupPermissions,
  userId?: string | null
): BackupPermissions {
  const normalized: BackupPermissions = {
    calculatorHistory: Boolean(perms.calculatorHistory),
    notes: Boolean(perms.notes),
    tasks: Boolean(perms.tasks),
  };

  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(getStorageKey(userId), JSON.stringify(normalized));
      window.dispatchEvent(
        new CustomEvent('calcmax:backup-permissions-changed', {
          detail: { userId: userId || null, permissions: normalized },
        })
      );
    } catch {
      // Ignore storage quota warnings
    }
  }

  return normalized;
}

export async function fetchBackupPermissionsFromCloud(
  userId?: string | null
): Promise<BackupPermissions> {
  const local = getBackupPermissions(userId);
  if (!userId || typeof window === 'undefined') {
    return local;
  }

  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {};
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    const res = await fetch('/api/backup-settings', {
      method: 'GET',
      headers,
      cache: 'no-store',
    });

    if (res.ok) {
      const json = await res.json();
      if (json?.permissions) {
        return saveBackupPermissionsLocal(json.permissions, userId);
      }
    }
  } catch {
    // Fallback to local permissions if offline or endpoint unreachable
  }

  return local;
}

export async function updateBackupPermissionsInCloud(
  perms: BackupPermissions,
  userId?: string | null
): Promise<BackupPermissions> {
  const savedLocal = saveBackupPermissionsLocal(perms, userId);
  if (!userId || typeof window === 'undefined') {
    return savedLocal;
  }

  try {
    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (session?.access_token) {
      headers['Authorization'] = `Bearer ${session.access_token}`;
    }

    await fetch('/api/backup-settings', {
      method: 'POST',
      headers,
      body: JSON.stringify(savedLocal),
    });
  } catch {
    // Saved locally even when offline
  }

  return savedLocal;
}
