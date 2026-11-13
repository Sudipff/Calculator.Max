'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays,
  Cake,
  Clock,
  RotateCcw,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Hourglass,
  Star,
  Compass,
  Heart,
  ChevronRight,
  Info,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface AgeCalculatorProps {
  triggerVibration: (type?: 'success' | 'error' | 'click' | 'reset') => void;
  onSaveHistory: (type: string, details: string, result: string) => void;
}

// Helpers for Western & Chinese Zodiac
const ZODIAC_SIGNS = [
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

const CHINESE_ZODIAC = [
  'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
  'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'
];

function getWesternZodiac(month: number, day: number) {
  // month: 1-indexed (1 = Jan, 12 = Dec)
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

function getChineseZodiac(year: number) {
  const index = (year - 4) % 12;
  return CHINESE_ZODIAC[(index + 12) % 12];
}

const formatDateToISO = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

export default function AgeCalculator({ triggerVibration, onSaveHistory }: AgeCalculatorProps) {
  const todayISO = useMemo(() => formatDateToISO(new Date()), []);

  // Dates state
  const [birthDate, setBirthDate] = useState<string>('');
  const [targetDate, setTargetDate] = useState<string>(todayISO);
  const [copied, setCopied] = useState<boolean>(false);
  const [saved, setSaved] = useState<boolean>(false);
  const [activeTabSection, setActiveTabSection] = useState<'main' | 'milestones' | 'astro'>('main');

  // Strict Validation Logic
  const validationError = useMemo(() => {
    if (!birthDate) return null;
    if (!targetDate) return 'Please select a target date.';

    const dob = new Date(birthDate + 'T00:00:00');
    const target = new Date(targetDate + 'T00:00:00');

    if (isNaN(dob.getTime())) return 'Invalid date of birth provided.';
    if (isNaN(target.getTime())) return 'Invalid target date provided.';

    if (dob.getFullYear() < 1900) {
      return 'Birth year cannot be before 1900.';
    }

    if (dob.getTime() > target.getTime()) {
      return 'Date of birth cannot be later than the target date.';
    }

    return null;
  }, [birthDate, targetDate]);

  // Precise Age & Next Birthday Calculation
  const calculation = useMemo(() => {
    if (validationError || !birthDate || !targetDate) return null;

    const [bYear, bMonth, bDay] = birthDate.split('-').map(Number);
    const [tYear, tMonth, tDay] = targetDate.split('-').map(Number);

    const dob = new Date(bYear, bMonth - 1, bDay);
    const target = new Date(tYear, tMonth - 1, tDay);

    // 1. Exact Chronological Age (Years, Months, Days)
    let years = tYear - bYear;
    let months = tMonth - bMonth;
    let days = tDay - bDay;

    if (days < 0) {
      months--;
      // Days in the previous month of target date
      const prevMonthLastDay = new Date(tYear, tMonth - 1, 0).getDate();
      days += prevMonthLastDay;
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    // 2. Total Cumulative Units
    const diffTimeMs = target.getTime() - dob.getTime();
    const totalDays = Math.floor(diffTimeMs / (1000 * 60 * 60 * 24));
    const totalWeeks = Math.floor(totalDays / 7);
    const remainingDaysAfterWeeks = totalDays % 7;
    const totalMonths = years * 12 + months;
    const totalHours = totalDays * 24;
    const totalMinutes = totalHours * 60;
    const totalSeconds = totalMinutes * 60;

    // 3. Next Birthday Calculation
    let nextBdayYear = tYear;
    // Check if birthday has already passed this target year
    let nextBday = new Date(nextBdayYear, bMonth - 1, bDay);
    if (nextBday.getTime() < target.getTime()) {
      nextBdayYear = tYear + 1;
      nextBday = new Date(nextBdayYear, bMonth - 1, bDay);
    }

    // Is today the birthday?
    const isBirthdayToday = bMonth === tMonth && bDay === tDay;

    let nextBdayMonths = 0;
    let nextBdayDays = 0;
    let daysUntilNextBday = 0;

    if (!isBirthdayToday) {
      let nbMonths = nextBday.getMonth() - target.getMonth();
      let nbDays = nextBday.getDate() - target.getDate();
      let nbYears = nextBday.getFullYear() - target.getFullYear();

      if (nbDays < 0) {
        nbMonths--;
        const prevMonthLastDay = new Date(nextBday.getFullYear(), nextBday.getMonth(), 0).getDate();
        nbDays += prevMonthLastDay;
      }
      if (nbMonths < 0) {
        nbYears--;
        nbMonths += 12;
      }

      nextBdayMonths = nbMonths;
      nextBdayDays = nbDays;
      daysUntilNextBday = Math.ceil((nextBday.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
    }

    const nextBirthdayWeekday = nextBday.toLocaleDateString('en-US', { weekday: 'long' });
    const bornWeekday = dob.toLocaleDateString('en-US', { weekday: 'long' });
    const nextAge = years + 1;

    // Half birthday
    const halfBdayMonth = (bMonth + 6) % 12 || 12;
    const halfBdayDate = new Date(tYear, halfBdayMonth - 1, bDay);

    // Zodiac
    const westernZodiac = getWesternZodiac(bMonth, bDay);
    const chineseZodiac = getChineseZodiac(bYear);

    // Formatted readable strings
    const ageString = `${years} Year${years !== 1 ? 's' : ''}, ${months} Month${months !== 1 ? 's' : ''}, ${days} Day${days !== 1 ? 's' : ''}`;
    const nextBdayString = isBirthdayToday
      ? 'Happy Birthday! 🎉 Turning ' + years + ' today!'
      : `${nextBdayMonths} month${nextBdayMonths !== 1 ? 's' : ''} and ${nextBdayDays} day${nextBdayDays !== 1 ? 's' : ''} left`;

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
      nextBirthdayDate: nextBday,
      nextBirthdayWeekday,
      nextAge,
      nextBdayString,
      bornWeekday,
      westernZodiac,
      chineseZodiac,
      halfBdayDate: halfBdayDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    };
  }, [birthDate, targetDate, validationError]);

  const handleCopy = () => {
    if (!calculation) return;
    const text = `Age: ${calculation.ageString}\nBorn: ${birthDate} (${calculation.bornWeekday})\nNext Birthday: ${calculation.nextBdayString}\nTotal Days: ${calculation.totalDays.toLocaleString()}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    triggerVibration('click');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = () => {
    if (!calculation) return;
    const details = `DOB: ${birthDate} (${calculation.bornWeekday}) | Target Date: ${targetDate} | Total Days: ${calculation.totalDays.toLocaleString()} | Total Months: ${calculation.totalMonths.toLocaleString()} | Next Birthday: ${calculation.nextBdayString} | Zodiac: ${calculation.westernZodiac}`;
    const result = calculation.ageString;
    onSaveHistory('Age', details, result);
    setSaved(true);
    triggerVibration('success');
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setBirthDate('');
    setTargetDate(todayISO);
    triggerVibration('reset');
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6">
      {/* Main Input Grid Card */}
      <div className="bg-white rounded-3xl p-6 md:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Date of Birth Input */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Cake className="w-4 h-4 text-rose-500" />
              <span>Date of Birth (DOB)</span>
            </label>
            <div className="relative">
              <input
                type="date"
                max={targetDate || todayISO}
                value={birthDate}
                onChange={(e) => {
                  setBirthDate(e.target.value);
                  triggerVibration('click');
                }}
                className={`w-full bg-slate-50 border-2 rounded-2xl py-3.5 px-4 font-bold text-slate-800 focus:bg-white focus:ring-4 transition-all outline-none cursor-pointer ${
                  validationError && (!birthDate || birthDate > targetDate)
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-100 text-red-900'
                    : 'border-slate-200/80 focus:border-rose-500 focus:ring-rose-100'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center justify-between">
              <span>Select your actual birthday</span>
              <span className="font-semibold text-slate-600">
                {birthDate ? new Date(birthDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'None'}
              </span>
            </p>
          </div>

          {/* Age at the Date of (Target Date) */}
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-blue-500" />
                <span>Age at the Date of</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setTargetDate(todayISO);
                  triggerVibration('click');
                }}
                className="text-[10px] font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
              >
                Set Today
              </button>
            </label>
            <div className="relative">
              <input
                type="date"
                min={birthDate}
                value={targetDate}
                onChange={(e) => {
                  setTargetDate(e.target.value);
                  triggerVibration('click');
                }}
                className={`w-full bg-slate-50 border-2 rounded-2xl py-3.5 px-4 font-bold text-slate-800 focus:bg-white focus:ring-4 transition-all outline-none cursor-pointer ${
                  validationError && (!targetDate || birthDate > targetDate)
                    ? 'border-red-300 focus:border-red-500 focus:ring-red-100 text-red-900'
                    : 'border-slate-200/80 focus:border-blue-500 focus:ring-blue-100'
                }`}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1.5 flex items-center justify-between">
              <span>Defaults to current date</span>
              <span className="font-semibold text-slate-600">
                {targetDate ? new Date(targetDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'None'}
              </span>
            </p>
          </div>
        </div>

        {/* Reset Button */}
        <div className="pt-2 flex items-center justify-end border-t border-slate-100">
          <button
            type="button"
            onClick={handleReset}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-700 hover:text-rose-600 text-xs font-bold transition-all active:scale-95 flex items-center gap-2 cursor-pointer shadow-xs"
            title="Reset to default dates"
          >
            <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
            <span>Reset</span>
          </button>
        </div>

        {/* Validation Error Alert */}
        {validationError && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-center gap-3 text-red-800"
          >
            <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
            <div className="text-xs sm:text-sm font-semibold">{validationError}</div>
          </motion.div>
        )}
      </div>

      {/* Results Section */}
      {calculation && !validationError && (
        <div className="space-y-6">
          {/* Main Birthday Banner if today is birthday */}
          {calculation.isBirthdayToday && (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-gradient-to-r from-amber-500 to-rose-500 text-white rounded-3xl p-5 shadow-lg flex items-center gap-4"
            >
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center shrink-0 text-2xl">
                🎂
              </div>
              <div className="flex-1">
                <h3 className="font-extrabold text-lg">Happy Birthday! 🎉</h3>
                <p className="text-xs text-amber-100">
                  Today you turn exactly {calculation.years} years old! Wishing you joy, health, and prosperity!
                </p>
              </div>
            </motion.div>
          )}

          {/* Primary Age Display Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Years Card */}
            <div className="bg-gradient-to-br from-rose-500 to-rose-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="text-xs uppercase font-bold text-rose-200 tracking-wider mb-1">
                Completed Years
              </div>
              <div className="text-5xl font-black tracking-tight">{calculation.years}</div>
              <div className="text-xs text-rose-100 font-medium mt-2 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" />
                <span>Solar revolutions</span>
              </div>
            </div>

            {/* Months Card */}
            <div className="bg-gradient-to-br from-pink-500 to-pink-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="text-xs uppercase font-bold text-pink-200 tracking-wider mb-1">
                Remaining Months
              </div>
              <div className="text-5xl font-black tracking-tight">{calculation.months}</div>
              <div className="text-xs text-pink-100 font-medium mt-2 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                <span>Months past last birthday</span>
              </div>
            </div>

            {/* Days Card */}
            <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden">
              <div className="text-xs uppercase font-bold text-purple-200 tracking-wider mb-1">
                Remaining Days
              </div>
              <div className="text-5xl font-black tracking-tight">{calculation.days}</div>
              <div className="text-xs text-purple-100 font-medium mt-2 flex items-center gap-1.5">
                <Hourglass className="w-3.5 h-3.5" />
                <span>Days past last month</span>
              </div>
            </div>
          </div>

          {/* Exact Summary & Actions Ribbon */}
          <div className="bg-white rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Full Chronological Age
              </div>
              <div className="text-xl md:text-2xl font-black text-slate-800">
                {calculation.ageString}
              </div>
              <div className="text-xs text-slate-500 font-medium">
                Day of Birth: <span className="font-bold text-rose-600">{calculation.bornWeekday}</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 w-full md:w-auto">
              <button
                type="button"
                onClick={handleCopy}
                className="flex-1 md:flex-initial px-4 py-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-95"
                title="Copy age summary to clipboard"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                className="flex-1 md:flex-initial px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-200 cursor-pointer active:scale-95"
                title="Save calculation to history database"
              >
                {saved && <CheckCircle2 className="w-4 h-4" />}
                <span>{saved ? 'Saved to DB' : 'Save to History'}</span>
              </button>
            </div>
          </div>

          {/* Next Birthday Countdown Card */}
          <div className="bg-gradient-to-br from-indigo-900 via-slate-900 to-purple-950 rounded-3xl p-6 md:p-7 text-white shadow-xl relative overflow-hidden">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-amber-300">
                  <Cake className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-white">Next Birthday Countdown</h3>
                  <p className="text-xs text-slate-300">
                    {calculation.nextBirthdayDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>

              <div className="bg-white/10 px-3.5 py-1 rounded-full text-xs font-semibold text-indigo-200 border border-white/10">
                Turning {calculation.nextAge} years old
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Months Left
                </div>
                <div className="text-2xl font-extrabold text-amber-300 mt-0.5">
                  {calculation.nextBdayMonths}
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Days Left
                </div>
                <div className="text-2xl font-extrabold text-amber-300 mt-0.5">
                  {calculation.nextBdayDays}
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Total Days Left
                </div>
                <div className="text-2xl font-extrabold text-white mt-0.5">
                  {calculation.daysUntilNextBday}
                </div>
              </div>

              <div className="bg-white/5 rounded-2xl p-3 border border-white/10">
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                  Weekday
                </div>
                <div className="text-sm font-extrabold text-indigo-200 mt-2 truncate">
                  {calculation.nextBirthdayWeekday}
                </div>
              </div>
            </div>
          </div>

          {/* Additional Life Statistics & Milestones */}
          <div className="bg-white rounded-3xl p-6 md:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Hourglass className="w-5 h-5 text-rose-500" />
                <span>Life Summary in Other Units</span>
              </h3>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActiveTabSection('main')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTabSection === 'main' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Units
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTabSection('astro')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    activeTabSection === 'astro' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-500'
                  }`}
                >
                  Zodiac & Fun
                </button>
              </div>
            </div>

            {activeTabSection === 'main' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5">
                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Months
                  </span>
                  <span className="text-lg md:text-xl font-black text-slate-800 mt-1 block">
                    {calculation.totalMonths.toLocaleString()}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Weeks
                  </span>
                  <span className="text-lg md:text-xl font-black text-slate-800 mt-1 block">
                    {calculation.totalWeeks.toLocaleString()}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">
                    +{calculation.remainingDaysAfterWeeks} days
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Days
                  </span>
                  <span className="text-lg md:text-xl font-black text-rose-600 mt-1 block">
                    {calculation.totalDays.toLocaleString()}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Hours
                  </span>
                  <span className="text-lg md:text-xl font-black text-slate-800 mt-1 block">
                    {calculation.totalHours.toLocaleString()}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Minutes
                  </span>
                  <span className="text-lg md:text-xl font-black text-slate-800 mt-1 block">
                    {calculation.totalMinutes.toLocaleString()}
                  </span>
                </div>

                <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-100">
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                    Total Seconds
                  </span>
                  <span className="text-lg md:text-xl font-black text-slate-800 mt-1 block truncate">
                    {calculation.totalSeconds.toLocaleString()}
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div className="bg-rose-50/70 border border-rose-100 rounded-2xl p-4">
                  <div className="text-[11px] font-bold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5" /> Western Zodiac
                  </div>
                  <div className="text-xl font-black text-rose-900 mt-1 flex items-center gap-2">
                    <span className="text-2xl">{calculation.westernZodiac.symbol}</span>
                    <span>{calculation.westernZodiac.name}</span>
                  </div>
                  <div className="text-[11px] text-rose-600 font-medium mt-0.5">
                    {calculation.westernZodiac.element} Element • {calculation.westernZodiac.dates}
                  </div>
                </div>

                <div className="bg-amber-50/70 border border-amber-100 rounded-2xl p-4">
                  <div className="text-[11px] font-bold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Compass className="w-3.5 h-3.5" /> Chinese Zodiac
                  </div>
                  <div className="text-xl font-black text-amber-900 mt-1">
                    Year of the {calculation.chineseZodiac}
                  </div>
                  <div className="text-[11px] text-amber-600 font-medium mt-0.5">
                    Based on lunar cycle
                  </div>
                </div>

                <div className="bg-purple-50/70 border border-purple-100 rounded-2xl p-4">
                  <div className="text-[11px] font-bold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Heart className="w-3.5 h-3.5" /> Half Birthday
                  </div>
                  <div className="text-xl font-black text-purple-900 mt-1">
                    {calculation.halfBdayDate}
                  </div>
                  <div className="text-[11px] text-purple-600 font-medium mt-0.5">
                    6 months from your birthday
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
