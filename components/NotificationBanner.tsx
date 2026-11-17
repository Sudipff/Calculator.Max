'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  dismissNotification,
  getActiveNotification,
  getBottomNavVisible,
  subscribeBottomNavVisibility,
  subscribeNotifications,
  type AppNotification,
  type NotificationType,
} from '@/lib/notifications';

function renderIcon(type: NotificationType) {
  switch (type) {
    case 'success':
      return <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden="true" />;
    case 'sync':
      return <RefreshCw className="w-4 h-4 text-sky-400 shrink-0 animate-spin" aria-hidden="true" />;
    case 'warning':
      return <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />;
    case 'error':
      return <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" aria-hidden="true" />;
    case 'info':
    default:
      return <Info className="w-4 h-4 text-blue-400 shrink-0" aria-hidden="true" />;
  }
}

function getAccentRingClass(type: NotificationType): string {
  switch (type) {
    case 'success':
      return 'border-emerald-500/30';
    case 'sync':
      return 'border-sky-500/35';
    case 'warning':
      return 'border-amber-500/35';
    case 'error':
      return 'border-rose-500/40';
    case 'info':
    default:
      return 'border-white/15';
  }
}

export default function NotificationBanner() {
  const pathname = usePathname();
  const prefersReducedMotion = useReducedMotion();
  const [notification, setNotification] = useState<AppNotification | null>(() =>
    getActiveNotification()
  );
  const [bottomNavVisible, setBottomNavVisible] = useState<boolean>(() =>
    getBottomNavVisible()
  );

  useEffect(() => {
    const unsubNotif = subscribeNotifications(setNotification);
    const unsubNav = subscribeBottomNavVisibility(setBottomNavVisible);
    return () => {
      unsubNotif();
      unsubNav();
    };
  }, []);

  const hasBottomNavBar = pathname === '/' && bottomNavVisible;
  const bottomPositionClass = hasBottomNavBar
    ? 'bottom-[calc(4.5rem+env(safe-area-inset-bottom))]'
    : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom))]';

  const isInteractiveDismissVisible =
    Boolean(notification) &&
    (notification!.duration === 0 ||
      notification!.type === 'error' ||
      notification!.type === 'warning' ||
      Boolean(notification!.actionLabel));

  return (
    <div
      className={`fixed left-1/2 -translate-x-1/2 ${bottomPositionClass} z-[100010] pointer-events-none w-max max-w-[min(calc(100vw-1.5rem),26rem)] transition-[bottom] duration-200`}
    >
      <AnimatePresence mode="wait">
        {notification && (
          <motion.div
            key={`${notification.id}-${notification.type}-${notification.message}`}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.96 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.96 }
            }
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
            role={notification.type === 'error' ? 'alert' : 'status'}
            aria-live={notification.type === 'error' ? 'assertive' : 'polite'}
            data-testid="unified-notification-banner"
            onClick={() => {
              if (!notification.actionLabel) {
                dismissNotification(notification.id);
              }
            }}
            className={`pointer-events-auto inline-flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl bg-slate-900/95 dark:bg-slate-800/95 text-white backdrop-blur-md shadow-[0_12px_32px_rgba(15,23,42,0.3)] border ${getAccentRingClass(
              notification.type
            )} cursor-pointer select-none`}
          >
            {renderIcon(notification.type)}

            <span className="text-xs font-semibold tracking-tight leading-snug text-white/95 line-clamp-2">
              {notification.message}
            </span>

            {notification.actionLabel && notification.onAction && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  const action = notification.onAction;
                  dismissNotification(notification.id);
                  action?.();
                }}
                className="ml-0.5 px-2.5 py-1 rounded-xl bg-white text-slate-900 hover:bg-slate-100 text-[11px] font-bold whitespace-nowrap shrink-0 transition-colors cursor-pointer"
              >
                {notification.actionLabel}
              </button>
            )}

            {isInteractiveDismissVisible && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  dismissNotification(notification.id);
                }}
                aria-label="Dismiss notification"
                className="min-w-[26px] min-h-[26px] -mr-1 rounded-lg flex items-center justify-center text-white/65 hover:text-white hover:bg-white/10 transition-colors shrink-0 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
