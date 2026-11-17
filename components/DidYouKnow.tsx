'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Lightbulb, ChevronRight, ChevronLeft, Clock, Check, Share2, DollarSign } from 'lucide-react';
import { showNotification } from '@/lib/notifications';

export interface RetailTip {
  id: number;
  category: string;
  title: string;
  tip: string;
  actionableStep: string;
  badgeColor: string;
}

export const RETAIL_TIPS: RetailTip[] = [
  {
    id: 1,
    category: 'EMI & Loans',
    title: 'Watch Out for No-Cost EMI Processing Fees',
    tip: 'Zero-Cost EMI offers often hide processing fee charges (typically 1-2% or fixed ₹199-₹299) plus GST. Always add processing fees to compare true costs.',
    actionableStep: 'Compare total outflow (Processing Fee + Interest GST) against paying upfront with cashback cards.',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-200',
  },
  {
    id: 2,
    category: 'Unit Pricing',
    title: 'The "Per Gram / Per ML" Illusion',
    tip: 'Larger bulk packs are not always cheaper per unit. Retailers frequently put smaller promotional items on sale with lower unit costs.',
    actionableStep: 'Always use the Weight & Unit Converter to divide price by weight in grams before buying bulk packs.',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-200',
  },
  {
    id: 3,
    category: 'Wishlist Strategy',
    title: 'The 48-Hour Impulse Buffer Rule',
    tip: 'Delaying non-essential purchases by 48 hours reduces impulsive buying by over 60%, allowing initial emotional urgency to fade.',
    actionableStep: 'Add items to the Wishlist Planner with a 30-day target. If you still want it next month, deposit savings.',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-200',
  },
  {
    id: 4,
    category: 'Discounts',
    title: 'Stacked Coupon Hierarchy',
    tip: 'Store discounts apply in sequence, not sum! A 20% discount followed by an extra 10% coupon equals 28% total discount, NOT 30%.',
    actionableStep: 'Use the Discount Calculator to test exact compound savings before heading to the checkout counter.',
    badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
  },
  {
    id: 5,
    category: 'Shopping Timing',
    title: 'End-of-Month Clearance Windows',
    tip: 'Retail sales reps have monthly quotas. Higher negotiable discounts or extra freebies are often available in the last 3 days of the month.',
    actionableStep: 'Time major appliance or luxury purchases for the 28th-31st of the month for maximum seller flexibility.',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  },
  {
    id: 6,
    category: 'Credit & Rewards',
    title: 'Reward Point Expiration Audits',
    tip: 'Over $1.5B in retail credit card reward points expire unused annually. Converting points into immediate statement credit avoids expiration.',
    actionableStep: 'Check credit card reward balances at the start of every quarter before executing high-value purchases.',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  },
  {
    id: 7,
    category: 'Price Match',
    title: 'Retailer Price Matching Guarantees',
    tip: 'Many major electronics and home stores match online competitor prices if shown at checkout before billing.',
    actionableStep: 'Search live e-commerce prices on your phone right before paying at brick-and-mortar stores.',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-200',
  },
];

export default function DidYouKnow() {
  const [currentTipIndex, setCurrentTipIndex] = useState<number>(0);
  const [timeToNextDay, setTimeToNextDay] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Daily seed index calculation
  useEffect(() => {
    const today = new Date();
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);

    const dailyIndex = dayOfYear % RETAIL_TIPS.length;
    setCurrentTipIndex(dailyIndex);

    // Update countdown timer to midnight
    const updateCountdown = () => {
      const now = new Date();
      const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const remainingMs = tomorrow.getTime() - now.getTime();

      const hours = Math.floor(remainingMs / (1000 * 60 * 60));
      const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
      setTimeToNextDay(`${hours}h ${minutes}m`);
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 60000);
    return () => clearInterval(interval);
  }, []);

  const handleNext = () => {
    setCurrentTipIndex((prev) => (prev + 1) % RETAIL_TIPS.length);
  };

  const handlePrev = () => {
    setCurrentTipIndex((prev) => (prev - 1 + RETAIL_TIPS.length) % RETAIL_TIPS.length);
  };

  const currentTip = RETAIL_TIPS[currentTipIndex];

  const handleCopy = () => {
    const text = `💡 Retail Savings Tip: ${currentTip.title}\n${currentTip.tip}\nAction: ${currentTip.actionableStep}`;
    navigator.clipboard?.writeText(text);
    setCopied(true);
    showNotification({
      id: 'tip-copy',
      message: 'Tip copied to clipboard',
      type: 'success',
      duration: 1800,
    });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10 rounded-3xl p-5 border border-amber-200/60 shadow-[0_4px_20px_rgb(0,0,0,0.03)] relative overflow-hidden mb-6">
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-2xl -mr-10 -mt-10 pointer-events-none"></div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-sm shrink-0">
            <Lightbulb className="w-4 h-4 fill-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-amber-950 text-sm tracking-tight">Did You Know?</h3>
              <span className="bg-amber-200/80 text-amber-900 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                Daily Savings Tip
              </span>
            </div>
            {timeToNextDay && (
              <p className="text-[10px] text-amber-800/60 font-medium flex items-center gap-1 mt-0.5">
                <Clock className="w-3 h-3 text-amber-600" /> Refreshes in {timeToNextDay}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1.5 self-end sm:self-center">
          <button
            type="button"
            onClick={handleCopy}
            className="text-[11px] font-bold text-amber-800 bg-white/80 hover:bg-white border border-amber-200/80 px-2.5 py-1 rounded-xl transition-all flex items-center gap-1 shadow-2xs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5 text-amber-700" />}
            <span>{copied ? 'Copied' : 'Share Tip'}</span>
          </button>
          <div className="flex items-center space-x-1 bg-white/80 border border-amber-200/80 rounded-xl p-0.5">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 text-amber-800 hover:bg-amber-100/60 rounded-lg transition-colors"
              title="Previous Tip"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-[10px] font-bold text-amber-900 px-1">
              {currentTipIndex + 1}/{RETAIL_TIPS.length}
            </span>
            <button
              type="button"
              onClick={handleNext}
              className="p-1 text-amber-800 hover:bg-amber-100/60 rounded-lg transition-colors"
              title="Next Tip"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentTip.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }}
          className="bg-white/90 backdrop-blur-xs rounded-2xl p-4 border border-amber-100/80 shadow-2xs space-y-2"
        >
          <div className="flex items-center justify-between gap-2">
            <h4 className="font-bold text-slate-800 text-sm md:text-base">
              {currentTip.title}
            </h4>
            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${currentTip.badgeColor}`}>
              {currentTip.category}
            </span>
          </div>

          <p className="text-xs text-slate-600 leading-relaxed font-normal">
            {currentTip.tip}
          </p>

          <div className="pt-2 border-t border-amber-50 flex items-start gap-2 text-xs text-amber-900/80 font-medium bg-amber-50/50 p-2.5 rounded-xl">
            <span><strong className="font-bold text-amber-950">Actionable Advice:</strong> {currentTip.actionableStep}</span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
