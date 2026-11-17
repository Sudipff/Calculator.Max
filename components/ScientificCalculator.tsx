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
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  calcReducer,
  INITIAL_CALC_STATE,
  evaluateWithCache,
  clearEvaluationCache,
  buildFullExpression,
  countUnclosedParens,
} from '../lib/scientificEngine';
import { showNotification } from '@/lib/notifications';
import { useTheme } from '@/components/ThemeProvider';

interface ScientificCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory?: (type: string, details: string, result: string) => void;
  onBackHome?: () => void;
  onOpenHistory?: () => void;
  onViewModeChange?: (mode: 'scientific' | 'standard') => void;
}

export default function ScientificCalculator({
  triggerVibration,
  onBackHome,
  onOpenHistory,
  onViewModeChange,
}: ScientificCalculatorProps) {
  const { isDark } = useTheme();
  const [state, dispatch] = useReducer(calcReducer, INITIAL_CALC_STATE);
  const [isSecondFunction, setIsSecondFunction] = useState<boolean>(false);
  const [calculatorView, setCalculatorView] = useState<'scientific' | 'standard'>('scientific');
  const [showMenu, setShowMenu] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  const [livePreview, setLivePreview] = useState<string | null>(null);
  const computeReqIdRef = useRef<number>(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapeScrollRef = useRef<HTMLDivElement | null>(null);

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
      clearEvaluationCache();
    };
  }, []);

  // Auto-scroll history tape to newest bottom entry
  useEffect(() => {
    if (tapeScrollRef.current) {
      tapeScrollRef.current.scrollTop = tapeScrollRef.current.scrollHeight;
    }
  }, [localTape.length, evaluatedResult]);

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
    triggerVibration('click');
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

  // Keyboard Shortcuts Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
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
  }, []);

  // Dynamic scientific function labels based on 2nd state
  const trigSinLabel = isSecondFunction ? 'sin⁻¹' : 'sin';
  const trigCosLabel = isSecondFunction ? 'cos⁻¹' : 'cos';
  const trigTanLabel = isSecondFunction ? 'tan⁻¹' : 'tan';

  const trigSinFn = isSecondFunction ? 'asin' : 'sin';
  const trigCosFn = isSecondFunction ? 'acos' : 'cos';
  const trigTanFn = isSecondFunction ? 'atan' : 'tan';

  // Prominent chronological multi-line tape above the active input area (avoids duplicating active evaluated equation)
  const lastTape = localTape[0];
  const priorTapeEntries = useMemo(() => {
    const source =
      evaluatedResult !== null && lastTape && lastTape.res === evaluatedResult
        ? localTape.slice(1)
        : localTape;
    return [...source].reverse();
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

  // Adaptive color classes (Light warm-stone palette + Dark obsidian sibling)
  const shellBg = isDark
    ? 'bg-[#121418] text-zinc-100 sm:border sm:border-zinc-800/80'
    : 'bg-[#ECEBE7] text-zinc-900 sm:border sm:border-[#DFDDD7]';

  const keyBase =
    'min-h-[48px] sm:min-h-[54px] rounded-[20px] sm:rounded-[22px] flex items-center justify-center transition-all duration-150 active:scale-[0.94] cursor-pointer select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C25215]';

  const sciKeyClass = isDark
    ? `${keyBase} bg-[#1C1F26] hover:bg-[#252932] text-zinc-300 text-sm sm:text-[15px] font-medium border border-zinc-800/70`
    : `${keyBase} bg-[#F6F5F2] hover:bg-white text-zinc-700 text-sm sm:text-[15px] font-medium shadow-[0_1px_2px_rgba(24,24,27,0.04)]`;

  const sciKeyActiveClass = isDark
    ? `${keyBase} bg-[#C25215]/25 text-[#F59E6C] text-sm sm:text-[15px] font-semibold border border-[#C25215]/60`
    : `${keyBase} bg-[#FBECE3] text-[#B84A0E] text-sm sm:text-[15px] font-semibold border border-[#E6B89C]`;

  const numKeyClass = isDark
    ? `${keyBase} bg-[#22262E] hover:bg-[#2C313B] text-zinc-50 text-xl sm:text-[22px] font-normal tabular-nums border border-zinc-800/80`
    : `${keyBase} bg-[#F8F7F4] hover:bg-white text-zinc-900 text-xl sm:text-[22px] font-normal tabular-nums shadow-[0_1px_2px_rgba(24,24,27,0.04)]`;

  const operatorKeyClass = isDark
    ? `${keyBase} bg-[#9E5228] hover:bg-[#AE5B2E] text-white text-xl sm:text-[22px] font-normal shadow-sm`
    : `${keyBase} bg-[#B46233] hover:bg-[#A3572C] text-white text-xl sm:text-[22px] font-normal shadow-[0_2px_6px_rgba(180,98,51,0.18)]`;

  const accentKeyClass = isDark
    ? `${keyBase} bg-[#C25215] hover:bg-[#D25C1B] text-white text-xl sm:text-[22px] font-medium shadow-md shadow-black/25`
    : `${keyBase} bg-[#C25215] hover:bg-[#AE4811] text-white text-xl sm:text-[22px] font-medium shadow-[0_3px_10px_rgba(194,82,21,0.28)]`;

  const modeSwitchKeyClass = isDark
    ? `${keyBase} bg-[#1C1F26] hover:bg-[#252932] text-[#E8793E] border border-zinc-800/70`
    : `${keyBase} bg-[#F6F5F2] hover:bg-white text-[#C25215] shadow-[0_1px_2px_rgba(24,24,27,0.04)]`;

  return (
    <div className="mobile-edge-calc w-full flex-1 flex flex-col sm:max-w-[460px] sm:mx-auto m-0 p-0">
      {/* Main Calculator Shell */}
      <div
        className={`flex-1 flex flex-col justify-between rounded-none sm:rounded-[34px] px-4 pt-2.5 pb-[max(0.85rem,env(safe-area-inset-bottom))] sm:p-5 sm:shadow-[0_18px_50px_rgba(15,23,42,0.08)] transition-colors ${shellBg}`}
      >
        {/* Minimalist Top Bar: Back Arrow Left (Home), No Title, Visible Three-Dot Menu Right (History & Copy) */}
        <div className="flex items-center justify-between h-11 shrink-0 relative z-30">
          <button
            type="button"
            onClick={() => {
              triggerVibration('click');
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
                triggerVibration('click');
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
                  className={`absolute right-0 top-12 z-40 w-44 rounded-2xl p-1.5 shadow-xl border ${
                    isDark
                      ? 'bg-[#1C1F26] border-zinc-700/80 text-zinc-100'
                      : 'bg-[#FAF9F6] border-[#DFDDD7] text-zinc-800'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setShowMenu(false);
                      triggerVibration('click');
                      onOpenHistory?.();
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-black/5'
                    }`}
                  >
                    <History className="w-4 h-4 text-[#C25215]" />
                    <span>History</span>
                  </button>

                  <button
                    type="button"
                    disabled={currentInput === 'Error'}
                    onClick={() => {
                      handleCopy();
                      setShowMenu(false);
                    }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 ${
                      isDark ? 'hover:bg-zinc-800' : 'hover:bg-black/5'
                    }`}
                  >
                    {copied ? (
                      <Check className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <Copy className="w-4 h-4 text-[#C25215]" />
                    )}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Prominent Multi-Line History Tape + Active Input / Result Display */}
        <div className="flex-1 min-h-[210px] sm:min-h-[240px] flex flex-col justify-end overflow-hidden px-1 pb-4 pt-1">
          {/* Multi-Line Scrollable History Tape Above Input Area */}
          {priorTapeEntries.length > 0 && (
            <div
              ref={tapeScrollRef}
              aria-label="Calculation history tape"
              className={`flex-1 min-h-0 overflow-y-auto pr-1 pb-3 mb-3 border-b ${
                isDark ? 'border-zinc-800/80' : 'border-zinc-300/80'
              }`}
            >
              <div className="min-h-full flex flex-col justify-end gap-3">
                {priorTapeEntries.map((item, idx) => (
                  <button
                    key={`${item.expr}-${item.res}-${idx}`}
                    type="button"
                    onClick={() => {
                      dispatch({ type: 'LOAD_TAPE', res: item.res });
                      triggerVibration('click');
                    }}
                    className={`w-full text-right rounded-xl px-2 py-1 transition-colors cursor-pointer ${
                      isDark ? 'hover:bg-white/5' : 'hover:bg-black/[0.04]'
                    }`}
                    title="Tap to insert result"
                  >
                    <div
                      className={`text-lg sm:text-xl font-normal tabular-nums leading-snug whitespace-normal break-words ${
                        isDark ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {item.expr}
                    </div>
                    <div
                      className={`text-xl sm:text-2xl font-medium tabular-nums leading-tight mt-0.5 whitespace-normal break-words ${
                        isDark ? 'text-zinc-200' : 'text-zinc-700'
                      }`}
                    >
                      = {item.res}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Input Area */}
          <div className="shrink-0">
            {openParenCount > 0 && (
              <div className="flex justify-end mb-1.5">
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

            {/* Large Right-Aligned Wrapping Equation Line */}
            {equationDisplay && (
              <div
                className={`text-right text-[26px] sm:text-[32px] font-normal tabular-nums tracking-tight leading-[1.24] whitespace-normal break-words ${
                  isDark ? 'text-zinc-300' : 'text-zinc-700'
                }`}
              >
                {equationDisplay}
              </div>
            )}

            {/* Significantly Larger Primary Result / Input Value + Burnt-Orange Caret */}
            <div className="mt-2 flex items-end justify-end gap-1.5">
              <span
                className={`text-[50px] sm:text-[60px] font-semibold tabular-nums tracking-tight leading-[1.06] text-right whitespace-normal break-all ${
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
                className="w-[2.5px] h-12 sm:h-14 mb-1 rounded-full bg-[#C25215] shrink-0"
              />
            </div>

            {/* Error Feedback Only (No Duplicate Readout Below Result) */}
            {errorMessage && (
              <div className="mt-2 flex items-center justify-end">
                <span className="inline-flex items-center gap-1.5 text-rose-500 text-sm font-medium text-right whitespace-normal break-words">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMessage}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Keypad Grid */}
        {calculatorView === 'scientific' ? (
          <div className="grid grid-cols-5 gap-2.5 sm:gap-3 shrink-0">
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
          /* Standard 4-Column Minimalist Keypad */
          <div className="grid grid-cols-4 gap-2.5 sm:gap-3 shrink-0">
            {/* Row 1: C, Backspace, %, ÷ */}
            <button
              type="button"
              onClick={handleClearAll}
              className={`${accentKeyClass} min-h-[58px] sm:min-h-[64px]`}
              aria-label="Clear all"
            >
              C
            </button>

            <button
              type="button"
              onClick={handleBackspace}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
              aria-label="Backspace"
            >
              <Delete className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={handlePercent}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              %
            </button>

            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              ÷
            </button>

            {/* Row 2: 7, 8, 9, × */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              7
            </button>
            <button
              type="button"
              onClick={() => handleDigit('8')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              8
            </button>
            <button
              type="button"
              onClick={() => handleDigit('9')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              9
            </button>
            <button
              type="button"
              onClick={() => handleOperator('×')}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              ×
            </button>

            {/* Row 3: 4, 5, 6, − */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              4
            </button>
            <button
              type="button"
              onClick={() => handleDigit('5')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              5
            </button>
            <button
              type="button"
              onClick={() => handleDigit('6')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              6
            </button>
            <button
              type="button"
              onClick={() => handleOperator('−')}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              −
            </button>

            {/* Row 4: 1, 2, 3, + */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              1
            </button>
            <button
              type="button"
              onClick={() => handleDigit('2')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              2
            </button>
            <button
              type="button"
              onClick={() => handleDigit('3')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              3
            </button>
            <button
              type="button"
              onClick={() => handleOperator('+')}
              className={`${operatorKeyClass} min-h-[58px] sm:min-h-[64px]`}
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
              className={`${modeSwitchKeyClass} min-h-[58px] sm:min-h-[64px]`}
              aria-label="Switch to Scientific keypad"
              title="Switch to Scientific keypad"
            >
              <ArrowLeftRight className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => handleDigit('0')}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              0
            </button>

            <button
              type="button"
              onClick={handleDecimal}
              className={`${numKeyClass} min-h-[58px] sm:min-h-[64px]`}
            >
              .
            </button>

            <button
              type="button"
              onClick={handleEqual}
              className={`${accentKeyClass} min-h-[58px] sm:min-h-[64px]`}
              aria-label="Equals"
            >
              =
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
