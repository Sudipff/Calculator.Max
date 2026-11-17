export type NotificationType = 'success' | 'info' | 'warning' | 'error' | 'sync';

export interface AppNotification {
  id: string;
  message: string;
  type: NotificationType;
  duration: number;
  actionLabel?: string;
  onAction?: () => void;
  timestamp: number;
}

export interface ShowNotificationOptions {
  id?: string;
  message: string;
  type?: NotificationType;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
}

type NotificationListener = (notification: AppNotification | null) => void;
type BottomNavListener = (visible: boolean) => void;

const DEFAULT_DURATIONS: Record<NotificationType, number> = {
  success: 2200,
  info: 2400,
  warning: 3200,
  error: 3800,
  sync: 0,
};

let currentNotification: AppNotification | null = null;
let bottomNavVisible = false;
let autoDismissTimer: ReturnType<typeof setTimeout> | null = null;
let offlineSyncSuppressedUntil = 0;

const notificationListeners = new Set<NotificationListener>();
const bottomNavListeners = new Set<BottomNavListener>();

export function suppressOfflineSyncNotifications(durationMs = 5000): void {
  const until = Date.now() + Math.max(0, durationMs);
  if (until > offlineSyncSuppressedUntil) {
    offlineSyncSuppressedUntil = until;
  }
  if (currentNotification?.id === 'cloud-sync') {
    dismissNotification('cloud-sync');
  }
}

export function isOfflineSyncNotificationSuppressed(): boolean {
  return Date.now() < offlineSyncSuppressedUntil;
}

function emitNotification() {
  for (const listener of notificationListeners) {
    listener(currentNotification);
  }
}

function clearAutoDismissTimer() {
  if (autoDismissTimer !== null) {
    clearTimeout(autoDismissTimer);
    autoDismissTimer = null;
  }
}

export function showNotification(options: ShowNotificationOptions): string {
  if (options.id === 'cloud-sync' && isOfflineSyncNotificationSuppressed()) {
    return options.id;
  }

  const type: NotificationType = options.type ?? 'info';
  const duration =
    typeof options.duration === 'number'
      ? Math.max(0, options.duration)
      : DEFAULT_DURATIONS[type];

  const timestamp = Date.now();
  const id = options.id || `notif-${timestamp}-${Math.random().toString(36).slice(2, 6)}`;

  clearAutoDismissTimer();

  currentNotification = {
    id,
    message: options.message,
    type,
    duration,
    actionLabel: options.actionLabel,
    onAction: options.onAction,
    timestamp,
  };

  emitNotification();

  if (duration > 0) {
    autoDismissTimer = setTimeout(() => {
      if (currentNotification && currentNotification.id === id && currentNotification.timestamp === timestamp) {
        currentNotification = null;
        autoDismissTimer = null;
        emitNotification();
      }
    }, duration);
  }

  return id;
}

export function dismissNotification(id?: string): void {
  if (!currentNotification) return;
  if (id && currentNotification.id !== id) return;
  clearAutoDismissTimer();
  currentNotification = null;
  emitNotification();
}

export function getActiveNotification(): AppNotification | null {
  return currentNotification;
}

export function subscribeNotifications(listener: NotificationListener): () => void {
  notificationListeners.add(listener);
  listener(currentNotification);
  return () => {
    notificationListeners.delete(listener);
  };
}

export function setBottomNavVisible(visible: boolean): void {
  if (bottomNavVisible === visible) return;
  bottomNavVisible = visible;
  for (const listener of bottomNavListeners) {
    listener(bottomNavVisible);
  }
}

export function getBottomNavVisible(): boolean {
  return bottomNavVisible;
}

export function subscribeBottomNavVisibility(listener: BottomNavListener): () => void {
  bottomNavListeners.add(listener);
  listener(bottomNavVisible);
  return () => {
    bottomNavListeners.delete(listener);
  };
}
