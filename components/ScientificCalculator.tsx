'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import {
  Calculator as CalcIcon,
  RotateCcw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Delete,
  History,
  Equal,
  Info,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ScientificCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: string, details: string, result: string) => void;
}

type AngleMode = 'DEG' | 'RAD';

// Floating point sanitizer
function cleanFloat(val: number): number {
  if (Math.abs(val) < 1e-12) return 0;
  // Round to 10 decimal digits to eliminate floating point artifacts like 0.30000000000000004
  const factor = 1e10;
  return Math.round(val * factor) / factor;
}

// Factorial computation
function factorial(n: number): number {
  if (!Number.isInteger(n) || n < 0) {
    throw new Error('Factorial requires a non-negative integer.');
  }
  if (n > 170) {
    throw new Error('Result exceeds maximum computable number (overflow).');
  }
  let res = 1;
  for (let i = 2; i <= n; i++) {
    res *= i;
  }
  return res;
}

type Token =
  | { type: 'NUMBER'; value: number }
  | { type: 'IDENT'; value: string }
  | { type: 'OP'; value: '+' | '-' | '*' | '/' | '^' | '!' | '%' }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' };

// Helper to auto-close any unclosed '(' parentheses in an expression string
function closeUnbalancedParens(str: string): string {
  let openCount = 0;
  for (const ch of str) {
    if (ch === '(') openCount++;
    else if (ch === ')' && openCount > 0) openCount--;
  }
  return openCount > 0 ? str + ')'.repeat(openCount) : str;
}

// Count unclosed '(' parentheses
function countUnclosedParens(str: string): number {
  let openCount = 0;
  for (const ch of str) {
    if (ch === '(') openCount++;
    else if (ch === ')' && openCount > 0) openCount--;
  }
  return openCount;
}

export default function ScientificCalculator({
  triggerVibration,
  onSaveHistory,
}: ScientificCalculatorProps) {
  // Calculator state
  const [expression, setExpression] = useState<string>('');
  const [currentInput, setCurrentInput] = useState<string>('0');
  const [isNewInput, setIsNewInput] = useState<boolean>(true);
  const [evaluatedResult, setEvaluatedResult] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [isSecondFunction, setIsSecondFunction] = useState<boolean>(false);
  const [calculatorView, setCalculatorView] = useState<'scientific' | 'standard'>('scientific');
  const [memoryValue, setMemoryValue] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [localTape, setLocalTape] = useState<Array<{ expr: string; res: string; time: string }>>([]);
  const [showTape, setShowTape] = useState<boolean>(false);

  // Safe mathematical tokenizer + recursive-descent parser with strict domain checks
  const safeEvaluateMath = useCallback(
    (rawExpr: string, currentAngle: AngleMode): { result: number; display: string } => {
      if (!rawExpr || !rawExpr.trim()) {
        throw new Error('Empty expression');
      }

      // Normalize display symbols and balance parentheses
      let normalized = rawExpr
        .replace(/×/g, '*')
        .replace(/÷/g, '/')
        .replace(/−/g, '-')
        .replace(/π/g, 'pi')
        .trim();

      // Strip trailing binary operators or commas at the end of an expression
      normalized = normalized.replace(/[+\-*/^,\s]+$/, '');
      if (!normalized) {
        throw new Error('Empty expression');
      }

      normalized = closeUnbalancedParens(normalized);

      // 1. Tokenize
      const rawTokens: Token[] = [];
      let i = 0;
      const len = normalized.length;

      while (i < len) {
        const ch = normalized[i];

        if (/\s/.test(ch)) {
          i++;
          continue;
        }

        // Number literal (including decimals and scientific notation like 1e-7 or 1e+21)
        if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(normalized[i + 1]))) {
          let numStr = '';
          while (i < len && /[\d.]/.test(normalized[i])) {
            numStr += normalized[i++];
          }
          // Check for scientific notation with explicit sign (e.g. 1e-7, 1e+21)
          if (
            i < len &&
            (normalized[i] === 'e' || normalized[i] === 'E') &&
            i + 1 < len &&
            (normalized[i + 1] === '+' || normalized[i + 1] === '-') &&
            i + 2 < len &&
            /\d/.test(normalized[i + 2])
          ) {
            numStr += normalized[i++]; // 'e' or 'E'
            numStr += normalized[i++]; // '+' or '-'
            while (i < len && /\d/.test(normalized[i])) {
              numStr += normalized[i++];
            }
          }
          const parsedNum = Number(numStr);
          if (isNaN(parsedNum)) {
            throw new Error(`Invalid number: ${numStr}`);
          }
          rawTokens.push({ type: 'NUMBER', value: parsedNum });
          continue;
        }

        // Identifiers (functions and constants: sin, cos, pi, e, etc.)
        if (/[a-zA-Z_]/.test(ch)) {
          let ident = '';
          while (i < len && /[a-zA-Z0-9_]/.test(normalized[i])) {
            ident += normalized[i++];
          }
          rawTokens.push({ type: 'IDENT', value: ident.toLowerCase() });
          continue;
        }

        if (ch === '(') {
          rawTokens.push({ type: 'LPAREN' });
          i++;
          continue;
        }

        if (ch === ')') {
          rawTokens.push({ type: 'RPAREN' });
          i++;
          continue;
        }

        if (ch === ',') {
          rawTokens.push({ type: 'COMMA' });
          i++;
          continue;
        }

        if (ch === '+' || ch === '-' || ch === '*' || ch === '/' || ch === '^' || ch === '!' || ch === '%') {
          rawTokens.push({ type: 'OP', value: ch });
          i++;
          continue;
        }

        throw new Error(`Unexpected character: "${ch}"`);
      }

      if (rawTokens.length === 0) {
        throw new Error('Empty expression');
      }

      // 2. Insert implicit multiplication tokens where appropriate
      // e.g. 2pi, 2(3), (2)(3), 2sin(30), sin(30)cos(60), 5!2, 50%200
      const tokens: Token[] = [];
      for (let idx = 0; idx < rawTokens.length; idx++) {
        const curr = rawTokens[idx];
        if (idx > 0) {
          const prev = rawTokens[idx - 1];
          const prevIsValueEnd =
            prev.type === 'NUMBER' ||
            prev.type === 'RPAREN' ||
            (prev.type === 'IDENT' && (prev.value === 'pi' || prev.value === 'e')) ||
            (prev.type === 'OP' && (prev.value === '!' || prev.value === '%'));

          const currIsValueStart =
            curr.type === 'LPAREN' ||
            curr.type === 'IDENT' ||
            (curr.type === 'NUMBER' && prev.type !== 'NUMBER');

          if (prevIsValueEnd && currIsValueStart) {
            tokens.push({ type: 'OP', value: '*' });
          }
        }
        tokens.push(curr);
      }

      // 3. Math helpers & functions
      const toRad = (angle: number) => (currentAngle === 'DEG' ? (angle * Math.PI) / 180 : angle);
      const fromRad = (rad: number) => (currentAngle === 'DEG' ? (rad * 180) / Math.PI : rad);

      const applyUnaryFunction = (fnName: string, x: number): number => {
        switch (fnName) {
          case 'sin':
            if (currentAngle === 'DEG' && x % 180 === 0) return 0;
            return cleanFloat(Math.sin(toRad(x)));
          case 'cos':
            if (currentAngle === 'DEG' && (x - 90) % 180 === 0) return 0;
            return cleanFloat(Math.cos(toRad(x)));
          case 'tan':
            if (currentAngle === 'DEG' && (x - 90) % 180 === 0) {
              throw new Error(`tan(${x}°) is undefined (asymptote)`);
            }
            return cleanFloat(Math.tan(toRad(x)));
          case 'asin':
            if (x < -1 || x > 1) throw new Error('asin input must be between -1 and 1');
            return cleanFloat(fromRad(Math.asin(x)));
          case 'acos':
            if (x < -1 || x > 1) throw new Error('acos input must be between -1 and 1');
            return cleanFloat(fromRad(Math.acos(x)));
          case 'atan':
            return cleanFloat(fromRad(Math.atan(x)));
          case 'sinh':
            return cleanFloat(Math.sinh(x));
          case 'cosh':
            return cleanFloat(Math.cosh(x));
          case 'tanh':
            return cleanFloat(Math.tanh(x));
          case 'sqrt':
            if (x < 0) throw new Error('Square root of a negative number is undefined');
            return cleanFloat(Math.sqrt(x));
          case 'cbrt':
            return cleanFloat(Math.cbrt(x));
          case 'log':
            if (x <= 0) throw new Error('Logarithm is undefined for numbers ≤ 0');
            return cleanFloat(Math.log10(x));
          case 'ln':
            if (x <= 0) throw new Error('Natural logarithm (ln) is undefined for numbers ≤ 0');
            return cleanFloat(Math.log(x));
          case 'exp':
            return cleanFloat(Math.exp(x));
          case 'fact':
            return factorial(cleanFloat(x));
          default:
            throw new Error(`Unknown function: ${fnName}`);
        }
      };

      // 4. Recursive-descent parser
      let pos = 0;
      const peek = (): Token | undefined => tokens[pos];
      const consume = (): Token => tokens[pos++];

      const parseExpression = (): number => {
        let left = parseTerm();
        while (pos < tokens.length) {
          const t = peek();
          if (t && t.type === 'OP' && (t.value === '+' || t.value === '-')) {
            consume();
            if (pos >= tokens.length) break; // Ignore trailing + or -
            const right = parseTerm();
            left = t.value === '+' ? left + right : left - right;
          } else {
            break;
          }
        }
        return cleanFloat(left);
      };

      const parseTerm = (): number => {
        let left = parseUnary();
        while (pos < tokens.length) {
          const t = peek();
          if (t && t.type === 'OP' && (t.value === '*' || t.value === '/')) {
            consume();
            if (pos >= tokens.length) break; // Ignore trailing * or /
            const right = parseUnary();
            if (t.value === '/') {
              if (Math.abs(right) < 1e-15) {
                throw new Error('Cannot divide by zero.');
              }
              left = left / right;
            } else {
              left = left * right;
            }
          } else {
            break;
          }
        }
        return left;
      };

      const parseUnary = (): number => {
        const t = peek();
        if (t && t.type === 'OP' && t.value === '+') {
          consume();
          return parseUnary();
        }
        if (t && t.type === 'OP' && t.value === '-') {
          consume();
          return -parseUnary();
        }
        return parsePower();
      };

      const parsePower = (): number => {
        const base = parsePostfix();
        const t = peek();
        if (t && t.type === 'OP' && t.value === '^') {
          consume();
          if (pos >= tokens.length) return base;
          const exponent = parseUnary(); // Right-associative & allows negative exponents like 2^-3
          const res = Math.pow(base, exponent);
          if (isNaN(res)) {
            throw new Error('Invalid exponentiation operation.');
          }
          return cleanFloat(res);
        }
        return base;
      };

      const parsePostfix = (): number => {
        let val = parsePrimary();
        while (pos < tokens.length) {
          const t = peek();
          if (t && t.type === 'OP' && (t.value === '!' || t.value === '%')) {
            consume();
            if (t.value === '!') {
              val = factorial(cleanFloat(val));
            } else {
              val = val / 100;
            }
          } else {
            break;
          }
        }
        return val;
      };

      const parsePrimary = (): number => {
        const t = peek();
        if (!t) {
          throw new Error('Incomplete expression.');
        }

        if (t.type === 'NUMBER') {
          consume();
          return t.value;
        }

        if (t.type === 'IDENT') {
          consume();
          if (t.value === 'pi') return Math.PI;
          if (t.value === 'e') return Math.E;

          const fnName = t.value;
          const nextTok = peek();
          if (nextTok && nextTok.type === 'LPAREN') {
            consume(); // consume '('
            const arg1 = parseExpression();
            if (fnName === 'pow') {
              const commaTok = peek();
              if (commaTok && commaTok.type === 'COMMA') {
                consume();
                const arg2 = parseExpression();
                const closeTok = peek();
                if (closeTok && closeTok.type === 'RPAREN') consume();
                const res = Math.pow(arg1, arg2);
                if (isNaN(res)) throw new Error('Invalid power operation.');
                return cleanFloat(res);
              }
            }
            const closeTok = peek();
            if (closeTok && closeTok.type === 'RPAREN') {
              consume();
            }
            return applyUnaryFunction(fnName, arg1);
          } else {
            // Function followed directly by unary expression without parentheses
            const arg1 = parseUnary();
            return applyUnaryFunction(fnName, arg1);
          }
        }

        if (t.type === 'LPAREN') {
          consume(); // consume '('
          const nextTok = peek();
          if (nextTok && nextTok.type === 'RPAREN') {
            consume();
            return 0;
          }
          const val = parseExpression();
          const closeTok = peek();
          if (closeTok && closeTok.type === 'RPAREN') {
            consume();
          }
          return val;
        }

        throw new Error('Invalid mathematical expression.');
      };

      const val = parseExpression();
      if (pos < tokens.length) {
        // Consume any stray closing parentheses gracefully
        while (pos < tokens.length && tokens[pos].type === 'RPAREN') {
          pos++;
        }
        if (pos < tokens.length) {
          throw new Error('Invalid mathematical syntax.');
        }
      }

      if (typeof val !== 'number' || isNaN(val)) {
        throw new Error('Invalid mathematical expression.');
      }
      if (!isFinite(val)) {
        throw new Error('Result exceeds maximum limit (Infinity/overflow).');
      }

      const cleaned = cleanFloat(val);
      const display = Number.isInteger(cleaned)
        ? cleaned.toString()
        : parseFloat(cleaned.toFixed(10)).toString();

      return { result: cleaned, display };
    },
    []
  );

  // Helper to assemble the complete expression from `expression` and `currentInput`
  const buildFullExpression = useCallback(
    (expr: string, curr: string, isNew: boolean): string => {
      if (curr === 'Error') return '';
      const trimmedExpr = expr.trim();
      if (!trimmedExpr) {
        return closeUnbalancedParens(curr);
      }

      if (isNew) {
        // User has not typed a new operand since the last operator or ')'
        const stripped = trimmedExpr.replace(/[+\-×÷^,\s]+$/, '');
        return closeUnbalancedParens(stripped || curr);
      }

      const balancedCurr = closeUnbalancedParens(curr);
      if (trimmedExpr.endsWith(')')) {
        return closeUnbalancedParens(`${trimmedExpr} × ${balancedCurr}`);
      }
      return closeUnbalancedParens(`${trimmedExpr} ${balancedCurr}`);
    },
    []
  );

  // Live real-time preview computation
  const livePreview = useMemo(() => {
    if (errorMessage) return null;
    if (!expression && isNewInput) return null;

    const fullExpr = buildFullExpression(expression, currentInput, isNewInput);
    if (!fullExpr) return null;

    try {
      const { display } = safeEvaluateMath(fullExpr, angleMode);
      return display;
    } catch {
      return null;
    }
  }, [expression, currentInput, isNewInput, errorMessage, angleMode, buildFullExpression, safeEvaluateMath]);

  // Key press handlers
  const handleDigit = (digit: string) => {
    triggerVibration('click');
    setErrorMessage(null);

    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput(digit);
      setIsNewInput(false);
      return;
    }

    if (isNewInput || currentInput === 'Error') {
      setCurrentInput(digit);
      setIsNewInput(false);
      return;
    }

    setCurrentInput((prev) => {
      if (prev === '0') {
        return digit;
      }
      if (prev.endsWith(')')) {
        return `${prev} × ${digit}`;
      }
      return prev + digit;
    });
    setIsNewInput(false);
  };

  const handleDecimal = () => {
    triggerVibration('click');
    setErrorMessage(null);

    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput('0.');
      setIsNewInput(false);
      return;
    }

    if (isNewInput || currentInput === 'Error') {
      setCurrentInput('0.');
      setIsNewInput(false);
      return;
    }

    setCurrentInput((prev) => {
      // Check only the current trailing number token for an existing decimal point
      const lastNumberSegment = prev.split(/[^0-9.]/).pop() || '';
      if (lastNumberSegment.includes('.')) return prev;
      if (prev.endsWith('(')) return `${prev}0.`;
      if (prev.endsWith(')')) return `${prev} × 0.`;
      return prev + '.';
    });
    setIsNewInput(false);
  };

  const handleOperator = (op: string) => {
    triggerVibration('click');
    setErrorMessage(null);

    if (currentInput === 'Error') {
      setExpression(`0 ${op}`);
      setCurrentInput('0');
      setIsNewInput(true);
      setEvaluatedResult(null);
      return;
    }

    // 1. Chaining immediately after '='
    if (evaluatedResult !== null) {
      setExpression(`${evaluatedResult} ${op}`);
      setCurrentInput(evaluatedResult);
      setEvaluatedResult(null);
      setIsNewInput(true);
      return;
    }

    // 2. User pressed an operator right after another operator or ')' without typing a new number
    if (isNewInput) {
      if (!expression) {
        const startVal = currentInput && currentInput !== 'Error' ? closeUnbalancedParens(currentInput) : '0';
        setExpression(`${startVal} ${op}`);
      } else if (/[+\-×÷^]\s*$/.test(expression)) {
        // Replace the trailing operator with the newly selected operator
        setExpression(expression.replace(/[+\-×÷^]\s*$/, op));
      } else {
        // Expression ends with ')' or a value
        setExpression(`${expression} ${op}`);
      }
      setIsNewInput(true);
      return;
    }

    // 3. User typed a number/expression and now chains with an operator
    const balancedCurr = closeUnbalancedParens(currentInput);
    const combinedExpr = expression
      ? expression.trim().endsWith(')')
        ? `${expression.trim()} × ${balancedCurr}`
        : `${expression.trim()} ${balancedCurr}`
      : balancedCurr;

    const nextExpression = `${combinedExpr} ${op}`;
    setExpression(nextExpression);

    // Show intermediate running value on the display if the expression so far is evaluable
    try {
      if (countUnclosedParens(combinedExpr) === 0) {
        const { display } = safeEvaluateMath(combinedExpr, angleMode);
        setCurrentInput(display);
      } else {
        setCurrentInput('0');
      }
    } catch {
      setCurrentInput('0');
    }

    setIsNewInput(true);
  };

  const handleFunction = (fnName: string) => {
    triggerVibration('click');
    setErrorMessage(null);

    if (fnName === 'pow') {
      handleOperator('^');
      return;
    }

    const activeVal =
      currentInput === 'Error' ? '0' : evaluatedResult !== null ? evaluatedResult : currentInput;

    // Postfix / immediate-wrap functions: sq (x²), cube (x³), reciprocal (1/x), factorial (n!)
    if (fnName === 'sq' || fnName === 'cube' || fnName === 'reciprocal' || fnName === 'factorial') {
      const target = closeUnbalancedParens(activeVal || '0');
      if (evaluatedResult !== null) {
        setExpression('');
        setEvaluatedResult(null);
      }
      if (fnName === 'sq') {
        setCurrentInput(`pow(${target},2)`);
      } else if (fnName === 'cube') {
        setCurrentInput(`pow(${target},3)`);
      } else if (fnName === 'reciprocal') {
        setCurrentInput(`(1/(${target}))`);
      } else if (fnName === 'factorial') {
        setCurrentInput(`(${target})!`);
      }
      setIsNewInput(false);
      return;
    }

    // Standard prefix/wrapping scientific functions: sin, cos, tan, asin, acos, atan, ln, log, exp, sinh, cosh, tanh, sqrt, cbrt
    if (evaluatedResult !== null) {
      // Wrap the evaluated result so user can immediately press '=' or chain '+ ...'
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput(`${fnName}(${evaluatedResult})`);
      setIsNewInput(false);
      return;
    }

    if (isNewInput) {
      // User hasn't typed a number yet -> open function call `fnName(` so they can type the argument next
      setCurrentInput(`${fnName}(`);
      setIsNewInput(false);
      return;
    }

    // User is in the middle of typing currentInput
    setCurrentInput((prev) => {
      if (prev.endsWith('(')) {
        // Nested function call, e.g. sin(cos(
        return `${prev}${fnName}(`;
      }
      // Wrap the already-typed value with balanced parentheses, e.g. 30 -> sin(30)
      const closed = closeUnbalancedParens(prev);
      return `${fnName}(${closed})`;
    });
    setIsNewInput(false);
  };

  const handleConstant = (constant: string) => {
    triggerVibration('click');
    setErrorMessage(null);

    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput(constant);
      setIsNewInput(false);
      return;
    }

    if (!isNewInput && currentInput !== 'Error') {
      if (currentInput.endsWith('(')) {
        setCurrentInput(`${currentInput}${constant}`);
      } else {
        setCurrentInput(`${currentInput} × ${constant}`);
      }
      setIsNewInput(false);
      return;
    }

    setCurrentInput(constant);
    setIsNewInput(false);
  };

  const handleParenthesis = (p: '(' | ')') => {
    triggerVibration('click');
    setErrorMessage(null);

    if (p === '(') {
      if (evaluatedResult !== null) {
        setExpression(`${evaluatedResult} × (`);
        setEvaluatedResult(null);
        setCurrentInput('0');
        setIsNewInput(true);
        return;
      }

      if (!isNewInput && currentInput !== 'Error') {
        if (currentInput.endsWith('(')) {
          setCurrentInput((prev) => `${prev}(`);
          return;
        }
        // e.g. user typed `2` then `(` -> `2 × (`
        const closedCurr = closeUnbalancedParens(currentInput);
        setExpression((prev) => (prev ? `${prev} ${closedCurr} × (` : `${closedCurr} × (`));
        setCurrentInput('0');
        setIsNewInput(true);
        return;
      }

      setExpression((prev) => {
        if (!prev) return '(';
        if (prev.trim().endsWith(')')) return `${prev.trim()} × (`;
        return `${prev} (`;
      });
      setCurrentInput('0');
      setIsNewInput(true);
    } else {
      // Closing parenthesis ')'
      if (!isNewInput && countUnclosedParens(currentInput) > 0) {
        setCurrentInput((prev) => `${prev})`);
        return;
      }

      const openInExpr = countUnclosedParens(expression);
      if (openInExpr <= 0) {
        // Ignore unmatched ')'
        return;
      }

      if (!isNewInput && currentInput !== 'Error') {
        const closedCurr = closeUnbalancedParens(currentInput);
        setExpression((prev) => `${prev} ${closedCurr})`.trim());
        setCurrentInput('0');
        setIsNewInput(true);
      } else {
        setExpression((prev) => {
          const cleaned = prev.replace(/[+\-×÷^]\s*$/, '').trim();
          return `${cleaned})`;
        });
        setCurrentInput('0');
        setIsNewInput(true);
      }
    }
  };

  const handleToggleSign = () => {
    triggerVibration('click');
    setErrorMessage(null);

    if (currentInput === 'Error') {
      setCurrentInput('0');
      setIsNewInput(true);
      return;
    }

    setCurrentInput((prev) => {
      if (prev === '0') return '0';
      const toggled = prev.startsWith('-') ? prev.substring(1) : `-${prev}`;
      if (evaluatedResult !== null) {
        setEvaluatedResult(toggled);
      }
      return toggled;
    });
    setIsNewInput(false);
  };

  const handlePercent = () => {
    triggerVibration('click');
    setErrorMessage(null);
    if (currentInput === 'Error') return;

    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
    }
    setCurrentInput((prev) => `${closeUnbalancedParens(prev)}%`);
    setIsNewInput(false);
  };

  const handleBackspace = () => {
    triggerVibration('click');
    setErrorMessage(null);

    if (evaluatedResult !== null) {
      setEvaluatedResult(null);
      setIsNewInput(false);
    }

    setCurrentInput((prev) => {
      if (prev.length <= 1 || prev === 'Error') {
        setIsNewInput(true);
        return '0';
      }
      return prev.slice(0, -1);
    });
  };

  const handleClearAll = () => {
    triggerVibration('reset');
    setExpression('');
    setCurrentInput('0');
    setIsNewInput(true);
    setEvaluatedResult(null);
    setErrorMessage(null);
  };

  const handleClearEntry = () => {
    triggerVibration('click');
    setCurrentInput('0');
    setIsNewInput(true);
    setErrorMessage(null);
  };

  // Memory handlers
  const handleMemory = (action: 'MC' | 'MR' | 'M+' | 'M-' | 'MS') => {
    triggerVibration('click');
    let currentVal = 0;
    try {
      const target = evaluatedResult || currentInput;
      if (target && target !== 'Error') {
        const { result } = safeEvaluateMath(target, angleMode);
        currentVal = result;
      }
    } catch {
      currentVal = parseFloat(evaluatedResult || currentInput) || 0;
    }

    switch (action) {
      case 'MC':
        setMemoryValue(0);
        setHasMemory(false);
        break;
      case 'MR':
        if (hasMemory) {
          setErrorMessage(null);
          if (evaluatedResult !== null) {
            setExpression('');
            setEvaluatedResult(null);
          }
          setCurrentInput(memoryValue.toString());
          setIsNewInput(false);
        }
        break;
      case 'M+':
        setMemoryValue((prev) => cleanFloat(prev + currentVal));
        setHasMemory(true);
        break;
      case 'M-':
        setMemoryValue((prev) => cleanFloat(prev - currentVal));
        setHasMemory(true);
        break;
      case 'MS':
        setMemoryValue(cleanFloat(currentVal));
        setHasMemory(true);
        break;
    }
  };

  // Main Equal Evaluation
  const handleEqual = () => {
    triggerVibration('click');
    setErrorMessage(null);

    if (currentInput === 'Error') {
      handleClearAll();
      return;
    }

    const fullExpr = buildFullExpression(expression, currentInput, isNewInput);
    if (!fullExpr) return;

    try {
      const { display } = safeEvaluateMath(fullExpr, angleMode);
      setEvaluatedResult(display);
      setCurrentInput(display);
      setExpression('');
      setIsNewInput(true);
      triggerVibration('success');

      // Add to internal session tape
      setLocalTape((prev) => [
        {
          expr: fullExpr,
          res: display,
          time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
        ...prev.slice(0, 19),
      ]);
    } catch (err: any) {
      triggerVibration('error');
      setErrorMessage(err.message || 'Error: Invalid calculation');
      setCurrentInput('Error');
      setEvaluatedResult(null);
      setIsNewInput(true);
    }
  };

  const handleCopy = () => {
    const textToCopy = evaluatedResult || currentInput;
    if (!textToCopy || textToCopy === 'Error') return;
    navigator.clipboard?.writeText(textToCopy);
    setCopied(true);
    triggerVibration('click');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToHistory = () => {
    const res = evaluatedResult || currentInput;
    if (!res || res === 'Error') return;

    const lastTape = localTape[0];
    const details = lastTape ? `${lastTape.expr} (${angleMode})` : `Scientific Math Calculation (${angleMode})`;
    onSaveHistory('Calculator', details, `= ${res}`);
    setSaved(true);
    triggerVibration('success');
    setTimeout(() => setSaved(false), 2000);
  };

  // Keyboard Shortcuts Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing inside an input field
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key >= '0' && e.key <= '9') {
        handleDigit(e.key);
      } else if (e.key === '.') {
        handleDecimal();
      } else if (e.key === '+') {
        handleOperator('+');
      } else if (e.key === '-') {
        handleOperator('−');
      } else if (e.key === '*') {
        handleOperator('×');
      } else if (e.key === '/') {
        e.preventDefault();
        handleOperator('÷');
      } else if (e.key === '^') {
        handleOperator('^');
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        handleEqual();
      } else if (e.key === 'Backspace') {
        handleBackspace();
      } else if (e.key === 'Escape') {
        handleClearAll();
      } else if (e.key === '(' || e.key === ')') {
        handleParenthesis(e.key);
      } else if (e.key === '%') {
        handlePercent();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  return (
    <div className="w-full max-w-4xl mx-auto space-y-2 sm:space-y-4">
      {/* Main Calculator Body */}
      <div className="bg-white rounded-2xl sm:rounded-3xl p-2.5 sm:p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 space-y-1.5 sm:space-y-3">
        {/* LCD / Display Screen */}
        <div className="bg-slate-900 rounded-xl sm:rounded-2xl p-2.5 sm:p-4 md:p-5 text-white shadow-inner relative overflow-hidden border border-slate-800">
          <div className="flex items-center justify-between text-[11px] sm:text-xs text-slate-400 font-mono mb-0.5 sm:mb-1.5">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <button
                type="button"
                onClick={() => {
                  setAngleMode((prev) => (prev === 'DEG' ? 'RAD' : 'DEG'));
                  triggerVibration('click');
                }}
                className={`px-1.5 sm:px-2 py-0.5 rounded text-[9px] sm:text-[10px] font-bold transition-colors cursor-pointer ${
                  angleMode === 'DEG' ? 'bg-indigo-600 text-white' : 'bg-slate-700 text-slate-300'
                }`}
                title="Toggle between Degrees and Radians"
              >
                {angleMode}
              </button>
              {hasMemory && (
                <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] sm:text-[10px] font-bold">
                  M
                </span>
              )}
              {isSecondFunction && (
                <span className="px-1.5 py-0.5 rounded bg-purple-500/30 text-purple-300 text-[9px] sm:text-[10px] font-bold">
                  2nd
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
                className={`flex items-center gap-1 text-[10px] sm:text-[11px] font-sans font-bold py-0.5 px-2 rounded transition-colors cursor-pointer border whitespace-nowrap shrink-0 ${
                  calculatorView === 'scientific'
                    ? 'bg-indigo-600 hover:bg-indigo-500 text-white border-indigo-500/60'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
                }`}
                title="Switch between Normal and Scientific calculator"
              >
                {calculatorView === 'scientific' ? (
                  <>
                    <Minimize2 className="w-3 h-3" />
                    <span>Normal</span>
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
                className="text-slate-400 hover:text-white flex items-center gap-1 text-[10px] sm:text-[11px] transition-colors cursor-pointer py-0.5 px-1.5 rounded hover:bg-slate-800 whitespace-nowrap shrink-0"
                title="View recent calculation history tape"
              >
                <History className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                <span>Tape ({localTape.length})</span>
              </button>
            </div>
          </div>

          {/* Active Expression Line */}
          <div className="text-slate-400 font-mono tabular-nums text-[11px] sm:text-sm min-h-[1rem] sm:min-h-[1.25rem] overflow-x-auto whitespace-nowrap text-right tracking-wide scrollbar-none">
            {expression || ' '}
          </div>

          {/* Current Input / Main Display */}
          <div className="text-xl sm:text-3xl md:text-4xl font-mono tabular-nums font-bold text-right text-white tracking-tight overflow-x-auto whitespace-nowrap scrollbar-none py-0.5">
            {currentInput}
          </div>

          {/* Display Footer Bar (Selected left status element removed) */}
          <div className="mt-1 pt-1 border-t border-slate-800 flex items-center justify-end min-h-[1.25rem] sm:min-h-[1.5rem] text-[11px] sm:text-xs font-mono">
            {/* Quick Action Icons (Copy) */}
            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={handleCopy}
                className="p-1 sm:p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
                title="Copy current value"
              >
                {copied ? <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" /> : <Copy className="w-3 h-3 sm:w-3.5 sm:h-3.5" />}
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
              className="bg-slate-50 rounded-2xl p-2.5 sm:p-4 border border-slate-200/80 overflow-hidden"
            >
              <div className="flex items-center justify-between mb-1.5 sm:mb-2.5 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <span>Recent Tape Records</span>
                <button
                  type="button"
                  onClick={() => setLocalTape([])}
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
                        setErrorMessage(null);
                        setEvaluatedResult(null);
                        setCurrentInput(item.res);
                        setIsNewInput(false);
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

        {/* Memory Bar */}
        <div className="grid grid-cols-5 gap-1 sm:gap-2">
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
              className={`py-1 sm:py-1.5 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold transition-all ${
                btn.disabled
                  ? 'bg-slate-50 text-slate-300 cursor-not-allowed border border-slate-100'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700 active:scale-95 border border-slate-200/60 cursor-pointer'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Unified 4-Column Keypad Grid (Fits Mobile Viewport Without Scrolling) */}
        <div className="grid grid-cols-4 gap-1 sm:gap-2">
          {/* Compact 4-Column Scientific Function Rows */}
          {calculatorView === 'scientific' && (
            <>
              {/* Scientific Row 1: 2nd, sin/asin, cos/acos, tan/atan */}
              <button
                type="button"
                onClick={() => {
                  setIsSecondFunction((prev) => !prev);
                  triggerVibration('click');
                }}
                className={`py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold transition-all border cursor-pointer active:scale-95 ${
                  isSecondFunction
                    ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200/80'
                }`}
              >
                2nd
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'asin' : 'sin')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'sin⁻¹' : 'sin'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'acos' : 'cos')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'cos⁻¹' : 'cos'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'atan' : 'tan')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'tan⁻¹' : 'tan'}
              </button>

              {/* Scientific Row 2: ln/exp, log/sinh, sqrt/cbrt, x²/x³ */}
              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'exp' : 'ln')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'eˣ' : 'ln'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'sinh' : 'log')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'sinh' : 'log'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'cbrt' : 'sqrt')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? '∛x' : '√x'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'cube' : 'sq')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'x³' : 'x²'}
              </button>

              {/* Scientific Row 3: xʸ/cosh, 1/x/tanh, (, ) */}
              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'cosh' : 'pow')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'cosh' : 'xʸ'}
              </button>

              <button
                type="button"
                onClick={() => handleFunction(isSecondFunction ? 'tanh' : 'reciprocal')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-100 transition-all active:scale-95 cursor-pointer"
              >
                {isSecondFunction ? 'tanh' : '1/x'}
              </button>

              <button
                type="button"
                onClick={() => handleParenthesis('(')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                (
              </button>

              <button
                type="button"
                onClick={() => handleParenthesis(')')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                )
              </button>

              {/* Scientific Row 4: π, e, n!, ± */}
              <button
                type="button"
                onClick={() => handleConstant('π')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                π
              </button>

              <button
                type="button"
                onClick={() => handleConstant('e')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                e
              </button>

              <button
                type="button"
                onClick={() => handleFunction('factorial')}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                n!
              </button>

              <button
                type="button"
                onClick={handleToggleSign}
                className="py-1.5 sm:py-2.5 rounded-xl text-[11px] sm:text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
              >
                ±
              </button>
            </>
          )}

          {/* Standard Numeric & Arithmetic Keypad (4 Columns) */}
          {/* Row 1: AC, CE, %, ÷ */}
          <button
            type="button"
            onClick={handleClearAll}
            className="py-2 sm:py-3 rounded-xl text-xs sm:text-sm font-black bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 transition-all active:scale-95 cursor-pointer"
          >
            AC
          </button>

          <button
            type="button"
            onClick={handleClearEntry}
            className="py-2 sm:py-3 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
          >
            CE
          </button>

          <button
            type="button"
            onClick={handlePercent}
            className="py-2 sm:py-3 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 transition-all active:scale-95 cursor-pointer"
          >
            %
          </button>

          <button
            type="button"
            onClick={() => handleOperator('÷')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-base font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer"
          >
            ÷
          </button>

          {/* Row 2: 7, 8, 9, × */}
          <button
            type="button"
            onClick={() => handleDigit('7')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            7
          </button>

          <button
            type="button"
            onClick={() => handleDigit('8')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            8
          </button>

          <button
            type="button"
            onClick={() => handleDigit('9')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            9
          </button>

          <button
            type="button"
            onClick={() => handleOperator('×')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-base font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer"
          >
            ×
          </button>

          {/* Row 3: 4, 5, 6, − */}
          <button
            type="button"
            onClick={() => handleDigit('4')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            4
          </button>

          <button
            type="button"
            onClick={() => handleDigit('5')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            5
          </button>

          <button
            type="button"
            onClick={() => handleDigit('6')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            6
          </button>

          <button
            type="button"
            onClick={() => handleOperator('−')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-base font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer"
          >
            −
          </button>

          {/* Row 4: 1, 2, 3, + */}
          <button
            type="button"
            onClick={() => handleDigit('1')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            1
          </button>

          <button
            type="button"
            onClick={() => handleDigit('2')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            2
          </button>

          <button
            type="button"
            onClick={() => handleDigit('3')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            3
          </button>

          <button
            type="button"
            onClick={() => handleOperator('+')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-base font-black bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200/80 transition-all active:scale-95 cursor-pointer"
          >
            +
          </button>

          {/* Row 5: 0, ., Backspace, = */}
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDecimal}
            className="py-2 sm:py-3 rounded-xl text-sm sm:text-lg font-bold bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200/60 transition-all active:scale-95 cursor-pointer"
          >
            .
          </button>

          <button
            type="button"
            onClick={handleBackspace}
            className="py-2 sm:py-3 rounded-xl text-xs sm:text-sm font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200/80 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            aria-label="Backspace"
          >
            <Delete className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
          </button>

          <button
            type="button"
            onClick={handleEqual}
            className="py-2 sm:py-3 rounded-xl text-base sm:text-lg font-black bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 text-white shadow-md shadow-indigo-200 flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            aria-label="Equals"
          >
            <Equal className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
