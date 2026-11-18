'use client';

import React, {
  useState,
  useMemo,
  useEffect,
  useReducer,
  useCallback,
  useRef,
  useDeferredValue,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowLeftRight,
  Check,
  Copy,
  Delete,
  History,
  MoreVertical,
  Plus,
  Trash2,
  Vibrate,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  calcReducer,
  INITIAL_CALC_STATE,
  evaluateWithCache,
  clearEvaluationCache,
  buildFullExpression,
  countUnclosedParens,
  type TapeEntry,
} from '../lib/scientificEngine';
import { showNotification } from '@/lib/notifications';
import { useTheme } from '@/components/ThemeProvider';
import {
  getHapticEnabled,
  setHapticEnabled,
  HAPTIC_CHANGED_EVENT,
} from '@/lib/haptics';

const CALC_HISTORY_STORAGE_KEY = 'calcmax_scientific_tape_v1';
const CALC_SAVED_HISTORY_KEYS_STORAGE = 'calcmax_scientific_saved_keys_v1';

interface ScientificCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  hapticEnabled?: boolean;
  onToggleHaptic?: (enabled: boolean) => void;
  onSaveHistory?: (type: string, details: string, result: string) => void | Promise<void>;
  onBackHome?: () => void;
  onViewModeChange?: (mode: 'scientific' | 'standard') => void;
  onHistoryOpenChange?: (isOpen: boolean) => void;
}

export default function ScientificCalculator({
  triggerVibration,
  hapticEnabled: controlledHapticEnabled,
  onToggleHaptic,
  onSaveHistory,
  onBackHome,
  onViewModeChange,
  onHistoryOpenChange,
}: ScientificCalculatorProps) {
  const { isDark } = useTheme();
  const [state, dispatch] = useReducer(calcReducer, INITIAL_CALC_STATE);
  const [isSecondFunction, setIsSecondFunction] = useState<boolean>(false);
  const [calculatorView, setCalculatorView] = useState<'scientific' | 'standard'>('scientific');
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [showHistoryPage, setShowHistoryPage] = useState<boolean>(false);
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [savingHistoryKeys, setSavingHistoryKeys] = useState<Record<string, boolean>>({});
  const [savedHistoryKeys, setSavedHistoryKeys] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<boolean>(false);
  const [copiedHistoryId, setCopiedHistoryId] = useState<string | null>(null);
  const [localHapticEnabled, setLocalHapticEnabled] = useState<boolean>(true);
  const isHapticOn = controlledHapticEnabled ?? localHapticEnabled;

  const [livePreview, setLivePreview] = useState<string | null>(null);
  const computeReqIdRef = useRef<number>(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const displayAreaRef = useRef<HTMLDivElement | null>(null);
  const historyScrollRef = useRef<HTMLDivElement | null>(null);
  const activeInputRef = useRef<HTMLDivElement | null>(null);
  const shouldStickHistoryToBottomRef = useRef<boolean>(true);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const historyCopyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasHydratedTapeRef = useRef<boolean>(false);

  const {
    expression,
    currentInput,
    isNewInput,
    evaluatedResult,
    lastAnswer,
    errorMessage,
    angleMode,
    tape: localTape,
  } = state;

  // Notify parent when view mode toggles so bottom navigation hides in scientific mode
  useEffect(() => {
    onViewModeChange?.(calculatorView);
  }, [calculatorView, onViewModeChange]);

  // Notify parent when dedicated History page is open so bottom navigation stays hidden
  useEffect(() => {
    onHistoryOpenChange?.(showHistoryPage);
    return () => {
      onHistoryOpenChange?.(false);
    };
  }, [showHistoryPage, onHistoryOpenChange]);

  // Hydrate persisted calculator history on mount
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CALC_HISTORY_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid: TapeEntry[] = parsed
            .filter(
              (item): item is TapeEntry =>
                Boolean(item) &&
                typeof item.expr === 'string' &&
                typeof item.res === 'string' &&
                typeof item.time === 'string'
            )
            .map((item, idx) => ({
              id: typeof item.id === 'string' ? item.id : `hydrated-${idx}-${item.time}`,
              expr: item.expr,
              res: item.res,
              time: item.time,
            }));
          if (valid.length > 0) {
            dispatch({ type: 'HYDRATE_TAPE', tape: valid });
          }
        }
      }
      const rawSaved = window.localStorage.getItem(CALC_SAVED_HISTORY_KEYS_STORAGE);
      if (rawSaved) {
        const parsedSaved = JSON.parse(rawSaved);
        if (parsedSaved && typeof parsedSaved === 'object' && !Array.isArray(parsedSaved)) {
          setSavedHistoryKeys(parsedSaved as Record<string, boolean>);
        }
      }
    } catch {
      // Ignore storage access or malformed data errors
    } finally {
      hasHydratedTapeRef.current = true;
    }
  }, []);

  // Persist saved card flags whenever updated
  useEffect(() => {
    if (!hasHydratedTapeRef.current) return;
    try {
      window.localStorage.setItem(
        CALC_SAVED_HISTORY_KEYS_STORAGE,
        JSON.stringify(savedHistoryKeys)
      );
    } catch {
      // Ignore quota / private browsing errors
    }
  }, [savedHistoryKeys]);

  // Persist calculator history whenever tape changes (after initial hydration)
  useEffect(() => {
    if (!hasHydratedTapeRef.current) return;
    try {
      window.localStorage.setItem(CALC_HISTORY_STORAGE_KEY, JSON.stringify(localTape));
    } catch {
      // Ignore quota / private browsing errors
    }
  }, [localTape]);

  // Close overflow menu on outside pointer click
  useEffect(() => {
    if (!showMenu) return;
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, [showMenu]);

  // Sync haptic preference with shared storage
  useEffect(() => {
    setLocalHapticEnabled(getHapticEnabled());
    const onHapticChange = (e: Event) => {
      const next = (e as CustomEvent)?.detail?.enabled;
      setLocalHapticEnabled(typeof next === 'boolean' ? next : getHapticEnabled());
    };
    window.addEventListener(HAPTIC_CHANGED_EVENT, onHapticChange);
    return () => window.removeEventListener(HAPTIC_CHANGED_EVENT, onHapticChange);
  }, []);

  // Keep scrollable history pinned to bottom when active input grows and pushes the divisor line upward
  useEffect(() => {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return;
    const syncScrollOnResize = () => {
      const container = historyScrollRef.current;
      if (container && shouldStickHistoryToBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    };
    const observer = new ResizeObserver(syncScrollOnResize);
    if (historyScrollRef.current) observer.observe(historyScrollRef.current);
    if (activeInputRef.current) observer.observe(activeInputRef.current);
    return () => {
      observer.disconnect();
    };
  }, [calculatorView, showHistoryPage]);

  // Defer preview inputs so keystrokes & keypad presses always render immediately without blocking
  const deferredExpr = useDeferredValue(expression);
  const deferredInput = useDeferredValue(currentInput);
  const deferredIsNew = useDeferredValue(isNewInput);
  const deferredError = useDeferredValue(errorMessage);
  const deferredAngle = useDeferredValue(angleMode);
  const deferredLastAnswer = useDeferredValue(lastAnswer);

  const openParenCount = useMemo(() => {
    const activePart = isNewInput || currentInput === 'Error' ? '' : currentInput;
    return countUnclosedParens(`${expression} ${activePart}`);
  }, [expression, currentInput, isNewInput]);

  // Decoupled asynchronous cancellable live-preview computation using bounded LRU cache
  useEffect(() => {
    computeReqIdRef.current += 1;
    const reqId = computeReqIdRef.current;
    let cancelled = false;
    let idleHandle: number | null = null;
    let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

    const runPreviewCalculation = () => {
      if (cancelled || reqId !== computeReqIdRef.current) return;

      if (deferredError || (!deferredExpr && deferredIsNew)) {
        setLivePreview(null);
        return;
      }

      const previewExpr = buildFullExpression(deferredExpr, deferredInput, deferredIsNew, true);
      if (!previewExpr) {
        setLivePreview(null);
        return;
      }

      try {
        const { display } = evaluateWithCache(previewExpr, deferredAngle, deferredLastAnswer, {
          allowAutoClose: true,
        });
        if (cancelled || reqId !== computeReqIdRef.current) return;
        if (!deferredExpr && display === deferredInput) {
          setLivePreview(null);
        } else {
          setLivePreview(display);
        }
      } catch {
        if (!cancelled && reqId === computeReqIdRef.current) {
          setLivePreview(null);
        }
      }
    };

    const win =
      typeof window !== 'undefined'
        ? (window as Window & {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
          })
        : null;

    if (win && typeof win.requestIdleCallback === 'function') {
      idleHandle = win.requestIdleCallback(runPreviewCalculation, { timeout: 60 });
    } else {
      timeoutHandle = setTimeout(runPreviewCalculation, 0);
    }

    return () => {
      cancelled = true;
      if (idleHandle !== null && win && typeof win.cancelIdleCallback === 'function') {
        win.cancelIdleCallback(idleHandle);
      }
      if (timeoutHandle !== null) {
        clearTimeout(timeoutHandle);
      }
    };
  }, [
    deferredExpr,
    deferredInput,
    deferredIsNew,
    deferredError,
    deferredAngle,
    deferredLastAnswer,
  ]);

  // Unmount cleanup
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (historyCopyTimerRef.current) {
        clearTimeout(historyCopyTimerRef.current);
        historyCopyTimerRef.current = null;
      }
      clearEvaluationCache();
    };
  }, []);

  // Atomic action dispatchers
  const handleDigit = useCallback(
    (digit: string) => {
      triggerVibration('click');
      dispatch({ type: 'DIGIT', digit });
    },
    [triggerVibration]
  );

  const handleDecimal = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'DECIMAL' });
  }, [triggerVibration]);

  const handleOperator = useCallback(
    (op: string) => {
      triggerVibration('click');
      dispatch({ type: 'OPERATOR', op });
    },
    [triggerVibration]
  );

  const handleFunction = useCallback(
    (fnName: string) => {
      triggerVibration('click');
      dispatch({ type: 'FUNCTION', fnName });
    },
    [triggerVibration]
  );

  const handleConstant = useCallback(
    (constant: string) => {
      triggerVibration('click');
      dispatch({ type: 'CONSTANT', constant });
    },
    [triggerVibration]
  );

  const handleParenthesis = useCallback(
    (p: '(' | ')') => {
      triggerVibration('click');
      dispatch({ type: 'PAREN', paren: p });
    },
    [triggerVibration]
  );

  const handlePercent = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'PERCENT' });
  }, [triggerVibration]);

  const handleBackspace = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'BACKSPACE' });
  }, [triggerVibration]);

  const handleClearAll = useCallback(() => {
    triggerVibration('reset');
    dispatch({ type: 'CLEAR_ALL' });
  }, [triggerVibration]);

  const handleEqual = useCallback(() => {
    triggerVibration('click');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dispatch({ type: 'EQUAL', timeStr });
  }, [triggerVibration]);

  const handleCopy = () => {
    const textToCopy = evaluatedResult || livePreview || currentInput;
    if (!textToCopy || textToCopy === 'Error') return;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    showNotification({
      id: 'calc-copy',
      message: 'Copied to clipboard',
      type: 'success',
      duration: 1800,
    });
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => {
      setCopied(false);
      copyTimerRef.current = null;
    }, 1800);
  };

  const handleCopyHistoryEntry = (entryKey: string, res: string) => {
    if (!res || res === 'Error') return;
    navigator.clipboard?.writeText(res);
    setCopiedHistoryId(entryKey);
    showNotification({
      id: 'calc-history-copy',
      message: 'Result copied',
      type: 'success',
      duration: 1600,
    });
    if (historyCopyTimerRef.current) clearTimeout(historyCopyTimerRef.current);
    historyCopyTimerRef.current = setTimeout(() => {
      setCopiedHistoryId(null);
      historyCopyTimerRef.current = null;
    }, 1600);
  };

  // Keyboard Shortcuts Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (showHistoryPage) {
        if (e.key === 'Escape') {
          e.preventDefault();
          setShowHistoryPage(false);
          setShowClearConfirm(false);
        }
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        dispatch({ type: 'DIGIT', digit: e.key });
      } else if (e.key === '.') {
        dispatch({ type: 'DECIMAL' });
      } else if (e.key === '+') {
        dispatch({ type: 'OPERATOR', op: '+' });
      } else if (e.key === '-') {
        dispatch({ type: 'OPERATOR', op: '−' });
      } else if (e.key === '*') {
        dispatch({ type: 'OPERATOR', op: '×' });
      } else if (e.key === '/') {
        e.preventDefault();
        dispatch({ type: 'OPERATOR', op: '÷' });
      } else if (e.key === '^') {
        dispatch({ type: 'OPERATOR', op: '^' });
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        dispatch({ type: 'EQUAL', timeStr });
      } else if (e.key === 'Backspace') {
        dispatch({ type: 'BACKSPACE' });
      } else if (e.key === 'Escape') {
        dispatch({ type: 'CLEAR_ALL' });
      } else if (e.key === '(' || e.key === ')') {
        dispatch({ type: 'PAREN', paren: e.key });
      } else if (e.key === '%') {
        dispatch({ type: 'PERCENT' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showHistoryPage]);

  // Dynamic scientific function labels based on 2nd state
  const trigSinLabel = isSecondFunction ? 'sin⁻¹' : 'sin';
  const trigCosLabel = isSecondFunction ? 'cos⁻¹' : 'cos';
  const trigTanLabel = isSecondFunction ? 'tan⁻¹' : 'tan';

  const trigSinFn = isSecondFunction ? 'asin' : 'sin';
  const trigCosFn = isSecondFunction ? 'acos' : 'cos';
  const trigTanFn = isSecondFunction ? 'atan' : 'tan';

  // Dynamic sizing & history shortening based on active equation length:
  // History items always stay larger than active input text while scaling down and shortening as equation grows.
  const lastTape = localTape[0];
  const priorSource = useMemo(() => {
    return evaluatedResult !== null && lastTape && lastTape.res === evaluatedResult
      ? localTape.slice(1)
      : localTape;
  }, [localTape, evaluatedResult, lastTape]);

  const equationDisplay = useMemo(() => {
    if (evaluatedResult !== null && lastTape && lastTape.res === evaluatedResult) {
      return lastTape.expr;
    }
    if (expression) {
      if (isNewInput || currentInput === 'Error') {
        return expression;
      }
      return `${expression} ${currentInput}`;
    }
    return '';
  }, [evaluatedResult, lastTape, expression, isNewInput, currentInput]);

  const mainResultDisplay = useMemo(() => {
    if (errorMessage) return 'Error';
    if (evaluatedResult !== null) return `= ${evaluatedResult}`;
    if (expression && livePreview !== null) return `= ${livePreview}`;
    return currentInput;
  }, [errorMessage, evaluatedResult, expression, livePreview, currentInput]);

  const handleAddCardToMainHistory = async (entryKey: string, item: TapeEntry) => {
    if (savingHistoryKeys[entryKey] || savedHistoryKeys[entryKey]) return;

    setSavingHistoryKeys((prev) => ({ ...prev, [entryKey]: true }));
    try {
      await onSaveHistory?.('Calculator', item.expr, `Result: ${item.res}`);
      setSavedHistoryKeys((prev) => ({ ...prev, [entryKey]: true }));
      showNotification({
        id: `calc-save-${entryKey}`,
        message: 'Saved to main History',
        type: 'success',
        duration: 1800,
      });
    } catch {
      showNotification({
        id: `calc-save-err-${entryKey}`,
        message: 'Could not save calculation',
        type: 'error',
        duration: 2400,
      });
    } finally {
      setSavingHistoryKeys((prev) => {
        const next = { ...prev };
        delete next[entryKey];
        return next;
      });
    }
  };

  const handleToggleHapticSetting = () => {
    const next = !isHapticOn;
    setLocalHapticEnabled(next);
    if (onToggleHaptic) {
      onToggleHaptic(next);
    } else {
      setHapticEnabled(next);
    }
    showNotification({
      id: 'calc-haptic-toggle',
      message: next ? 'Haptic feedback on' : 'Haptic feedback off',
      type: 'success',
      duration: 1500,
    });
  };

  // Fixed-size display typography & full scrollable history (oldest at top, newest just above divisor line)
  const historyEntries = useMemo(() => {
    return [...priorSource].reverse();
  }, [priorSource]);

  // Snap history scroll to newest calculation whenever a new entry is added or active calculation grows
  useEffect(() => {
    shouldStickHistoryToBottomRef.current = true;
    const container = historyScrollRef.current;
    if (!container) return;
    requestAnimationFrame(() => {
      if (historyScrollRef.current) {
        historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
      }
    });
  }, [historyEntries.length]);

  useEffect(() => {
    const container = historyScrollRef.current;
    if (!container || !shouldStickHistoryToBottomRef.current) return;
    requestAnimationFrame(() => {
      if (historyScrollRef.current && shouldStickHistoryToBottomRef.current) {
        historyScrollRef.current.scrollTop = historyScrollRef.current.scrollHeight;
      }
    });
  }, [equationDisplay, mainResultDisplay, openParenCount, errorMessage]);

  // Adaptive color classes (Crisp white + soft tinted off-white keys in Light mode; Obsidian in Dark mode)
  const shellBg = isDark
    ? 'bg-[#121418] text-zinc-100 sm:border sm:border-zinc-800/80'
    : 'bg-white text-slate-900 sm:border sm:border-slate-200/80';

  const keyBase =
    'min-h-0 h-full rounded-[18px] sm:rounded-[20px] flex items-center justify-center transition-all duration-150 active:scale-[0.94] cursor-pointer select-none touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215]';

  const sciKeyClass = isDark
    ? `${keyBase} bg-[#1C1F26] hover:bg-[#252932] text-zinc-300 text-sm sm:text-[15px] font-medium border border-zinc-800/70`
    : `${keyBase} bg-[#EEF2F7] hover:bg-[#E3E9F1] text-slate-700 text-sm sm:text-[15px] font-medium border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`;

  const sciKeyActiveClass = isDark
    ? `${keyBase} bg-[#C25215]/25 text-[#F59E6C] text-sm sm:text-[15px] font-semibold border border-[#C25215]/60`
    : `${keyBase} bg-[#FBECE3] text-[#B84A0E] text-sm sm:text-[15px] font-semibold border border-[#E6B89C]`;

  const numKeyClass = isDark
    ? `${keyBase} bg-[#22262E] hover:bg-[#2C313B] text-zinc-50 text-xl sm:text-[22px] font-normal tabular-nums border border-zinc-800/80`
    : `${keyBase} bg-[#F5F7FA] hover:bg-[#EBF0F5] text-slate-900 text-xl sm:text-[22px] font-normal tabular-nums border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.05)]`;

  const operatorKeyClass = isDark
    ? `${keyBase} bg-[#9E5228] hover:bg-[#AE5B2E] text-white text-xl sm:text-[22px] font-normal shadow-sm`
    : `${keyBase} bg-[#B46233] hover:bg-[#A3572C] text-white text-xl sm:text-[22px] font-normal shadow-[0_2px_6px_rgba(180,98,51,0.18)]`;

  const accentKeyClass = isDark
    ? `${keyBase} bg-[#C25215] hover:bg-[#D25C1B] text-white text-xl sm:text-[22px] font-medium shadow-md shadow-black/25`
    : `${keyBase} bg-[#C25215] hover:bg-[#AE4811] text-white text-xl sm:text-[22px] font-medium shadow-[0_3px_10px_rgba(194,82,21,0.28)]`;

  const modeSwitchKeyClass = isDark
    ? `${keyBase} bg-[#1C1F26] hover:bg-[#252932] text-[#E8793E] border border-zinc-800/70`
    : `${keyBase} bg-[#EEF2F7] hover:bg-[#E3E9F1] text-[#C25215] border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]`;

  if (showHistoryPage) {
    return (
      <div className="mobile-edge-calc w-full h-[100dvh] max-h-[100dvh] sm:h-[calc(100dvh-1rem)] sm:max-h-[820px] min-h-0 flex-1 flex flex-col overflow-hidden sm:max-w-[460px] sm:mx-auto m-0 p-0">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          className={`flex-1 min-h-0 h-full max-h-full overflow-hidden flex flex-col rounded-none sm:rounded-[32px] px-4 pt-2 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:p-4 sm:shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-colors ${shellBg}`}
        >
          {/* Dedicated Histories Top Bar: Back Arrow Left, Histories Title, Clear Action Right */}
          <div className="flex items-center justify-between h-12 shrink-0">
            <button
              type="button"
              onClick={() => {
                setShowClearConfirm(false);
                setShowHistoryPage(false);
              }}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] ${
                isDark
                  ? 'text-zinc-200 hover:text-white hover:bg-zinc-800/80'
                  : 'text-zinc-800 hover:text-zinc-950 hover:bg-black/5'
              }`}
              aria-label="Back to calculator"
              title="Back to calculator"
            >
              <ArrowLeft className="w-5 h-5 stroke-[2]" />
            </button>

            <h2 className="text-base sm:text-lg font-semibold tracking-tight">Histories</h2>

            {localTape.length > 0 ? (
              <button
                type="button"
                onClick={() => {
                  setShowClearConfirm((prev) => !prev);
                }}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] ${
                  showClearConfirm
                    ? 'text-[#C25215] bg-[#C25215]/10'
                    : isDark
                    ? 'text-zinc-300 hover:text-white hover:bg-zinc-800/80'
                    : 'text-zinc-700 hover:text-zinc-950 hover:bg-black/5'
                }`}
                aria-label="Clear calculation histories"
                title="Clear histories"
              >
                <Trash2 className="w-[18px] h-[18px] stroke-[2]" />
              </button>
            ) : (
              <div className="w-[44px]" aria-hidden="true" />
            )}
          </div>

          {/* Inline Clear Confirmation */}
          <AnimatePresence>
            {showClearConfirm && localTape.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.14 }}
                className={`mt-2 mb-1 px-3.5 py-2.5 rounded-2xl flex items-center justify-between gap-3 border ${
                  isDark
                    ? 'bg-[#1C1F26] border-zinc-800 text-zinc-200'
                    : 'bg-[#F5F7FA] border-slate-200/80 text-slate-800'
                }`}
              >
                <span className="text-sm font-medium">Clear all past calculations?</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => {
                      setShowClearConfirm(false);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer transition-colors ${
                      isDark ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-black/5 text-zinc-700'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'CLEAR_TAPE' });
                      setSavedHistoryKeys({});
                      setShowClearConfirm(false);
                      showNotification({
                        id: 'calc-history-clear',
                        message: 'Calculator histories cleared',
                        type: 'success',
                        duration: 1800,
                      });
                    }}
                    className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-[#C25215] hover:bg-[#AE4811] text-white cursor-pointer transition-colors"
                  >
                    Clear
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Full-Page List of Past Calculations */}
          <div className="flex-1 min-h-0 overflow-y-auto pt-3 pb-2 pr-0.5">
            {localTape.length === 0 ? (
              <div className="h-full min-h-[260px] flex flex-col items-center justify-center text-center px-6">
                <History
                  className={`w-10 h-10 stroke-[1.5] mb-3 ${
                    isDark ? 'text-zinc-600' : 'text-zinc-400'
                  }`}
                />
                <p
                  className={`text-base font-medium ${
                    isDark ? 'text-zinc-300' : 'text-zinc-700'
                  }`}
                >
                  No calculations yet
                </p>
                <p
                  className={`text-sm mt-1 ${
                    isDark ? 'text-zinc-500' : 'text-zinc-500'
                  }`}
                >
                  Completed equations will appear here.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {localTape.map((item, idx) => {
                  const entryKey = item.id ?? `${item.expr}-${item.res}-${item.time}-${idx}`;
                  const isEntryCopied = copiedHistoryId === entryKey;
                  const isSaving = Boolean(savingHistoryKeys[entryKey]);
                  const isSaved = Boolean(savedHistoryKeys[entryKey]);
                  return (
                    <div
                      key={entryKey}
                      className={`rounded-2xl px-3.5 py-3 transition-colors border ${
                        isDark
                          ? 'bg-[#1C1F26]/90 hover:bg-[#242832] border-zinc-800/70'
                          : 'bg-[#F5F7FA] hover:bg-[#EDF1F6] border-slate-200/75 shadow-[0_1px_2px_rgba(15,23,42,0.03)]'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleCopyHistoryEntry(entryKey, item.res)}
                          className={`min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] ${
                            isDark
                              ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
                              : 'text-zinc-500 hover:text-zinc-900 hover:bg-black/5'
                          }`}
                          aria-label={`Copy result ${item.res}`}
                          title="Copy result"
                        >
                          {isEntryCopied ? (
                            <Check className="w-4 h-4 text-emerald-500" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            dispatch({ type: 'LOAD_TAPE', res: item.res });
                            setShowClearConfirm(false);
                            setShowHistoryPage(false);
                          }}
                          className="flex-1 min-w-0 text-right cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] rounded-xl py-0.5"
                          title="Tap to load result into calculator"
                        >
                          <div
                            className={`text-xs font-normal tabular-nums mb-0.5 ${
                              isDark ? 'text-zinc-500' : 'text-zinc-400'
                            }`}
                          >
                            {item.time}
                          </div>
                          <div
                            className={`text-[15px] sm:text-base font-normal tabular-nums leading-snug whitespace-normal break-words ${
                              isDark ? 'text-zinc-300' : 'text-zinc-600'
                            }`}
                          >
                            {item.expr}
                          </div>
                          <div
                            className={`text-2xl sm:text-[26px] font-semibold tabular-nums tracking-tight leading-tight mt-0.5 whitespace-normal break-words ${
                              isDark ? 'text-white' : 'text-zinc-950'
                            }`}
                          >
                            <span className="text-[#C25215] mr-1">=</span>
                            {item.res}
                          </div>
                        </button>
                      </div>

                      <div
                        className={`mt-2.5 pt-2 border-t flex items-center justify-end ${
                          isDark ? 'border-zinc-800/80' : 'border-zinc-200/80'
                        }`}
                      >
                        <button
                          type="button"
                          disabled={isSaving || isSaved}
                          onClick={() => handleAddCardToMainHistory(entryKey, item)}
                          className={`min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] ${
                            isSaved
                              ? isDark
                                ? 'bg-emerald-500/15 text-emerald-400 cursor-default'
                                : 'bg-emerald-500/10 text-emerald-700 cursor-default'
                              : isSaving
                              ? 'bg-[#C25215]/70 text-white cursor-wait'
                              : 'bg-[#C25215] hover:bg-[#AE4811] text-white cursor-pointer active:scale-[0.97]'
                          }`}
                        >
                          {isSaved ? (
                            <>
                              <Check className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>Saved to History</span>
                            </>
                          ) : (
                            <>
                              <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
                              <span>{isSaving ? 'Saving...' : 'Add to History'}</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="mobile-edge-calc w-full h-[100dvh] max-h-[100dvh] sm:h-[calc(100dvh-1rem)] sm:max-h-[820px] min-h-0 flex-1 flex flex-col overflow-hidden sm:max-w-[460px] sm:mx-auto m-0 p-0">
      {/* Main Calculator Shell (Locked to single screen without scrolling so header is always visible) */}
      <div
        className={`flex-1 min-h-0 h-full max-h-full overflow-hidden flex flex-col justify-between rounded-none sm:rounded-[32px] px-3.5 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] sm:px-5 sm:py-3.5 sm:shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-colors ${shellBg}`}
      >
        {/* Minimalist Top Bar: Back Arrow Left (Home), No Title, Visible Three-Dot Menu Right */}
        <div className="flex items-center justify-between h-10 sm:h-11 shrink-0 relative z-30">
          <button
            type="button"
            onClick={() => {
              onBackHome?.();
            }}
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer ${
              isDark
                ? 'text-zinc-200 hover:text-white hover:bg-zinc-800/80'
                : 'text-zinc-800 hover:text-zinc-950 hover:bg-black/5'
            }`}
            aria-label="Back to home screen"
            title="Back to Home"
          >
            <ArrowLeft className="w-5 h-5 stroke-[2]" />
          </button>

          <div ref={menuRef} className="relative">
            <button
              type="button"
              onClick={() => {
                setShowMenu((prev) => !prev);
              }}
              className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-2xl transition-colors cursor-pointer ${
                isDark
                  ? 'text-zinc-200 hover:text-white hover:bg-zinc-800/80'
                  : 'text-zinc-800 hover:text-zinc-950 hover:bg-black/5'
              }`}
              aria-label="Calculator menu"
              aria-expanded={showMenu}
            >
              <MoreVertical className="w-5 h-5 stroke-[2]" />
            </button>

            <AnimatePresence>
              {showMenu && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.94, y: -6 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.94, y: -6 }}
                  transition={{ duration: 0.14 }}
                  className={`absolute right-0 top-12 z-40 w-56 rounded-2xl p-1.5 shadow-xl border ${
                    isDark
                      ? 'bg-[#1C1F26] border-zinc-700/80 text-zinc-100'
                      : 'bg-white border-slate-200/90 text-slate-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      setShowClearConfirm(false);
                      setShowHistoryPage(true);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-black/5'
                    }`}
                  >
                    <History className="w-4 h-4 text-[#C25215] shrink-0" />
                    <span>Histories</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentInput === 'Error'}
                    onClick={() => {
                      handleCopy();
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-black/5'
                    }`}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#C25215] shrink-0" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>

                  <div
                    className={`my-1 h-px ${isDark ? 'bg-zinc-800' : 'bg-slate-200/80'}`}
                    aria-hidden="true"
                  />

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={isHapticOn}
                    data-haptic={isHapticOn ? 'off' : 'custom'}
                    onClick={handleToggleHapticSetting}
                    className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-black/5'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Vibrate className="w-4 h-4 text-[#C25215] shrink-0" />
                      <span>Haptic Feedback</span>
                    </span>
                    <span
                      aria-hidden="true"
                      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        isHapticOn
                          ? 'bg-[#C25215]'
                          : isDark
                          ? 'bg-zinc-700'
                          : 'bg-zinc-300'
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-xs transition-transform ${
                          isHapticOn ? 'translate-x-[18px]' : 'translate-x-[3px]'
                        }`}
                      />
                    </span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Display Area: Smoothly Scrollable Fixed-Size History Above + Upward-Growing Input Area & Divisor Line */}
        <div
          ref={displayAreaRef}
          className="flex-1 min-h-0 flex flex-col justify-end overflow-hidden px-1 pb-2 pt-0"
        >
          {/* Scrollable History Section: Fixed font sizes, fills remaining space & gently fades at top */}
          {historyEntries.length > 0 && (
            <div
              ref={historyScrollRef}
              aria-label="Recent calculations history"
              data-calc-history-scroll="true"
              onScroll={(e) => {
                const el = e.currentTarget;
                const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
                shouldStickHistoryToBottomRef.current = distanceFromBottom <= 16;
              }}
              className={`flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
                historyEntries.length > 1
                  ? '[mask-image:linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.68)_8%,rgba(0,0,0,0.92)_18%,rgba(0,0,0,1)_28%)]'
                  : '[mask-image:linear-gradient(to_bottom,rgba(0,0,0,0.95)_0%,rgba(0,0,0,1)_12%)]'
              }`}
            >
              <div className="min-h-full flex flex-col items-end justify-end gap-1 pb-1.5 pt-2">
                {historyEntries.map((item, idx) => (
                  <button
                    key={item.id ?? `${item.expr}-${item.res}-${item.time}-${idx}`}
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'LOAD_TAPE', res: item.res });
                    }}
                    className={`w-full text-right rounded-lg px-1.5 py-0.5 transition-colors cursor-pointer opacity-90 hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215] ${
                      isDark ? 'hover:bg-white/5' : 'hover:bg-black/[0.04]'
                    }`}
                    title="Tap to insert result"
                  >
                    <div
                      className={`text-[16px] sm:text-[17px] leading-[1.3] font-normal tabular-nums whitespace-normal break-words ${
                        isDark ? 'text-zinc-200' : 'text-slate-700'
                      }`}
                    >
                      {item.expr} ={' '}
                      <span
                        className={`text-[17px] sm:text-[18px] font-medium ${
                          isDark ? 'text-white' : 'text-slate-900'
                        }`}
                      >
                        {item.res}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Divisor Line + Active Input Area (Moves upward smoothly as calculations grow, keeping text sizes fixed) */}
          <div
            ref={activeInputRef}
            className={`shrink-0 max-h-[68%] overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${
              historyEntries.length > 0
                ? `pt-2 border-t ${isDark ? 'border-zinc-800/80' : 'border-zinc-300/80'}`
                : ''
            }`}
          >
            {openParenCount > 0 && (
              <div className="flex justify-end mb-1">
                <span
                  className={`px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums ${
                    isDark ? 'bg-zinc-800 text-zinc-300' : 'bg-black/5 text-zinc-700'
                  }`}
                  title="Open parentheses awaiting closing ')'"
                >
                  {openParenCount} (
                </span>
              </div>
            )}

            {/* Right-Aligned Wrapping Equation (Fixed Size) */}
            {equationDisplay && (
              <div
                className={`text-right text-[20px] sm:text-[22px] leading-[1.26] font-normal tabular-nums tracking-tight whitespace-normal break-words ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                {equationDisplay}
              </div>
            )}

            {/* Primary Result / Active Value (Fixed Size) + Burnt-Orange Caret */}
            <div className="mt-1 flex items-end justify-end gap-1.5">
              <span
                className={`text-[38px] sm:text-[42px] leading-[1.08] font-semibold tabular-nums tracking-tight text-right whitespace-normal break-all ${
                  errorMessage
                    ? 'text-rose-500'
                    : isDark
                    ? 'text-white'
                    : 'text-zinc-950'
                }`}
              >
                {mainResultDisplay}
              </span>
              <span
                aria-hidden="true"
                className="w-[2.5px] h-9 sm:h-10 mb-1 rounded-full bg-[#C25215] shrink-0"
              />
            </div>

            {/* Error Feedback Only (No Duplicate Readout Below Result) */}
            {errorMessage && (
              <div className="mt-1.5 flex items-center justify-end">
                <span className="inline-flex items-center gap-1.5 text-rose-500 text-xs sm:text-sm font-medium text-right whitespace-normal break-words">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{errorMessage}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Keypad Grid (locked responsive height across Scientific & Standard modes to fit single screen) */}
        <div className="shrink-0">
        {calculatorView === 'scientific' ? (
          <div className="grid grid-cols-5 grid-rows-7 gap-2 sm:gap-2.5 h-[clamp(304px,48dvh,380px)] sm:h-[clamp(320px,50dvh,400px)] shrink-0">
            {/* Row 1: 2nd, deg, sin, cos, tan */}
            <button
              type="button"
              onClick={() => {
                setIsSecondFunction((prev) => !prev);
                triggerVibration('click');
              }}
              className={isSecondFunction ? sciKeyActiveClass : sciKeyClass}
            >
              2nd
            </button>

            <button
              type="button"
              onClick={() => {
                dispatch({ type: 'TOGGLE_ANGLE' });
                triggerVibration('click');
              }}
              className={angleMode === 'RAD' ? sciKeyActiveClass : sciKeyClass}
              title="Toggle Degrees / Radians"
            >
              {angleMode.toLowerCase()}
            </button>

            <button
              type="button"
              onClick={() => handleFunction(trigSinFn)}
              className={sciKeyClass}
            >
              {trigSinLabel}
            </button>

            <button
              type="button"
              onClick={() => handleFunction(trigCosFn)}
              className={sciKeyClass}
            >
              {trigCosLabel}
            </button>

            <button
              type="button"
              onClick={() => handleFunction(trigTanFn)}
              className={sciKeyClass}
            >
              {trigTanLabel}
            </button>

            {/* Row 2: x^y, lg, ln, (, ) */}
            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'yroot' : 'pow')}
              className={sciKeyClass}
            >
              {isSecondFunction ? 'ʸ√x' : 'xʸ'}
            </button>

            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'tenpow' : 'log')}
              className={sciKeyClass}
            >
              {isSecondFunction ? '10ˣ' : 'lg'}
            </button>

            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'exp' : 'ln')}
              className={sciKeyClass}
            >
              {isSecondFunction ? 'eˣ' : 'ln'}
            </button>

            <button
              type="button"
              onClick={() => handleParenthesis('(')}
              className={sciKeyClass}
            >
              (
            </button>

            <button
              type="button"
              onClick={() => handleParenthesis(')')}
              className={sciKeyClass}
            >
              )
            </button>

            {/* Row 3: √x, C, Backspace, %, ÷ */}
            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'cbrt' : 'sqrt')}
              className={sciKeyClass}
            >
              {isSecondFunction ? '∛x' : '√x'}
            </button>

            <button
              type="button"
              onClick={handleClearAll}
              className={accentKeyClass}
              aria-label="Clear all"
            >
              C
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className={operatorKeyClass}
              aria-label="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handlePercent}
              className={operatorKeyClass}
            >
              %
            </button>

            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className={operatorKeyClass}
            >
              ÷
            </button>

            {/* Row 4: x!, 7, 8, 9, × */}
            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'sq' : 'factorial')}
              className={sciKeyClass}
            >
              {isSecondFunction ? 'x²' : 'x!'}
            </button>

            <button type="button" onClick={() => handleDigit('7')} className={numKeyClass}>
              7
            </button>
            <button type="button" onClick={() => handleDigit('8')} className={numKeyClass}>
              8
            </button>
            <button type="button" onClick={() => handleDigit('9')} className={numKeyClass}>
              9
            </button>

            <button
              type="button"
              onClick={() => handleOperator('×')}
              className={operatorKeyClass}
            >
              ×
            </button>

            {/* Row 5: 1/x, 4, 5, 6, − */}
            <button
              type="button"
              onClick={() => handleFunction(isSecondFunction ? 'cube' : 'reciprocal')}
              className={sciKeyClass}
            >
              {isSecondFunction ? 'x³' : '1/x'}
            </button>

            <button type="button" onClick={() => handleDigit('4')} className={numKeyClass}>
              4
            </button>
            <button type="button" onClick={() => handleDigit('5')} className={numKeyClass}>
              5
            </button>
            <button type="button" onClick={() => handleDigit('6')} className={numKeyClass}>
              6
            </button>

            <button
              type="button"
              onClick={() => handleOperator('−')}
              className={operatorKeyClass}
            >
              −
            </button>

            {/* Row 6: π, 1, 2, 3, + */}
            <button
              type="button"
              onClick={() => (isSecondFunction ? handleFunction('abs') : handleConstant('π'))}
              className={sciKeyClass}
            >
              {isSecondFunction ? '|x|' : 'π'}
            </button>

            <button type="button" onClick={() => handleDigit('1')} className={numKeyClass}>
              1
            </button>
            <button type="button" onClick={() => handleDigit('2')} className={numKeyClass}>
              2
            </button>
            <button type="button" onClick={() => handleDigit('3')} className={numKeyClass}>
              3
            </button>

            <button
              type="button"
              onClick={() => handleOperator('+')}
              className={operatorKeyClass}
            >
              +
            </button>

            {/* Row 7: Mode Switch, e, 0, ., = */}
            <button
              type="button"
              onClick={() => {
                setCalculatorView('standard');
                triggerVibration('click');
              }}
              className={modeSwitchKeyClass}
              aria-label="Switch to Standard keypad"
              title="Switch to Standard keypad"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => handleConstant(isSecondFunction ? 'Ans' : 'e')}
              className={sciKeyClass}
            >
              {isSecondFunction ? 'Ans' : 'e'}
            </button>

            <button type="button" onClick={() => handleDigit('0')} className={numKeyClass}>
              0
            </button>

            <button type="button" onClick={handleDecimal} className={numKeyClass}>
              .
            </button>

            <button
              type="button"
              onClick={handleEqual}
              className={accentKeyClass}
              aria-label="Equals"
            >
              =
            </button>
          </div>
        ) : (
          /* Standard 4-Column Minimalist Keypad (identical height to Scientific grid) */
          <div className="grid grid-cols-4 grid-rows-5 gap-2 sm:gap-2.5 h-[clamp(304px,48dvh,380px)] sm:h-[clamp(320px,50dvh,400px)] shrink-0">
            {/* Row 1: C, Backspace, %, ÷ */}
            <button
              type="button"
              onClick={handleClearAll}
              className={`${accentKeyClass} h-full`}
              aria-label="Clear all"
            >
              C
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className={`${operatorKeyClass} h-full`}
              aria-label="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handlePercent}
              className={`${operatorKeyClass} h-full`}
            >
              %
            </button>

            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className={`${operatorKeyClass} h-full`}
            >
              ÷
            </button>

            {/* Row 2: 7, 8, 9, × */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className={`${numKeyClass} h-full`}
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit('8')}
              className={`${numKeyClass} h-full`}
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit('9')}
              className={`${numKeyClass} h-full`}
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperator('×')}
              className={`${operatorKeyClass} h-full`}
            >
              ×
            </button>

            {/* Row 3: 4, 5, 6, − */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className={`${numKeyClass} h-full`}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit('5')}
              className={`${numKeyClass} h-full`}
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit('6')}
              className={`${numKeyClass} h-full`}
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperator('−')}
              className={`${operatorKeyClass} h-full`}
            >
              −
            </button>

            {/* Row 4: 1, 2, 3, + */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className={`${numKeyClass} h-full`}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit('2')}
              className={`${numKeyClass} h-full`}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit('3')}
              className={`${numKeyClass} h-full`}
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className={`${operatorKeyClass} h-full`}
            >
              +
            </button>

            {/* Row 5: Switch to Scientific, 0, ., = */}
            <button
              type="button"
              onClick={() => {
                setCalculatorView('scientific');
                triggerVibration('click');
              }}
              className={`${modeSwitchKeyClass} h-full`}
              aria-label="Switch to Scientific keypad"
              title="Switch to Scientific keypad"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => handleDigit('0')}
              className={`${numKeyClass} h-full`}
            >
              0
            </button>

            <button
              type="button"
              onClick={handleDecimal}
              className={`${numKeyClass} h-full`}
            >
              .
            </button>

            <button
              type="button"
              onClick={handleEqual}
              className={`${accentKeyClass} h-full`}
              aria-label="Equals"
            >
              =
            </button>
          </div>
        )}
        </div>
      </div>
    </div>
  );
}
