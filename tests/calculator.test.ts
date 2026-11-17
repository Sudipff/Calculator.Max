import test from 'node:test';
import assert from 'node:assert/strict';

import {
  INITIAL_CALC_STATE,
  calcReducer,
  safeEvaluateMath,
  evaluateWithCache,
  clearEvaluationCache,
  getEvaluationCacheSize,
  sanitizeFloat,
  formatDisplayNumber,
  factorial,
  normalizeDegrees,
  degToRadExact,
  radToDegExact,
  buildFullExpression,
  closeUnbalancedParens,
  countUnclosedParens,
  type CalcAction,
  type CalcState,
} from '../lib/scientificEngine';

import {
  evaluateBasicArithmetic,
  computeDiscount,
  computeWeightQuantity,
  computeWeightPrice,
  convertRetailUnit,
  computeEmiPlan,
  computeAgeDetails,
  computeWishlistDaysRemaining,
  computeWishlistPlan,
  convertCurrencyAmount,
} from '../lib/basicCalculators';

function approxEqual(actual: number, expected: number, tol = 1e-10, label = '') {
  const diff = Math.abs(actual - expected);
  assert.ok(
    diff <= tol,
    `${label ? label + ': ' : ''}expected ${expected} ± ${tol}, got ${actual} (diff=${diff})`
  );
}

function runSequence(actions: CalcAction[], initialState: CalcState = INITIAL_CALC_STATE): CalcState {
  return actions.reduce((st, act) => calcReducer(st, act), initialState);
}

// ============================================================================
// 1. BASIC ARITHMETIC & RETAIL CALCULATORS
// ============================================================================

test('Basic Arithmetic Evaluator: operators, Unicode symbols, commas, PEMDAS, edge cases', () => {
  assert.equal(evaluateBasicArithmetic('1,250 × 4'), 5000);
  assert.equal(evaluateBasicArithmetic('100 ÷ 4'), 25);
  assert.equal(evaluateBasicArithmetic('50 − 12.5'), 37.5);
  assert.equal(evaluateBasicArithmetic('2 + 3 × 4'), 14);
  assert.equal(evaluateBasicArithmetic('(2 + 3) × 4'), 20);
  assert.equal(evaluateBasicArithmetic('2(3 + 4)'), 14);
  assert.equal(evaluateBasicArithmetic('(2 + 3)(4 + 1)'), 25);
  assert.equal(evaluateBasicArithmetic('-15.5 + 30.5'), 15);
  assert.equal(evaluateBasicArithmetic('1.5E3'), 1500);
  assert.equal(evaluateBasicArithmetic('200 × 15%'), 30);

  // Invalid / non-finite / malformed expressions must return NaN (never silently parseFloat prefix)
  assert.ok(Number.isNaN(evaluateBasicArithmetic('')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('   ')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('5 / 0')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('0 / 0')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('100 + ')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('(2 + 3')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('1E400')));
  assert.ok(Number.isNaN(evaluateBasicArithmetic('abc')));
});

test('Discount Calculator: exact savings, final price, boundary and invalid inputs', () => {
  const d1 = computeDiscount('1000', '15');
  assert.ok(d1);
  assert.equal(d1.saved, 150);
  assert.equal(d1.finalPrice, 850);

  const d2 = computeDiscount('199.99', '12.5');
  assert.ok(d2);
  approxEqual(d2.saved, 24.99875, 1e-10);
  approxEqual(d2.finalPrice, 174.99125, 1e-10);

  // 0% and 100% boundary discounts
  const d0 = computeDiscount(500, 0);
  assert.ok(d0);
  assert.equal(d0.saved, 0);
  assert.equal(d0.finalPrice, 500);

  const d100 = computeDiscount(500, 100);
  assert.ok(d100);
  assert.equal(d100.saved, 500);
  assert.equal(d100.finalPrice, 0);

  // Expression support in fields
  const dExpr = computeDiscount('100 × 2', '10 + 5');
  assert.ok(dExpr);
  assert.equal(dExpr.saved, 30);
  assert.equal(dExpr.finalPrice, 170);

  // Validation rejections
  assert.equal(computeDiscount(0, 10), null);
  assert.equal(computeDiscount(-100, 10), null);
  assert.equal(computeDiscount(100, -1), null);
  assert.equal(computeDiscount(100, 101), null);
  assert.equal(computeDiscount('100 / 0', '10'), null);
});

test('Weight & Price Calculator: metric (grams/kg) and imperial (oz/lb)', () => {
  // Metric under 1kg
  const w1 = computeWeightQuantity(400, 100, 'metric');
  assert.ok(w1);
  assert.equal(w1.quantityBaseUnit, 250);
  assert.equal(w1.formattedQty, '250 grams');

  // Metric >= 1kg
  const w2 = computeWeightQuantity(200, 350, 'metric');
  assert.ok(w2);
  assert.equal(w2.quantityBaseUnit, 1750);
  assert.equal(w2.formattedQty, '1.75 kg');

  // Imperial under 1lb
  const w3 = computeWeightQuantity(10, 2.5, 'imperial');
  assert.ok(w3);
  assert.equal(w3.quantityBaseUnit, 4);
  assert.equal(w3.formattedQty, '4.0 oz');

  // Imperial >= 1lb
  const w4 = computeWeightQuantity(8, 20, 'imperial');
  assert.ok(w4);
  assert.equal(w4.quantityBaseUnit, 40);
  assert.equal(w4.formattedQty, '2.50 lb');

  // Validation rejections
  assert.equal(computeWeightQuantity(0, 100, 'metric'), null);
  assert.equal(computeWeightQuantity(100, 0, 'metric'), null);
  assert.equal(computeWeightQuantity(-10, 50, 'imperial'), null);

  // Target weight -> total price calculations
  const wpKg = computeWeightPrice(400, 1.5, 'kg', 'metric');
  assert.ok(wpKg);
  assert.equal(wpKg.totalCost, 600);
  assert.equal(wpKg.formattedWeight, '1.5 kg');

  const wpGrams = computeWeightPrice(400, 250, 'g', 'metric');
  assert.ok(wpGrams);
  assert.equal(wpGrams.totalCost, 100);
  assert.equal(wpGrams.formattedWeight, '250 g');

  const wpOz = computeWeightPrice(10, 4, 'oz', 'imperial');
  assert.ok(wpOz);
  assert.equal(wpOz.totalCost, 2.5);

  const wpLb = computeWeightPrice(8, 2.5, 'lb', 'imperial');
  assert.ok(wpLb);
  assert.equal(wpLb.totalCost, 20);

  // Cross-system unit conversion accuracy (1 lb = 0.45359237 kg at 100/kg)
  const wpLbToKg = computeWeightPrice(100, 1, 'lb', 'metric');
  assert.ok(wpLbToKg);
  approxEqual(wpLbToKg.totalCost, 45.359237, 1e-6);

  assert.equal(computeWeightPrice(0, 250, 'g', 'metric'), null);
  assert.equal(computeWeightPrice(100, 0, 'kg', 'metric'), null);
  assert.equal(computeWeightPrice(100, -5, 'kg', 'metric'), null);
});

test('Retail Unit Converter: all 10 unit conversions and roundtrip consistency', () => {
  const gToKg = convertRetailUnit(1250, 'g_to_kg');
  assert.equal(gToKg?.numericValue, 1.25);
  assert.equal(gToKg?.formattedResult, '1.250 kg');

  const kgToG = convertRetailUnit(1.25, 'kg_to_g');
  assert.equal(kgToG?.numericValue, 1250);
  assert.equal(kgToG?.formattedResult, '1250 grams');

  assert.equal(convertRetailUnit(500, 'ml_to_l')?.formattedResult, '0.500 Liters');
  assert.equal(convertRetailUnit(2.5, 'l_to_ml')?.formattedResult, '2500 ml');
  assert.equal(convertRetailUnit(10, 'lb_to_kg')?.formattedResult, '4.536 kg');
  assert.equal(convertRetailUnit(10, 'kg_to_lb')?.formattedResult, '22.046 lb');
  assert.equal(convertRetailUnit(1, 'oz_to_g')?.formattedResult, '28.35 g');
  assert.equal(convertRetailUnit(10, 'ft_to_m')?.formattedResult, '3.048 m');
  assert.equal(convertRetailUnit(10, 'm_to_ft')?.formattedResult, '32.808 ft');
  assert.equal(convertRetailUnit(1, 'floz_to_ml')?.formattedResult, '29.57 mL');

  // Roundtrip accuracy lb -> kg -> lb
  const kgs = convertRetailUnit(15, 'lb_to_kg')!.numericValue;
  const lbsBack = convertRetailUnit(kgs, 'kg_to_lb')!.numericValue;
  approxEqual(lbsBack, 15, 1e-6, 'lb -> kg -> lb roundtrip');

  assert.equal(convertRetailUnit('invalid', 'g_to_kg'), null);
});

test('EMI Loan Calculator: reducing balance, flat rate, 0% rate, amortization invariants', () => {
  // Reducing balance standard loan: 120,000 - 20,000 = 100,000 principal at 12% p.a. for 12 months
  const red = computeEmiPlan(120000, 20000, 12, 12, 'months', 'reducing');
  assert.ok(red);
  assert.equal(red.principal, 100000);
  assert.equal(red.months, 12);
  // Monthly rate 1%, formula: 100000 * 0.01 * 1.01^12 / (1.01^12 - 1) = 8884.8788678...
  approxEqual(red.emi, 8884.8788678, 1e-5, 'Reducing EMI');
  approxEqual(red.totalInterest, red.emi * 12 - 100000, 1e-6);
  assert.equal(red.schedule.length, 12);
  assert.equal(red.schedule[red.schedule.length - 1].balance, 0);

  const sumPrincipalRed = red.schedule.reduce((s, r) => s + r.principalPaid, 0);
  const sumInterestRed = red.schedule.reduce((s, r) => s + r.interestPaid, 0);
  approxEqual(sumPrincipalRed, 100000, 1e-6, 'Amortization sum of principal');
  approxEqual(sumInterestRed, red.totalInterest, 1e-6, 'Amortization sum of interest');

  // Years unit equivalence (2 years == 24 months)
  const twoYears = computeEmiPlan(50000, 0, 10, 2, 'years', 'reducing');
  const twentyFourMonths = computeEmiPlan(50000, 0, 10, 24, 'months', 'reducing');
  assert.ok(twoYears && twentyFourMonths);
  assert.equal(twoYears.months, 24);
  approxEqual(twoYears.emi, twentyFourMonths.emi, 1e-10);
  assert.equal(twoYears.yearlySummaries.length, 2);

  // Flat rate loan: 100,000 at 10% flat for 2 years -> 20,000 interest, 5,000/mo EMI
  const flat = computeEmiPlan(100000, 0, 10, 2, 'years', 'flat');
  assert.ok(flat);
  assert.equal(flat.totalInterest, 20000);
  assert.equal(flat.emi, 5000);
  assert.equal(flat.schedule[23].balance, 0);
  approxEqual(
    flat.schedule.reduce((s, r) => s + r.principalPaid, 0),
    100000,
    1e-6
  );

  // Zero interest reducing loan
  const zeroInt = computeEmiPlan(24000, 0, 0, 12, 'months', 'reducing');
  assert.ok(zeroInt);
  assert.equal(zeroInt.emi, 2000);
  assert.equal(zeroInt.totalInterest, 0);
  assert.equal(zeroInt.schedule[11].balance, 0);

  // 1-month tenure boundary
  const oneMonth = computeEmiPlan(10000, 0, 12, 1, 'months', 'reducing');
  assert.ok(oneMonth);
  approxEqual(oneMonth.emi, 10100, 1e-6);
  assert.equal(oneMonth.schedule[0].balance, 0);

  // Invalid inputs
  assert.equal(computeEmiPlan(0, 0, 10, 12, 'months', 'reducing'), null);
  assert.equal(computeEmiPlan(10000, 10000, 10, 12, 'months', 'reducing'), null);
  assert.equal(computeEmiPlan(10000, 12000, 10, 12, 'months', 'reducing'), null);
  assert.equal(computeEmiPlan(10000, 0, -5, 12, 'months', 'reducing'), null);
  assert.equal(computeEmiPlan(10000, 0, 10, 0, 'months', 'reducing'), null);
});

test('Age Calculator: exact Y/M/D, DST-proof day counts, leap-year Feb 29, zodiacs, validation', () => {
  const age1 = computeAgeDetails('2000-01-15', '2026-05-20');
  assert.ok(age1);
  assert.equal(age1.years, 26);
  assert.equal(age1.months, 4);
  assert.equal(age1.days, 5);
  assert.equal(age1.westernZodiac.name, 'Capricorn');
  assert.equal(age1.chineseZodiac, 'Dragon');

  // DST spring forward boundary (March 1 to March 31 must strictly be 30 days)
  const dstSpring = computeAgeDetails('2024-03-01', '2024-03-31');
  assert.ok(dstSpring);
  assert.equal(dstSpring.totalDays, 30);

  // DST fall back boundary (Nov 1 to Nov 10 must strictly be 9 days)
  const dstFall = computeAgeDetails('2024-11-01', '2024-11-10');
  assert.ok(dstFall);
  assert.equal(dstFall.totalDays, 9);

  // Leap-year baby checks
  const leapOnNonLeap = computeAgeDetails('2000-02-29', '2025-02-28');
  assert.ok(leapOnNonLeap);
  assert.equal(leapOnNonLeap.isBirthdayToday, true);
  assert.equal(leapOnNonLeap.daysUntilNextBday, 0);

  const leapBeforeNonLeap = computeAgeDetails('2000-02-29', '2025-02-27');
  assert.ok(leapBeforeNonLeap);
  assert.equal(leapBeforeNonLeap.daysUntilNextBday, 1);

  const leapOnLeap = computeAgeDetails('2000-02-29', '2024-02-29');
  assert.ok(leapOnLeap);
  assert.equal(leapOnLeap.years, 24);
  assert.equal(leapOnLeap.isBirthdayToday, true);

  // Half birthday clamping: Aug 31 + 6 months in non-leap 2025 -> Feb 28 (NOT Mar 3!)
  const halfBdayClamp = computeAgeDetails('1995-08-31', '2025-01-10');
  assert.ok(halfBdayClamp);
  assert.equal(halfBdayClamp.halfBdayDate, 'Feb 28');

  // Validation rejections
  assert.equal(computeAgeDetails('1899-12-31', '2025-01-01'), null);
  assert.equal(computeAgeDetails('2026-01-02', '2026-01-01'), null);
  assert.equal(computeAgeDetails('2025-02-29', '2026-01-01'), null); // invalid date 2025-02-29
});

test('Wishlist Planner & Currency Exchange: UTC-safe dates, completion, cross-rates', () => {
  // Wishlist UTC calendar math (no off-by-1 shift across timezone offsets)
  const daysLeft = computeWishlistDaysRemaining('date', '2026-06-15', 0, 'days', '2026-06-05');
  assert.equal(daysLeft, 10);

  assert.equal(computeWishlistDaysRemaining('duration', '', 4, 'weeks'), 28);
  assert.equal(computeWishlistDaysRemaining('duration', '', 2, 'months'), 61);

  const plan = computeWishlistPlan(1000, 300, 10);
  assert.ok(plan);
  assert.equal(plan.remaining, 700);
  assert.equal(plan.progressPercent, 30);
  assert.equal(plan.daily, 70);
  assert.equal(plan.weekly, 490);
  assert.equal(plan.isCompleted, false);

  const completedPlan = computeWishlistPlan(1000, 1000, 5);
  assert.ok(completedPlan);
  assert.equal(completedPlan.isCompleted, true);
  assert.equal(completedPlan.progressPercent, 100);
  assert.equal(completedPlan.daily, 0);

  // Saved > target or target <= 0 rejected
  assert.equal(computeWishlistPlan(500, 600, 5), null);
  assert.equal(computeWishlistPlan(0, 0, 5), null);

  // Currency cross-rate and roundtrip
  const rates = { USD: 1, EUR: 0.92, BDT: 120, INR: 84 };
  const fx = convertCurrencyAmount(100, 'USD', 'BDT', rates);
  assert.ok(fx);
  assert.equal(fx.convertedAmount, 12000);
  assert.equal(fx.exchangeRate, 120);

  const cross = convertCurrencyAmount(100, 'BDT', 'INR', rates);
  assert.ok(cross);
  approxEqual(cross.convertedAmount, 70, 1e-10);
  const crossBack = convertCurrencyAmount(cross.convertedAmount, 'INR', 'BDT', rates);
  approxEqual(crossBack!.convertedAmount, 100, 1e-10);

  assert.equal(convertCurrencyAmount(0, 'USD', 'INR', rates), null);
  assert.equal(convertCurrencyAmount(100, 'USD', 'INVALID', rates), null);
});

// ============================================================================
// 2. SCIENTIFIC MATH ENGINE (safeEvaluateMath + helpers)
// ============================================================================

test('Scientific Engine: arithmetic precedence, associativity, unary signs, IEEE-754 cleanup', () => {
  assert.equal(safeEvaluateMath('2 + 3 × 4 - 5', 'DEG').result, 9);
  assert.equal(safeEvaluateMath('(2 + 3) × (4 - 1)', 'DEG').result, 15);
  assert.equal(safeEvaluateMath('2 ^ 3 ^ 2', 'DEG').result, 512); // Right-associative: 2^(3^2)
  assert.equal(safeEvaluateMath('-2 ^ 2', 'DEG').result, -4);
  assert.equal(safeEvaluateMath('(-2) ^ 2', 'DEG').result, 4);
  assert.equal(safeEvaluateMath('--5', 'DEG').result, 5);
  assert.equal(safeEvaluateMath('17 mod 5', 'DEG').result, 2);
  assert.equal(safeEvaluateMath('-7 mod 3', 'DEG').result, -1);

  // IEEE-754 cleanup vs preserving genuine tiny differences
  assert.equal(safeEvaluateMath('0.1 + 0.2', 'DEG').result, 0.3);
  assert.equal(safeEvaluateMath('0.1 + 0.2 - 0.3', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('1.005 × 100', 'DEG').result, 100.5);
  assert.equal(safeEvaluateMath('1000000 + 0.000001', 'DEG').result, 1000000.000001);
  approxEqual(safeEvaluateMath('1.000000000001 - 1', 'DEG').result, 1e-12, 1e-15);

  // Large and tiny numbers with scientific formatting
  assert.equal(formatDisplayNumber(1e15), '1E15');
  assert.equal(formatDisplayNumber(1.23e-9), '1.23E-9');
  assert.equal(formatDisplayNumber(-0), '0');
  assert.equal(safeEvaluateMath('2E5 × 3E-2', 'DEG').result, 6000);
});

test('Scientific Engine: implicit multiplication, constants, percentage, factorial, roots', () => {
  approxEqual(safeEvaluateMath('2π', 'DEG').result, 2 * Math.PI, 1e-11);
  assert.equal(safeEvaluateMath('2(3 + 4)', 'DEG').result, 14);
  assert.equal(safeEvaluateMath('(2 + 3)(4 + 5)', 'DEG').result, 45);
  assert.equal(safeEvaluateMath('sin(30)2', 'DEG').result, 1);
  assert.equal(safeEvaluateMath('50%200', 'DEG').result, 100);
  assert.equal(safeEvaluateMath('2sqrt(9)', 'DEG').result, 6);
  assert.equal(safeEvaluateMath('Ans + 10', 'DEG', '32').result, 42);
  approxEqual(safeEvaluateMath('ln(e^3)', 'DEG').result, 3, 1e-12);

  // Factorials
  assert.equal(factorial(0), 1);
  assert.equal(factorial(1), 1);
  assert.equal(factorial(5), 120);
  assert.equal(factorial(10), 3628800);
  assert.equal(safeEvaluateMath('0! + 4!', 'DEG').result, 25);
  assert.equal(safeEvaluateMath('3! ^ 2', 'DEG').result, 36);
  assert.equal(safeEvaluateMath('2 ^ 3!', 'DEG').result, 64);
  assert.ok(Number.isFinite(safeEvaluateMath('170!', 'DEG').result));

  // Roots & yroot
  assert.equal(safeEvaluateMath('sqrt(144)', 'DEG').result, 12);
  assert.equal(safeEvaluateMath('cbrt(27)', 'DEG').result, 3);
  assert.equal(safeEvaluateMath('cbrt(-27)', 'DEG').result, -3);
  assert.equal(safeEvaluateMath('16 yroot 4', 'DEG').result, 2);
  assert.equal(safeEvaluateMath('(-8) yroot 3', 'DEG').result, -2);
  assert.equal(safeEvaluateMath('(-8) yroot (-3)', 'DEG').result, -0.5);
  assert.equal(safeEvaluateMath('pow(2, 10)', 'DEG').result, 1024);
});

test('Scientific Engine: trigonometry (DEG & RAD), identities, huge angles, inverse trig', () => {
  // Exact DEG values
  assert.equal(safeEvaluateMath('sin(0)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('sin(30)', 'DEG').result, 0.5);
  assert.equal(safeEvaluateMath('sin(90)', 'DEG').result, 1);
  assert.equal(safeEvaluateMath('sin(180)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('sin(270)', 'DEG').result, -1);
  assert.equal(safeEvaluateMath('sin(360000030)', 'DEG').result, 0.5);
  assert.equal(normalizeDegrees(-30), 330);
  assert.equal(safeEvaluateMath('sin(-30)', 'DEG').result, -0.5);

  assert.equal(safeEvaluateMath('cos(0)', 'DEG').result, 1);
  assert.equal(safeEvaluateMath('cos(60)', 'DEG').result, 0.5);
  assert.equal(safeEvaluateMath('cos(90)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('cos(180)', 'DEG').result, -1);
  assert.equal(safeEvaluateMath('cos(300)', 'DEG').result, 0.5);

  assert.equal(safeEvaluateMath('tan(0)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('tan(45)', 'DEG').result, 1);
  assert.equal(safeEvaluateMath('tan(135)', 'DEG').result, -1);
  assert.equal(safeEvaluateMath('tan(225)', 'DEG').result, 1);

  // Trigonometric Pythagorean identity with full intermediate precision
  for (const deg of [15, 23.7, 37, 60, 73.25, 118, 255]) {
    assert.equal(
      safeEvaluateMath(`sin(${deg})^2 + cos(${deg})^2 - 1`, 'DEG').result,
      0,
      `Pythagorean identity failed for ${deg}°`
    );
  }

  // RAD mode
  assert.equal(safeEvaluateMath('sin(π)', 'RAD').result, 0);
  assert.equal(safeEvaluateMath('cos(π/2)', 'RAD').result, 0);
  assert.equal(safeEvaluateMath('cos(π)', 'RAD').result, -1);
  assert.equal(safeEvaluateMath('tan(π/4)', 'RAD').result, 1);
  assert.equal(safeEvaluateMath('sin(1e-10)', 'RAD').result, 1e-10);
  approxEqual(degToRadExact(180), Math.PI, 1e-12);
  assert.equal(radToDegExact(Math.PI), 180);

  // Inverse trig in DEG & RAD
  assert.equal(safeEvaluateMath('asin(0.5)', 'DEG').result, 30);
  assert.equal(safeEvaluateMath('acos(0.5)', 'DEG').result, 60);
  assert.equal(safeEvaluateMath('atan(1)', 'DEG').result, 45);
  approxEqual(safeEvaluateMath('asin(1)', 'RAD').result, Math.PI / 2, 1e-11);
  approxEqual(safeEvaluateMath('acos(-1)', 'RAD').result, Math.PI, 1e-11);
  assert.equal(safeEvaluateMath('asin(sin(42))', 'DEG').result, 42);
});

test('Scientific Engine: hyperbolic, exponential, logarithms & nested complex expressions', () => {
  // Hyperbolic identity: cosh(x)^2 - sinh(x)^2 = 1
  for (const x of [0, 0.75, 2.5, -1.8]) {
    assert.equal(
      safeEvaluateMath(`cosh(${x})^2 - sinh(${x})^2 - 1`, 'DEG').result,
      0,
      `Hyperbolic identity failed for x=${x}`
    );
  }
  assert.equal(safeEvaluateMath('sinh(0)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('cosh(0)', 'DEG').result, 1);
  assert.equal(safeEvaluateMath('tanh(0)', 'DEG').result, 0);
  approxEqual(safeEvaluateMath('asinh(sinh(2.3))', 'DEG').result, 2.3, 1e-11);
  approxEqual(safeEvaluateMath('acosh(cosh(2.3))', 'DEG').result, 2.3, 1e-11);
  approxEqual(safeEvaluateMath('atanh(tanh(0.6))', 'DEG').result, 0.6, 1e-11);

  // Exponentials & logarithms
  assert.equal(safeEvaluateMath('log(1000)', 'DEG').result, 3);
  assert.equal(safeEvaluateMath('log(1)', 'DEG').result, 0);
  assert.equal(safeEvaluateMath('log2(1024)', 'DEG').result, 10);
  assert.equal(safeEvaluateMath('ln(1)', 'DEG').result, 0);
  approxEqual(safeEvaluateMath('exp(2)', 'DEG').result, Math.E ** 2, 1e-11);
  assert.equal(safeEvaluateMath('10^(4)', 'DEG').result, 10000);
  assert.equal(safeEvaluateMath('2^(8)', 'DEG').result, 256);
  assert.equal(safeEvaluateMath('abs(-42.5)', 'DEG').result, 42.5);
  approxEqual(safeEvaluateMath('ln(1.0000001)', 'DEG').result, Math.log1p(1e-7), 1e-12);

  // Multi-layer compound expression mixing trig, powers, logs, roots, factorial, reciprocal, mod
  const compound =
    '((sin(30) + cos(60))^4 × sqrt(144) ÷ 3!) + (ln(e^5) - log2(16)) + (1/(0.25)) - (29 mod 5)';
  // = (1^4 * 12 / 6) + (5 - 4) + 4 - 4 = 2 + 1 + 4 - 4 = 3
  assert.equal(safeEvaluateMath(compound, 'DEG').result, 3);
});

test('Scientific Engine: domain, syntax, overflow errors & cache eviction', () => {
  const errCases: [string, RegExp, ('DEG' | 'RAD')?][] = [
    ['', /Empty/],
    ['5 / 0', /divide by zero/i],
    ['5 mod 0', /Modulo by zero/i],
    ['tan(90)', /asymptote/i, 'DEG'],
    ['tan(270)', /asymptote/i, 'DEG'],
    ['tan(π/2)', /asymptote/i, 'RAD'],
    ['sqrt(-4)', /negative/i],
    ['log(0)', /undefined/i],
    ['log2(-1)', /undefined/i],
    ['ln(0)', /undefined/i],
    ['asin(1.5)', /between -1 and 1/i],
    ['acos(-1.2)', /between -1 and 1/i],
    ['acosh(0.5)', /≥ 1/i],
    ['atanh(1)', /strictly between -1 and 1/i],
    ['(-1)!', /non-negative integer/i],
    ['2.5!', /non-negative integer/i],
    ['171!', /overflow/i],
    ['(-8) yroot 2', /Even root/i],
    ['8 yroot 0', /cannot be zero/i],
    ['(-2)^0.5', /Invalid exponentiation/i],
    ['()', /Empty parentheses/i],
    ['(2 + 3', /Unclosed parenthesis/i],
    ['2 + 3)', /Unmatched closing/i],
    ['5 +', /Incomplete expression/i],
    ['(* 2)', /Invalid operator/i],
    ['1000^1000', /overflow/i],
  ];

  for (const [expr, pattern, mode] of errCases) {
    assert.throws(
      () => safeEvaluateMath(expr, mode || 'DEG', '0', { allowAutoClose: false }),
      pattern,
      `Expected "${expr}" to throw ${pattern}`
    );
  }

  // Live preview mode allows partial expressions / auto-closing
  assert.equal(safeEvaluateMath('2 × (3 + 4', 'DEG', '0', { allowAutoClose: true }).result, 14);
  assert.equal(safeEvaluateMath('5 + ', 'DEG', '0', { allowAutoClose: true }).result, 5);
  assert.equal(closeUnbalancedParens('sin((2+3'), 'sin((2+3))');
  assert.equal(countUnclosedParens('sin((2+3)'), 1);

  // Bounded cache (MAX_EVAL_CACHE = 64)
  clearEvaluationCache();
  for (let i = 1; i <= 80; i++) {
    evaluateWithCache(`${i} + 1`, 'DEG', '0', { allowAutoClose: false });
  }
  assert.ok(getEvaluationCacheSize() <= 64);
});

// ============================================================================
// 3. SCIENTIFIC CALCULATOR REDUCER (Interactive Keypad Sequences)
// ============================================================================

test('Calculator Reducer: standard & scientific interactive button sequences and bug regressions', () => {
  // 1. Operator precedence in multi-step entry: 2 + 3 * 4 = 14
  const seq1 = runSequence([
    { type: 'DIGIT', digit: '2' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '3' },
    { type: 'OPERATOR', op: '×' },
    { type: 'DIGIT', digit: '4' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(seq1.evaluatedResult, '14');
  assert.equal(seq1.lastAnswer, '14');

  // 2. Reciprocal (1/x) precedence regression fix: 10 ÷ 4 [1/x] = 40 (NOT 2.5!)
  const recDiv = runSequence([
    { type: 'DIGIT', digit: '1' },
    { type: 'DIGIT', digit: '0' },
    { type: 'OPERATOR', op: '÷' },
    { type: 'DIGIT', digit: '4' },
    { type: 'FUNCTION', fnName: 'reciprocal' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(recDiv.evaluatedResult, '40');

  // Reciprocal exponent precedence: 2 ^ 4 [1/x] = 2^(1/4) ≈ 1.189207115003
  const recPow = runSequence([
    { type: 'DIGIT', digit: '2' },
    { type: 'OPERATOR', op: '^' },
    { type: 'DIGIT', digit: '4' },
    { type: 'FUNCTION', fnName: 'reciprocal' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  approxEqual(Number(recPow.evaluatedResult), Math.pow(2, 0.25), 1e-10);

  // 3. TOGGLE_SIGN (±) regression fixes:
  // a) Fresh start: ± 3 + 5 = 2
  const signFresh = runSequence([
    { type: 'TOGGLE_SIGN' },
    { type: 'DIGIT', digit: '3' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '5' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(signFresh.evaluatedResult, '2');

  // b) Mid-expression: 5 + ± 3 = 2 (previously became 5 + -53 = -48!)
  const signMid = runSequence([
    { type: 'DIGIT', digit: '5' },
    { type: 'OPERATOR', op: '+' },
    { type: 'TOGGLE_SIGN' },
    { type: 'DIGIT', digit: '3' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(signMid.evaluatedResult, '2');

  // c) Inside open function: sin( ± 3 0 ) = -0.5
  const signInsideFn = runSequence([
    { type: 'FUNCTION', fnName: 'sin' },
    { type: 'TOGGLE_SIGN' },
    { type: 'DIGIT', digit: '3' },
    { type: 'DIGIT', digit: '0' },
    { type: 'PAREN', paren: ')' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(signInsideFn.evaluatedResult, '-0.5');

  // d) Squaring negative number: 3 ± x² = 9 (must wrap as (-3)^2, NOT -3^2 = -9)
  const negSquared = runSequence([
    { type: 'DIGIT', digit: '3' },
    { type: 'TOGGLE_SIGN' },
    { type: 'FUNCTION', fnName: 'sq' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(negSquared.evaluatedResult, '9');

  // e) Negating evaluated result then chaining: 4 + 4 = ± + 2 = -6
  const signEval = runSequence([
    { type: 'DIGIT', digit: '4' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '4' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
    { type: 'TOGGLE_SIGN' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '2' },
    { type: 'EQUAL', timeStr: '10:00 AM' },
  ]);
  assert.equal(signEval.evaluatedResult, '-6');
});

test('Calculator Reducer: successive = does not repeat, memory operations, parens, backspace, EE, error recovery', () => {
  // Successive '=' presses must NOT repeat the last binary operation: 2 + 3 = = = -> stays 5
  const repeatEq = runSequence([
    { type: 'DIGIT', digit: '2' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '3' },
    { type: 'EQUAL', timeStr: '10:01 AM' },
    { type: 'EQUAL', timeStr: '10:01 AM' },
    { type: 'EQUAL', timeStr: '10:01 AM' },
  ]);
  assert.equal(repeatEq.evaluatedResult, '5');
  assert.equal(repeatEq.tape.length, 1);

  // Memory workflow: 10 MS -> 5 M+ -> 2 M- -> C -> MR = -> 13
  const memSeq = runSequence([
    { type: 'DIGIT', digit: '1' },
    { type: 'DIGIT', digit: '0' },
    { type: 'MEMORY', action: 'MS' },
    { type: 'CLEAR_ENTRY' },
    { type: 'DIGIT', digit: '5' },
    { type: 'MEMORY', action: 'M+' },
    { type: 'CLEAR_ENTRY' },
    { type: 'DIGIT', digit: '2' },
    { type: 'MEMORY', action: 'M-' },
    { type: 'CLEAR_ALL' },
    { type: 'MEMORY', action: 'MR' },
    { type: 'EQUAL', timeStr: '10:02 AM' },
  ]);
  assert.equal(memSeq.evaluatedResult, '13');
  assert.equal(memSeq.hasMemory, true);
  assert.equal(runSequence([{ type: 'MEMORY', action: 'MC' }], memSeq).hasMemory, false);

  // Parenthesis error preserves input rather than wiping out expression
  const unclosed = runSequence([
    { type: 'PAREN', paren: '(' },
    { type: 'DIGIT', digit: '2' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '3' },
    { type: 'EQUAL', timeStr: '10:03 AM' },
  ]);
  assert.ok(unclosed.errorMessage && unclosed.errorMessage.includes('Unclosed'));
  assert.notEqual(unclosed.currentInput, 'Error');
  const recovered = runSequence(
    [
      { type: 'PAREN', paren: ')' },
      { type: 'EQUAL', timeStr: '10:03 AM' },
    ],
    unclosed
  );
  assert.equal(recovered.evaluatedResult, '5');

  // Backspace on '-5' returns cleanly to '0' (no dangling '-')
  const bsNeg = runSequence([
    { type: 'DIGIT', digit: '5' },
    { type: 'TOGGLE_SIGN' },
    { type: 'BACKSPACE' },
  ]);
  assert.equal(bsNeg.currentInput, '0');
  assert.equal(bsNeg.isNewInput, true);

  // Scientific notation input via SCI_EXP: 1.5 EE ± 3 = 0.0015
  const eeSeq = runSequence([
    { type: 'DIGIT', digit: '1' },
    { type: 'DECIMAL' },
    { type: 'DIGIT', digit: '5' },
    { type: 'SCI_EXP' },
    { type: 'TOGGLE_SIGN' },
    { type: 'DIGIT', digit: '3' },
    { type: 'EQUAL', timeStr: '10:04 AM' },
  ]);
  assert.equal(eeSeq.evaluatedResult, '0.0015');

  // buildFullExpression trailing op strip when isNewInput=true
  assert.equal(buildFullExpression('5 +', '5', true, false), '5');
  assert.equal(buildFullExpression('(2 + 3)', '4', false, false), '(2 + 3) × 4');

  // Reciprocal of parenthesized group inside compound division: 20 ÷ (2 + 3) [1/x] = 100
  const recGroup = runSequence([
    { type: 'DIGIT', digit: '2' },
    { type: 'DIGIT', digit: '0' },
    { type: 'OPERATOR', op: '÷' },
    { type: 'PAREN', paren: '(' },
    { type: 'DIGIT', digit: '2' },
    { type: 'OPERATOR', op: '+' },
    { type: 'DIGIT', digit: '3' },
    { type: 'PAREN', paren: ')' },
    { type: 'FUNCTION', fnName: 'reciprocal' },
    { type: 'EQUAL', timeStr: '10:05 AM' },
  ]);
  assert.equal(recGroup.evaluatedResult, '100');

  // TOGGLE_ANGLE, LOAD_TAPE, CLEAR_TAPE
  const toggledAngle = runSequence([{ type: 'TOGGLE_ANGLE' }], recGroup);
  assert.equal(toggledAngle.angleMode, 'RAD');
  const loaded = calcReducer(toggledAngle, { type: 'LOAD_TAPE', res: '42' });
  assert.equal(loaded.currentInput, '42');
  assert.equal(calcReducer(loaded, { type: 'CLEAR_TAPE' }).tape.length, 0);
});

test('Long-horizon, month-end rollover, and cache key isolation checks', () => {
  // 30-year (360-month) home loan EMI amortization invariant
  const mortgage = computeEmiPlan(500000, 100000, 6.5, 30, 'years', 'reducing');
  assert.ok(mortgage);
  assert.equal(mortgage.months, 360);
  assert.equal(mortgage.yearlySummaries.length, 30);
  approxEqual(mortgage.emi, 2528.27209, 1e-4, '30yr mortgage EMI');
  assert.equal(mortgage.schedule[359].balance, 0);
  approxEqual(
    mortgage.schedule.reduce((s, r) => s + r.principalPaid, 0),
    400000,
    1e-5
  );

  // Month-end rollover Age test (leap Feb 2024 vs Jan 31)
  const ageRollover = computeAgeDetails('2000-01-31', '2024-03-01');
  assert.ok(ageRollover);
  assert.equal(ageRollover.years, 24);
  assert.equal(ageRollover.months, 1);
  assert.equal(ageRollover.days, 1);
  assert.ok(ageRollover.nextBdayDays >= 0 && ageRollover.nextBdayMonths >= 0);
  assert.equal(ageRollover.totalDays, 8796);

  // Non-leap month-end rollover (Jan 31 -> Mar 1)
  const ageRolloverNonLeap = computeAgeDetails('2000-01-31', '2025-03-01');
  assert.ok(ageRolloverNonLeap);
  assert.equal(ageRolloverNonLeap.years, 25);
  assert.equal(ageRolloverNonLeap.months, 1);
  assert.equal(ageRolloverNonLeap.days, 1);
  assert.ok(ageRolloverNonLeap.days >= 0);

  // Cache isolation across angleMode & Ans
  clearEvaluationCache();
  assert.equal(evaluateWithCache('sin(1)', 'RAD', '0').result, sanitizeFloat(Math.sin(1)));
  assert.notEqual(
    evaluateWithCache('sin(1)', 'RAD', '0').result,
    evaluateWithCache('sin(1)', 'DEG', '0').result
  );
  assert.equal(evaluateWithCache('Ans × 2', 'DEG', '5').result, 10);
  assert.equal(evaluateWithCache('Ans × 2', 'DEG', '12').result, 24);
});

