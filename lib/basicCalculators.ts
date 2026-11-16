import { safeEvaluateMath } from './scientificEngine';

/**
 * Pure, deterministic basic/retail/financial calculator functions shared across UI
 * components and verified by the automated calculator test suite.
 */

export function evaluateBasicArithmetic(expr: string): number {
  if (!expr || typeof expr !== 'string') return NaN;
  const cleaned = expr.replace(/,/g, '').trim();
  if (!cleaned) return NaN;

  // Allow fast exact decimal parsing for plain numeric literals (including negative/scientific)
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(cleaned)) {
    const direct = Number(cleaned);
    return Number.isFinite(direct) ? direct : NaN;
  }

  try {
    const { result } = safeEvaluateMath(cleaned, 'DEG', '0', { allowAutoClose: false });
    return Number.isFinite(result) ? result : NaN;
  } catch {
    return NaN;
  }
}

export interface DiscountResult {
  originalPrice: number;
  discountPercent: number;
  saved: number;
  finalPrice: number;
}

export function computeDiscount(
  priceInput: string | number,
  discountInput: string | number
): DiscountResult | null {
  const price =
    typeof priceInput === 'number' ? priceInput : evaluateBasicArithmetic(priceInput);
  const disc =
    typeof discountInput === 'number'
      ? discountInput
      : evaluateBasicArithmetic(discountInput);

  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(disc) || disc < 0 || disc > 100) return null;

  const saved = Number(((price * disc) / 100).toPrecision(13));
  const finalPrice = Number(Math.max(0, price - saved).toPrecision(13));

  return {
    originalPrice: price,
    discountPercent: disc,
    saved,
    finalPrice,
  };
}

export type WeightUnitSystem = 'metric' | 'imperial';

export interface WeightCalculationResult {
  pricePerUnit: number;
  budget: number;
  unitSystem: WeightUnitSystem;
  /** Grams when metric, ounces when imperial */
  quantityBaseUnit: number;
  formattedQty: string;
}

export function computeWeightQuantity(
  pricePerUnitInput: string | number,
  budgetInput: string | number,
  unitSystem: WeightUnitSystem = 'metric'
): WeightCalculationResult | null {
  const pricePerUnit =
    typeof pricePerUnitInput === 'number'
      ? pricePerUnitInput
      : evaluateBasicArithmetic(pricePerUnitInput);
  const budget =
    typeof budgetInput === 'number' ? budgetInput : evaluateBasicArithmetic(budgetInput);

  if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;
  if (!Number.isFinite(budget) || budget <= 0) return null;

  if (unitSystem === 'imperial') {
    const ounces = (budget / pricePerUnit) * 16;
    const formattedQty =
      ounces >= 16 ? `${(ounces / 16).toFixed(2)} lb` : `${ounces.toFixed(1)} oz`;
    return {
      pricePerUnit,
      budget,
      unitSystem,
      quantityBaseUnit: ounces,
      formattedQty,
    };
  }

  const grams = (budget / pricePerUnit) * 1000;
  const formattedQty =
    grams >= 1000 ? `${(grams / 1000).toFixed(2)} kg` : `${grams.toFixed(0)} grams`;

  return {
    pricePerUnit,
    budget,
    unitSystem,
    quantityBaseUnit: grams,
    formattedQty,
  };
}

export type WeightTargetUnit = 'kg' | 'g' | 'lb' | 'oz';

export interface WeightCostCalculationResult {
  pricePerUnit: number;
  targetWeight: number;
  targetUnit: WeightTargetUnit;
  unitSystem: WeightUnitSystem;
  normalizedMainUnits: number;
  totalCost: number;
  formattedWeight: string;
}

export function computeWeightPrice(
  pricePerUnitInput: string | number,
  targetWeightInput: string | number,
  targetUnit: WeightTargetUnit = 'kg',
  unitSystem: WeightUnitSystem = 'metric'
): WeightCostCalculationResult | null {
  const pricePerUnit =
    typeof pricePerUnitInput === 'number'
      ? pricePerUnitInput
      : evaluateBasicArithmetic(pricePerUnitInput);
  const targetWeight =
    typeof targetWeightInput === 'number'
      ? targetWeightInput
      : evaluateBasicArithmetic(targetWeightInput);

  if (!Number.isFinite(pricePerUnit) || pricePerUnit <= 0) return null;
  if (!Number.isFinite(targetWeight) || targetWeight <= 0) return null;

  let normalizedMainUnits = targetWeight;
  if (unitSystem === 'imperial') {
    switch (targetUnit) {
      case 'lb':
        normalizedMainUnits = targetWeight;
        break;
      case 'oz':
        normalizedMainUnits = targetWeight / 16;
        break;
      case 'kg':
        normalizedMainUnits = targetWeight * 2.20462262185;
        break;
      case 'g':
        normalizedMainUnits = (targetWeight / 1000) * 2.20462262185;
        break;
    }
  } else {
    switch (targetUnit) {
      case 'kg':
        normalizedMainUnits = targetWeight;
        break;
      case 'g':
        normalizedMainUnits = targetWeight / 1000;
        break;
      case 'lb':
        normalizedMainUnits = targetWeight * 0.45359237;
        break;
      case 'oz':
        normalizedMainUnits = (targetWeight / 16) * 0.45359237;
        break;
    }
  }

  const totalCost = Number((pricePerUnit * normalizedMainUnits).toPrecision(13));
  const formattedWeight = `${targetWeight} ${targetUnit}`;

  return {
    pricePerUnit,
    targetWeight,
    targetUnit,
    unitSystem,
    normalizedMainUnits,
    totalCost,
    formattedWeight,
  };
}

export type RetailUnitConversionType =
  | 'g_to_kg'
  | 'kg_to_g'
  | 'ml_to_l'
  | 'l_to_ml'
  | 'lb_to_kg'
  | 'kg_to_lb'
  | 'oz_to_g'
  | 'ft_to_m'
  | 'm_to_ft'
  | 'floz_to_ml';

export interface UnitConversionResult {
  input: number;
  numericValue: number;
  formattedResult: string;
  details: string;
}

export function convertRetailUnit(
  valueInput: string | number,
  unitType: RetailUnitConversionType
): UnitConversionResult | null {
  const input =
    typeof valueInput === 'number' ? valueInput : evaluateBasicArithmetic(valueInput);
  if (!Number.isFinite(input)) return null;

  let numericValue = 0;
  let formattedResult = '';
  let details = '';

  switch (unitType) {
    case 'g_to_kg':
      numericValue = input / 1000;
      formattedResult = `${numericValue.toFixed(3)} kg`;
      details = `Input Amount: ${input} grams | Conversion Type: Grams to Kilograms (g -> kg)`;
      break;
    case 'kg_to_g':
      numericValue = input * 1000;
      formattedResult = `${numericValue.toFixed(0)} grams`;
      details = `Input Amount: ${input} kg | Conversion Type: Kilograms to Grams (kg -> g)`;
      break;
    case 'ml_to_l':
      numericValue = input / 1000;
      formattedResult = `${numericValue.toFixed(3)} Liters`;
      details = `Input Amount: ${input} ml | Conversion Type: Milliliters to Liters (ml -> L)`;
      break;
    case 'l_to_ml':
      numericValue = input * 1000;
      formattedResult = `${numericValue.toFixed(0)} ml`;
      details = `Input Amount: ${input} Liters | Conversion Type: Liters to Milliliters (L -> ml)`;
      break;
    case 'lb_to_kg':
      numericValue = input * 0.45359237;
      formattedResult = `${numericValue.toFixed(3)} kg`;
      details = `Input Amount: ${input} lb | Conversion Type: Pounds to Kilograms (lb -> kg)`;
      break;
    case 'kg_to_lb':
      numericValue = input * 2.20462262;
      formattedResult = `${numericValue.toFixed(3)} lb`;
      details = `Input Amount: ${input} kg | Conversion Type: Kilograms to Pounds (kg -> lb)`;
      break;
    case 'oz_to_g':
      numericValue = input * 28.3495231;
      formattedResult = `${numericValue.toFixed(2)} g`;
      details = `Input Amount: ${input} oz | Conversion Type: Ounces to Grams (oz -> g)`;
      break;
    case 'ft_to_m':
      numericValue = input * 0.3048;
      formattedResult = `${numericValue.toFixed(3)} m`;
      details = `Input Amount: ${input} ft | Conversion Type: Feet to Meters (ft -> m)`;
      break;
    case 'm_to_ft':
      numericValue = input * 3.2808399;
      formattedResult = `${numericValue.toFixed(3)} ft`;
      details = `Input Amount: ${input} m | Conversion Type: Meters to Feet (m -> ft)`;
      break;
    case 'floz_to_ml':
      numericValue = input * 29.5735296;
      formattedResult = `${numericValue.toFixed(2)} mL`;
      details = `Input Amount: ${input} fl oz | Conversion Type: Fluid Ounces to Milliliters (fl oz -> mL)`;
      break;
  }

  return { input, numericValue, formattedResult, details };
}

export type InterestMethod = 'reducing' | 'flat';

export interface EmiScheduleRow {
  month: number;
  emi: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
  totalPaidSoFar: number;
}

export interface EmiYearlySummary {
  year: number;
  startMonth: number;
  endMonth: number;
  emiPaid: number;
  principalPaid: number;
  interestPaid: number;
  endingBalance: number;
}

export interface EmiPlanResult {
  principal: number;
  months: number;
  emi: number;
  totalInterest: number;
  totalLoanOutflow: number;
  overallTotalCost: number;
  principalPercent: number;
  interestPercent: number;
  chartData: { name: string; value: number; color: string }[];
  schedule: EmiScheduleRow[];
  yearlySummaries: EmiYearlySummary[];
  amortizationTrendData: {
    month: string;
    principalPaid: number;
    interestPaid: number;
    balance: number;
  }[];
  comparisonDiff: number;
  flatAltInterest: number;
  reducingAltInterest: number;
}

export function computeEmiPlan(
  price: number,
  downPayment: number,
  annualRate: number,
  tenureVal: number,
  tenureUnit: 'months' | 'years',
  interestMethod: InterestMethod
): EmiPlanResult | null {
  if (
    !Number.isFinite(price) ||
    !Number.isFinite(downPayment) ||
    !Number.isFinite(annualRate) ||
    !Number.isFinite(tenureVal)
  ) {
    return null;
  }
  if (price <= 0 || downPayment < 0 || downPayment >= price || tenureVal <= 0 || annualRate < 0) {
    return null;
  }

  const principal = Math.max(0, price - downPayment);
  const months = Math.max(1, Math.round(tenureUnit === 'years' ? tenureVal * 12 : tenureVal));
  if (months <= 0) return null;

  let emi = 0;
  let totalInterest = 0;
  const schedule: EmiScheduleRow[] = [];

  if (interestMethod === 'flat') {
    const tenureYears = months / 12;
    totalInterest = principal * (annualRate / 100) * tenureYears;
    const totalOutflow = principal + totalInterest;
    emi = totalOutflow / months;

    const monthlyPrincipalPortion = principal / months;
    const monthlyInterestPortion = totalInterest / months;

    let currentBalance = principal;
    let cumPaid = 0;
    for (let m = 1; m <= months; m++) {
      const principalThisMonth = m === months ? currentBalance : monthlyPrincipalPortion;
      currentBalance = m === months ? 0 : Math.max(0, currentBalance - principalThisMonth);
      cumPaid += emi;
      schedule.push({
        month: m,
        emi,
        principalPaid: principalThisMonth,
        interestPaid: monthlyInterestPortion,
        balance: currentBalance,
        totalPaidSoFar: cumPaid,
      });
    }
  } else if (annualRate === 0) {
    emi = principal / months;
    totalInterest = 0;
    let currentBalance = principal;
    let cumPaid = 0;
    for (let m = 1; m <= months; m++) {
      const principalThisMonth = m === months ? currentBalance : emi;
      currentBalance = m === months ? 0 : Math.max(0, currentBalance - principalThisMonth);
      cumPaid += emi;
      schedule.push({
        month: m,
        emi,
        principalPaid: principalThisMonth,
        interestPaid: 0,
        balance: currentBalance,
        totalPaidSoFar: cumPaid,
      });
    }
  } else {
    const monthlyRate = annualRate / 12 / 100;
    const compoundFactor = Math.pow(1 + monthlyRate, months);
    emi = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);
    totalInterest = Math.max(0, emi * months - principal);

    let currentBalance = principal;
    let cumPaid = 0;
    for (let m = 1; m <= months; m++) {
      const interestForMonth = currentBalance * monthlyRate;
      let principalForMonth = emi - interestForMonth;
      if (m === months) {
        principalForMonth = currentBalance;
        currentBalance = 0;
      } else {
        currentBalance = Math.max(0, currentBalance - principalForMonth);
      }
      cumPaid += emi;
      schedule.push({
        month: m,
        emi,
        principalPaid: principalForMonth,
        interestPaid: interestForMonth,
        balance: currentBalance,
        totalPaidSoFar: cumPaid,
      });
    }
  }

  const totalLoanOutflow = emi * months;
  const overallTotalCost = totalLoanOutflow + downPayment;

  const principalPercent = totalLoanOutflow > 0 ? (principal / totalLoanOutflow) * 100 : 100;
  const interestPercent = totalLoanOutflow > 0 ? (totalInterest / totalLoanOutflow) * 100 : 0;

  let comparisonDiff = 0;
  let flatAltInterest = 0;
  let reducingAltInterest = 0;

  if (annualRate > 0) {
    const tenureYears = months / 12;
    flatAltInterest = principal * (annualRate / 100) * tenureYears;

    const monthlyRate = annualRate / 12 / 100;
    const compoundFactor = Math.pow(1 + monthlyRate, months);
    const reducingEmi = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);
    reducingAltInterest = Math.max(0, reducingEmi * months - principal);
    comparisonDiff = Math.abs(flatAltInterest - reducingAltInterest);
  }

  const yearlySummaries: EmiYearlySummary[] = [];
  const totalYears = Math.ceil(months / 12);
  for (let y = 1; y <= totalYears; y++) {
    const startM = (y - 1) * 12 + 1;
    const endM = Math.min(y * 12, months);
    const yearRows = schedule.filter((r) => r.month >= startM && r.month <= endM);

    const yEmi = yearRows.reduce((acc, r) => acc + r.emi, 0);
    const yPrinc = yearRows.reduce((acc, r) => acc + r.principalPaid, 0);
    const yInt = yearRows.reduce((acc, r) => acc + r.interestPaid, 0);
    const lastRow = yearRows[yearRows.length - 1];

    yearlySummaries.push({
      year: y,
      startMonth: startM,
      endMonth: endM,
      emiPaid: yEmi,
      principalPaid: yPrinc,
      interestPaid: yInt,
      endingBalance: lastRow ? lastRow.balance : 0,
    });
  }

  const chartData = [
    { name: 'Principal Amount', value: Math.round(principal), color: '#3B82F6' },
    { name: 'Total Interest', value: Math.round(totalInterest), color: '#F97316' },
  ];

  const amortizationTrendData = schedule.map((item) => ({
    month: `M${item.month}`,
    principalPaid: Math.round(item.principalPaid),
    interestPaid: Math.round(item.interestPaid),
    balance: Math.round(item.balance),
  }));

  return {
    principal,
    months,
    emi,
    totalInterest,
    totalLoanOutflow,
    overallTotalCost,
    principalPercent: Math.round(principalPercent),
    interestPercent: Math.round(interestPercent),
    chartData,
    schedule,
    yearlySummaries,
    amortizationTrendData,
    comparisonDiff,
    flatAltInterest,
    reducingAltInterest,
  };
}

export const ZODIAC_SIGNS = [
  { name: 'Capricorn', symbol: '♑', element: 'Earth', dates: 'Dec 22 - Jan 19' },
  { name: 'Aquarius', symbol: '♒', element: 'Air', dates: 'Jan 20 - Feb 18' },
  { name: 'Pisces', symbol: '♓', element: 'Water', dates: 'Feb 19 - Mar 20' },
  { name: 'Aries', symbol: '♈', element: 'Fire', dates: 'Mar 21 - Apr 19' },
  { name: 'Taurus', symbol: '♉', element: 'Earth', dates: 'Apr 20 - May 20' },
  { name: 'Gemini', symbol: '♊', element: 'Air', dates: 'May 21 - Jun 20' },
  { name: 'Cancer', symbol: '♋', element: 'Water', dates: 'Jun 21 - Jul 22' },
  { name: 'Leo', symbol: '♌', element: 'Fire', dates: 'Jul 23 - Aug 22' },
  { name: 'Virgo', symbol: '♍', element: 'Earth', dates: 'Aug 23 - Sep 22' },
  { name: 'Libra', symbol: '♎', element: 'Air', dates: 'Sep 23 - Oct 22' },
  { name: 'Scorpio', symbol: '♏', element: 'Water', dates: 'Oct 23 - Nov 21' },
  { name: 'Sagittarius', symbol: '♐', element: 'Fire', dates: 'Nov 22 - Dec 21' },
];

export const CHINESE_ZODIAC = [
  'Rat',
  'Ox',
  'Tiger',
  'Rabbit',
  'Dragon',
  'Snake',
  'Horse',
  'Goat',
  'Monkey',
  'Rooster',
  'Dog',
  'Pig',
];

export function getWesternZodiac(month: number, day: number) {
  if ((month === 1 && day <= 19) || (month === 12 && day >= 22)) return ZODIAC_SIGNS[0];
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return ZODIAC_SIGNS[1];
  if ((month === 2 && day >= 19) || (month === 3 && day <= 20)) return ZODIAC_SIGNS[2];
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return ZODIAC_SIGNS[3];
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return ZODIAC_SIGNS[4];
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return ZODIAC_SIGNS[5];
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return ZODIAC_SIGNS[6];
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return ZODIAC_SIGNS[7];
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return ZODIAC_SIGNS[8];
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return ZODIAC_SIGNS[9];
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return ZODIAC_SIGNS[10];
  return ZODIAC_SIGNS[11];
}

export function getChineseZodiac(year: number) {
  const index = (year - 4) % 12;
  return CHINESE_ZODIAC[(index + 12) % 12];
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonthUTC(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function parseIsoParts(iso: string): [number, number, number] | null {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12) return null;
  const maxD = daysInMonthUTC(year, month);
  if (day < 1 || day > maxD) return null;
  return [year, month, day];
}

export interface AgeCalculationResult {
  years: number;
  months: number;
  days: number;
  ageString: string;
  isBirthdayToday: boolean;
  totalDays: number;
  totalWeeks: number;
  remainingDaysAfterWeeks: number;
  totalMonths: number;
  totalHours: number;
  totalMinutes: number;
  totalSeconds: number;
  nextBdayMonths: number;
  nextBdayDays: number;
  daysUntilNextBday: number;
  nextBirthdayDate: Date;
  nextBirthdayWeekday: string;
  nextAge: number;
  nextBdayString: string;
  bornWeekday: string;
  westernZodiac: (typeof ZODIAC_SIGNS)[number];
  chineseZodiac: string;
  halfBdayDate: string;
}

export function computeAgeDetails(
  birthDateIso: string,
  targetDateIso: string
): AgeCalculationResult | null {
  const dobParts = parseIsoParts(birthDateIso);
  const targetParts = parseIsoParts(targetDateIso);
  if (!dobParts || !targetParts) return null;

  const [bYear, bMonth, bDay] = dobParts;
  const [tYear, tMonth, tDay] = targetParts;

  if (bYear < 1900) return null;

  const dobUtcMs = Date.UTC(bYear, bMonth - 1, bDay);
  const targetUtcMs = Date.UTC(tYear, tMonth - 1, tDay);
  if (dobUtcMs > targetUtcMs) return null;

  // 1. Exact Chronological Age (Years, Months, Days) — clamped anchor prevents negative days on month-end rollovers (e.g. Jan 31 -> Mar 1)
  let years = tYear - bYear;
  let months = tMonth - bMonth;
  let days = tDay - bDay;

  if (days < 0) {
    months--;
    if (months < 0) {
      years--;
      months += 12;
    }
    const anchorTotalMonths = bYear * 12 + (bMonth - 1) + years * 12 + months;
    const anchorYear = Math.floor(anchorTotalMonths / 12);
    const anchorMonth1Based = (anchorTotalMonths % 12) + 1;
    const anchorDay = Math.min(bDay, daysInMonthUTC(anchorYear, anchorMonth1Based));
    const anchorUtcMs = Date.UTC(anchorYear, anchorMonth1Based - 1, anchorDay);
    days = Math.round((targetUtcMs - anchorUtcMs) / 86400000);
  } else if (months < 0) {
    years--;
    months += 12;
  }

  // 2. DST-proof cumulative calendar units via UTC
  const totalDays = Math.round((targetUtcMs - dobUtcMs) / 86400000);
  const totalWeeks = Math.floor(totalDays / 7);
  const remainingDaysAfterWeeks = totalDays % 7;
  const totalMonths = years * 12 + months;
  const totalHours = totalDays * 24;
  const totalMinutes = totalHours * 60;
  const totalSeconds = totalMinutes * 60;

  // 3. Next Birthday (handles Feb 29 without rolling silently past Feb into Mar 1 on leap checks)
  const resolveAnnualBirthdayParts = (year: number): [number, number, number] => {
    if (bMonth === 2 && bDay === 29 && !isLeapYear(year)) {
      return [year, 2, 28];
    }
    return [year, bMonth, bDay];
  };

  let [nbY, nbM, nbD] = resolveAnnualBirthdayParts(tYear);
  let nextBdayUtcMs = Date.UTC(nbY, nbM - 1, nbD);
  if (nextBdayUtcMs < targetUtcMs) {
    [nbY, nbM, nbD] = resolveAnnualBirthdayParts(tYear + 1);
    nextBdayUtcMs = Date.UTC(nbY, nbM - 1, nbD);
  }

  const isBirthdayToday =
    (bMonth === tMonth && bDay === tDay) ||
    (bMonth === 2 && bDay === 29 && !isLeapYear(tYear) && tMonth === 2 && tDay === 28);

  let nextBdayMonths = 0;
  let nextBdayDays = 0;
  let daysUntilNextBday = 0;

  if (!isBirthdayToday) {
    let nbMonthsCalc = (nbY - tYear) * 12 + (nbM - tMonth);
    let nbDaysCalc = nbD - tDay;
    if (nbDaysCalc < 0) {
      nbMonthsCalc--;
      const anchorTotalMonths = tYear * 12 + (tMonth - 1) + nbMonthsCalc;
      const anchorYear = Math.floor(anchorTotalMonths / 12);
      const anchorMonth1Based = (anchorTotalMonths % 12) + 1;
      const anchorDay = Math.min(tDay, daysInMonthUTC(anchorYear, anchorMonth1Based));
      const anchorUtcMs = Date.UTC(anchorYear, anchorMonth1Based - 1, anchorDay);
      nbDaysCalc = Math.round((nextBdayUtcMs - anchorUtcMs) / 86400000);
    }

    nextBdayMonths = Math.max(0, nbMonthsCalc);
    nextBdayDays = Math.max(0, nbDaysCalc);
    daysUntilNextBday = Math.round((nextBdayUtcMs - targetUtcMs) / 86400000);
  }

  const nextBdayDateObj = new Date(nextBdayUtcMs);
  const dobDateObj = new Date(dobUtcMs);
  const nextBirthdayWeekday = nextBdayDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  const bornWeekday = dobDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
  const nextAge = years + 1;

  // Clamped Half Birthday so e.g. Aug 31 + 6 months -> Feb 28/29 instead of overflowing into March
  const halfBdayMonth = (bMonth + 6) % 12 || 12;
  const halfBdayDay = Math.min(bDay, daysInMonthUTC(tYear, halfBdayMonth));
  const halfBdayDateObj = new Date(Date.UTC(tYear, halfBdayMonth - 1, halfBdayDay));

  const westernZodiac = getWesternZodiac(bMonth, bDay);
  const chineseZodiac = getChineseZodiac(bYear);

  const ageString = `${years} Year${years !== 1 ? 's' : ''}, ${months} Month${
    months !== 1 ? 's' : ''
  }, ${days} Day${days !== 1 ? 's' : ''}`;
  const nextBdayString = isBirthdayToday
    ? 'Happy Birthday! 🎉 Turning ' + years + ' today!'
    : `${nextBdayMonths} month${nextBdayMonths !== 1 ? 's' : ''} and ${nextBdayDays} day${
        nextBdayDays !== 1 ? 's' : ''
      } left`;

  return {
    years,
    months,
    days,
    ageString,
    isBirthdayToday,
    totalDays,
    totalWeeks,
    remainingDaysAfterWeeks,
    totalMonths,
    totalHours,
    totalMinutes,
    totalSeconds,
    nextBdayMonths,
    nextBdayDays,
    daysUntilNextBday,
    nextBirthdayDate: new Date(nbY, nbM - 1, nbD),
    nextBirthdayWeekday,
    nextAge,
    nextBdayString,
    bornWeekday,
    westernZodiac,
    chineseZodiac,
    halfBdayDate: halfBdayDateObj.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }),
  };
}

export function computeWishlistDaysRemaining(
  mode: 'date' | 'duration',
  targetDateIso: string,
  durationVal: number,
  durationUnit: 'days' | 'weeks' | 'months',
  referenceDateIso?: string
): number {
  if (mode === 'date') {
    const targetParts = parseIsoParts(targetDateIso);
    if (!targetParts) return 0;

    let refY: number;
    let refM: number;
    let refD: number;
    if (referenceDateIso) {
      const refParts = parseIsoParts(referenceDateIso);
      if (!refParts) return 0;
      [refY, refM, refD] = refParts;
    } else {
      const now = new Date();
      refY = now.getFullYear();
      refM = now.getMonth() + 1;
      refD = now.getDate();
    }

    const todayUtcMs = Date.UTC(refY, refM - 1, refD);
    const targetUtcMs = Date.UTC(targetParts[0], targetParts[1] - 1, targetParts[2]);
    return Math.max(0, Math.round((targetUtcMs - todayUtcMs) / 86400000));
  }

  if (!Number.isFinite(durationVal) || durationVal <= 0) return 0;
  if (durationUnit === 'days') return durationVal;
  if (durationUnit === 'weeks') return durationVal * 7;
  if (durationUnit === 'months') return Math.round(durationVal * 30.4375);
  return 0;
}

export interface WishlistPlanResult {
  remaining: number;
  progressPercent: number;
  daily: number;
  weekly: number;
  monthly: number;
  days: number;
  isCompleted: boolean;
}

export function computeWishlistPlan(
  target: number,
  saved: number,
  daysRemaining: number
): WishlistPlanResult | null {
  if (!Number.isFinite(target) || target <= 0) return null;
  if (!Number.isFinite(saved) || saved < 0 || saved > target) return null;

  const remaining = Math.max(0, target - saved);
  const progressPercent = Math.min(100, Math.round((saved / target) * 100));

  if (remaining === 0) {
    return {
      remaining: 0,
      progressPercent: 100,
      daily: 0,
      weekly: 0,
      monthly: 0,
      days: daysRemaining,
      isCompleted: true,
    };
  }

  const days = daysRemaining > 0 ? daysRemaining : 1;
  const daily = remaining / days;
  const weekly = daily * 7;
  const monthly = daily * 30.4375;

  return {
    remaining,
    progressPercent,
    daily,
    weekly,
    monthly,
    days: daysRemaining,
    isCompleted: false,
  };
}

export interface CurrencyConversionResult {
  convertedAmount: number;
  exchangeRate: number;
  fromCode: string;
  toCode: string;
}

export function convertCurrencyAmount(
  amount: number,
  fromCode: string,
  toCode: string,
  rates: Record<string, number>
): CurrencyConversionResult | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const fromRate = rates[fromCode];
  const toRate = rates[toCode];
  if (!Number.isFinite(fromRate) || fromRate <= 0) return null;
  if (!Number.isFinite(toRate) || toRate <= 0) return null;

  const usdValue = amount / fromRate;
  const convertedAmount = usdValue * toRate;
  const exchangeRate = toRate / fromRate;

  return {
    convertedAmount,
    exchangeRate,
    fromCode,
    toCode,
  };
}
