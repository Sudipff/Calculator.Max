'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  CalendarDays,
  Calculator,
  CreditCard,
  Target,
  Percent,
  Scale,
  ArrowRightLeft,
  Coins,
  Clock,
  Copy,
  Check,
  Sparkles,
} from 'lucide-react';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'motion/react';
import { HistoryItem, parseSavedAmountFromText } from '../lib/historyStorage';
import { showNotification } from '@/lib/notifications';

type ToolTabTarget =
  | 'age'
  | 'calculator'
  | 'emi'
  | 'wishlist'
  | 'discount'
  | 'weight'
  | 'unit'
  | 'currency';

interface HistoryPreviewModalProps {
  item: HistoryItem | null;
  currency: string;
  onClose: () => void;
}

interface ParsedParamRow {
  label: string;
  value: string;
  highlight?: boolean;
}

interface ParsedOutcomeRow {
  label: string;
  value: string;
}

interface ToolThemeConfig {
  label: string;
  sessionTitle: string;
  tabTarget: ToolTabTarget | null;
  tabButtonLabel: string;
  iconBg: string;
  iconText: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
  headerGradient: string;
  Icon: React.ComponentType<{ className?: string }>;
}

function getToolTheme(type: string): ToolThemeConfig {
  switch (type) {
    case 'Age':
      return {
        label: 'Age Calculator',
        sessionTitle: 'Age & Milestone Session',
        tabTarget: 'age',
        tabButtonLabel: 'Open Age Calculator',
        iconBg: 'bg-rose-100',
        iconText: 'text-rose-600',
        badgeBg: 'bg-rose-50',
        badgeText: 'text-rose-700',
        badgeBorder: 'border-rose-200',
        headerGradient: 'from-rose-500/10 to-pink-500/5',
        Icon: CalendarDays,
      };
    case 'Calculator':
      return {
        label: 'Scientific Calculator',
        sessionTitle: 'Scientific Calculator Session',
        tabTarget: 'calculator',
        tabButtonLabel: 'Open Calculator',
        iconBg: 'bg-violet-100',
        iconText: 'text-violet-600',
        badgeBg: 'bg-violet-50',
        badgeText: 'text-violet-700',
        badgeBorder: 'border-violet-200',
        headerGradient: 'from-violet-500/10 to-indigo-500/5',
        Icon: Calculator,
      };
    case 'EMI':
      return {
        label: 'EMI Calculator',
        sessionTitle: 'EMI Loan Calculation Session',
        tabTarget: 'emi',
        tabButtonLabel: 'Open EMI Calculator',
        iconBg: 'bg-blue-100',
        iconText: 'text-blue-600',
        badgeBg: 'bg-blue-50',
        badgeText: 'text-blue-700',
        badgeBorder: 'border-blue-200',
        headerGradient: 'from-blue-500/10 to-indigo-500/5',
        Icon: CreditCard,
      };
    case 'Wishlist':
      return {
        label: 'Wishlist Planner',
        sessionTitle: 'Wishlist Savings Goal Session',
        tabTarget: 'wishlist',
        tabButtonLabel: 'Open Wishlist Planner',
        iconBg: 'bg-emerald-100',
        iconText: 'text-emerald-600',
        badgeBg: 'bg-emerald-50',
        badgeText: 'text-emerald-700',
        badgeBorder: 'border-emerald-200',
        headerGradient: 'from-emerald-500/10 to-teal-500/5',
        Icon: Target,
      };
    case 'Discount':
      return {
        label: 'Discount Calculator',
        sessionTitle: 'Discount Calculation Session',
        tabTarget: 'discount',
        tabButtonLabel: 'Open Discount Calculator',
        iconBg: 'bg-sky-100',
        iconText: 'text-sky-600',
        badgeBg: 'bg-sky-50',
        badgeText: 'text-sky-700',
        badgeBorder: 'border-sky-200',
        headerGradient: 'from-sky-500/10 to-cyan-500/5',
        Icon: Percent,
      };
    case 'Weight':
      return {
        label: 'Price by Weight',
        sessionTitle: 'Price by Weight Session',
        tabTarget: 'weight',
        tabButtonLabel: 'Open Weight Calculator',
        iconBg: 'bg-orange-100',
        iconText: 'text-orange-600',
        badgeBg: 'bg-orange-50',
        badgeText: 'text-orange-700',
        badgeBorder: 'border-orange-200',
        headerGradient: 'from-orange-500/10 to-amber-500/5',
        Icon: Scale,
      };
    case 'Unit':
      return {
        label: 'Unit Converter',
        sessionTitle: 'Unit Conversion Session',
        tabTarget: 'unit',
        tabButtonLabel: 'Open Unit Converter',
        iconBg: 'bg-purple-100',
        iconText: 'text-purple-600',
        badgeBg: 'bg-purple-50',
        badgeText: 'text-purple-700',
        badgeBorder: 'border-purple-200',
        headerGradient: 'from-purple-500/10 to-fuchsia-500/5',
        Icon: ArrowRightLeft,
      };
    case 'Currency':
      return {
        label: 'Currency Exchange',
        sessionTitle: 'Currency Exchange Session',
        tabTarget: 'currency',
        tabButtonLabel: 'Open Currency Exchange',
        iconBg: 'bg-amber-100',
        iconText: 'text-amber-600',
        badgeBg: 'bg-amber-50',
        badgeText: 'text-amber-700',
        badgeBorder: 'border-amber-200',
        headerGradient: 'from-amber-500/10 to-yellow-500/5',
        Icon: Coins,
      };
    default:
      return {
        label: type || 'Calculation',
        sessionTitle: `${type || 'Calculation'} Session`,
        tabTarget: null,
        tabButtonLabel: 'Open Tool',
        iconBg: 'bg-slate-100',
        iconText: 'text-slate-600',
        badgeBg: 'bg-slate-50',
        badgeText: 'text-slate-700',
        badgeBorder: 'border-slate-200',
        headerGradient: 'from-slate-500/10 to-slate-400/5',
        Icon: Clock,
      };
  }
}

function normalizeParamLabel(rawKey: string, type: string): string {
  const key = rawKey.trim();
  if (type === 'EMI') {
    if (key === 'DP') return 'Down Payment';
    if (key === 'Loan') return 'Loan Principal';
    if (key === 'Rate') return 'Interest Rate & Method';
    if (key === 'Tenure') return 'Loan Tenure';
  }
  if (type === 'Age') {
    if (key === 'DOB') return 'Date of Birth';
  }
  return key;
}

function computeLegacyAgeExtras(dobStr: string, targetStr: string): ParsedParamRow[] {
  try {
    const [bY, bM, bD] = dobStr.split('-').map(Number);
    const [tY, tM, tD] = targetStr.split('-').map(Number);
    if (!bY || !bM || !bD || !tY || !tM || !tD) return [];
    const birth = new Date(bY, bM - 1, bD);
    const target = new Date(tY, tM - 1, tD);
    if (isNaN(birth.getTime()) || isNaN(target.getTime()) || birth > target) return [];

    const totalDays = Math.floor((target.getTime() - birth.getTime()) / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.floor(totalDays / 7);
    const remDays = totalDays % 7;
    const bornWeekday = birth.toLocaleDateString('en-US', { weekday: 'long' });

    return [
      { label: 'Born Weekday', value: bornWeekday },
      { label: 'Total Days Lived', value: `${totalDays.toLocaleString()} days` },
      { label: 'Total Weeks', value: `${totalWeeks.toLocaleString()} weeks, ${remDays} days` },
      { label: 'Total Hours', value: `${(totalDays * 24).toLocaleString()} hours` },
    ];
  } catch {
    return [];
  }
}

function parseSessionParameters(item: HistoryItem): {
  parameters: ParsedParamRow[];
  outcomes: ParsedOutcomeRow[];
} {
  const parameters: ParsedParamRow[] = [];
  const outcomes: ParsedOutcomeRow[] = [];

  const details = (item.details || '').trim();
  const result = (item.result || '').trim();

  // 1. Parse outcomes (item.result)
  if (result) {
    // Handle nested parentheses in Wishlist result e.g. "Daily Savings Target: ₹500/day (₹3500/wk | ₹15000/mo) | Current Goal Progress: 20%"
    if (item.type === 'Wishlist') {
      const progressIdx = result.lastIndexOf('Current Goal Progress:');
      if (progressIdx !== -1) {
        const targetPart = result.slice(0, progressIdx).replace(/\|\s*$/, '').trim();
        const progressPart = result.slice(progressIdx).trim();
        [targetPart, progressPart].forEach((seg) => {
          const colon = seg.indexOf(':');
          if (colon !== -1) {
            outcomes.push({
              label: seg.slice(0, colon).trim(),
              value: seg.slice(colon + 1).trim(),
            });
          } else if (seg) {
            outcomes.push({ label: 'Result', value: seg });
          }
        });
      }
    }

    if (outcomes.length === 0) {
      const resultParts = result.split(/\s*\|\s*/).filter(Boolean);
      resultParts.forEach((part, idx) => {
        const colonIdx = part.indexOf(':');
        const eqMatch = part.match(/^(Quantity|Price)\s*=\s*(.+)$/i);
        if (eqMatch) {
          outcomes.push({
            label: eqMatch[1].charAt(0).toUpperCase() + eqMatch[1].slice(1).toLowerCase(),
            value: eqMatch[2].trim(),
          });
        } else if (colonIdx !== -1) {
          outcomes.push({
            label: part.slice(0, colonIdx).trim(),
            value: part.slice(colonIdx + 1).trim(),
          });
        } else {
          outcomes.push({
            label: idx === 0 ? 'Calculated Result' : `Summary ${idx + 1}`,
            value: part.replace(/^=\s*/, '').trim() || part.trim(),
          });
        }
      });
    }
  }

  // 2. Parse details (item.details)
  if (details) {
    // Legacy Currency format: "100 USD ➔ EUR @ 1 USD = 0.9200 EUR"
    if (item.type === 'Currency' && details.includes('@') && !details.includes('Source Amount:')) {
      const [pairPart, ratePart] = details.split('@').map((s) => s.trim());
      const pairMatch = pairPart.match(/^([\d.,]+)\s+([A-Z]{3})\s*[➔→>-]+\s*([A-Z]{3})$/);
      if (pairMatch) {
        parameters.push({ label: 'Source Amount', value: `${pairMatch[1]} ${pairMatch[2]}`, highlight: true });
        parameters.push({ label: 'From Currency', value: pairMatch[2] });
        parameters.push({ label: 'To Currency', value: pairMatch[3] });
      } else if (pairPart) {
        parameters.push({ label: 'Conversion Pair', value: pairPart, highlight: true });
      }
      if (ratePart) {
        parameters.push({ label: 'Exchange Rate', value: ratePart });
      }
      return { parameters, outcomes };
    }

    // Legacy Scientific Calculator format: "sin(30) + 5 (DEG)"
    if (item.type === 'Calculator' && !details.includes('Expression:')) {
      const angleMatch = details.match(/\((DEG|RAD)\)\s*$/);
      const exprClean = angleMatch ? details.slice(0, angleMatch.index).trim() : details;
      parameters.push({ label: 'Expression', value: exprClean, highlight: true });
      if (angleMatch) {
        parameters.push({ label: 'Angle Unit', value: angleMatch[1] === 'DEG' ? 'Degrees (DEG)' : 'Radians (RAD)' });
      }
      return { parameters, outcomes };
    }

    // Generic pipe-separated Key: Value parser
    const parts = details.split(/\s*\|\s*/).filter(Boolean);
    let dobVal = '';
    let targetVal = '';

    parts.forEach((part) => {
      const colonIdx = part.indexOf(':');
      if (colonIdx !== -1) {
        const rawKey = part.slice(0, colonIdx).trim();
        const val = part.slice(colonIdx + 1).trim();
        const label = normalizeParamLabel(rawKey, item.type);

        if (item.type === 'Age') {
          if (rawKey === 'DOB') dobVal = val.split(' ')[0];
          if (rawKey === 'Target Date') targetVal = val.split(' ')[0];
        }

        parameters.push({
          label,
          value: val,
          highlight: parameters.length === 0,
        });
      } else {
        parameters.push({
          label: 'Parameter',
          value: part.trim(),
        });
      }
    });

    // If Age record is legacy (missing Total Days), derive extra stats from DOB & Target Date
    if (
      item.type === 'Age' &&
      dobVal &&
      targetVal &&
      !parameters.some((p) => p.label.toLowerCase().includes('total days'))
    ) {
      const extras = computeLegacyAgeExtras(dobVal, targetVal);
      parameters.push(...extras);
    }
  }

  return { parameters, outcomes };
}

export default function HistoryPreviewModal({
  item,
  currency,
  onClose,
}: HistoryPreviewModalProps) {
  const [copied, setCopied] = useState(false);
  const backdropRef = useRef<HTMLDivElement | null>(null);
  const scrollBodyRef = useRef<HTMLDivElement | null>(null);
  const pointerDownOnBackdropRef = useRef(false);
  const dragY = useMotionValue(0);
  const dragScaleOpacity = useTransform(dragY, [0, 260], [1, 0.35]);

  const dragSessionRef = useRef<{
    active: boolean;
    mode: 'header' | 'body' | null;
    startY: number;
    startX: number;
    lastY: number;
    lastTime: number;
    velocityY: number;
    moved: boolean;
  }>({
    active: false,
    mode: null,
    startY: 0,
    startX: 0,
    lastY: 0,
    lastTime: 0,
    velocityY: 0,
    moved: false,
  });

  const isOpen = Boolean(item);

  // Reset drag offset whenever a modal session opens
  useEffect(() => {
    if (isOpen) {
      dragY.set(0);
    }
  }, [isOpen, dragY]);

  // Strict modal backdrop scroll lock across desktop & mobile browsers (html + body + fixed position restore)
  useEffect(() => {
    if (!isOpen) return;

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    const scrollbarWidth = Math.max(0, window.innerWidth - html.clientWidth);

    const prevHtmlOverflow = html.style.overflow;
    const prevHtmlOverscroll = html.style.overscrollBehavior;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyOverscroll = body.style.overscrollBehavior;
    const prevBodyPosition = body.style.position;
    const prevBodyTop = body.style.top;
    const prevBodyLeft = body.style.left;
    const prevBodyRight = body.style.right;
    const prevBodyWidth = body.style.width;
    const prevBodyPaddingRight = body.style.paddingRight;

    html.style.overflow = 'hidden';
    html.style.overscrollBehavior = 'none';
    body.style.overflow = 'hidden';
    body.style.overscrollBehavior = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';
    if (scrollbarWidth > 0) {
      body.style.paddingRight = `${scrollbarWidth}px`;
    }

    return () => {
      html.style.overflow = prevHtmlOverflow;
      html.style.overscrollBehavior = prevHtmlOverscroll;
      body.style.overflow = prevBodyOverflow;
      body.style.overscrollBehavior = prevBodyOverscroll;
      body.style.position = prevBodyPosition;
      body.style.top = prevBodyTop;
      body.style.left = prevBodyLeft;
      body.style.right = prevBodyRight;
      body.style.width = prevBodyWidth;
      body.style.paddingRight = prevBodyPaddingRight;
      window.scrollTo(0, scrollY);
    };
  }, [isOpen]);

  // Block wheel and touchmove events on backdrop or non-scrollable areas from bubbling to background
  useEffect(() => {
    if (!isOpen) return;
    const backdropEl = backdropRef.current;
    if (!backdropEl) return;

    const handleWheel = (e: WheelEvent) => {
      const scrollEl = scrollBodyRef.current;
      if (!scrollEl || !scrollEl.contains(e.target as Node)) {
        e.preventDefault();
        return;
      }
      const { scrollTop, scrollHeight, clientHeight } = scrollEl;
      const atTop = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (scrollHeight <= clientHeight || atTop || atBottom) {
        e.preventDefault();
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      const scrollEl = scrollBodyRef.current;
      if (!scrollEl || !scrollEl.contains(e.target as Node)) {
        e.preventDefault();
        return;
      }
      if (dragSessionRef.current.active && dragSessionRef.current.mode === 'body') {
        const touch = e.touches[0];
        if (touch) {
          const deltaY = touch.clientY - dragSessionRef.current.startY;
          if (dragSessionRef.current.moved || (scrollEl.scrollTop <= 0 && deltaY > 4)) {
            e.preventDefault();
          }
        }
      }
    };

    backdropEl.addEventListener('wheel', handleWheel, { passive: false });
    backdropEl.addEventListener('touchmove', handleTouchMove, { passive: false });
    return () => {
      backdropEl.removeEventListener('wheel', handleWheel);
      backdropEl.removeEventListener('touchmove', handleTouchMove);
    };
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    if (!item) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [item, onClose]);

  const finishDrag = useCallback(() => {
    const session = dragSessionRef.current;
    if (!session.active) return;

    const currentY = dragY.get();
    const shouldDismiss = currentY > 90 || (currentY > 24 && session.velocityY > 0.45);

    session.active = false;
    session.mode = null;

    if (shouldDismiss) {
      onClose();
    } else if (currentY > 0) {
      animate(dragY, 0, {
        type: 'spring',
        stiffness: 420,
        damping: 34,
      });
    }
  }, [dragY, onClose]);

  const handleDragStart = useCallback(
    (clientX: number, clientY: number, mode: 'header' | 'body', target: EventTarget | null) => {
      // Never hijack interactive controls like close or copy buttons
      if (
        target instanceof Element &&
        target.closest('button, a, input, select, textarea, [data-no-drag="true"]')
      ) {
        return;
      }
      dragSessionRef.current = {
        active: true,
        mode,
        startY: clientY,
        startX: clientX,
        lastY: clientY,
        lastTime: performance.now(),
        velocityY: 0,
        moved: false,
      };
    },
    []
  );

  const handleDragMove = useCallback(
    (clientX: number, clientY: number, preventDefault?: () => void) => {
      const session = dragSessionRef.current;
      if (!session.active) return;

      const deltaY = clientY - session.startY;
      const deltaX = clientX - session.startX;

      if (session.mode === 'body') {
        const scrollTop = scrollBodyRef.current?.scrollTop ?? 0;
        // If user hasn't started dragging the sheet and is scrolling up or body is already scrolled, let native scroll handle it
        if (!session.moved) {
          if (scrollTop > 0 || deltaY <= 4 || Math.abs(deltaX) > Math.abs(deltaY)) {
            if (deltaY < -4 || scrollTop > 0) {
              session.active = false;
            }
            return;
          }
        }
      }

      if (deltaY > 0 || session.moved) {
        const clampedY = Math.max(0, deltaY);
        if (clampedY > 3) {
          session.moved = true;
        }
        const now = performance.now();
        const dt = Math.max(1, now - session.lastTime);
        session.velocityY = (clientY - session.lastY) / dt;
        session.lastY = clientY;
        session.lastTime = now;

        dragY.set(clampedY);
        if (session.moved && preventDefault) {
          preventDefault();
        }
      }
    },
    [dragY]
  );

  // Global mouse/pointer tracking while header drag is active on desktop
  useEffect(() => {
    if (!isOpen) return;

    const handleWindowPointerMove = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!dragSessionRef.current.active) return;
      handleDragMove(e.clientX, e.clientY);
    };

    const handleWindowPointerUp = (e: PointerEvent) => {
      if (e.pointerType === 'touch') return;
      if (!dragSessionRef.current.active) return;
      finishDrag();
    };

    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    return () => {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', handleWindowPointerUp);
      window.removeEventListener('pointercancel', handleWindowPointerUp);
    };
  }, [isOpen, handleDragMove, finishDrag]);

  const parsed = useMemo(() => {
    if (!item) return { parameters: [], outcomes: [] };
    return parseSessionParameters(item);
  }, [item]);

  const theme = getToolTheme(item?.type || '');
  const ToolIcon = theme.Icon;
  const itemSavings = item
    ? item.savedAmount !== undefined
      ? item.savedAmount
      : parseSavedAmountFromText(item.type, item.details, item.result)
    : 0;

  const formattedFullDate = item
    ? item.createdAt
      ? new Date(item.createdAt).toLocaleString([], {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : item.timestamp
    : '';

  const handleCopySession = () => {
    if (!item) return;
    const lines = [
      `${theme.sessionTitle} (${item.type})`,
      `Recorded: ${formattedFullDate}`,
      `Result: ${item.result}`,
      `Parameters:`,
      ...parsed.parameters.map((p) => `- ${p.label}: ${p.value}`),
    ];
    navigator.clipboard?.writeText(lines.join('\n'));
    setCopied(true);
    showNotification({
      id: 'history-preview-copy',
      message: 'Session copied to clipboard',
      type: 'success',
      duration: 1800,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {item && (
        <motion.div
          ref={backdropRef}
          id="history-preview-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-slate-950/60 backdrop-blur-xs overscroll-none touch-none select-none sm:select-auto"
          onPointerDown={(e) => {
            pointerDownOnBackdropRef.current = e.target === e.currentTarget;
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget && pointerDownOnBackdropRef.current) {
              onClose();
            }
            pointerDownOnBackdropRef.current = false;
          }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-preview-title"
        >
        <motion.div
          initial={{ opacity: 0, y: '100%' }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: '100%' }}
          transition={{ duration: 0.26, ease: [0.22, 1, 0.36, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="max-w-2xl w-full max-h-[92dvh] sm:max-h-[88dvh] flex flex-col"
        >
        <motion.div
          style={{ y: dragY, opacity: dragScaleOpacity }}
          className="bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl border border-slate-100 w-full max-h-[92dvh] sm:max-h-[88dvh] flex flex-col overflow-hidden relative will-change-transform"
        >
          {/* Swipeable Header Banner with Top Drag Handle */}
          <div
            data-drag-handle="true"
            onPointerDown={(e) => {
              if (e.pointerType === 'touch') return;
              handleDragStart(e.clientX, e.clientY, 'header', e.target);
            }}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              handleDragStart(touch.clientX, touch.clientY, 'header', e.target);
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              handleDragMove(touch.clientX, touch.clientY, () => e.preventDefault());
            }}
            onTouchEnd={finishDrag}
            onTouchCancel={finishDrag}
            className={`bg-gradient-to-br ${theme.headerGradient} px-5 pt-2.5 pb-4 sm:px-6 sm:pt-3 sm:pb-5 border-b border-slate-100 shrink-0 touch-none cursor-grab active:cursor-grabbing select-none`}
          >
            {/* Bottom-sheet Swipe Handle Indicator */}
            <div className="flex justify-center pb-2.5">
              <div
                className="w-11 h-1.5 rounded-full bg-slate-300/90"
                aria-hidden="true"
              />
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl ${theme.iconBg} ${theme.iconText} flex items-center justify-center shrink-0 shadow-xs`}>
                  <ToolIcon className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 mb-1">
                    <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${theme.badgeBg} ${theme.badgeText} ${theme.badgeBorder}`}>
                      {theme.label}
                    </span>
                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 bg-white/80 border border-slate-200/80 px-2 py-0.5 rounded-md">
                      <Clock className="w-3 h-3 text-slate-400" />
                      {formattedFullDate}
                    </span>
                  </div>
                  <h3 id="history-preview-title" className="text-base sm:text-lg font-extrabold text-slate-900 leading-snug">
                    {theme.sessionTitle}
                  </h3>
                </div>
              </div>

              <button
                type="button"
                data-no-drag="true"
                onPointerDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                onClick={onClose}
                className="p-2 rounded-xl bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 border border-slate-200/70 transition-colors cursor-pointer shrink-0"
                aria-label="Close session preview"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            </div>
          </div>

          {/* Scrollable Body (supports downward pull-to-dismiss when scrolled to top) */}
          <div
            ref={scrollBodyRef}
            onTouchStart={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              if ((scrollBodyRef.current?.scrollTop ?? 0) <= 0) {
                handleDragStart(touch.clientX, touch.clientY, 'body', e.target);
              }
            }}
            onTouchMove={(e) => {
              const touch = e.touches[0];
              if (!touch) return;
              handleDragMove(touch.clientX, touch.clientY);
            }}
            onTouchEnd={finishDrag}
            onTouchCancel={finishDrag}
            className="flex-1 overflow-y-auto overscroll-contain touch-pan-y p-5 sm:p-6 space-y-5 select-text"
          >
            {/* Highlighted Calculation Outcomes */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-inner space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-indigo-300 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Calculated Outcome
                </span>
                {itemSavings > 0 && (
                  <span className="text-[11px] font-bold text-emerald-300 bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 rounded-md">
                    Saved: {currency}
                    {itemSavings.toLocaleString(undefined, {
                      minimumFractionDigits: 0,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                )}
              </div>

              {parsed.outcomes.length <= 1 ? (
                <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-white break-words leading-snug">
                  {parsed.outcomes[0]?.value || item.result}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {parsed.outcomes.map((out, idx) => (
                    <div
                      key={idx}
                      className="bg-white/5 border border-white/10 rounded-xl p-3 space-y-1"
                    >
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {out.label}
                      </div>
                      <div className="text-sm sm:text-base font-extrabold font-mono tabular-nums text-white break-words">
                        {out.value}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Full Session Parameters Grid */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500">
                  Full Session Parameters & Breakdown
                </h4>
                <button
                  type="button"
                  onClick={handleCopySession}
                  className="inline-flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Details</span>
                    </>
                  )}
                </button>
              </div>

              {parsed.parameters.length > 0 ? (
                <div className="bg-slate-50/80 border border-slate-200/80 rounded-2xl divide-y divide-slate-200/70 overflow-hidden">
                  {parsed.parameters.map((param, idx) => (
                    <div
                      key={idx}
                      className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-4 ${
                        param.highlight ? 'bg-white' : ''
                      }`}
                    >
                      <span className="text-xs font-bold text-slate-500 shrink-0">
                        {param.label}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-slate-800 sm:text-right break-words font-mono tabular-nums">
                        {param.value}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 text-xs sm:text-sm text-slate-700 break-words">
                  {item.details || 'No additional input parameters recorded.'}
                </div>
              )}
            </div>
          </div>
        </motion.div>
        </motion.div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
