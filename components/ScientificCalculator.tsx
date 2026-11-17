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
  Copy,
  Check,
  AlertCircle,
  Delete,
  History,
  Equal,
  Maximize2,
  Minimize2,
  BookmarkPlus,
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

interface ScientificCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: string, details: string, result: string) => void;
}

export default function ScientificCalculator({
  triggerVibration,
  onSaveHistory,
}: ScientificCalculatorProps) {
  const [state, dispatch] = useReducer(calcReducer, INITIAL_CALC_STATE);
  const [isSecondFunction, setIsSecondFunction] = useState<boolean>(false);
  const [isHyperbolic, setIsHyperbolic] = useState<boolean>(false);
  const [calculatorView, setCalculatorView] = useState<'scientific' | 'standard'>('scientific');
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [showTape, setShowTape] = useState<boolean>(false);

  const [livePreview, setLivePreview] = useState<string | null>(null);

  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const computeReqIdRef = useRef<number>(0);

  const {
    expression,
    currentInput,
    isNewInput,
    evaluatedResult,
    lastAnswer,
    errorMessage,
    angleMode,
    memoryValue,
    hasMemory,
    tape: localTape,
  } = state;

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

    const win = typeof window !== 'undefined' ? (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }) : null;

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

  // Unmount cleanup: release timers and bounded evaluation cache to prevent leaks
  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
        copyTimerRef.current = null;
      }
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
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

  const handleScientificExponent = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'SCI_EXP' });
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

  const handleToggleSign = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'TOGGLE_SIGN' });
  }, [triggerVibration]);

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

  const handleClearEntry = useCallback(() => {
    triggerVibration('click');
    dispatch({ type: 'CLEAR_ENTRY' });
  }, [triggerVibration]);

  const handleMemory = useCallback(
    (action: 'MC' | 'MR' | 'M+' | 'M-' | 'MS') => {
      triggerVibration('click');
      dispatch({ type: 'MEMORY', action });
    },
    [triggerVibration]
  );

  const handleEqual = useCallback(() => {
    triggerVibration('click');
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    dispatch({ type: 'EQUAL', timeStr });
  }, [triggerVibration]);

  const handleCopy = () => {
    const textToCopy = evaluatedResult || currentInput;
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
    }, 2000);
  };

  const handleSaveToHistory = () => {
    const res = livePreview || evaluatedResult || currentInput;
    if (!res || res === 'Error') return;

    const lastTape = localTape[0];
    const exprText =
      evaluatedResult !== null && lastTape && lastTape.res === evaluatedResult
        ? lastTape.expr
        : expression || !isNewInput
        ? buildFullExpression(expression, currentInput, isNewInput, true)
        : currentInput;

    const modeLabel = calculatorView === 'scientific' ? 'Scientific' : 'Standard';
    const memoryLabel = hasMemory ? `${memoryValue}` : 'None';
    const details = `Expression: ${exprText} | Angle Mode: ${angleMode} | View Mode: ${modeLabel} | Memory: ${memoryLabel}`;
    onSaveHistory('Calculator', details, `= ${res}`);
    setSaved(true);
    triggerVibration('success');
    showNotification({
      id: 'calc-save',
      message: 'Saved to history',
      type: 'success',
      duration: 2000,
    });
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      setSaved(false);
      saveTimerRef.current = null;
    }, 2000);
  };

  // Keyboard Shortcuts Support — stable registration with zero listener churn
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

  // Dynamic scientific function labels based on 2nd and HYP states
  const trigSinLabel = isHyperbolic
    ? isSecondFunction
      ? 'sinh⁻¹'
      : 'sinh'
    : isSecondFunction
    ? 'sin⁻¹'
    : 'sin';
  const trigCosLabel = isHyperbolic
    ? isSecondFunction
      ? 'cosh⁻¹'
      : 'cosh'
    : isSecondFunction
    ? 'cos⁻¹'
    : 'cos';
  const trigTanLabel = isHyperbolic
    ? isSecondFunction
      ? 'tanh⁻¹'
      : 'tanh'
    : isSecondFunction
    ? 'tan⁻¹'
    : 'tan';

  const trigSinFn = isHyperbolic
    ? isSecondFunction
      ? 'asinh'
      : 'sinh'
    : isSecondFunction
    ? 'asin'
    : 'sin';
  const trigCosFn = isHyperbolic
    ? isSecondFunction
      ? 'acosh'
      : 'cosh'
    : isSecondFunction
    ? 'acos'
    : 'cos';
  const trigTanFn = isHyperbolic
    ? isSecondFunction
      ? 'atanh'
      : 'tanh'
    : isSecondFunction
    ? 'atan'
    : 'tan';

  return (
    <div className="mobile-edge-calc w-full flex-1 flex flex-col sm:max-w-4xl sm:mx-auto m-0 p-0 sm:space-y-4">
      {/* Main Calculator Body */}
      <div className="flex-1 flex flex-col justify-between bg-white rounded-none sm:rounded-3xl p-0 sm:p-5 md:p-6 shadow-none sm:shadow-[0_8px_30px_rgb(0,0,0,0.04)] border-0 sm:border sm:border-slate-100">
        {/* LCD / Display Screen */}
        <div className="bg-slate-900 rounded-none sm:rounded-2xl px-3.5 py-3 sm:p-4 md:p-5 text-white shadow-inner relative overflow-hidden border-b border-slate-800 sm:border shrink-0">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-mono mb-1.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'TOGGLE_ANGLE' });
                  triggerVibration('click');
                }}
                className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                  angleMode === 'DEG' ? 'bg-indigo-600 text-white' : 'bg-amber-600 text-white'
                }`}
                title="Toggle between Degrees and Radians"
              >
                {angleMode}
              </button>
              {hasMemory && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">
                  M
                </span>
              )}
              {isSecondFunction && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 text-[10px] font-bold">
                  2nd
                </span>
              )}
              {isHyperbolic && (
                <span className="px-1.5 py-0.5 rounded bg-cyan-500/30 text-cyan-300 text-[10px] font-bold">
                  HYP
                </span>
              )}
              {openParenCount > 0 && (
                <span
                  className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold"
                  title="Unclosed parentheses awaiting closing ')'"
                >
                  {openParenCount} (
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setCalculatorView((prev) => (prev === 'scientific' ? 'standard' : 'scientific'));
                  triggerVibration('click');
                }}
                className={`flex items-center gap-1 text-[10px] sm:text-[11px] font-sans font-bold py-1 px-2.5 rounded-lg transition-colors cursor-pointer border whitespace-nowrap shrink-0 ${
                  calculatorView === 'scientific'
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/60'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Switch between Normal and Scientific calculator"
              >
                {calculatorView === 'scientific' ? (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    <span>Standard</span>
                  </>
                ) : (
                  <>
                    <Maximize2 className="w-3 h-3" />
                    <span>Scientific</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setShowTape((prev) => !prev)}
                className={`flex items-center gap-1 text-[10px] sm:text-[11px] transition-colors cursor-pointer py-1 px-2 rounded-lg whitespace-nowrap shrink-0 ${
                  showTape ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
                title="View recent calculation history tape"
              >
                <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Tape ({localTape.length})</span>
              </button>
            </div>
          </div>

          {/* Active Expression Line */}
          <div className="text-slate-400 font-mono tabular-nums text-xs sm:text-sm min-h-[1.25rem] overflow-x-auto whitespace-nowrap text-right tracking-wide scrollbar-none">
            {expression || ' '}
          </div>

          {/* Current Input / Main Display */}
          <div className="text-2xl sm:text-3xl md:text-4xl font-mono tabular-nums font-bold text-right text-white tracking-tight overflow-x-auto whitespace-nowrap scrollbar-none py-1">
            {currentInput}
          </div>

          {/* Display Footer Bar: Error feedback or Live Preview + Quick Actions */}
          <div className="mt-1 pt-1.5 border-t border-slate-800 flex items-center justify-between gap-2 min-h-[1.75rem] text-[11px] sm:text-xs font-mono">
            <div className="flex-1 min-w-0 truncate">
              {errorMessage ? (
                <span className="inline-flex items-center gap-1 text-rose-400 font-sans font-semibold text-[11px] truncate">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{errorMessage}</span>
                </span>
              ) : livePreview !== null ? (
                <span className="text-emerald-400 font-bold tracking-wide">
                  = {livePreview}
                </span>
              ) : (
                <span className="text-slate-500 font-sans text-[10px]">
                  Ans = {lastAnswer}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSaveToHistory}
                disabled={currentInput === 'Error'}
                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white transition-colors cursor-pointer disabled:opacity-40 font-sans text-[10px] sm:text-[11px] font-bold"
                title="Save calculation to Calculation History"
              >
                {saved ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Saved</span>
                  </>
                ) : (
                  <>
                    <BookmarkPlus className="w-3 h-3 text-indigo-400" />
                    <span>Save</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Copy current value"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Optional History Tape Dropdown Drawer */}
        <AnimatePresence>
          {showTape && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-slate-50 sm:rounded-2xl p-2.5 sm:p-4 border-b sm:border border-slate-200/80 overflow-hidden shrink-0"
            >
              <div className="flex items-center justify-between mb-1.5 sm:mb-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>Recent Tape Records</span>
                <button
                  type="button"
                  onClick={() => dispatch({ type: 'CLEAR_TAPE' })}
                  className="text-rose-500 hover:text-rose-600 font-semibold text-[11px] cursor-pointer"
                >
                  Clear Tape
                </button>
              </div>

              {localTape.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-2">No calculations recorded yet in this session.</p>
              ) : (
                <div className="max-h-32 sm:max-h-44 overflow-y-auto space-y-1.5 pr-1">
                  {localTape.map((item, idx) => (
                    <div
                      key={idx}
                      onClick={() => {
                        dispatch({ type: 'LOAD_TAPE', res: item.res });
                        triggerVibration('click');
                      }}
                      className="p-2 rounded-xl bg-white border border-slate-100 flex items-center justify-between hover:border-indigo-200 cursor-pointer transition-colors"
                    >
                      <div className="text-xs font-mono tabular-nums text-slate-600 truncate mr-2">
                        {item.expr} = <span className="font-bold text-indigo-600">{item.res}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Responsive Edge-to-Edge Keypad Area (Fills Remaining Viewport Height on Mobile) */}
        <div className="flex-1 flex flex-col justify-between px-1.5 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-0 sm:pt-3 gap-1.5 sm:gap-2">
          {/* Memory Bar (5 Columns) */}
          <div className="grid grid-cols-5 gap-1 sm:gap-2 shrink-0">
            {[
              { label: 'MC', action: 'MC' as const, disabled: !hasMemory },
              { label: 'MR', action: 'MR' as const, disabled: !hasMemory },
              { label: 'M+', action: 'M+' as const, disabled: false },
              { label: 'M-', action: 'M-' as const, disabled: false },
              { label: 'MS', action: 'MS' as const, disabled: false },
            ].map((btn) => (
              <button
                key={btn.label}
                type="button"
                disabled={btn.disabled}
                onClick={() => handleMemory(btn.action)}
                className={`py-1.5 sm:py-2 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all ${
                  btn.disabled
                    ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 border border-slate-200/60 cursor-pointer'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Dedicated 5-Column Scientific Pad */}
          {calculatorView === 'scientific' && (
            <div className="grid grid-cols-5 gap-1 sm:gap-1.5 shrink-0">
              {/* Row 1: 2nd, HYP, DEG/RAD, (, ) */}
              <button
                type="button"
                onClick={() => {
                  setIsSecondFunction((prev) => !prev);
                  triggerVibration('click');
                }}
                className={`py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                  isSecondFunction
                    ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
                }`}
              >
                2nd
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsHyperbolic((prev) => !prev);
                  triggerVibration('click');
                }}
                className={`py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                  isHyperbolic
                    ? 'bg-cyan-600 text-white border-cyan-700 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
                }`}
                title="Toggle Hyperbolic Functions"
              >
                HYP
              </button>

              <button
                type="button"
                onClick={() => {
                  dispatch({ type: 'TOGGLE_ANGLE' });
                  triggerVibration('click');
                }}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-indigo-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
                title="Toggle Degrees / Radians"
              >
                {angleMode}
              </button>

              <button
                type="button"
                onClick={() => handleParenthesis('(')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                (
              </button>

              <button
                type="button"
                onClick={() => handleParenthesis(')')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                )
              </button>

              {/* Row 2: sin, cos, tan, ln/e^x, log/10^x */}
              <button
                type="button"
                onClick={() => handleFunction(trigSinFn)}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {trigSinLabel}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(trigCosFn)}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {trigCosLabel}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(trigTanFn)}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {trigTanLabel}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'exp' : 'ln')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'eˣ' : 'ln'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'tenpow' : 'log')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? '10ˣ' : 'log'}
              </button>

              {/* Row 3: x^2/x^3, sqrt/cbrt, x^y/yroot, 1/x/2^x, |x|/n! */}
              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'cube' : 'sq')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'x³' : 'x²'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'cbrt' : 'sqrt')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? '∛x' : '√x'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'yroot' : 'pow')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'ʸ√x' : 'xʸ'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'twopow' : 'reciprocal')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? '2ˣ' : '1/x'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'factorial' : 'abs')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'n!' : '|x|'}
              </button>

              {/* Row 4: pi, e, EE, mod, Ans */}
              <button
                type="button"
                onClick={() => handleConstant('π')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                π
              </button>

              <button
                type="button"
                onClick={() => handleConstant('e')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                e
              </button>

              <button
                type="button"
                onClick={handleScientificExponent}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
                title="Scientific notation exponent (×10ˣ)"
              >
                EE
              </button>

              <button
                type="button"
                onClick={() => handleOperator('mod')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
                title="Modulo remainder"
              >
                mod
              </button>

              <button
                type="button"
                onClick={() => handleConstant('Ans')}
                className="py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[11px] sm:text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/70 transition-all active:scale-95 cursor-pointer"
                title="Insert last calculated answer"
              >
                Ans
              </button>
            </div>
          )}

          {/* Standard Numeric & Arithmetic Keypad (4 Columns, Expands to Fill Viewport Height on Mobile) */}
          <div className="flex-1 grid grid-cols-4 grid-rows-5 gap-1.5 sm:gap-2">
            {/* Row 1: AC, CE, %, ÷ */}
            <button
              type="button"
              onClick={handleClearAll}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-sm font-black bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              AC
            </button>

            <button
              type="button"
              onClick={handleClearEntry}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              CE
            </button>

            <button
              type="button"
              onClick={handlePercent}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              %
            </button>

            <button
              type="button"
              onClick={() => handleOperator('÷')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              ÷
            </button>

            {/* Row 2: 7, 8, 9, × */}
            <button
              type="button"
              onClick={() => handleDigit('7')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              7
            </button>

            <button
              type="button"
              onClick={() => handleDigit('8')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              8
            </button>

            <button
              type="button"
              onClick={() => handleDigit('9')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              9
            </button>

            <button
              type="button"
              onClick={() => handleOperator('×')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              ×
            </button>

            {/* Row 3: 4, 5, 6, − */}
            <button
              type="button"
              onClick={() => handleDigit('4')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              4
            </button>

            <button
              type="button"
              onClick={() => handleDigit('5')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              5
            </button>

            <button
              type="button"
              onClick={() => handleDigit('6')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              6
            </button>

            <button
              type="button"
              onClick={() => handleOperator('−')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              −
            </button>

            {/* Row 4: 1, 2, 3, + */}
            <button
              type="button"
              onClick={() => handleDigit('1')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              1
            </button>

            <button
              type="button"
              onClick={() => handleDigit('2')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              2
            </button>

            <button
              type="button"
              onClick={() => handleDigit('3')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              3
            </button>

            <button
              type="button"
              onClick={() => handleOperator('+')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              +
            </button>

            {/* Row 5: ±, 0, ., Backspace, = */}
            <button
              type="button"
              onClick={handleToggleSign}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-base font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
              title="Toggle positive/negative sign"
            >
              ±
            </button>

            <button
              type="button"
              onClick={() => handleDigit('0')}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
            >
              0
            </button>

            <div className="grid grid-cols-2 gap-1.5 h-full">
              <button
                type="button"
                onClick={handleDecimal}
                className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
              >
                .
              </button>

              <button
                type="button"
                onClick={handleBackspace}
                className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
                aria-label="Backspace"
              >
                <Delete className="w-4 h-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={handleEqual}
              className="h-full min-h-[46px] sm:min-h-[52px] rounded-xl text-lg font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-indigo-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
              aria-label="Equals"
            >
              <Equal className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
