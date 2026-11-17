export type AngleMode = 'DEG' | 'RAD';

export interface TapeEntry {
  id?: string;
  expr: string;
  res: string;
  time: string;
}

export interface CalcState {
  expression: string;
  currentInput: string;
  isNewInput: boolean;
  evaluatedResult: string | null;
  lastAnswer: string;
  lastBinaryOp: { op: string; operand: string } | null;
  errorMessage: string | null;
  angleMode: AngleMode;
  memoryValue: number;
  hasMemory: boolean;
  tape: TapeEntry[];
}

export type CalcAction =
  | { type: 'DIGIT'; digit: string }
  | { type: 'DECIMAL' }
  | { type: 'SCI_EXP' }
  | { type: 'OPERATOR'; op: string }
  | { type: 'FUNCTION'; fnName: string }
  | { type: 'CONSTANT'; constant: string }
  | { type: 'PAREN'; paren: '(' | ')' }
  | { type: 'TOGGLE_SIGN' }
  | { type: 'PERCENT' }
  | { type: 'BACKSPACE' }
  | { type: 'CLEAR_ALL' }
  | { type: 'CLEAR_ENTRY' }
  | { type: 'EQUAL'; timeStr: string }
  | { type: 'TOGGLE_ANGLE' }
  | { type: 'MEMORY'; action: 'MC' | 'MR' | 'M+' | 'M-' | 'MS' }
  | { type: 'LOAD_TAPE'; res: string }
  | { type: 'ADD_TAPE'; expr: string; res: string; timeStr: string }
  | { type: 'HYDRATE_TAPE'; tape: TapeEntry[] }
  | { type: 'CLEAR_TAPE' };

export const INITIAL_CALC_STATE: CalcState = {
  expression: '',
  currentInput: '0',
  isNewInput: true,
  evaluatedResult: null,
  lastAnswer: '0',
  lastBinaryOp: null,
  errorMessage: null,
  angleMode: 'DEG',
  memoryValue: 0,
  hasMemory: false,
  tape: [],
};

const MAX_EXPRESSION_LENGTH = 1000;
const MAX_TOKENS = 400;
const MAX_PAREN_DEPTH = 64;
const MAX_EVAL_CACHE = 64;
const MAX_TAPE_ENTRIES = 100;

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export interface EvaluateOptions {
  allowAutoClose?: boolean;
}

// Bounded FIFO/LRU cache to prevent unbounded memory growth during extended sessions
const evalCache = new Map<string, { result: number; display: string }>();

export function clearEvaluationCache(): void {
  evalCache.clear();
}

export function getEvaluationCacheSize(): number {
  return evalCache.size;
}

const TRAILING_OP_REGEX = /(?:\bmod\b|\byroot\b|[+\-−×÷^])\s*$/i;
const TRAILING_STRIP_REGEX = /(?:\bmod\b|\byroot\b|[+\-−×÷^,\s])+$/i;

/**
 * Sanitizes IEEE 754 floating-point artifacts without multiplying by 1e10
 * (which corrupts numbers > 9e5) and without zeroing legitimate tiny scientific values.
 */
export function sanitizeFloat(val: number): number {
  if (!Number.isFinite(val)) {
    throw new Error('Result exceeds maximum limit (overflow).');
  }
  if (Object.is(val, -0) || val === 0) return 0;

  // Preserve exact integer precision up to MAX_SAFE_INTEGER (15 digits)
  if (Number.isInteger(val) && Math.abs(val) <= Number.MAX_SAFE_INTEGER) {
    return val;
  }

  // Round to 13 significant digits to strip binary artifacts (0.1 + 0.2 -> 0.3, 1.005*100 -> 100.5)
  const rounded = Number(val.toPrecision(13));
  return Object.is(rounded, -0) ? 0 : rounded;
}

/**
 * Formats a numeric result into a display/parser-compatible string.
 * Uses uppercase 'E' scientific notation for very large/small values so they can be chained cleanly.
 */
export function formatDisplayNumber(val: number): string {
  const clean = sanitizeFloat(val);
  if (clean === 0) return '0';

  const abs = Math.abs(clean);
  if (abs >= 1e13 || abs < 1e-7) {
    return clean
      .toExponential(10)
      .replace(/\.?0+(e[+-]?\d+)$/i, '$1')
      .replace(/e\+/i, 'E')
      .replace(/e-/i, 'E-');
  }

  return clean.toString();
}

export function factorial(n: number): number {
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

export function closeUnbalancedParens(str: string): string {
  let openCount = 0;
  for (const ch of str) {
    if (ch === '(') openCount++;
    else if (ch === ')' && openCount > 0) openCount--;
  }
  return openCount > 0 ? str + ')'.repeat(openCount) : str;
}

export function countUnclosedParens(str: string): number {
  let openCount = 0;
  for (const ch of str) {
    if (ch === '(') openCount++;
    else if (ch === ')' && openCount > 0) openCount--;
  }
  return openCount;
}

/**
 * Positive simple numbers/constants can receive postfix ^2 without extra parentheses.
 * Negative numbers (e.g. -2) MUST be wrapped as (-2)^2 so unary minus isn't applied after squaring.
 */
function isPositiveAtomicOperand(str: string): boolean {
  return /^(\d+(\.\d+)?(E[+-]?\d+)?|π|e|Ans)$/.test(str.trim());
}

/**
 * Normalizes degrees cleanly into [0, 360) with modular reduction before trigonometric lookup,
 * preventing floating-point phase drift on large angles (e.g. sin(360000030°)).
 */
export function normalizeDegrees(deg: number): number {
  if (!Number.isFinite(deg)) {
    throw new Error('Result exceeds maximum limit (overflow).');
  }
  let norm = ((deg % 360) + 360) % 360;
  const nearestInt = Math.round(norm);
  if (Math.abs(norm - nearestInt) < 1e-12) {
    norm = nearestInt % 360;
  }
  return norm;
}

export function degToRadExact(deg: number): number {
  const norm = normalizeDegrees(deg);
  const reduced = norm > 180 ? norm - 360 : norm;
  return reduced * DEG_TO_RAD;
}

export function radToDegExact(rad: number): number {
  if (!Number.isFinite(rad)) {
    throw new Error('Result exceeds maximum limit (overflow).');
  }
  return sanitizeFloat(rad * RAD_TO_DEG);
}

/**
 * Validates balanced, non-empty, bounded nested parenthesis structure before evaluation.
 */
function validateParenthesesStructure(tokens: Token[], allowAutoClose: boolean): Token[] {
  let depth = 0;

  for (let idx = 0; idx < tokens.length; idx++) {
    const curr = tokens[idx];
    const prev = idx > 0 ? tokens[idx - 1] : null;

    if (curr.type === 'LPAREN') {
      depth++;
      if (depth > MAX_PAREN_DEPTH) {
        throw new Error(`Parenthesis nesting exceeds maximum depth (${MAX_PAREN_DEPTH}).`);
      }
    } else if (curr.type === 'RPAREN') {
      if (prev && prev.type === 'LPAREN') {
        throw new Error('Empty parentheses "()" are invalid.');
      }
      if (prev && prev.type === 'COMMA') {
        throw new Error('Trailing comma before closing parenthesis ")".');
      }
      if (prev && prev.type === 'OP' && prev.value !== '!' && prev.value !== '%') {
        throw new Error('Missing operand before closing parenthesis ")".');
      }
      depth--;
      if (depth < 0) {
        throw new Error('Unmatched closing parenthesis ")".');
      }
    } else if (curr.type === 'OP' && prev && prev.type === 'LPAREN') {
      if (curr.value !== '+' && curr.value !== '-') {
        throw new Error(`Invalid operator "${curr.value}" immediately after opening parenthesis "(".`);
      }
    }
  }

  if (depth > 0) {
    if (!allowAutoClose) {
      throw new Error(`Unclosed parenthesis: ${depth} opening "(" missing matching ")".`);
    }
    const lastTok = tokens[tokens.length - 1];
    if (lastTok && (lastTok.type === 'LPAREN' || (lastTok.type === 'OP' && lastTok.value !== '!' && lastTok.value !== '%'))) {
      throw new Error('Incomplete parenthesized sub-expression.');
    }
    const closedTokens = tokens.slice();
    for (let k = 0; k < depth; k++) {
      closedTokens.push({ type: 'RPAREN' });
    }
    return closedTokens;
  }

  return tokens;
}

/**
 * Cached entry point for non-blocking preview and repeated expressions using a bounded LRU cache.
 */
export function evaluateWithCache(
  rawExpr: string,
  currentAngle: AngleMode,
  ansValueStr: string = '0',
  options: EvaluateOptions = {}
): { result: number; display: string } {
  const allowAutoClose = options.allowAutoClose ?? false;
  const cacheKey = `${currentAngle}::${ansValueStr}::${allowAutoClose ? '1' : '0'}::${rawExpr}`;

  const cached = evalCache.get(cacheKey);
  if (cached !== undefined) {
    // Refresh recency for LRU eviction
    evalCache.delete(cacheKey);
    evalCache.set(cacheKey, cached);
    return cached;
  }

  const computed = safeEvaluateMath(rawExpr, currentAngle, ansValueStr, options);

  if (evalCache.size >= MAX_EVAL_CACHE) {
    const oldestKey = evalCache.keys().next().value;
    if (oldestKey !== undefined) {
      evalCache.delete(oldestKey);
    }
  }
  evalCache.set(cacheKey, computed);
  return computed;
}

/**
 * Safe mathematical tokenizer + recursive-descent parser with strict parenthesis validation,
 * exact angular conversion, high-precision transcendental functions, and overflow protection.
 */
export function safeEvaluateMath(
  rawExpr: string,
  currentAngle: AngleMode,
  ansValueStr: string = '0',
  options: EvaluateOptions = {}
): { result: number; display: string } {
  const allowAutoClose = options.allowAutoClose ?? false;

  if (!rawExpr || !rawExpr.trim()) {
    throw new Error('Empty expression');
  }

  if (rawExpr.length > MAX_EXPRESSION_LENGTH) {
    throw new Error('Expression exceeds maximum supported length.');
  }

  let normalized = rawExpr
    .replace(/×/g, '*')
    .replace(/÷/g, '/')
    .replace(/−/g, '-')
    .replace(/π/g, 'pi')
    .trim();

  if (allowAutoClose) {
    // Live preview while typing may strip trailing binary operators safely
    normalized = normalized.replace(/(?:\bmod\b|\byroot\b|[+\-*/^,\s])+$/i, '').trim();
  } else if (/(?:\bmod\b|\byroot\b|[+\-*/^,])$/i.test(normalized)) {
    throw new Error('Incomplete expression.');
  }
  if (!normalized) {
    throw new Error('Empty expression');
  }

  // 1. Tokenize
  const rawTokens: Token[] = [];
  let i = 0;
  const len = normalized.length;

  while (i < len) {
    if (rawTokens.length > MAX_TOKENS) {
      throw new Error('Expression has too many operations.');
    }

    const ch = normalized[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Numeric literal including decimals and scientific notation (e.g. 5E3, 1.2E-4, 1e+21)
    if (/\d/.test(ch) || (ch === '.' && i + 1 < len && /\d/.test(normalized[i + 1]))) {
      let numStr = '';
      let dotCount = 0;
      while (i < len && /[\d.]/.test(normalized[i])) {
        if (normalized[i] === '.') dotCount++;
        numStr += normalized[i++];
      }
      if (dotCount > 1) {
        throw new Error(`Invalid number: ${numStr}`);
      }

      if (i < len && (normalized[i] === 'E' || normalized[i] === 'e')) {
        const nextCh = i + 1 < len ? normalized[i + 1] : '';
        const afterSignCh = i + 2 < len ? normalized[i + 2] : '';
        const isExplicitSignedExp = (nextCh === '+' || nextCh === '-') && /\d/.test(afterSignCh);
        const isUppercaseUnsignedExp = normalized[i] === 'E' && /\d/.test(nextCh);

        if (isExplicitSignedExp || isUppercaseUnsignedExp) {
          numStr += normalized[i++];
          if (normalized[i] === '+' || normalized[i] === '-') {
            numStr += normalized[i++];
          }
          while (i < len && /\d/.test(normalized[i])) {
            numStr += normalized[i++];
          }
        }
      }

      const parsedNum = Number(numStr);
      if (Number.isNaN(parsedNum)) {
        throw new Error(`Invalid number: ${numStr}`);
      }
      if (!Number.isFinite(parsedNum)) {
        throw new Error('Number exceeds maximum limit (overflow).');
      }
      rawTokens.push({ type: 'NUMBER', value: parsedNum });
      continue;
    }

    // Identifiers
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

  // Validate nested parenthesis structure strictly before inserting implicit multiplication
  const validatedRawTokens = validateParenthesesStructure(rawTokens, allowAutoClose);

  // 2. Insert implicit multiplication tokens
  const tokens: Token[] = [];
  for (let idx = 0; idx < validatedRawTokens.length; idx++) {
    const curr = validatedRawTokens[idx];
    if (idx > 0) {
      const prev = validatedRawTokens[idx - 1];
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
        if (tokens.length >= MAX_TOKENS) {
          throw new Error('Expression has too many operations.');
        }
        tokens.push({ type: 'OP', value: '*' });
      }
    }
    if (tokens.length >= MAX_TOKENS) {
      throw new Error('Expression has too many operations.');
    }
    tokens.push(curr);
  }

  // 3. High-precision Trigonometric, Angular, Hyperbolic, and Logarithmic Math
  // Note: Preserve full 64-bit IEEE-754 intermediate precision; final result is sanitized once at exit.
  const fromRad = (rad: number): number => {
    if (!Number.isFinite(rad)) {
      throw new Error('Result exceeds maximum limit (overflow).');
    }
    return currentAngle === 'DEG' ? rad * RAD_TO_DEG : rad;
  };

  const snapTrigRad = (val: number, absAngleRad: number, allowZeroSnapNearPiMultiples: boolean): number => {
    if (!Number.isFinite(val)) {
      throw new Error('Result exceeds maximum limit (overflow).');
    }
    // Preserve genuine small-angle inputs (e.g. sin(1e-12) in RAD) while eliminating π-multiple epsilon noise
    if (allowZeroSnapNearPiMultiples && absAngleRad > 1e-6 && Math.abs(val) < 1e-13) {
      return 0;
    }
    if (!allowZeroSnapNearPiMultiples && Math.abs(val) < 1e-13) {
      return 0;
    }
    return Object.is(val, -0) ? 0 : val;
  };

  const clampUnitInterval = (x: number, fnLabel: string): number => {
    if (Number.isNaN(x)) {
      throw new Error(`${fnLabel} input must be a valid number.`);
    }
    if (x >= -1 && x <= 1) return x;
    // Absorb harmless trigonometric floating-point overshoot (e.g. 1.0000000000000002)
    if (x > 1 && x <= 1 + 1e-12) return 1;
    if (x < -1 && x >= -1 - 1e-12) return -1;
    throw new Error(`${fnLabel} input must be between -1 and 1`);
  };

  const evalSin = (x: number): number => {
    if (currentAngle === 'DEG') {
      const norm = normalizeDegrees(x);
      if (norm === 0 || norm === 180) return 0;
      if (norm === 30 || norm === 150) return 0.5;
      if (norm === 210 || norm === 330) return -0.5;
      if (norm === 90) return 1;
      if (norm === 270) return -1;
      return Math.sin(degToRadExact(norm));
    }
    return snapTrigRad(Math.sin(x), Math.abs(x), true);
  };

  const evalCos = (x: number): number => {
    if (currentAngle === 'DEG') {
      const norm = normalizeDegrees(x);
      if (norm === 90 || norm === 270) return 0;
      if (norm === 60 || norm === 300) return 0.5;
      if (norm === 120 || norm === 240) return -0.5;
      if (norm === 0) return 1;
      if (norm === 180) return -1;
      return Math.cos(degToRadExact(norm));
    }
    return snapTrigRad(Math.cos(x), Math.abs(x), false);
  };

  const evalTan = (x: number): number => {
    if (currentAngle === 'DEG') {
      const norm = normalizeDegrees(x);
      if (norm === 90 || norm === 270) {
        throw new Error(`tan(${x}°) is undefined (asymptote)`);
      }
      if (norm === 0 || norm === 180) return 0;
      if (norm === 45 || norm === 225) return 1;
      if (norm === 135 || norm === 315) return -1;
      return Math.tan(degToRadExact(norm));
    }
    const cosVal = Math.cos(x);
    if (Math.abs(cosVal) < 1e-13) {
      throw new Error('tan(x) is undefined at odd multiples of π/2 (asymptote)');
    }
    return snapTrigRad(Math.tan(x), Math.abs(x), true);
  };

  const applyUnaryFunction = (fnName: string, x: number): number => {
    if (!Number.isFinite(x) && fnName !== 'abs') {
      throw new Error('Input exceeds computable numeric bounds.');
    }

    switch (fnName) {
      case 'sin':
        return evalSin(x);
      case 'cos':
        return evalCos(x);
      case 'tan':
        return evalTan(x);
      case 'asin': {
        const clamped = clampUnitInterval(x, 'sin⁻¹');
        return fromRad(Math.asin(clamped));
      }
      case 'acos': {
        const clamped = clampUnitInterval(x, 'cos⁻¹');
        return fromRad(Math.acos(clamped));
      }
      case 'atan':
        return fromRad(Math.atan(x));
      case 'sinh': {
        const res = Math.sinh(x);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }
      case 'cosh': {
        const res = Math.cosh(x);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }
      case 'tanh':
        return Math.tanh(x);
      case 'asinh':
        return Math.asinh(x);
      case 'acosh':
        if (x < 1 - 1e-12) throw new Error('cosh⁻¹ input must be ≥ 1');
        return Math.acosh(Math.max(1, x));
      case 'atanh':
        if (x <= -1 || x >= 1) throw new Error('tanh⁻¹ input must be strictly between -1 and 1');
        return Math.atanh(x);
      case 'sqrt':
        if (x < 0) throw new Error('Square root of a negative number is undefined');
        return Math.sqrt(x);
      case 'cbrt':
        return Math.cbrt(x);
      case 'log': {
        if (x <= 0) throw new Error('Logarithm (log) is undefined for numbers ≤ 0');
        return Math.abs(x - 1) < 1e-4 ? Math.log1p(x - 1) / Math.LN10 : Math.log10(x);
      }
      case 'log2': {
        if (x <= 0) throw new Error('Logarithm (log₂) is undefined for numbers ≤ 0');
        return Math.abs(x - 1) < 1e-4 ? Math.log1p(x - 1) / Math.LN2 : Math.log2(x);
      }
      case 'ln': {
        if (x <= 0) throw new Error('Natural logarithm (ln) is undefined for numbers ≤ 0');
        return Math.abs(x - 1) < 1e-4 ? Math.log1p(x - 1) : Math.log(x);
      }
      case 'exp': {
        const res = Math.exp(x);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }
      case 'tenpow': {
        const res = Math.pow(10, x);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }
      case 'twopow': {
        const res = Math.pow(2, x);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }
      case 'abs':
        return Math.abs(x);
      case 'fact':
        return factorial(sanitizeFloat(x));
      default:
        throw new Error(`Unknown function: ${fnName}`);
    }
  };

  // 4. Recursive-descent parser (keeps full 64-bit intermediate precision and checks overflow at each step)
  let pos = 0;
  let depth = 0;
  const peek = (): Token | undefined => tokens[pos];
  const consume = (): Token => tokens[pos++];

  const guardDepth = (fn: () => number): number => {
    depth++;
    if (depth > MAX_PAREN_DEPTH) {
      throw new Error('Parenthesis nesting is too deep.');
    }
    try {
      return fn();
    } finally {
      depth--;
    }
  };

  const addSubClean = (a: number, b: number, isAdd: boolean): number => {
    const raw = isAdd ? a + b : a - b;
    if (!Number.isFinite(raw)) {
      throw new Error('Result exceeds maximum limit (overflow).');
    }
    // Eliminate subtractive cancellation floating-point residue (e.g. 0.1 + 0.2 - 0.3 = 5.5e-17)
    const maxMag = Math.max(Math.abs(a), Math.abs(b));
    if (maxMag > 0 && Math.abs(raw) < maxMag * 1e-14) {
      return 0;
    }
    return raw;
  };

  const parseExpression = (): number =>
    guardDepth(() => {
      let left = parseTerm();
      while (pos < tokens.length) {
        const t = peek();
        if (t && t.type === 'OP' && (t.value === '+' || t.value === '-')) {
          consume();
          if (pos >= tokens.length) break;
          const right = parseTerm();
          left = addSubClean(left, right, t.value === '+');
        } else {
          break;
        }
      }
      return left;
    });

  const parseTerm = (): number => {
    let left = parseUnary();
    while (pos < tokens.length) {
      const t = peek();
      if (t && t.type === 'OP' && (t.value === '*' || t.value === '/' || t.value === 'mod')) {
        consume();
        if (pos >= tokens.length) break;
        const right = parseUnary();
        if (t.value === '/') {
          if (right === 0) {
            throw new Error('Cannot divide by zero.');
          }
          left = left / right;
        } else if (t.value === 'mod') {
          if (right === 0) {
            throw new Error('Modulo by zero is undefined.');
          }
          left = left % right;
        } else {
          left = left * right;
        }
        if (!Number.isFinite(left)) {
          throw new Error('Result exceeds maximum limit (overflow).');
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
      const val = -parseUnary();
      return Object.is(val, -0) ? 0 : val;
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
        if (exponent === 0) {
          throw new Error('Root degree cannot be zero.');
        }
        if (base < 0) {
          if (Number.isInteger(exponent) && Math.abs(exponent % 2) === 1) {
            const res = -Math.pow(-base, 1 / exponent);
            if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
            return res;
          }
          throw new Error('Even root of a negative number is undefined.');
        }
        const res = Math.pow(base, 1 / exponent);
        if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
        return res;
      }

      const res = Math.pow(base, exponent);
      if (Number.isNaN(res)) {
        throw new Error('Invalid exponentiation operation.');
      }
      if (!Number.isFinite(res)) {
        throw new Error('Result exceeds maximum limit (overflow).');
      }
      return res;
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
          val = factorial(sanitizeFloat(val));
        } else {
          val = val / 100;
        }
        if (!Number.isFinite(val)) {
          throw new Error('Result exceeds maximum limit (overflow).');
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
        return Number.isNaN(parsedAns) ? 0 : parsedAns;
      }

      const fnName = t.value;
      const nextTok = peek();
      if (nextTok && nextTok.type === 'LPAREN') {
        consume();
        const afterOpen = peek();
        if (afterOpen && afterOpen.type === 'RPAREN') {
          throw new Error(`Function "${fnName}()" cannot have empty parentheses.`);
        }
        const arg1 = parseExpression();
        if (fnName === 'pow') {
          const commaTok = peek();
          if (commaTok && commaTok.type === 'COMMA') {
            consume();
            const arg2 = parseExpression();
            const closeTok = peek();
            if (!closeTok || closeTok.type !== 'RPAREN') {
              throw new Error('Unclosed function parenthesis.');
            }
            consume();
            const res = Math.pow(arg1, arg2);
            if (Number.isNaN(res)) throw new Error('Invalid power operation.');
            if (!Number.isFinite(res)) throw new Error('Result exceeds maximum limit (overflow).');
            return res;
          }
        }
        const closeTok = peek();
        if (!closeTok || closeTok.type !== 'RPAREN') {
          throw new Error(`Unclosed parenthesis for "${fnName}()".`);
        }
        consume();
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
        throw new Error('Empty parentheses "()" are invalid.');
      }
      const val = parseExpression();
      const closeTok = peek();
      if (!closeTok || closeTok.type !== 'RPAREN') {
        throw new Error('Unclosed parenthesis "(".');
      }
      consume();
      return val;
    }

    throw new Error('Invalid mathematical expression.');
  };

  const val = parseExpression();
  if (pos < tokens.length) {
    const stray = tokens[pos];
    if (stray.type === 'RPAREN') {
      throw new Error('Unmatched closing parenthesis ")".');
    }
    throw new Error('Invalid mathematical syntax.');
  }

  if (typeof val !== 'number' || Number.isNaN(val)) {
    throw new Error('Invalid mathematical expression.');
  }
  if (!Number.isFinite(val)) {
    throw new Error('Result exceeds maximum limit (overflow).');
  }

  const cleaned = sanitizeFloat(val);
  const display = formatDisplayNumber(cleaned);
  return { result: cleaned, display };
}

/**
 * Assembles complete expression from `expression` and `currentInput`.
 * Set `autoClose = true` ONLY for live preview while typing; strict mode keeps parens exact.
 */
export function buildFullExpression(
  expr: string,
  curr: string,
  isNew: boolean,
  autoClose: boolean = false
): string {
  if (curr === 'Error') return '';
  const maybeClose = (s: string) => (autoClose ? closeUnbalancedParens(s) : s);

  const trimmedExpr = expr.trim();
  if (!trimmedExpr) {
    return maybeClose(curr);
  }

  if (isNew) {
    const stripped = trimmedExpr.replace(TRAILING_STRIP_REGEX, '').trim();
    return maybeClose(stripped || curr);
  }

  const cleanedCurr = curr.replace(/E[+-]?$/, '') || '0';
  const preparedCurr = maybeClose(cleanedCurr);
  if (trimmedExpr.endsWith(')')) {
    return maybeClose(`${trimmedExpr} × ${preparedCurr}`);
  }
  return maybeClose(`${trimmedExpr} ${preparedCurr}`);
}

/**
 * Extracts a trailing parenthesized or function call group (e.g. "(2 + 3)" or "sin(30)")
 * from an expression ending with ')'.
 */
function extractTrailingParenGroup(expr: string): { prefix: string; group: string } | null {
  const trimmed = expr.trim();
  if (!trimmed.endsWith(')')) return null;

  let depth = 0;
  let openIdx = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (trimmed[i] === ')') depth++;
    else if (trimmed[i] === '(') {
      depth--;
      if (depth === 0) {
        openIdx = i;
        break;
      }
    }
  }

  if (openIdx === -1) return null;

  // Include optional function identifier immediately before '(' (e.g. sin, sqrt, 10^, 2^)
  let startIdx = openIdx;
  const beforeParen = trimmed.slice(0, openIdx);
  const fnPrefixMatch = beforeParen.match(/(?:asinh|acosh|atanh|sinh|cosh|tanh|asin|acos|atan|sin|cos|tan|sqrt|cbrt|log2|log|ln|abs|exp|10\^|2\^)$/);
  if (fnPrefixMatch) {
    startIdx -= fnPrefixMatch[0].length;
  }

  return {
    prefix: trimmed.slice(0, startIdx).trim(),
    group: trimmed.slice(startIdx),
  };
}

/**
 * Extracts the last binary operator + operand from an evaluated expression for repeated '=' presses.
 */
function extractLastBinaryOp(fullExpr: string): { op: string; operand: string } | null {
  const trimmed = fullExpr.trim();
  // Match simple trailing "<op> <operand>" where operand has no unclosed parens
  const match = trimmed.match(/^(?:.+?)\s+(mod|yroot|[+\-−×÷^])\s+(-?(?:\d+(?:\.\d+)?(?:E[+-]?\d+)?|π|e|Ans))$/i);
  if (!match) return null;
  return { op: match[1], operand: match[2] };
}

/**
 * Atomic reducer managing all calculator state transitions without partial updates or stale closures.
 */
export function calcReducer(state: CalcState, action: CalcAction): CalcState {
  switch (action.type) {
    case 'DIGIT': {
      const { digit } = action;
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: digit,
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (state.isNewInput || state.currentInput === 'Error') {
        return {
          ...state,
          currentInput: digit,
          isNewInput: false,
          errorMessage: null,
        };
      }

      let nextInput: string;
      const prev = state.currentInput;
      if (prev === '0') {
        nextInput = digit;
      } else if (prev === '-0') {
        nextInput = `-${digit}`;
      } else if (prev.endsWith('(-0')) {
        nextInput = `${prev.slice(0, -1)}${digit}`;
      } else if (
        prev.endsWith(')') ||
        prev.endsWith('π') ||
        prev.endsWith('Ans') ||
        (prev.endsWith('e') && !prev.endsWith('E'))
      ) {
        nextInput = `${prev} × ${digit}`;
      } else {
        nextInput = prev + digit;
      }

      return {
        ...state,
        currentInput: nextInput,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'DECIMAL': {
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: '0.',
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (state.isNewInput || state.currentInput === 'Error') {
        return {
          ...state,
          currentInput: '0.',
          isNewInput: false,
          errorMessage: null,
        };
      }

      const prev = state.currentInput;
      if (/E[+-]?\d*$/.test(prev)) {
        return { ...state, errorMessage: null };
      }

      const lastNumberSegment = prev.split(/[^0-9.]/).pop() || '';
      let nextInput = prev;
      if (!lastNumberSegment.includes('.')) {
        if (prev === '-0' || prev.endsWith('(-0')) {
          nextInput = `${prev}.`;
        } else if (prev.endsWith('(')) {
          nextInput = `${prev}0.`;
        } else if (prev.endsWith(')') || prev.endsWith('π') || prev.endsWith('Ans') || (prev.endsWith('e') && !prev.endsWith('E'))) {
          nextInput = `${prev} × 0.`;
        } else {
          nextInput = prev + '.';
        }
      }

      return {
        ...state,
        currentInput: nextInput,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'SCI_EXP': {
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: `${state.evaluatedResult}E`,
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (state.isNewInput || state.currentInput === 'Error') {
        return {
          ...state,
          currentInput: '1E',
          isNewInput: false,
          errorMessage: null,
        };
      }

      const prev = state.currentInput;
      let nextInput = prev;
      if (/E[+-]?\d*$/.test(prev)) {
        nextInput = prev;
      } else if (/\d$/.test(prev)) {
        nextInput = `${prev}E`;
      } else if (prev.endsWith('(')) {
        nextInput = `${prev}1E`;
      } else {
        nextInput = `${prev} × 1E`;
      }

      return {
        ...state,
        currentInput: nextInput,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'OPERATOR': {
      const { op } = action;

      if (state.currentInput === 'Error') {
        return {
          ...state,
          expression: `0 ${op}`,
          currentInput: '0',
          isNewInput: true,
          evaluatedResult: null,
          lastBinaryOp: null,
          errorMessage: null,
        };
      }

      // 1. Chaining immediately after '='
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: `${state.evaluatedResult} ${op}`,
          currentInput: state.evaluatedResult,
          evaluatedResult: null,
          lastBinaryOp: null,
          isNewInput: true,
          errorMessage: null,
        };
      }

      // 2. Pressing another operator right after an operator or '(' / ')'
      if (state.isNewInput) {
        let nextExpr: string;
        if (!state.expression) {
          const startVal = closeUnbalancedParens(state.currentInput || '0');
          nextExpr = `${startVal} ${op}`;
        } else if (TRAILING_OP_REGEX.test(state.expression)) {
          nextExpr = state.expression.replace(TRAILING_OP_REGEX, op);
        } else if (state.expression.trim().endsWith('(')) {
          // Allow unary/operator recovery safely only as '0 <op>' after '('
          nextExpr = `${state.expression} 0 ${op}`;
        } else {
          nextExpr = `${state.expression} ${op}`;
        }

        return {
          ...state,
          expression: nextExpr,
          isNewInput: true,
          errorMessage: null,
        };
      }

      // 3. Normal chaining: append current operand + op, and safely compute intermediate display
      const cleanedCurr = state.currentInput.replace(/E[+-]?$/, '');
      const balancedCurr = closeUnbalancedParens(cleanedCurr || '0');
      const trimmedExpr = state.expression.trim();
      const combinedExpr = trimmedExpr
        ? trimmedExpr.endsWith(')')
          ? `${trimmedExpr} × ${balancedCurr}`
          : `${trimmedExpr} ${balancedCurr}`
        : balancedCurr;

      if (countUnclosedParens(combinedExpr) === 0) {
        try {
          const { display } = safeEvaluateMath(combinedExpr, state.angleMode, state.lastAnswer);
          return {
            ...state,
            expression: `${combinedExpr} ${op}`,
            currentInput: display,
            isNewInput: true,
            errorMessage: null,
          };
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid mathematical expression';
          return {
            ...state,
            currentInput: 'Error',
            evaluatedResult: null,
            isNewInput: true,
            errorMessage: msg,
          };
        }
      }

      return {
        ...state,
        expression: `${combinedExpr} ${op}`,
        currentInput: '0',
        isNewInput: true,
        errorMessage: null,
      };
    }

    case 'FUNCTION': {
      const { fnName } = action;

      if (fnName === 'pow') {
        return calcReducer(state, { type: 'OPERATOR', op: '^' });
      }
      if (fnName === 'yroot') {
        return calcReducer(state, { type: 'OPERATOR', op: 'yroot' });
      }

      // If user just closed a ')' (isNewInput && expression ends with ')'), apply function to that group
      let workingExpr = state.expression;
      let activeVal =
        state.currentInput === 'Error'
          ? '0'
          : state.evaluatedResult !== null
          ? state.evaluatedResult
          : state.currentInput;
      let effectiveIsNew = state.isNewInput;

      if (state.evaluatedResult === null && state.isNewInput && state.expression.trim().endsWith(')')) {
        const extracted = extractTrailingParenGroup(state.expression);
        if (extracted) {
          workingExpr = extracted.prefix;
          activeVal = extracted.group;
          effectiveIsNew = false;
        }
      }

      // Immediate unary/postfix wrappers: x², x³, 1/x, n!
      if (fnName === 'sq' || fnName === 'cube' || fnName === 'reciprocal' || fnName === 'factorial') {
        const cleanedTarget = closeUnbalancedParens((activeVal || '0').replace(/E[+-]?$/, '') || '0');
        const wrappedBase = isPositiveAtomicOperand(cleanedTarget) ? cleanedTarget : `(${cleanedTarget})`;

        let nextInput = cleanedTarget;
        if (fnName === 'sq') nextInput = `${wrappedBase}^2`;
        else if (fnName === 'cube') nextInput = `${wrappedBase}^3`;
        else if (fnName === 'reciprocal') nextInput = `(1/${wrappedBase})`;
        else if (fnName === 'factorial') nextInput = `${wrappedBase}!`;

        return {
          ...state,
          expression: state.evaluatedResult !== null ? '' : workingExpr,
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: nextInput,
          isNewInput: false,
          errorMessage: null,
        };
      }

      // Immediate prefix exponential wrappers: 10^x, 2^x, e^x
      if (fnName === 'tenpow' || fnName === 'twopow' || fnName === 'exp') {
        const prefix = fnName === 'tenpow' ? '10^(' : fnName === 'twopow' ? '2^(' : 'exp(';
        if (state.evaluatedResult !== null) {
          return {
            ...state,
            expression: '',
            evaluatedResult: null,
            lastBinaryOp: null,
            currentInput: `${prefix}${state.evaluatedResult})`,
            isNewInput: false,
            errorMessage: null,
          };
        }
        if (effectiveIsNew) {
          return {
            ...state,
            expression: workingExpr,
            currentInput: prefix,
            isNewInput: false,
            errorMessage: null,
          };
        }

        const nextInput = activeVal.endsWith('(')
          ? `${activeVal}${prefix}`
          : `${prefix}${closeUnbalancedParens(activeVal)})`;

        return {
          ...state,
          expression: workingExpr,
          currentInput: nextInput,
          isNewInput: false,
          errorMessage: null,
        };
      }

      // Standard prefix functions
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: `${fnName}(${state.evaluatedResult})`,
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (effectiveIsNew) {
        return {
          ...state,
          expression: workingExpr,
          currentInput: `${fnName}(`,
          isNewInput: false,
          errorMessage: null,
        };
      }

      const nextInput = activeVal.endsWith('(')
        ? `${activeVal}${fnName}(`
        : `${fnName}(${closeUnbalancedParens(activeVal)})`;

      return {
        ...state,
        expression: workingExpr,
        currentInput: nextInput,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'CONSTANT': {
      const { constant } = action;
      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: constant,
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (!state.isNewInput && state.currentInput !== 'Error') {
        const nextInput = state.currentInput.endsWith('(')
          ? `${state.currentInput}${constant}`
          : `${state.currentInput} × ${constant}`;
        return {
          ...state,
          currentInput: nextInput,
          isNewInput: false,
          errorMessage: null,
        };
      }

      return {
        ...state,
        currentInput: constant,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'PAREN': {
      const { paren } = action;
      const totalOpen =
        countUnclosedParens(state.expression) +
        (state.isNewInput || state.currentInput === 'Error' ? 0 : countUnclosedParens(state.currentInput));

      if (paren === '(') {
        if (totalOpen >= MAX_PAREN_DEPTH) {
          return {
            ...state,
            errorMessage: `Maximum parenthesis depth (${MAX_PAREN_DEPTH}) reached.`,
          };
        }

        if (state.evaluatedResult !== null) {
          return {
            ...state,
            expression: `${state.evaluatedResult} × (`,
            evaluatedResult: null,
            lastBinaryOp: null,
            currentInput: '0',
            isNewInput: true,
            errorMessage: null,
          };
        }

        if (!state.isNewInput && state.currentInput !== 'Error') {
          if (state.currentInput.endsWith('(')) {
            return {
              ...state,
              currentInput: `${state.currentInput}(`,
              errorMessage: null,
            };
          }
          const closedCurr = closeUnbalancedParens(state.currentInput);
          const nextExpr = state.expression ? `${state.expression} ${closedCurr} × (` : `${closedCurr} × (`;
          return {
            ...state,
            expression: nextExpr,
            currentInput: '0',
            isNewInput: true,
            errorMessage: null,
          };
        }

        const prevTrim = state.expression.trim();
        const nextExpr = !prevTrim
          ? '('
          : prevTrim.endsWith(')')
          ? `${prevTrim} × (`
          : `${prevTrim} (`;

        return {
          ...state,
          expression: nextExpr,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      } else {
        // Strict validation on closing parenthesis ')'
        if (!state.isNewInput && state.currentInput !== 'Error') {
          if (state.currentInput.endsWith('(')) {
            return {
              ...state,
              errorMessage: 'Empty parentheses "()" are invalid.',
            };
          }
          if (countUnclosedParens(state.currentInput) > 0) {
            return {
              ...state,
              currentInput: `${state.currentInput})`,
              errorMessage: null,
            };
          }
        }

        if (countUnclosedParens(state.expression) <= 0) {
          return {
            ...state,
            errorMessage: 'No open parenthesis "(" to close.',
          };
        }

        if (state.isNewInput && state.expression.trim().endsWith('(')) {
          return {
            ...state,
            errorMessage: 'Empty parentheses "()" are invalid.',
          };
        }

        if (state.isNewInput && TRAILING_OP_REGEX.test(state.expression)) {
          return {
            ...state,
            errorMessage: 'Complete the operation before closing parenthesis ")".',
          };
        }

        const closedCurr =
          !state.isNewInput && state.currentInput !== 'Error'
            ? closeUnbalancedParens(state.currentInput.replace(/E[+-]?$/, '') || '0')
            : '';

        const nextExpr = closedCurr
          ? `${state.expression} ${closedCurr})`.trim()
          : `${state.expression.trim()})`;

        // Evaluate the closed sub-expression strictly for immediate display feedback
        let subDisplay = '0';
        try {
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
            subDisplay = safeEvaluateMath(subExpr, state.angleMode, state.lastAnswer, { allowAutoClose: false }).display;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : 'Invalid parenthesized expression';
          return {
            ...state,
            errorMessage: msg,
          };
        }

        return {
          ...state,
          expression: nextExpr,
          currentInput: subDisplay,
          isNewInput: true,
          errorMessage: null,
        };
      }
    }

    case 'TOGGLE_SIGN': {
      if (state.currentInput === 'Error') {
        return {
          ...state,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      }

      // If a result was just evaluated with '=', negate the result (keeping 0 as '0')
      if (state.evaluatedResult !== null) {
        if (state.evaluatedResult === '0') {
          return { ...state, errorMessage: null };
        }
        const toggledRes = state.evaluatedResult.startsWith('-')
          ? state.evaluatedResult.substring(1)
          : `-${state.evaluatedResult}`;
        return {
          ...state,
          currentInput: toggledRes,
          evaluatedResult: toggledRes,
          isNewInput: true,
          errorMessage: null,
        };
      }

      // If right after a closed ')' while isNewInput is true, negate the parenthesized group
      if (state.isNewInput && state.expression.trim().endsWith(')')) {
        const extracted = extractTrailingParenGroup(state.expression);
        if (extracted) {
          return {
            ...state,
            expression: extracted.prefix,
            currentInput: `-${extracted.group}`,
            isNewInput: false,
            errorMessage: null,
          };
        }
      }

      // Starting a new negative operand (fresh state or right after a binary operator / '(')
      if (state.isNewInput) {
        return {
          ...state,
          currentInput: '-0',
          isNewInput: false,
          errorMessage: null,
        };
      }

      // Toggling '-0' cancels negative entry back to '0'
      if (state.currentInput === '-0') {
        return {
          ...state,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      }

      if (state.currentInput === '0') {
        return {
          ...state,
          currentInput: '-0',
          isNewInput: false,
          errorMessage: null,
        };
      }

      const expMatch = state.currentInput.match(/^(.*E)([+-]?)(\d*)$/);
      if (expMatch) {
        const [, prefix, sign, digits] = expMatch;
        const nextSign = sign === '-' ? '' : '-';
        return {
          ...state,
          currentInput: `${prefix}${nextSign}${digits}`,
          isNewInput: false,
          errorMessage: null,
        };
      }

      // Inside an open function or parenthesis like 'sin(' or 'sin(30', negate the inner operand
      if (countUnclosedParens(state.currentInput) > 0) {
        if (state.currentInput.endsWith('(')) {
          return {
            ...state,
            currentInput: `${state.currentInput}-0`,
            isNewInput: false,
            errorMessage: null,
          };
        }
        if (state.currentInput.endsWith('(-0')) {
          return {
            ...state,
            currentInput: state.currentInput.slice(0, -2),
            isNewInput: false,
            errorMessage: null,
          };
        }
        const innerMatch = state.currentInput.match(/^(.*?\()(-?)(.+)$/);
        if (innerMatch) {
          const [, prefixParen, signPart, restOperand] = innerMatch;
          const nextInner = signPart === '-' ? restOperand : `-${restOperand}`;
          return {
            ...state,
            currentInput: `${prefixParen}${nextInner}`,
            isNewInput: false,
            errorMessage: null,
          };
        }
      }

      const toggled = state.currentInput.startsWith('-')
        ? state.currentInput.substring(1)
        : `-${state.currentInput}`;

      return {
        ...state,
        currentInput: toggled,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'PERCENT': {
      if (state.currentInput === 'Error') return state;

      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: `${closeUnbalancedParens(state.evaluatedResult)}%`,
          isNewInput: false,
          errorMessage: null,
        };
      }

      if (state.isNewInput && state.expression.trim().endsWith(')')) {
        const extracted = extractTrailingParenGroup(state.expression);
        if (extracted) {
          return {
            ...state,
            expression: extracted.prefix,
            currentInput: `${extracted.group}%`,
            isNewInput: false,
            errorMessage: null,
          };
        }
      }

      return {
        ...state,
        currentInput: `${closeUnbalancedParens(state.currentInput)}%`,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'BACKSPACE': {
      if (state.currentInput === 'Error') {
        return {
          ...state,
          expression: '',
          currentInput: '0',
          isNewInput: true,
          evaluatedResult: null,
          errorMessage: null,
        };
      }

      if (state.evaluatedResult !== null) {
        return {
          ...state,
          expression: '',
          evaluatedResult: null,
          lastBinaryOp: null,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      }

      // If user just pressed an operator (isNewInput && expression), undo trailing operator instead of slicing intermediate result
      if (state.isNewInput && state.expression) {
        if (TRAILING_OP_REGEX.test(state.expression)) {
          const stripped = state.expression.replace(TRAILING_OP_REGEX, '').trim();
          const lastAtomMatch = stripped.match(/(-?(?:\d+(?:\.\d+)?(?:E[+-]?\d+)?|π|e|Ans))$/);
          if (lastAtomMatch) {
            const remainingExpr = stripped.slice(0, stripped.length - lastAtomMatch[0].length).trim();
            return {
              ...state,
              expression: remainingExpr,
              currentInput: lastAtomMatch[1],
              isNewInput: false,
              errorMessage: null,
            };
          }
          return {
            ...state,
            expression: stripped,
            isNewInput: true,
            errorMessage: null,
          };
        }
        if (state.expression.trim().endsWith('(')) {
          const strippedParen = state.expression.trim().replace(/(?:\s*×\s*)?\(\s*$/, '').trim();
          return {
            ...state,
            expression: strippedParen,
            isNewInput: true,
            errorMessage: null,
          };
        }
        return state;
      }

      const prev = state.currentInput;
      if (prev.length <= 1) {
        return {
          ...state,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      }

      const fnMatch = prev.match(
        /(asinh|acosh|atanh|sinh|cosh|tanh|asin|acos|atan|sin|cos|tan|sqrt|cbrt|log2|log|ln|abs|exp|10\^|2\^)\($/
      );
      if (fnMatch) {
        const sliced = prev.slice(0, -fnMatch[0].length);
        return {
          ...state,
          currentInput: sliced || '0',
          isNewInput: !sliced,
          errorMessage: null,
        };
      }

      if (prev.endsWith('Ans')) {
        const sliced = prev.slice(0, -3);
        return {
          ...state,
          currentInput: sliced || '0',
          isNewInput: !sliced,
          errorMessage: null,
        };
      }

      const sliced = prev.slice(0, -1);
      if (!sliced || sliced === '-') {
        return {
          ...state,
          currentInput: '0',
          isNewInput: true,
          errorMessage: null,
        };
      }
      return {
        ...state,
        currentInput: sliced,
        isNewInput: false,
        errorMessage: null,
      };
    }

    case 'CLEAR_ALL':
      return {
        ...state,
        expression: '',
        currentInput: '0',
        isNewInput: true,
        evaluatedResult: null,
        lastBinaryOp: null,
        errorMessage: null,
      };

    case 'CLEAR_ENTRY':
      return {
        ...state,
        currentInput: '0',
        isNewInput: true,
        evaluatedResult: null,
        errorMessage: null,
      };

    case 'EQUAL': {
      if (state.currentInput === 'Error') {
        return calcReducer(state, { type: 'CLEAR_ALL' });
      }

      // Prevent repeating operations on successive '=' presses when a result is already evaluated
      if (state.evaluatedResult !== null) {
        return state.errorMessage ? { ...state, errorMessage: null } : state;
      }

      // Enforce strict parenthesis validation on EQUAL (do NOT silently auto-close unbalanced parens)
      const fullExpr = buildFullExpression(state.expression, state.currentInput, state.isNewInput, false);
      if (!fullExpr) return state;

      try {
        const { display } = safeEvaluateMath(fullExpr, state.angleMode, state.lastAnswer, { allowAutoClose: false });
        const binaryTail = extractLastBinaryOp(fullExpr);
        return {
          ...state,
          evaluatedResult: display,
          lastAnswer: display,
          lastBinaryOp: binaryTail,
          currentInput: display,
          expression: '',
          isNewInput: true,
          errorMessage: null,
          tape: [
            {
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              expr: fullExpr,
              res: display,
              time: action.timeStr,
            },
            ...state.tape.slice(0, MAX_TAPE_ENTRIES - 1),
          ],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Invalid mathematical expression';
        const isParenSyntaxError =
          msg.includes('parenthes') ||
          msg.includes('Parenthes') ||
          msg.includes('Empty parentheses');
        return {
          ...state,
          errorMessage: msg,
          // Preserve user's nested expression on parenthesis errors so they can simply close ')',
          // while setting Error display for arithmetic/domain errors (e.g. div by 0).
          currentInput: isParenSyntaxError ? state.currentInput : 'Error',
          evaluatedResult: null,
          isNewInput: isParenSyntaxError ? state.isNewInput : true,
        };
      }
    }

    case 'TOGGLE_ANGLE':
      return {
        ...state,
        angleMode: state.angleMode === 'DEG' ? 'RAD' : 'DEG',
      };

    case 'MEMORY': {
      let currentVal = 0;
      const target = state.evaluatedResult || state.currentInput;
      if (target && target !== 'Error') {
        try {
          currentVal = safeEvaluateMath(target, state.angleMode, state.lastAnswer).result;
        } catch {
          currentVal = parseFloat(target) || 0;
        }
      }

      try {
        switch (action.action) {
          case 'MC':
            return { ...state, memoryValue: 0, hasMemory: false };
          case 'MR':
            if (!state.hasMemory) return state;
            return {
              ...state,
              expression: state.evaluatedResult !== null ? '' : state.expression,
              evaluatedResult: null,
              currentInput: formatDisplayNumber(state.memoryValue),
              isNewInput: false,
              errorMessage: null,
            };
          case 'M+': {
            const nextMem = sanitizeFloat(state.memoryValue + currentVal);
            return { ...state, memoryValue: nextMem, hasMemory: true };
          }
          case 'M-': {
            const nextMem = sanitizeFloat(state.memoryValue - currentVal);
            return { ...state, memoryValue: nextMem, hasMemory: true };
          }
          case 'MS':
            return { ...state, memoryValue: sanitizeFloat(currentVal), hasMemory: true };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Memory operation overflow';
        return { ...state, errorMessage: msg };
      }
      return state;
    }

    case 'LOAD_TAPE':
      return {
        ...state,
        errorMessage: null,
        evaluatedResult: null,
        currentInput: action.res,
        isNewInput: false,
      };

    case 'ADD_TAPE': {
      const expr = action.expr.trim();
      const res = action.res.trim();
      if (!expr || !res) return state;
      return {
        ...state,
        tape: [
          {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            expr,
            res,
            time: action.timeStr,
          },
          ...state.tape.slice(0, MAX_TAPE_ENTRIES - 1),
        ],
      };
    }

    case 'HYDRATE_TAPE':
      return {
        ...state,
        tape: action.tape.slice(0, MAX_TAPE_ENTRIES),
      };

    case 'CLEAR_TAPE':
      return {
        ...state,
        tape: [],
      };
  }
}
