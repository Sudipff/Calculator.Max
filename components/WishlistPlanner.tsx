'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Target, Calendar, Plus, Trash2, CheckCircle2, RotateCcw, AlertCircle, ShoppingBag, TrendingUp, DollarSign, Award, Clock, BarChart3, HelpCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  computeWishlistDaysRemaining,
  computeWishlistPlan,
} from '../lib/basicCalculators';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { showNotification } from '@/lib/notifications';

export interface WishlistItem {
  id: string;
  name: string;
  targetPrice: number;
  savedAmount: number;
  targetDate: string; // YYYY-MM-DD
  createdAt: string;
}

interface WishlistPlannerProps {
  currency: string;
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: 'Wishlist', details: string, result: string, savedAmount?: number) => void;
}

export default function WishlistPlanner({ currency, triggerVibration, onSaveHistory }: WishlistPlannerProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Input fields
  const [itemName, setItemName] = useState('');
  const [targetPrice, setTargetPrice] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  
  // Target date mode: 'date' or 'duration'
  const [mode, setMode] = useState<'date' | 'duration'>('duration');
  
  // Date picker state (default 3 months from today)
  const getDefaultTargetDate = () => {
    const d = new Date();
    d.setMonth(d.getMonth() + 3);
    return d.toISOString().split('T')[0];
  };
  const [targetDate, setTargetDate] = useState<string>(getDefaultTargetDate());

  // Duration input state
  const [durationValue, setDurationValue] = useState<string>('');
  const [durationUnit, setDurationUnit] = useState<'months' | 'weeks' | 'days'>('months');

  // Saved Wishlist Items Array (Persisted in localStorage)
  const [savedWishlist, setSavedWishlist] = useState<WishlistItem[]>([]);

  // Deposit Modal/Input state for a saved item
  const [depositAmountMap, setDepositAmountMap] = useState<{ [id: string]: string }>({});

  useEffect(() => {
    try {
      const localData = localStorage.getItem('retail-calc-wishlist-items');
      if (localData) {
        setSavedWishlist(JSON.parse(localData));
      }
    } catch (e) {
      // ignore parse error
    }
  }, []);

  const saveWishlistToStorage = (items: WishlistItem[]) => {
    setSavedWishlist(items);
    localStorage.setItem('retail-calc-wishlist-items', JSON.stringify(items));
  };

  // Helper number parser
  const parseNum = (val: string): number => {
    const cleaned = val.replace(/[^0-9.]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  };

  const target = parseNum(targetPrice);
  const saved = parseNum(savedAmount);
  const durationVal = parseNum(durationValue);

  // Field validation checks
  const isTargetError = targetPrice !== '' && target <= 0;
  const isSavedError = savedAmount !== '' && (saved < 0 || (target > 0 && saved > target));
  const isDurationError = mode === 'duration' && durationValue !== '' && durationVal <= 0;

  // Calculate target days remaining based on mode (UTC calendar-safe)
  const daysRemaining = useMemo(
    () => computeWishlistDaysRemaining(mode, targetDate, durationVal, durationUnit),
    [mode, targetDate, durationVal, durationUnit]
  );

  // Main savings breakdown
  const plan = useMemo(() => {
    if (isSavedError) return null;
    return computeWishlistPlan(target, saved, daysRemaining);
  }, [target, saved, daysRemaining, isSavedError]);

  // Recharts Bar Chart Scenario Comparison Data
  const scenarioData = useMemo(() => {
    if (!plan || plan.isCompleted || plan.remaining <= 0) return [];

    const baseMonthly = Math.ceil(plan.monthly);
    const baseDays = plan.days > 0 ? plan.days : 30;
    const baseMonths = Math.max(0.5, Math.round((baseDays / 30.4375) * 10) / 10);

    // Boost Plan (+25% Monthly Deposit)
    const boostMonthly = Math.ceil(baseMonthly * 1.25);
    const boostDays = Math.ceil(plan.remaining / (plan.daily * 1.25));
    const boostMonths = Math.max(0.3, Math.round((boostDays / 30.4375) * 10) / 10);

    // Power Saver Plan (+50% Monthly Deposit)
    const powerMonthly = Math.ceil(baseMonthly * 1.5);
    const powerDays = Math.ceil(plan.remaining / (plan.daily * 1.5));
    const powerMonths = Math.max(0.2, Math.round((powerDays / 30.4375) * 10) / 10);

    return [
      {
        name: 'Standard Plan',
        monthlyDeposit: baseMonthly,
        monthsLabel: `${baseMonths} mos`,
        color: '#10B981',
      },
      {
        name: 'Boost (+25%)',
        monthlyDeposit: boostMonthly,
        monthsLabel: `${boostMonths} mos`,
        color: '#0D9488',
      },
      {
        name: 'Power (+50%)',
        monthlyDeposit: powerMonthly,
        monthsLabel: `${powerMonths} mos`,
        color: '#0284C7',
      },
    ];
  }, [plan]);

  // Motivational Smart Tip Generator
  const smartTip = useMemo(() => {
    if (!plan) return '';
    if (plan.isCompleted) {
      return `🎉 Congratulations! You have fully funded your target for "${itemName || 'Item'}". Ready to make your purchase!`;
    }
    if (plan.days <= 0) {
      return `⚠️ Target date or duration has passed. Adjust your date or duration to get fresh savings goals!`;
    }

    const nameStr = itemName ? `"${itemName}"` : 'your item';
    const dailyFormatted = `${currency}${Math.ceil(plan.daily).toLocaleString()}`;
    const durationLabel =
      mode === 'duration'
        ? `${durationValue} ${durationUnit}`
        : `${plan.days} days (${Math.ceil(plan.days / 30)} months)`;

    let advice = `Save ${dailyFormatted}/day to buy ${nameStr} in ${durationLabel}!`;

    if (plan.daily <= 50) {
      advice += ` That's less than a cup of chai or coffee a day! ☕`;
    } else if (plan.daily <= 200) {
      advice += ` Skip just 1-2 takeaway meals a week to hit this easily! 🍔`;
    } else if (plan.daily <= 500) {
      advice += ` Setting aside small weekly contributions will get you there stress-free! 🚀`;
    } else {
      advice += ` Stay focused on your goal — consistency is key to big purchases! 💪`;
    }

    return advice;
  }, [plan, itemName, currency, mode, durationValue, durationUnit]);

  // Reset Form
  const handleReset = () => {
    triggerVibration('reset');
    setItemName('');
    setTargetPrice('');
    setSavedAmount('');
    setDurationValue('');
    setDurationUnit('months');
    setTargetDate(getDefaultTargetDate());
  };

  // Add Item to Wishlist List
  const handleAddToWishlist = () => {
    if (target <= 0 || !itemName.trim()) {
      triggerVibration('error');
      return;
    }
    triggerVibration('success');

    let computedDate = targetDate;
    if (mode === 'duration') {
      const d = new Date();
      d.setDate(d.getDate() + daysRemaining);
      computedDate = d.toISOString().split('T')[0];
    }

    const newItem: WishlistItem = {
      id: Date.now().toString(),
      name: itemName || 'Wishlist Item',
      targetPrice: target,
      savedAmount: saved,
      targetDate: computedDate,
      createdAt: new Date().toLocaleDateString(),
    };

    const updated = [newItem, ...savedWishlist];
    saveWishlistToStorage(updated);

    // Also trigger history log
    const remainingVal = Math.max(0, target - saved);
    const details = `Target Item Name: ${newItem.name} | Target Price: ${currency}${target.toLocaleString()} | Already Saved: ${currency}${saved.toLocaleString()} | Remaining Target: ${currency}${remainingVal.toLocaleString()} | Timeframe: ${daysRemaining} Days (${computedDate})`;
    const result = `Daily Savings Target: ${currency}${Math.ceil(plan?.daily || 0)}/day (${currency}${Math.ceil(plan?.weekly || 0)}/wk | ${currency}${Math.ceil(plan?.monthly || 0)}/mo) | Current Goal Progress: ${plan?.progressPercent || 0}%`;
    onSaveHistory('Wishlist', details, result, saved);
    showNotification({
      id: 'wishlist-save',
      message: 'Wishlist goal saved',
      type: 'success',
      duration: 2000,
    });
  };

  // Quick Deposit increment for a saved wishlist item
  const handleDeposit = (id: string) => {
    const amountStr = depositAmountMap[id];
    const depositVal = parseNum(amountStr || '0');
    if (depositVal <= 0) {
      triggerVibration('error');
      showNotification({
        id: 'wishlist-deposit',
        message: 'Enter a positive deposit amount',
        type: 'warning',
        duration: 2200,
      });
      return;
    }
    triggerVibration('success');

    const updated = savedWishlist.map((item) => {
      if (item.id === id) {
        const newSaved = Math.min(item.targetPrice, item.savedAmount + depositVal);
        return { ...item, savedAmount: newSaved };
      }
      return item;
    });

    saveWishlistToStorage(updated);
    setDepositAmountMap((prev) => ({ ...prev, [id]: '' }));
    showNotification({
      id: 'wishlist-deposit',
      message: 'Deposit added to goal',
      type: 'success',
      duration: 2000,
    });
  };

  // Delete item from saved wishlist
  const handleDeleteWishlistItem = (id: string) => {
    triggerVibration('reset');
    const updated = savedWishlist.filter((item) => item.id !== id);
    saveWishlistToStorage(updated);
    showNotification({
      id: 'wishlist-delete',
      message: 'Wishlist goal removed',
      type: 'info',
      duration: 1800,
    });
  };

  return (
    <div className="space-y-6">
      {/* Calculator Card */}
      <div className="bg-white rounded-3xl p-5 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-36 h-36 bg-emerald-500/5 rounded-bl-full -mr-10 -mt-10 pointer-events-none"></div>

        {/* Header */}
        <div className="relative z-10 flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <div className="w-11 h-11 rounded-2xl bg-emerald-100 flex items-center justify-center text-emerald-600 shadow-sm">
              <Target className="w-6 h-6" />
            </div>
            <div>
              <h2 className="font-bold text-lg md:text-xl text-slate-800">Wishlist Savings Planner</h2>
              <p className="text-xs text-slate-400 font-medium">Turn retail dreams into automated goals</p>
            </div>
          </div>
        </div>

        {/* Responsive Grid for Planner Form & Results */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Form Inputs Column */}
          <div className="space-y-4 lg:col-span-6">
            {/* Target Item Name */}
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                Target Item Name
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200/80 focus:border-emerald-400 rounded-2xl py-3 pl-10 pr-4 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-100 transition-all outline-none"
                  placeholder="Enter item name"
                />
                <ShoppingBag className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Target Price & Amount Saved */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                  <span>Target Price</span>
                  {isTargetError && (
                    <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> invalid
                    </span>
                  )}
                </label>
                <motion.div
                  animate={isTargetError ? { x: [-4, 4, -4, 4, 0] } : {}}
                  transition={{ duration: 0.3 }}
                  className="relative"
                >
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={targetPrice}
                    onChange={(e) => setTargetPrice(e.target.value)}
                    className={`w-full border rounded-2xl py-3 pl-9 pr-4 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                      isTargetError
                        ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                        : 'bg-slate-50 border-slate-200/80 focus:border-emerald-400 focus:ring-emerald-100'
                    }`}
                    placeholder="0"
                  />
                </motion.div>
                {isTargetError && (
                  <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> Target price must be greater than 0.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5 flex justify-between items-center">
                  <span>Already Saved</span>
                  {isSavedError && (
                    <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> invalid
                    </span>
                  )}
                </label>
                <motion.div
                  animate={isSavedError ? { x: [-4, 4, -4, 4, 0] } : {}}
                  transition={{ duration: 0.3 }}
                  className="relative"
                >
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                    {currency}
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={savedAmount}
                    onChange={(e) => setSavedAmount(e.target.value)}
                    className={`w-full border rounded-2xl py-3 pl-9 pr-4 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                      isSavedError
                        ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100 text-red-900'
                        : 'bg-slate-50 border-slate-200/80 focus:border-emerald-400 focus:ring-emerald-100'
                    }`}
                    placeholder="0"
                  />
                </motion.div>
                {isSavedError && (
                  <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" /> Cannot exceed target or be negative.
                  </p>
                )}
              </div>
            </div>

            {/* Planning Mode Selector: Duration vs Target Date */}
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Goal Timeframe
                </label>
                <div className="inline-flex bg-slate-100 p-0.5 rounded-xl border border-slate-200/60">
                  <button
                    type="button"
                    onClick={() => setMode('duration')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      mode === 'duration' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    By Duration
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode('date')}
                    className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      mode === 'date' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    By Target Date
                  </button>
                </div>
              </div>

              {mode === 'duration' ? (
                <div>
                  <motion.div
                    animate={isDurationError ? { x: [-4, 4, -4, 4, 0] } : {}}
                    transition={{ duration: 0.3 }}
                    className="flex gap-2"
                  >
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        inputMode="numeric"
                        value={durationValue}
                        onChange={(e) => setDurationValue(e.target.value)}
                        className={`w-full border rounded-2xl py-3 px-4 font-bold text-slate-800 focus:ring-2 transition-all outline-none ${
                          isDurationError
                            ? 'bg-red-50/50 border-red-300 focus:border-red-400 focus:ring-red-100'
                            : 'bg-slate-50 border-slate-200/80 focus:border-emerald-400 focus:ring-emerald-100'
                        }`}
                        placeholder="0"
                      />
                    </div>
                    <div className="w-36">
                      <select
                        value={durationUnit}
                        onChange={(e) => setDurationUnit(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200/80 focus:border-emerald-400 rounded-2xl py-3 px-3 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-100 transition-all outline-none"
                      >
                        <option value="months">Months</option>
                        <option value="weeks">Weeks</option>
                        <option value="days">Days</option>
                      </select>
                    </div>
                  </motion.div>
                  {isDurationError && (
                    <p className="text-[11px] text-red-500 font-medium mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" /> Duration must be greater than 0.
                    </p>
                  )}
                </div>
              ) : (
                <div className="relative">
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200/80 focus:border-emerald-400 rounded-2xl py-3 px-4 font-bold text-slate-800 focus:ring-2 focus:ring-emerald-100 transition-all outline-none"
                  />
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2.5 pt-2">
              <button
                type="button"
                onClick={handleReset}
                className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-600 font-bold py-3.5 rounded-2xl transition-colors"
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </button>
              {plan && target > 0 && (
                <button
                  type="button"
                  onClick={handleAddToWishlist}
                  className="flex-1 flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3.5 rounded-2xl shadow-md transition-all active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" /> Add to Wishlist
                </button>
              )}
            </div>
          </div>

          {/* Results & Motivation Column (lg:col-span-6) */}
          <div className="lg:col-span-6">
            <AnimatePresence>
              {plan && target > 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="space-y-4"
                >
                  {/* Progress Percentage Bar */}
                  <div className="bg-slate-50 border border-slate-100 rounded-3xl p-5">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-600 uppercase tracking-wider flex items-center gap-1.5">
                        <Award className="w-4 h-4 text-emerald-500" /> Goal Progress
                      </span>
                      <span className="text-base font-black text-emerald-600">
                        {plan.progressPercent}%
                      </span>
                    </div>

                    <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden p-0.5 relative">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${plan.progressPercent}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                        className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 rounded-full shadow-sm"
                      />
                    </div>

                    <div className="flex justify-between items-center mt-3 text-xs font-semibold text-slate-500">
                      <span>Saved: {currency}{saved.toLocaleString()}</span>
                      <span>Target: {currency}{target.toLocaleString()}</span>
                    </div>
                  </div>

                  {/* Required Savings Breakdown Cards */}
                  {!plan.isCompleted && (
                    <div className="grid grid-cols-3 gap-2.5">
                      <div className="bg-emerald-50/80 border border-emerald-100 rounded-2xl p-3.5 text-center">
                        <p className="text-emerald-800/60 text-[10px] font-bold uppercase tracking-wider mb-1">
                          Per Day
                        </p>
                        <p className="text-sm sm:text-base md:text-lg font-black text-emerald-700">
                          {currency}{Math.ceil(plan.daily).toLocaleString()}
                        </p>
                      </div>

                      <div className="bg-teal-50/80 border border-teal-100 rounded-2xl p-3.5 text-center">
                        <p className="text-teal-800/60 text-[10px] font-bold uppercase tracking-wider mb-1">
                          Per Week
                        </p>
                        <p className="text-sm sm:text-base md:text-lg font-black text-teal-700">
                          {currency}{Math.ceil(plan.weekly).toLocaleString()}
                        </p>
                      </div>

                      <div className="bg-cyan-50/80 border border-cyan-100 rounded-2xl p-3.5 text-center">
                        <p className="text-cyan-800/60 text-[10px] font-bold uppercase tracking-wider mb-1">
                          Per Month
                        </p>
                        <p className="text-sm sm:text-base md:text-lg font-black text-cyan-700">
                          {currency}{Math.ceil(plan.monthly).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Motivational Smart Tip Box */}
                  <div className="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-3xl p-5 shadow-md relative overflow-hidden">
                    <div className="flex gap-3 items-start">
                      <div>
                        <h3 className="text-xs font-bold uppercase text-emerald-200 tracking-wider mb-1">
                          Smart Savings Strategy
                        </h3>
                        <p className="text-xs md:text-sm leading-relaxed font-medium text-emerald-50">
                          {smartTip}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Recharts Bar Chart Visualization for Savings Pace Scenarios */}
                  {scenarioData.length > 0 && (
                    <div className="bg-slate-50/80 border border-slate-100 rounded-3xl p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                          <BarChart3 className="w-4 h-4 text-emerald-500" /> Savings Pace Comparison
                        </h3>
                        <span className="text-[11px] text-slate-500 font-semibold">Monthly Deposit vs Target Time</span>
                      </div>

                      <div className="h-48 w-full">
                        {isMounted ? (
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={scenarioData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} />
                              <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                              <Tooltip
                                formatter={(val: number) => [`${currency}${val.toLocaleString()}/mo`, 'Monthly Deposit']}
                                labelFormatter={(label: string) => `Scenario: ${label}`}
                                contentStyle={{
                                  backgroundColor: '#0F172A',
                                  borderRadius: '12px',
                                  color: '#fff',
                                  fontSize: '12px',
                                  border: 'none',
                                }}
                              />
                              <Bar dataKey="monthlyDeposit" radius={[8, 8, 0, 0]}>
                                {scenarioData.map((entry, index) => (
                                  <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
                            Loading scenarios chart...
                          </div>
                        )}
                      </div>

                      {/* Scenarios Legend */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60 text-center">
                        {scenarioData.map((sc, idx) => (
                          <div key={idx} className="bg-white rounded-xl p-2 border border-slate-100 shadow-2xs">
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{sc.name}</p>
                            <p className="text-xs font-black text-slate-800">{currency}{sc.monthlyDeposit.toLocaleString()}/m</p>
                            <p className="text-[10px] font-semibold text-emerald-600 mt-0.5">{sc.monthsLabel}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <div className="hidden lg:flex flex-col items-center justify-center h-full min-h-[380px] bg-slate-50/80 border border-slate-100 rounded-3xl p-6 text-center space-y-3 relative overflow-hidden">
                  <div className="w-28 h-28 relative rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm bg-white p-2">
                    <img
                      src="/empty_state_calc.jpg"
                      alt="Wishlist Cart Illustration"
                      className="w-full h-full object-cover rounded-xl"
                    />
                  </div>
                  <div>
                    <p className="font-extrabold text-slate-700 text-sm">Set Target Price & Timeframe</p>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Automated daily, weekly, and monthly deposit targets will generate alongside interactive savings scenario pace charts.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-teal-600 bg-teal-50/80 px-3 py-1 rounded-full border border-teal-100">
                    <Target className="w-3.5 h-3.5" />
                    <span>Smart Deposit Goal Tracker</span>
                  </div>
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Saved Wishlist Cards Collection */}
      {savedWishlist.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-emerald-500" /> Active Saved Wishlist ({savedWishlist.length})
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedWishlist.map((item) => {
              const itemRemaining = Math.max(0, item.targetPrice - item.savedAmount);
              const itemProgress = Math.min(100, Math.round((item.savedAmount / item.targetPrice) * 100));
              const isDone = itemRemaining === 0;

              // Calculate days remaining to target
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const targetD = new Date(item.targetDate);
              targetD.setHours(0, 0, 0, 0);
              const itemDays = Math.max(0, Math.ceil((targetD.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
              const itemDaily = itemDays > 0 ? itemRemaining / itemDays : itemRemaining;

              return (
                <div
                  key={item.id}
                  className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3 hover:shadow-md transition-shadow flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-slate-800 text-base">{item.name}</h4>
                        <p className="text-xs text-slate-400 font-medium">
                          Target Date: {item.targetDate || 'Flexible'} ({itemDays} days left)
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleDeleteWishlistItem(item.id)}
                        className="text-slate-300 hover:text-red-500 p-1.5 rounded-lg transition-colors"
                        title="Remove from wishlist"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Progress bar */}
                    <div>
                      <div className="flex justify-between text-xs font-bold mb-1">
                        <span className="text-slate-600">
                          Saved: {currency}{item.savedAmount.toLocaleString()} / {currency}{item.targetPrice.toLocaleString()}
                        </span>
                        <span className={isDone ? 'text-emerald-600 font-black' : 'text-slate-500'}>
                          {isDone ? '🎉 Goal Achieved!' : `${itemProgress}%`}
                        </span>
                      </div>

                      <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${
                            isDone ? 'bg-emerald-500' : 'bg-teal-500'
                          }`}
                          style={{ width: `${itemProgress}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Deposit Action */}
                  {!isDone && (
                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2 mt-2">
                      <div className="flex-1 text-xs text-slate-500 font-medium">
                        Need <span className="font-bold text-slate-800">{currency}{Math.ceil(itemDaily)}/day</span>
                      </div>

                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          inputMode="decimal"
                          value={depositAmountMap[item.id] || ''}
                          onChange={(e) =>
                            setDepositAmountMap({ ...depositAmountMap, [item.id]: e.target.value })
                          }
                          placeholder="+ Deposit"
                          className="w-24 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeposit(item.id)}
                          className="bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-1 rounded-xl transition-all shadow-sm"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
