'use client';

import React, { useState, useMemo, useCallback, useEffect } from 'react';
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

interface ScientificCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: string, details: string, result: string) => void;
}

type AngleMode = 'DEG' | 'RAD';

// Floating point sanitizer to remove IEEE 754 precision artifacts
function cleanFloat(val: number): number {
  if (Math.abs(val) < 1e-12) return 0;
  const factor = 1e10;
  return Math.round(val * factor) / factor;
}

// Factorial computation with strict validation
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
  | { type: 'OP'; value: '+' | '-' | '*' | '/' | '^' | '!' | '%' | 'mod' | 'yroot' }
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

// Check if a string is a simple number or constant suitable for direct exponentiation without wrapping parens
function isAtomicOperand(str: string): boolean {
  return /^-?(\d+(\.\d+)?(E[+-]?\d+)?|π|e|Ans)$/.test(str.trim());
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
  const [lastAnswer, setLastAnswer] = useState<string>('0');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [angleMode, setAngleMode] = useState<AngleMode>('DEG');
  const [isSecondFunction, setIsSecondFunction] = useState<boolean>(false);
  const [isHyperbolic, setIsHyperbolic] = useState<boolean>(false);
  const [calculatorView, setCalculatorView] = useState<'scientific' | 'standard'>('scientific');
  const [memoryValue, setMemoryValue] = useState<number>(0);
  const [hasMemory, setHasMemory] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [localTape, setLocalTape] = useState<Array<{ expr: string; res: string; time: string }>>([]);
  const [showTape, setShowTape] = useState<boolean>(false);

  // Safe mathematical tokenizer + recursive-descent parser with strict domain checks
  const safeEvaluateMath = useCallback(
    (
      rawExpr: string,
      currentAngle: AngleMode,
      ansValueStr: string = '0'
    ): { result: number; display: string } => {
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
      normalized = normalized.replace(/(?:\bmod\b|\byroot\b|[+\-*/^,\s])+$/i, '').trim();
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

        // Number literal (including decimals and scientific notation like 5E3, 1.2E-4, 1e+21)
        if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(normalized[i + 1]))) {
          let numStr = '';
          while (i < len && /[\d.]/.test(normalized[i])) {
            numStr += normalized[i++];
          }
          // Uppercase E scientific notation (e.g. 5E3, 5E-3, 5E+3) or lowercase e+/-digits
          if (i < len && (normalized[i] === 'E' || normalized[i] === 'e')) {
            const nextCh = i + 1 < len ? normalized[i + 1] : '';
            const afterSignCh = i + 2 < len ? normalized[i + 2] : '';
            const isExplicitSignedExp = (nextCh === '+' || nextCh === '-') && /\d/.test(afterSignCh);
            const isUppercaseUnsignedExp = normalized[i] === 'E' && /\d/.test(nextCh);

            if (isExplicitSignedExp || isUppercaseUnsignedExp) {
              numStr += normalized[i++]; // 'E' or 'e'
              if (normalized[i] === '+' || normalized[i] === '-') {
                numStr += normalized[i++];
              }
              while (i < len && /\d/.test(normalized[i])) {
                numStr += normalized[i++];
              }
            }
          }
          const parsedNum = Number(numStr);
          if (isNaN(parsedNum)) {
            throw new Error(`Invalid number: ${numStr}`);
          }
          rawTokens.push({ type: 'NUMBER', value: parsedNum });
          continue;
        }

        // Identifiers (functions, operators like mod/yroot, and constants: sin, cos, pi, e, ans, etc.)
        if (/[a-zA-Z_]/.test(ch)) {
          let ident = '';
          while (i < len && /[a-zA-Z0-9_]/.test(normalized[i])) {
            ident += normalized[i++];
          }
          const lower = ident.toLowerCase();
          if (lower === 'mod') {
            rawTokens.push({ type: 'OP', value: 'mod' });
          } else if (lower === 'yroot') {
            rawTokens.push({ type: 'OP', value: 'yroot' });
          } else {
            rawTokens.push({ type: 'IDENT', value: lower });
          }
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
      // e.g. 2pi, 2(3), (2)(3), 2sin(30), sin(30)cos(60), 5!2, 2Ans
      const tokens: Token[] = [];
      for (let idx = 0; idx < rawTokens.length; idx++) {
        const curr = rawTokens[idx];
        if (idx > 0) {
          const prev = rawTokens[idx - 1];
          const prevIsValueEnd =
            prev.type === 'NUMBER' ||
            prev.type === 'RPAREN' ||
            (prev.type === 'IDENT' && (prev.value === 'pi' || prev.value === 'e' || prev.value === 'ans')) ||
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
            if (x < -1 || x > 1) throw new Error('sin⁻¹ input must be between -1 and 1');
            return cleanFloat(fromRad(Math.asin(x)));
          case 'acos':
            if (x < -1 || x > 1) throw new Error('cos⁻¹ input must be between -1 and 1');
            return cleanFloat(fromRad(Math.acos(x)));
          case 'atan':
            return cleanFloat(fromRad(Math.atan(x)));
          case 'sinh':
            return cleanFloat(Math.sinh(x));
          case 'cosh':
            return cleanFloat(Math.cosh(x));
          case 'tanh':
            return cleanFloat(Math.tanh(x));
          case 'asinh':
            return cleanFloat(Math.asinh(x));
          case 'acosh':
            if (x < 1) throw new Error('cosh⁻¹ input must be ≥ 1');
            return cleanFloat(Math.acosh(x));
          case 'atanh':
            if (x <= -1 || x >= 1) throw new Error('tanh⁻¹ input must be strictly between -1 and 1');
            return cleanFloat(Math.atanh(x));
          case 'sqrt':
            if (x < 0) throw new Error('Square root of a negative number is undefined');
            return cleanFloat(Math.sqrt(x));
          case 'cbrt':
            return cleanFloat(Math.cbrt(x));
          case 'log':
            if (x <= 0) throw new Error('Logarithm (log) is undefined for numbers ≤ 0');
            return cleanFloat(Math.log10(x));
          case 'log2':
            if (x <= 0) throw new Error('Logarithm (log₂) is undefined for numbers ≤ 0');
            return cleanFloat(Math.log2(x));
          case 'ln':
            if (x <= 0) throw new Error('Natural logarithm (ln) is undefined for numbers ≤ 0');
            return cleanFloat(Math.log(x));
          case 'exp':
            return cleanFloat(Math.exp(x));
          case 'tenpow':
            return cleanFloat(Math.pow(10, x));
          case 'twopow':
            return cleanFloat(Math.pow(2, x));
          case 'abs':
            return cleanFloat(Math.abs(x));
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
            if (pos >= tokens.length) break;
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
          if (t && t.type === 'OP' && (t.value === '*' || t.value === '/' || t.value === 'mod')) {
            consume();
            if (pos >= tokens.length) break;
            const right = parseUnary();
            if (t.value === '/') {
              if (Math.abs(right) < 1e-15) {
                throw new Error('Cannot divide by zero.');
              }
              left = left / right;
            } else if (t.value === 'mod') {
              if (Math.abs(right) < 1e-15) {
                throw new Error('Modulo by zero is undefined.');
              }
              left = left % right;
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
        if (t && t.type === 'OP' && (t.value === '^' || t.value === 'yroot')) {
          consume();
          if (pos >= tokens.length) return base;
          const exponent = parseUnary();
          if (t.value === 'yroot') {
            if (Math.abs(exponent) < 1e-15) {
              throw new Error('Root degree cannot be zero.');
            }
            if (base < 0) {
              if (Number.isInteger(exponent) && Math.abs(exponent % 2) === 1) {
                return cleanFloat(-Math.pow(-base, 1 / exponent));
              }
              throw new Error('Even root of a negative number is undefined.');
            }
            return cleanFloat(Math.pow(base, 1 / exponent));
          }
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
          if (t.value === 'ans') {
            const parsedAns = Number(ansValueStr);
            return isNaN(parsedAns) ? 0 : parsedAns;
          }

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
            const arg1 = parseUnary();
            return applyUnaryFunction(fnName, arg1);
          }
        }

        if (t.type === 'LPAREN') {
          consume();
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

  // Assemble complete expression from `expression` and `currentInput`
  const buildFullExpression = useCallback(
    (expr: string, curr: string, isNew: boolean): string => {
      if (curr === 'Error') return '';
      const trimmedExpr = expr.trim();
      if (!trimmedExpr) {
        return closeUnbalancedParens(curr);
      }

      if (isNew) {
        const stripped = trimmedExpr.replace(/(?:\bmod\b|\byroot\b|[+\-×÷^,\s])+$/i, '').trim();
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
      const { display } = safeEvaluateMath(fullExpr, angleMode, lastAnswer);
      // Avoid redundant preview when current input is already the exact same single number
      if (!expression && display === currentInput) return null;
      return display;
    } catch {
      return null;
    }
  }, [expression, currentInput, isNewInput, errorMessage, angleMode, lastAnswer, buildFullExpression, safeEvaluateMath]);

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
      if (prev.endsWith(')') || prev.endsWith('π') || prev.endsWith('Ans') || (prev.endsWith('e') && !prev.endsWith('E'))) {
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
      // Do not insert decimal inside scientific notation exponent
      if (/E[+-]?\d*$/.test(prev)) return prev;
      const lastNumberSegment = prev.split(/[^0-9.]/).pop() || '';
      if (lastNumberSegment.includes('.')) return prev;
      if (prev.endsWith('(')) return `${prev}0.`;
      if (prev.endsWith(')') || prev.endsWith('π') || prev.endsWith('Ans')) return `${prev} × 0.`;
      return prev + '.';
    });
    setIsNewInput(false);
  };

  const handleScientificExponent = () => {
    triggerVibration('click');
    setErrorMessage(null);

    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput(`${evaluatedResult}E`);
      setIsNewInput(false);
      return;
    }

    if (isNewInput || currentInput === 'Error') {
      setCurrentInput('1E');
      setIsNewInput(false);
      return;
    }

    setCurrentInput((prev) => {
      if (/E[+-]?\d*$/.test(prev)) return prev;
      if (/\d$/.test(prev)) return `${prev}E`;
      if (prev.endsWith('(')) return `${prev}1E`;
      return `${prev} × 1E`;
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

    // 2. User pressed an operator right after another operator or '(' / ')' without typing a new number
    if (isNewInput) {
      if (!expression) {
        const startVal = currentInput && currentInput !== 'Error' ? closeUnbalancedParens(currentInput) : '0';
        setExpression(`${startVal} ${op}`);
      } else if (/(?:\bmod|\byroot|[+\-×÷^])\s*$/.test(expression)) {
        setExpression(expression.replace(/(?:\bmod|\byroot|[+\-×÷^])\s*$/, op));
      } else {
        setExpression(`${expression} ${op}`);
      }
      setIsNewInput(true);
      return;
    }

    // Strip dangling 'E' or 'E-' if user directly hits an operator
    const cleanedCurr = currentInput.replace(/E[+-]?$/, '');
    const balancedCurr = closeUnbalancedParens(cleanedCurr || '0');
    const combinedExpr = expression
      ? expression.trim().endsWith(')')
        ? `${expression.trim()} × ${balancedCurr}`
        : `${expression.trim()} ${balancedCurr}`
      : balancedCurr;

    const nextExpression = `${combinedExpr} ${op}`;
    setExpression(nextExpression);

    try {
      if (countUnclosedParens(combinedExpr) === 0) {
        const { display } = safeEvaluateMath(combinedExpr, angleMode, lastAnswer);
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
    if (fnName === 'yroot') {
      handleOperator('yroot');
      return;
    }

    const activeVal =
      currentInput === 'Error' ? '0' : evaluatedResult !== null ? evaluatedResult : currentInput;

    // Immediate unary/postfix wrappers
    if (fnName === 'sq' || fnName === 'cube' || fnName === 'reciprocal' || fnName === 'factorial') {
      const cleanedTarget = closeUnbalancedParens((activeVal || '0').replace(/E[+-]?$/, '') || '0');
      const wrappedBase = isAtomicOperand(cleanedTarget) ? cleanedTarget : `(${cleanedTarget})`;

      if (evaluatedResult !== null) {
        setExpression('');
        setEvaluatedResult(null);
      }

      if (fnName === 'sq') {
        setCurrentInput(`${wrappedBase}^2`);
      } else if (fnName === 'cube') {
        setCurrentInput(`${wrappedBase}^3`);
      } else if (fnName === 'reciprocal') {
        setCurrentInput(`1/(${cleanedTarget})`);
      } else if (fnName === 'factorial') {
        setCurrentInput(`${wrappedBase}!`);
      }
      setIsNewInput(false);
      return;
    }

    // Immediate prefix exponential wrappers: 10^x, 2^x, e^x
    if (fnName === 'tenpow' || fnName === 'twopow' || fnName === 'exp') {
      const prefix = fnName === 'tenpow' ? '10^(' : fnName === 'twopow' ? '2^(' : 'exp(';
      if (evaluatedResult !== null) {
        setExpression('');
        setEvaluatedResult(null);
        setCurrentInput(`${prefix}${evaluatedResult})`);
        setIsNewInput(false);
        return;
      }
      if (isNewInput) {
        setCurrentInput(prefix);
        setIsNewInput(false);
        return;
      }
      setCurrentInput((prev) => {
        if (prev.endsWith('(')) return `${prev}${prefix}`;
        const closed = closeUnbalancedParens(prev);
        return `${prefix}${closed})`;
      });
      setIsNewInput(false);
      return;
    }

    // Standard prefix functions: sin, cos, tan, asin, acos, atan, sinh, cosh, tanh, asinh, acosh, atanh, ln, log, sqrt, cbrt, abs
    if (evaluatedResult !== null) {
      setExpression('');
      setEvaluatedResult(null);
      setCurrentInput(`${fnName}(${evaluatedResult})`);
      setIsNewInput(false);
      return;
    }

    if (isNewInput) {
      setCurrentInput(`${fnName}(`);
      setIsNewInput(false);
      return;
    }

    setCurrentInput((prev) => {
      if (prev.endsWith('(')) {
        return `${prev}${fnName}(`;
      }
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
        return;
      }

      const closedCurr = !isNewInput && currentInput !== 'Error' ? closeUnbalancedParens(currentInput) : '';
      const nextExpr = closedCurr
        ? `${expression} ${closedCurr})`.trim()
        : `${expression.replace(/(?:\bmod|\byroot|[+\-×÷^])\s*$/, '').trim()})`;

      setExpression(nextExpr);

      // Evaluate the closed parenthesized sub-expression so the display shows a helpful value instead of 0
      try {
        // Find matching '(' for the just-appended ')'
        let depth = 0;
        let matchIdx = -1;
        for (let idx = nextExpr.length - 1; idx >= 0; idx--) {
          if (nextExpr[idx] === ')') depth++;
          else if (nextExpr[idx] === '(') {
            depth--;
            if (depth === 0) {
              matchIdx = idx;
              break;
            }
          }
        }
        if (matchIdx !== -1) {
          const subExpr = nextExpr.slice(matchIdx);
          const { display } = safeEvaluateMath(subExpr, angleMode, lastAnswer);
          setCurrentInput(display);
        } else {
          setCurrentInput('0');
        }
      } catch {
        setCurrentInput('0');
      }
      setIsNewInput(true);
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
      // Support toggling sign of scientific notation exponent (e.g. 5E3 -> 5E-3)
      const expMatch = prev.match(/^(.*E)([+-]?)(\d*)$/);
      if (expMatch) {
        const [, prefix, sign, digits] = expMatch;
        const nextSign = sign === '-' ? '' : '-';
        return `${prefix}${nextSign}${digits}`;
      }
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
      // Remove entire trailing function call prefix (e.g. 'sin(', 'asinh(', '10^(') in one press
      const fnMatch = prev.match(/(asinh|acosh|atanh|sinh|cosh|tanh|asin|acos|atan|sin|cos|tan|sqrt|cbrt|log2|log|ln|abs|exp|10\^|2\^)\($/);
      if (fnMatch) {
        const sliced = prev.slice(0, -fnMatch[0].length);
        if (!sliced) {
          setIsNewInput(true);
          return '0';
        }
        return sliced;
      }
      if (prev.endsWith('Ans')) {
        const sliced = prev.slice(0, -3);
        if (!sliced) {
          setIsNewInput(true);
          return '0';
        }
        return sliced;
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
        const { result } = safeEvaluateMath(target, angleMode, lastAnswer);
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
      const { display } = safeEvaluateMath(fullExpr, angleMode, lastAnswer);
      setEvaluatedResult(display);
      setLastAnswer(display);
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
      setErrorMessage(err.message || 'Invalid mathematical expression');
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
    const res = livePreview || evaluatedResult || currentInput;
    if (!res || res === 'Error') return;

    const lastTape = localTape[0];
    const exprText =
      evaluatedResult !== null && lastTape && lastTape.res === evaluatedResult
        ? lastTape.expr
        : expression || !isNewInput
        ? buildFullExpression(expression, currentInput, isNewInput)
        : currentInput;

    const modeLabel = calculatorView === 'scientific' ? 'Scientific' : 'Standard';
    const memoryLabel = hasMemory ? `${memoryValue}` : 'None';
    const details = `Expression: ${exprText} | Angle Mode: ${angleMode} | View Mode: ${modeLabel} | Memory: ${memoryLabel}`;
    onSaveHistory('Calculator', details, `= ${res}`);
    setSaved(true);
    triggerVibration('success');
    setTimeout(() => setSaved(false), 2000);
  };

  // Keyboard Shortcuts Support
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
                  setAngleMode((prev) => (prev === 'DEG' ? 'RAD' : 'DEG'));
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
                  setAngleMode((prev) => (prev === 'DEG' ? 'RAD' : 'DEG'));
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
