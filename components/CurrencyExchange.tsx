'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Coins,
  ArrowRightLeft,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import { convertCurrencyAmount } from '../lib/basicCalculators';

export type VibrationType = 'click' | 'success' | 'error' | 'reset';

interface CurrencyExchangeProps {
  appCurrency?: string;
  triggerVibration?: (type: VibrationType) => void;
  onSaveHistory?: (type: string, details: string, result: string) => void;
}

export interface CurrencyOption {
  code: string;
  symbol: string;
  name: string;
  country: string;
  flag: string;
}

export const CURRENCY_LIST: CurrencyOption[] = [
  { code: 'BDT', symbol: '৳', name: 'Bangladeshi Taka', country: 'Bangladesh', flag: '🇧🇩' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee', country: 'India', flag: '🇮🇳' },
  { code: 'USD', symbol: '$', name: 'US Dollar', country: 'United States', flag: '🇺🇸' },
  { code: 'EUR', symbol: '€', name: 'Euro', country: 'European Union', flag: '🇪🇺' },
  { code: 'GBP', symbol: '£', name: 'British Pound', country: 'United Kingdom', flag: '🇬🇧' },
  { code: 'SAR', symbol: '﷼', name: 'Saudi Riyal', country: 'Saudi Arabia', flag: '🇸🇦' },
  { code: 'AED', symbol: 'د.إ', name: 'UAE Dirham', country: 'United Arab Emirates', flag: '🇦🇪' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar', country: 'Canada', flag: '🇨🇦' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', country: 'Australia', flag: '🇦🇺' },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', country: 'Singapore', flag: '🇸🇬' },
  { code: 'MYR', symbol: 'RM', name: 'Malaysian Ringgit', country: 'Malaysia', flag: '🇲🇾' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', country: 'Japan', flag: '🇯🇵' },
  { code: 'PKR', symbol: '₨', name: 'Pakistani Rupee', country: 'Pakistan', flag: '🇵🇰' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan', country: 'China', flag: '🇨🇳' },
  { code: 'KWD', symbol: 'KD', name: 'Kuwaiti Dinar', country: 'Kuwait', flag: '🇰🇼' },
  { code: 'QAR', symbol: 'QR', name: 'Qatari Riyal', country: 'Qatar', flag: '🇶🇦' },
  { code: 'OMR', symbol: 'OMR', name: 'Omani Rial', country: 'Oman', flag: '🇴🇲' },
  { code: 'BHD', symbol: 'BD', name: 'Bahraini Dinar', country: 'Bahrain', flag: '🇧🇭' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc', country: 'Switzerland', flag: '🇨🇭' },
  { code: 'NPR', symbol: 'रू', name: 'Nepalese Rupee', country: 'Nepal', flag: '🇳🇵' },
  { code: 'LKR', symbol: 'Rs', name: 'Sri Lankan Rupee', country: 'Sri Lanka', flag: '🇱🇰' },
  { code: 'THB', symbol: '฿', name: 'Thai Baht', country: 'Thailand', flag: '🇹🇭' },
  { code: 'KRW', symbol: '₩', name: 'South Korean Won', country: 'South Korea', flag: '🇰🇷' },
  { code: 'TRY', symbol: '₺', name: 'Turkish Lira', country: 'Turkey', flag: '🇹🇷' },
  { code: 'ZAR', symbol: 'R', name: 'South African Rand', country: 'South Africa', flag: '🇿🇦' },
  { code: 'BRL', symbol: 'R$', name: 'Brazilian Real', country: 'Brazil', flag: '🇧🇷' },
  { code: 'IDR', symbol: 'Rp', name: 'Indonesian Rupiah', country: 'Indonesia', flag: '🇮🇩' },
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', country: 'Philippines', flag: '🇵🇭' },
  { code: 'VND', symbol: '₫', name: 'Vietnamese Dong', country: 'Vietnam', flag: '🇻🇳' },
  { code: 'NZD', symbol: 'NZ$', name: 'New Zealand Dollar', country: 'New Zealand', flag: '🇳🇿' },
];

// Comprehensive fallback exchange rates matrix against USD base (1.0)
const STATIC_RATES: Record<string, number> = {
  USD: 1.0,
  BDT: 119.80,
  INR: 83.45,
  EUR: 0.92,
  GBP: 0.78,
  SAR: 3.75,
  AED: 3.67,
  CAD: 1.36,
  AUD: 1.51,
  SGD: 1.35,
  MYR: 4.70,
  JPY: 155.50,
  PKR: 278.50,
  CNY: 7.24,
  KWD: 0.31,
  QAR: 3.64,
  OMR: 0.38,
  BHD: 0.38,
  CHF: 0.90,
  NPR: 133.50,
  LKR: 302.00,
  THB: 36.80,
  KRW: 1365.00,
  TRY: 32.50,
  ZAR: 18.20,
  BRL: 5.25,
  IDR: 16100.00,
  PHP: 57.80,
  VND: 25400.00,
  NZD: 1.64,
};

const EXCHANGE_RATE_API_URL =
  'https://v6.exchangerate-api.com/v6/1777c81aa6a2978918c8826d/latest/USD';

export default function CurrencyExchange({
  appCurrency = '₹',
  triggerVibration,
  onSaveHistory,
}: CurrencyExchangeProps) {
  // Infer default 'from' currency based on app setting
  const defaultFromCode = useMemo(() => {
    const found = CURRENCY_LIST.find((c) => c.symbol === appCurrency);
    return found ? found.code : 'USD';
  }, [appCurrency]);

  const [fromCurrency, setFromCurrency] = useState<string>(defaultFromCode);
  const [toCurrency, setToCurrency] = useState<string>(
    defaultFromCode === 'INR' ? 'USD' : 'INR'
  );
  const [amount, setAmount] = useState<string>('');
  const [inputErr, setInputErr] = useState<boolean>(false);

  const [rates, setRates] = useState<Record<string, number>>(STATIC_RATES);
  const [isLiveRates, setIsLiveRates] = useState<boolean>(false);
  const [loadingRates, setLoadingRates] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  // Fetch live exchange rates from ExchangeRate-API v6
  const fetchLiveRates = async () => {
    setLoadingRates(true);
    try {
      const res = await fetch(EXCHANGE_RATE_API_URL);
      if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
      const data = await res.json();

      // ExchangeRate-API v6 returns `conversion_rates` (fallback to `rates` if needed)
      const apiRates = data?.conversion_rates || data?.rates;
      if (apiRates && typeof apiRates === 'object') {
        const newRates: Record<string, number> = { ...STATIC_RATES, USD: 1.0 };
        Object.keys(apiRates).forEach((code) => {
          if (typeof apiRates[code] === 'number') {
            newRates[code] = apiRates[code];
          }
        });
        CURRENCY_LIST.forEach((c) => {
          newRates[c.code] = apiRates[c.code] || STATIC_RATES[c.code] || 1;
        });
        setRates(newRates);
        setIsLiveRates(true);
        setLastUpdated(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
      } else {
        throw new Error('Invalid JSON response format from ExchangeRate-API');
      }
    } catch (err) {
      console.warn('Live currency API fetch failed, using built-in static rates:', err);
      setIsLiveRates(false);
    } finally {
      setLoadingRates(false);
    }
  };

  useEffect(() => {
    fetchLiveRates();
  }, []);

  // Update default from currency if app currency changes
  useEffect(() => {
    const matched = CURRENCY_LIST.find((c) => c.symbol === appCurrency);
    if (matched && matched.code !== fromCurrency) {
      setFromCurrency(matched.code);
    }
  }, [appCurrency]);

  // Dynamically compute conversion values whenever amount, selected currencies, or rates change
  const convertedResult = useMemo(() => {
    const cleaned = (amount || '').toString().replace(/,/g, '').trim();
    if (!cleaned) return null;

    const parsedAmount = parseFloat(cleaned);
    const effectiveRates: Record<string, number> = {
      ...STATIC_RATES,
      ...rates,
    };
    const conv = convertCurrencyAmount(parsedAmount, fromCurrency, toCurrency, effectiveRates);
    if (!conv) return null;

    const fromItem = CURRENCY_LIST.find((c) => c.code === fromCurrency) || CURRENCY_LIST[0];
    const toItem = CURRENCY_LIST.find((c) => c.code === toCurrency) || CURRENCY_LIST[1];

    return {
      convertedAmount: conv.convertedAmount,
      exchangeRate: conv.exchangeRate,
      fromSymbol: fromItem.symbol,
      toSymbol: toItem.symbol,
      fromCode: fromItem.code,
      toCode: toItem.code,
    };
  }, [amount, fromCurrency, toCurrency, rates]);

  const handleConvert = () => {
    const cleaned = (amount || '').toString().replace(/,/g, '').trim();
    const parsedAmount = parseFloat(cleaned);
    if (isNaN(parsedAmount) || parsedAmount <= 0 || !convertedResult) {
      setInputErr(true);
      if (triggerVibration) triggerVibration('error');
      return;
    }
    setInputErr(false);
    if (triggerVibration) triggerVibration('success');

    // Save to calculation history
    if (onSaveHistory) {
      const details = `Source Amount: ${parsedAmount.toLocaleString()} ${convertedResult.fromCode} | Currency Pair: ${convertedResult.fromCode} → ${convertedResult.toCode} | Exchange Rate: 1 ${convertedResult.fromCode} = ${convertedResult.exchangeRate.toFixed(4)} ${convertedResult.toCode}`;
      const formattedRes = `${convertedResult.toSymbol}${convertedResult.convertedAmount.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })} (${convertedResult.toCode})`;
      onSaveHistory('Currency', details, formattedRes);
    }
  };

  const handleSwap = () => {
    if (triggerVibration) triggerVibration('click');
    const temp = fromCurrency;
    setFromCurrency(toCurrency);
    setToCurrency(temp);
  };

  const handleReset = () => {
    if (triggerVibration) triggerVibration('reset');
    setAmount('');
    setInputErr(false);
  };

  const currentFromItem = CURRENCY_LIST.find((c) => c.code === fromCurrency) || CURRENCY_LIST[0];
  const currentToItem = CURRENCY_LIST.find((c) => c.code === toCurrency) || CURRENCY_LIST[1];

  const liveExchangeRatio = useMemo(() => {
    const fRate = rates[fromCurrency] || 1;
    const tRate = rates[toCurrency] || 1;
    return tRate / fRate;
  }, [fromCurrency, toCurrency, rates]);

  return (
    <div className="bg-white rounded-3xl p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden h-full flex flex-col justify-between">
      <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-bl-full -mr-10 -mt-10 z-0 pointer-events-none"></div>

      <div className="relative z-10 flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-lg text-slate-800">Currency Exchange</h2>
            <p className="text-[11px] font-medium text-slate-400">Real-time FX rates & quick conversion</p>
          </div>
        </div>

        {/* Live status badge & refresh */}
        <button
          type="button"
          onClick={fetchLiveRates}
          disabled={loadingRates}
          className="flex items-center space-x-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/80 px-2.5 py-1 rounded-full text-[10px] font-bold text-slate-600 transition-all cursor-pointer"
          title="Click to refresh live exchange rates"
        >
          <RefreshCw className={`w-3 h-3 text-emerald-600 ${loadingRates ? 'animate-spin' : ''}`} />
          <span>{isLiveRates ? `Live ${lastUpdated ? `@ ${lastUpdated}` : ''}` : 'Static Rates'}</span>
        </button>
      </div>


      <div className="space-y-4">
        {/* Amount Input */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 flex justify-between items-center">
            <span>Amount to Convert</span>
            {inputErr && (
              <span className="text-red-500 text-[10px] lowercase font-semibold flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> enter valid amount
              </span>
            )}
          </label>
          <motion.div
            animate={inputErr ? { x: [-4, 4, -4, 4, 0] } : {}}
            transition={{ duration: 0.3 }}
            className="relative"
          >
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">
              {currentFromItem.symbol}
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                if (inputErr) setInputErr(false);
              }}
              className={`w-full border rounded-2xl py-3.5 pl-10 pr-4 font-semibold text-slate-800 focus:ring-2 transition-all outline-none ${
                inputErr
                  ? 'bg-red-50/50 border-red-300 focus:ring-red-100 text-red-900'
                  : 'bg-slate-50 border-none focus:ring-emerald-200'
              }`}
              placeholder="0"
            />
          </motion.div>
        </div>

        {/* Currency Selectors & Swap */}
        <div className="grid grid-cols-12 gap-2 items-center">
          {/* From Currency */}
          <div className="col-span-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              From
            </label>
            <select
              value={fromCurrency}
              onChange={(e) => {
                setFromCurrency(e.target.value);
              }}
              className="w-full bg-slate-50 border-none rounded-2xl py-3 px-3 font-bold text-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-200 cursor-pointer"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={`from-${c.code}`} value={c.code}>
                  {c.flag} {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </div>

          {/* Swap Button */}
          <div className="col-span-2 flex items-end justify-center pt-5">
            <button
              type="button"
              onClick={handleSwap}
              className="w-10 h-10 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-600 flex items-center justify-center transition-all border border-emerald-100 shadow-2xs active:scale-90"
              title="Swap Currencies"
            >
              <ArrowRightLeft className="w-4 h-4" />
            </button>
          </div>

          {/* To Currency */}
          <div className="col-span-5">
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
              To
            </label>
            <select
              value={toCurrency}
              onChange={(e) => {
                setToCurrency(e.target.value);
              }}
              className="w-full bg-slate-50 border-none rounded-2xl py-3 px-3 font-bold text-slate-800 text-xs sm:text-sm focus:ring-2 focus:ring-emerald-200 cursor-pointer"
            >
              {CURRENCY_LIST.map((c) => (
                <option key={`to-${c.code}`} value={c.code}>
                  {c.flag} {c.code} ({c.symbol})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Ratio Indicator */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl px-3.5 py-2 flex items-center justify-between text-xs text-slate-500 font-medium">
          <span className="flex items-center gap-1.5">
            <Globe className="w-3.5 h-3.5 text-emerald-500" />
            <span>Exchange Ratio:</span>
          </span>
          <span className="font-extrabold text-slate-700">
            1 {currentFromItem.code} = {liveExchangeRatio.toFixed(4)} {currentToItem.code}
          </span>
        </div>

        {/* Convert & Reset Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={handleConvert}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3.5 rounded-2xl transition-all shadow-md active:scale-[0.98] flex items-center justify-center gap-2"
          >
            <span>Convert FX</span>
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="w-14 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors"
            title="Reset"
          >
            <RotateCcw className="w-5 h-5" />
          </button>
        </div>

        {/* Converted Result Display */}
        <AnimatePresence>
          {convertedResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="pt-3 border-t border-slate-100 mt-2 overflow-hidden"
            >
              <div className="bg-emerald-50 rounded-2xl p-4 flex justify-between items-center border border-emerald-100/80 shadow-2xs">
                <div>
                  <p className="text-emerald-800/60 text-xs font-bold uppercase tracking-wider mb-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Converted Value</span>
                  </p>
                  <p className="text-2xl font-black text-emerald-700">
                    {convertedResult.toSymbol}
                    {convertedResult.convertedAmount.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-emerald-800/60 text-xs font-bold uppercase tracking-wider mb-1">
                    Rate Applied
                  </p>
                  <p className="text-xs font-bold text-emerald-800">
                    1 {convertedResult.fromCode} = {convertedResult.exchangeRate.toFixed(4)} {convertedResult.toCode}
                  </p>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
