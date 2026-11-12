'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calculator,
  Percent,
  AlertCircle,
  RotateCcw,
  PieChart as PieChartIcon,
  CheckCircle2,
  TrendingDown,
  Equal,
  ChevronDown,
  ChevronUp,
  TableProperties,
  Info,
  BarChart3,
  CalendarDays,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';

interface EmiCalculatorProps {
  currency: string;
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: 'EMI', details: string, result: string) => void;
}

export type InterestMethod = 'reducing' | 'flat';

interface ScheduleRow {
  month: number;
  emi: number;
  principalPaid: number;
  interestPaid: number;
  balance: number;
  totalPaidSoFar: number;
}

interface YearlySummary {
  year: number;
  startMonth: number;
  endMonth: number;
  emiPaid: number;
  principalPaid: number;
  interestPaid: number;
  endingBalance: number;
}

export default function EmiCalculator({ currency, triggerVibration, onSaveHistory }: EmiCalculatorProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Input states
  const [totalPrice, setTotalPrice] = useState<string>('');
  const [downPayment, setDownPayment] = useState<string>('');
  const [interestRate, setInterestRate] = useState<string>('');
  const [tenure, setTenure] = useState<string>('');
  const [tenureUnit, setTenureUnit] = useState<'months' | 'years'>('months');
  const [interestMethod, setInterestMethod] = useState<InterestMethod>('reducing');
  const [showSchedule, setShowSchedule] = useState<boolean>(false);
  const [scheduleView, setScheduleView] = useState<'table' | 'chart' | 'yearly'>('table');

  // Parse helper
  const parseNum = (val: string): number => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  // Calculations derived in real-time
  const price = parseNum(totalPrice);
  const dp = parseNum(downPayment);
  const annualRate = parseNum(interestRate);
  const tenureVal = parseNum(tenure);

  // Validation flags for individual fields
  const isPriceError = price <= 0 && totalPrice !== '';
  const isDpError = dp >= price && price > 0;
  const isRateError = annualRate < 0;
  const isTenureError = tenureVal <= 0 && tenure !== '';

  // Validation checks list
  const errors = useMemo(() => {
    const list: string[] = [];
    if (isPriceError) {
      list.push('Total price must be greater than 0.');
    }
    if (isDpError) {
      list.push('Down payment cannot be equal to or greater than total item price.');
    }
    if (isTenureError) {
      list.push('Tenure must be greater than 0.');
    }
    if (isRateError) {
      list.push('Interest rate cannot be negative.');
    }
    return list;
  }, [isPriceError, isDpError, isTenureError, isRateError]);

  // Loan calculation values
  const calculations = useMemo(() => {
    if (price <= 0 || dp >= price || tenureVal <= 0 || annualRate < 0) {
      return null;
    }

    const principal = Math.max(0, price - dp);
    const months = Math.max(1, Math.round(tenureUnit === 'years' ? tenureVal * 12 : tenureVal));

    if (months <= 0) return null;

    let emi = 0;
    let totalInterest = 0;
    const schedule: ScheduleRow[] = [];

    if (interestMethod === 'flat') {
      // Flat Rate: Total Interest = Principal * (Rate/100) * (Years)
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
        currentBalance = Math.max(0, currentBalance - principalThisMonth);
        if (m === months) currentBalance = 0;
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
    } else {
      // Reducing Balance Rate
      if (annualRate === 0) {
        emi = principal / months;
        totalInterest = 0;
        let currentBalance = principal;
        let cumPaid = 0;
        for (let m = 1; m <= months; m++) {
          const principalThisMonth = m === months ? currentBalance : emi;
          currentBalance = Math.max(0, currentBalance - principalThisMonth);
          if (m === months) currentBalance = 0;
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
        totalInterest = emi * months - principal;

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
    }

    const totalLoanOutflow = emi * months;
    const overallTotalCost = totalLoanOutflow + dp;

    const principalPercent = totalLoanOutflow > 0 ? (principal / totalLoanOutflow) * 100 : 100;
    const interestPercent = totalLoanOutflow > 0 ? (totalInterest / totalLoanOutflow) * 100 : 0;

    // Calculate counter-method comparison for informative comparison
    let comparisonDiff = 0;
    let flatAltInterest = 0;
    let reducingAltInterest = 0;

    if (annualRate > 0) {
      const tenureYears = months / 12;
      flatAltInterest = principal * (annualRate / 100) * tenureYears;

      const monthlyRate = annualRate / 12 / 100;
      const compoundFactor = Math.pow(1 + monthlyRate, months);
      const reducingEmi = (principal * monthlyRate * compoundFactor) / (compoundFactor - 1);
      reducingAltInterest = reducingEmi * months - principal;

      comparisonDiff = Math.abs(flatAltInterest - reducingAltInterest);
    }

    // Yearly Aggregates
    const yearlySummaries: YearlySummary[] = [];
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

    // Amortization visual trend data
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
  }, [price, dp, annualRate, tenureVal, tenureUnit, interestMethod]);

  // Preset Handlers
  const handleInterestPreset = (rate: number) => {
    triggerVibration('click');
    setInterestRate(rate.toString());
  };

  const handleTenurePreset = (m: number) => {
    triggerVibration('click');
    setTenure(m.toString());
    setTenureUnit('months');
  };

  const handleReset = () => {
    triggerVibration('reset');
    setTotalPrice('');
    setDownPayment('');
    setInterestRate('');
    setTenure('');
    setTenureUnit('months');
    setInterestMethod('reducing');
    setShowSchedule(false);
  };

  const handleSaveToHistory = () => {
    if (!calculations || errors.length > 0) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');
    const methodLabel = interestMethod === 'reducing' ? 'Reducing Balance' : 'Flat Rate';
    const details = `Total Price: ${currency}${price.toLocaleString()} | DP: ${currency}${dp.toLocaleString()} | Loan: ${currency}${Math.round(calculations.principal).toLocaleString()} | Rate: ${annualRate}% (${methodLabel}) | Tenure: ${calculations.months} Months | Total Cost: ${currency}${Math.round(calculations.overallTotalCost).toLocaleString()}`;
    const result = `EMI: ${currency}${Math.round(calculations.emi).toLocaleString()}/mo | Interest: ${currency}${Math.round(calculations.totalInterest).toLocaleString()}`;
    onSaveHistory('EMI', details, result);
  };

  return (
    <div className="bg-white rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden">
      {/* Decorative background accent */}
      <div className="absolute top-0 right-0 w-36 h-36 bg-blue-500/5 rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-11 h-11 rounded-2xl bg-blue-100 flex items-center justify-center text-blue-600 shadow-sm">
            <Calculator className="w-6 h-6" />
          </div>
          <div>
            <h2 className="font-bold text-lg md:text-xl text-slate-800">Retail EMI Calculator</h2>
            <p className="text-xs text-slate-400 font-medium">
              Calculate loan installments with Reducing Balance or Flat Rate
            </p>
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Input Form Column */}
        <div className="space-y-4 lg:col-span-6">
          {/* Interest Method Selector (Flat vs Reducing) */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span>Interest Calculation Method</span>
              <span className="text-[10px] font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {interestMethod === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}
              </span>
            </label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  triggerVibration('click');
                  setInterestMethod('reducing');
                }}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  interestMethod === 'reducing'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <TrendingDown className={`w-4 h-4 ${interestMethod === 'reducing' ? 'text-blue-200' : 'text-blue-600'}`} />
                  <span>Reducing Balance</span>
                </div>
                <span className={`text-[10px] mt-1 line-clamp-2 leading-tight ${interestMethod === 'reducing' ? 'text-blue-100' : 'text-slate-500'}`}>
                  Interest decreases as principal is paid off monthly (Standard Bank EMI)
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  triggerVibration('click');
                  setInterestMethod('flat');
                }}
                className={`flex flex-col items-start p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  interestMethod === 'flat'
                    ? 'bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-500/20'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-center gap-1.5 font-bold text-xs">
                  <Equal className={`w-4 h-4 ${interestMethod === 'flat' ? 'text-blue-200' : 'text-orange-500'}`} />
                  <span>Flat Rate</span>
                </div>
                <span className={`text-[10px] mt-1 line-clamp-2 leading-tight ${interestMethod === 'flat' ? 'text-blue-100' : 'text-slate-500'}`}>
                  Interest is charged equally on initial principal for the full loan tenure
                </span>
              </button>
            </div>
          </div>

          {/* Total Price & Down Payment */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                <span>Total Item Price</span>
                {isPriceError && (
                  <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> invalid
                  </span>
                )}
              </label>
              <motion.div
                animate={isPriceError ? { x: [-4, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={totalPrice}
                  onChange={(e) => setTotalPrice(e.target.value)}
                  className={`w-full border rounded-2xl py-3 pl-9 pr-4 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                    isPriceError
                      ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                      : 'bg-slate-50 border-slate-200/80 focus:border-blue-400 focus:ring-blue-100'
                  }`}
                  placeholder="0"
                />
              </motion.div>
              {isPriceError && (
                <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Price must be greater than 0.
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                <span>Down Payment <span className="text-slate-400 font-normal">(Optional)</span></span>
                {isDpError && (
                  <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                    <AlertCircle className="w-3 h-3" /> invalid
                  </span>
                )}
              </label>
              <motion.div
                animate={isDpError ? { x: [-4, 4, -4, 4, 0] } : {}}
                transition={{ duration: 0.3 }}
                className="relative"
              >
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">{currency}</span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={downPayment}
                  onChange={(e) => setDownPayment(e.target.value)}
                  className={`w-full border rounded-2xl py-3 pl-9 pr-4 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                    isDpError
                      ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                      : 'bg-slate-50 border-slate-200/80 focus:border-blue-400 focus:ring-blue-100'
                  }`}
                  placeholder="0"
                />
              </motion.div>
              {isDpError && (
                <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3 shrink-0" /> Cannot exceed total price.
                </p>
              )}
            </div>
          </div>

          {/* Interest Rate & Presets */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Annual Interest Rate (%)
              </label>
              <span className="text-xs text-blue-600 font-semibold">
                {interestRate === '' ? '' : annualRate === 0 ? '0% No-Cost EMI' : `${annualRate}% p.a.`}
              </span>
            </div>
            <motion.div
              animate={isRateError ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="relative mb-2"
            >
              <input
                type="text"
                inputMode="decimal"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className={`w-full border rounded-2xl py-3 pl-4 pr-10 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                  isRateError
                    ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                    : 'bg-slate-50 border-slate-200/80 focus:border-blue-400 focus:ring-blue-100'
                }`}
                placeholder="0"
              />
              <Percent className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2" />
            </motion.div>
            {isRateError && (
              <p className="text-[11px] text-red-500 font-medium mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> Interest rate cannot be negative.
              </p>
            )}

            {/* Quick Rate Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[0, 8, 10, 12, 14, 18].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => handleInterestPreset(rate)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    interestRate !== '' && annualRate === rate
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {rate === 0 ? '0% No Cost' : `${rate}%`}
                </button>
              ))}
            </div>
          </div>

          {/* Tenure Selector */}
          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                Loan Tenure
              </label>
              {/* Months/Years Toggle */}
              <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration('click');
                    setTenureUnit('months');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tenureUnit === 'months' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Months
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerVibration('click');
                    setTenureUnit('years');
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    tenureUnit === 'years' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500'
                  }`}
                >
                  Years
                </button>
              </div>
            </div>

            <motion.div
              animate={isTenureError ? { x: [-4, 4, -4, 4, 0] } : {}}
              transition={{ duration: 0.3 }}
              className="relative mb-2"
            >
              <input
                type="text"
                inputMode="numeric"
                value={tenure}
                onChange={(e) => setTenure(e.target.value)}
                className={`w-full border rounded-2xl py-3 pl-4 pr-16 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                  isTenureError
                    ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                    : 'bg-slate-50 border-slate-200/80 focus:border-blue-400 focus:ring-blue-100'
                }`}
                placeholder="0"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400 uppercase">
                {tenureUnit}
              </span>
            </motion.div>
            {isTenureError && (
              <p className="text-[11px] text-red-500 font-medium mb-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" /> Tenure must be greater than 0.
              </p>
            )}

            {/* Quick Tenure Presets */}
            <div className="flex flex-wrap gap-1.5">
              {[3, 6, 9, 12, 18, 24, 36].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => handleTenurePreset(m)}
                  className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    tenureUnit === 'months' && tenureVal === m
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl transition-colors cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" /> Reset
            </button>
            {calculations && (
              <button
                type="button"
                onClick={handleSaveToHistory}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-bold py-3.5 rounded-2xl transition-colors border border-blue-200/60 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" /> Save History
              </button>
            )}
          </div>

          {/* Validation Errors */}
          <AnimatePresence>
            {errors.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="bg-amber-50 border border-amber-200/80 rounded-2xl p-3.5 mt-2"
              >
                <div className="flex gap-2 items-start text-amber-800 text-xs font-semibold">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    {errors.map((err, i) => (
                      <p key={i}>{err}</p>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* EMI Results Dashboard Column (lg:col-span-6) */}
        <div className="lg:col-span-6">
          <AnimatePresence>
            {calculations && errors.length === 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.3 }}
                className="space-y-4"
              >
                {/* Highlight EMI Banner */}
                <div className="bg-gradient-to-br from-blue-600 via-blue-700 to-indigo-800 text-white rounded-3xl p-5 md:p-6 shadow-lg shadow-blue-500/20 relative overflow-hidden">
                  <div className="absolute right-0 bottom-0 opacity-10 translate-x-4 translate-y-4">
                    <Calculator className="w-32 h-32" />
                  </div>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-blue-100 text-xs font-bold uppercase tracking-wider">
                      Monthly Installment (EMI)
                    </p>
                    <span className="text-[10px] font-bold bg-white/20 text-white px-2 py-0.5 rounded-md backdrop-blur-xs">
                      {interestMethod === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}
                    </span>
                  </div>
                  <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-black text-blue-200">{currency}</span>
                    <span className="text-4xl md:text-5xl font-black tracking-tight">
                      {Math.round(calculations.emi).toLocaleString()}
                    </span>
                    <span className="text-xs text-blue-200 font-semibold ml-1">/ month</span>
                  </div>
                  <div className="mt-4 pt-3 border-t border-white/15 flex flex-wrap justify-between items-center gap-2 text-xs text-blue-100 font-medium">
                    <span>Tenure: {calculations.months} Months</span>
                    <span>
                      {annualRate === 0 ? '0% No Cost EMI' : `Interest Rate: ${annualRate}%`}
                    </span>
                  </div>
                </div>

                {/* Method Comparison Insight Banner */}
                {annualRate > 0 && (
                  <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 text-xs">
                    <div className="flex items-start gap-2">
                      <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-bold text-slate-800">
                          {interestMethod === 'reducing' ? (
                            <>
                              With <strong>Reducing Balance</strong>, you save{' '}
                              <span className="text-emerald-600 font-black">
                                {currency}{Math.round(calculations.comparisonDiff).toLocaleString()} in interest
                              </span>{' '}
                              compared to Flat Rate.
                            </>
                          ) : (
                            <>
                              With <strong>Flat Rate</strong>, interest is calculated on the initial principal. With Reducing Balance, interest would be only{' '}
                              <span className="text-blue-600 font-black">
                                {currency}{Math.round(calculations.reducingAltInterest).toLocaleString()}
                              </span>.
                            </>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 leading-relaxed">
                          {interestMethod === 'reducing'
                            ? 'Interest reduces each month as the outstanding loan balance is repaid.'
                            : 'Equal monthly interest and principal portions are allocated each month.'}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Detailed Breakdown Cards */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3.5">
                    <p className="text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                      Net Loan Amount
                    </p>
                    <p className="text-base font-black text-slate-800">
                      {currency}{Math.round(calculations.principal).toLocaleString()}
                    </p>
                    {dp > 0 && (
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        DP: {currency}{dp.toLocaleString()}
                      </p>
                    )}
                  </div>

                  <div className="bg-orange-50/70 border border-orange-100 rounded-2xl p-3.5">
                    <p className="text-orange-800/60 text-[11px] font-bold uppercase tracking-wider mb-1">
                      Total Interest
                    </p>
                    <p className="text-base font-black text-orange-600">
                      {currency}{Math.round(calculations.totalInterest).toLocaleString()}
                    </p>
                    <p className="text-[10px] text-orange-500 font-medium mt-0.5">
                      {calculations.interestPercent}% of loan outflow
                    </p>
                  </div>

                  <div className="col-span-2 bg-emerald-50/60 border border-emerald-100 rounded-2xl p-3.5 flex justify-between items-center">
                    <div>
                      <p className="text-emerald-800/60 text-[11px] font-bold uppercase tracking-wider mb-0.5">
                        Total Payable (Principal + Interest + DP)
                      </p>
                      <p className="text-lg font-black text-emerald-700">
                        {currency}{Math.round(calculations.overallTotalCost).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="inline-block bg-emerald-100 text-emerald-800 text-[11px] font-bold px-2.5 py-1 rounded-full">
                        Total Cost
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual Breakdown Section */}
                <div className="bg-slate-50/80 border border-slate-100 rounded-3xl p-4">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <PieChartIcon className="w-4 h-4 text-blue-500" /> Payment Breakdown
                    </h3>
                    <span className="text-xs text-slate-500 font-semibold">
                      {calculations.principalPercent}% Principal / {calculations.interestPercent}% Interest
                    </span>
                  </div>

                  {/* Animated Stacked Progress Bar */}
                  <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex shadow-inner mb-3">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${calculations.principalPercent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full bg-blue-500"
                      title={`Principal: ${calculations.principalPercent}%`}
                    />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${calculations.interestPercent}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className="h-full bg-orange-500"
                      title={`Interest: ${calculations.interestPercent}%`}
                    />
                  </div>

                  {/* Donut Chart with Recharts */}
                  <div className="h-44 w-full flex items-center justify-center relative">
                    {isMounted ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={calculations.chartData}
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={65}
                            paddingAngle={4}
                            dataKey="value"
                          >
                            {calculations.chartData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(val: number) => [`${currency}${val.toLocaleString()}`, 'Amount']}
                            contentStyle={{
                              backgroundColor: '#1E293B',
                              borderRadius: '12px',
                              color: '#fff',
                              fontSize: '12px',
                              border: 'none',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-xs text-slate-400">Loading breakdown...</div>
                    )}
                    {/* Center Text */}
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] uppercase font-bold text-slate-400">Total</span>
                      <span className="text-xs font-extrabold text-slate-700">
                        {currency}{Math.round(calculations.totalLoanOutflow).toLocaleString()}
                      </span>
                    </div>
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap justify-center items-center gap-4 text-xs font-medium pt-1">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-blue-500 inline-block shadow-sm"></span>
                      <span className="text-slate-600 font-semibold">Principal:</span>
                      <span className="font-bold text-slate-800">
                        {currency}{Math.round(calculations.principal).toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full bg-orange-500 inline-block shadow-sm"></span>
                      <span className="text-slate-600 font-semibold">Interest:</span>
                      <span className="font-bold text-slate-800">
                        {currency}{Math.round(calculations.totalInterest).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Modernized Amortization Repayment Schedule */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      triggerVibration('click');
                      setShowSchedule(!showSchedule);
                    }}
                    className="w-full flex items-center justify-between px-4 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-2xl shadow-sm transition-all text-xs cursor-pointer group"
                  >
                    <span className="flex items-center gap-2">
                      <TableProperties className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
                      <span>Monthly Repayment Schedule & Amortization</span>
                    </span>
                    <div className="flex items-center gap-2 text-slate-300">
                      <span className="text-[11px] font-medium hidden sm:inline">
                        {calculations.months} installments
                      </span>
                      {showSchedule ? (
                        <ChevronUp className="w-4 h-4 text-slate-300" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-300" />
                      )}
                    </div>
                  </button>

                  {/* Expanded Schedule Container */}
                  <AnimatePresence>
                    {showSchedule && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-3 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-md"
                      >
                        {/* Schedule Header / Tabs */}
                        <div className="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs font-extrabold text-slate-800">Schedule View</span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 font-bold px-2 py-0.5 rounded-full">
                              {interestMethod === 'reducing' ? 'Reducing Balance' : 'Flat Rate'}
                            </span>
                          </div>

                          {/* View Toggle Tabs */}
                          <div className="inline-flex bg-slate-200/80 p-0.5 rounded-xl text-xs font-bold">
                            <button
                              type="button"
                              onClick={() => {
                                triggerVibration('click');
                                setScheduleView('table');
                              }}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                scheduleView === 'table'
                                  ? 'bg-white text-slate-800 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <TableProperties className="w-3.5 h-3.5" />
                                <span>Monthly Table</span>
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                triggerVibration('click');
                                setScheduleView('chart');
                              }}
                              className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                scheduleView === 'chart'
                                  ? 'bg-white text-slate-800 shadow-xs'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              <span className="flex items-center gap-1">
                                <BarChart3 className="w-3.5 h-3.5" />
                                <span>Trend Chart</span>
                              </span>
                            </button>

                            {calculations.months >= 12 && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerVibration('click');
                                  setScheduleView('yearly');
                                }}
                                className={`px-3 py-1 rounded-lg transition-all cursor-pointer ${
                                  scheduleView === 'yearly'
                                    ? 'bg-white text-slate-800 shadow-xs'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                <span className="flex items-center gap-1">
                                  <CalendarDays className="w-3.5 h-3.5" />
                                  <span>Annual</span>
                                </span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* TAB 1: Detailed Monthly Table View */}
                        {scheduleView === 'table' && (
                          <div className="overflow-x-auto max-h-72 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-bold text-[11px] border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Month</th>
                                  <th className="py-2.5 px-3">EMI ({currency})</th>
                                  <th className="py-2.5 px-3">Principal ({currency})</th>
                                  <th className="py-2.5 px-3">Interest ({currency})</th>
                                  <th className="py-2.5 px-3 text-right">Balance ({currency})</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {calculations.schedule.map((row) => (
                                  <tr key={row.month} className="hover:bg-blue-50/40 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-slate-600">
                                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-lg bg-slate-100 text-[11px]">
                                        {row.month}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 font-bold text-slate-900">
                                      {Math.round(row.emi).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="inline-block bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                                        {Math.round(row.principalPaid).toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3">
                                      <span className="inline-block bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-semibold text-[11px]">
                                        {Math.round(row.interestPaid).toLocaleString()}
                                      </span>
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                      {Math.round(row.balance).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* TAB 2: Visual Trend Chart */}
                        {scheduleView === 'chart' && (
                          <div className="p-4 space-y-3">
                            <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                              <span>Declining Loan Balance & Payment Split Over Time</span>
                              <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1 text-[11px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span> Principal
                                </span>
                                <span className="flex items-center gap-1 text-[11px]">
                                  <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span> Interest
                                </span>
                              </div>
                            </div>

                            <div className="h-48 w-full">
                              {isMounted ? (
                                <ResponsiveContainer width="100%" height="100%">
                                  <AreaChart data={calculations.amortizationTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                      <linearGradient id="colorPrincipal" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1} />
                                      </linearGradient>
                                      <linearGradient id="colorInterest" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#F97316" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#F97316" stopOpacity={0.1} />
                                      </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                    <XAxis dataKey="month" tick={{ fontSize: 10 }} stroke="#94A3B8" />
                                    <YAxis tick={{ fontSize: 10 }} stroke="#94A3B8" />
                                    <Tooltip
                                      formatter={(val: number, name: string) => [
                                        `${currency}${val.toLocaleString()}`,
                                        name === 'principalPaid'
                                          ? 'Principal Paid'
                                          : name === 'interestPaid'
                                          ? 'Interest Paid'
                                          : 'Remaining Balance',
                                      ]}
                                      contentStyle={{
                                        backgroundColor: '#0F172A',
                                        borderRadius: '12px',
                                        color: '#fff',
                                        fontSize: '11px',
                                        border: 'none',
                                      }}
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="principalPaid"
                                      stackId="1"
                                      stroke="#2563EB"
                                      fillOpacity={1}
                                      fill="url(#colorPrincipal)"
                                    />
                                    <Area
                                      type="monotone"
                                      dataKey="interestPaid"
                                      stackId="1"
                                      stroke="#EA580C"
                                      fillOpacity={1}
                                      fill="url(#colorInterest)"
                                    />
                                  </AreaChart>
                                </ResponsiveContainer>
                              ) : (
                                <div className="text-xs text-slate-400 text-center py-10">Loading chart...</div>
                              )}
                            </div>
                          </div>
                        )}

                        {/* TAB 3: Yearly Aggregated View */}
                        {scheduleView === 'yearly' && (
                          <div className="overflow-x-auto max-h-72 overflow-y-auto">
                            <table className="w-full text-left text-xs">
                              <thead className="bg-slate-100 text-slate-700 sticky top-0 z-10 font-bold text-[11px] border-b border-slate-200">
                                <tr>
                                  <th className="py-2.5 px-3">Year</th>
                                  <th className="py-2.5 px-3">Period</th>
                                  <th className="py-2.5 px-3">Total Paid ({currency})</th>
                                  <th className="py-2.5 px-3">Principal ({currency})</th>
                                  <th className="py-2.5 px-3">Interest ({currency})</th>
                                  <th className="py-2.5 px-3 text-right">Year-End Balance ({currency})</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {calculations.yearlySummaries.map((yr) => (
                                  <tr key={yr.year} className="hover:bg-blue-50/40 transition-colors">
                                    <td className="py-2.5 px-3 font-bold text-slate-900">Year {yr.year}</td>
                                    <td className="py-2.5 px-3 text-slate-500 font-semibold">
                                      M{yr.startMonth} - M{yr.endMonth}
                                    </td>
                                    <td className="py-2.5 px-3 font-bold text-slate-900">
                                      {Math.round(yr.emiPaid).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3 text-blue-600 font-semibold">
                                      {Math.round(yr.principalPaid).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3 text-orange-600 font-semibold">
                                      {Math.round(yr.interestPaid).toLocaleString()}
                                    </td>
                                    <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                                      {Math.round(yr.endingBalance).toLocaleString()}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}

                        {/* Footer Summary */}
                        <div className="bg-slate-50 p-3 text-[11px] text-slate-600 flex flex-wrap justify-between items-center border-t border-slate-200 gap-2 font-medium">
                          <span className="flex items-center gap-1.5">
                            <span>Total Loan Duration: <strong>{calculations.months} Months</strong></span>
                          </span>
                          <span className="text-slate-500">
                            Total Payable: <strong className="text-slate-800">{currency}{Math.round(calculations.totalLoanOutflow).toLocaleString()}</strong>
                          </span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            ) : (
              <div className="hidden lg:flex flex-col items-center justify-center h-full min-h-[380px] bg-slate-50/80 border border-slate-100 rounded-3xl p-6 text-center space-y-3 relative overflow-hidden">
                <div className="w-28 h-28 relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm bg-white p-2">
                  <img
                    src="/empty_state_calc.jpg"
                    alt="EMI Calculator Illustration"
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>
                <div>
                  <p className="font-extrabold text-slate-700 text-sm">Enter Loan Details to View EMI Breakdown</p>
                  <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                    Interactive amortization charts, interest ratios, and monthly payment stats will render here in real time.
                  </p>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-bold text-blue-600 bg-blue-50/80 px-3 py-1 rounded-full border border-blue-100">
                  <Calculator className="w-3.5 h-3.5" />
                  <span>Reducing Balance & Flat Rate Supported</span>
                </div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

