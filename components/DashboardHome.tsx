'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays,
  Calculator,
  Wallet,
  Tag,
  ShoppingCart,
  Heart,
  Scale,
  Ruler,
  Globe,
  ArrowUpDown,
  StickyNote,
  ListTodo,
  ChevronRight,
} from 'lucide-react';
import { motion } from 'motion/react';
import type { NoteItem } from '../lib/types/notes-tasks';

export type DashboardTargetTab =
  | 'age'
  | 'calculator'
  | 'emi'
  | 'wishlist'
  | 'discount'
  | 'weight'
  | 'unit'
  | 'currency'
  | 'notes'
  | 'tasks';

interface DashboardHomeProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  onSelectTool: (tab: DashboardTargetTab) => void;
  notes: NoteItem[];
  tasksCount: number;
}

interface DashboardCardDef {
  id: DashboardTargetTab;
  title: string;
  subtitle: string;
  keywords: string;
  cardBg: string;
  iconBg: string;
  iconText: string;
  icon: React.ComponentType<{ className?: string }>;
  secondaryIcon?: React.ComponentType<{ className?: string }>;
  secondaryIconClass?: string;
}

const ALL_CALCULATORS_CARDS: DashboardCardDef[] = [
  {
    id: 'age',
    title: 'Age Calculator',
    subtitle: 'Birthday to current date',
    keywords: 'age birthday date years months days countdown',
    cardBg: 'bg-[#e6f7fa] hover:bg-[#dbf3f7] border-[#cfeef4]',
    iconBg: 'bg-[#5ec2c6]/25',
    iconText: 'text-[#0f766e]',
    icon: CalendarDays,
  },
  {
    id: 'calculator',
    title: 'Scientific Calculator',
    subtitle: 'Complex functions, logic',
    keywords: 'scientific math sin cos tan log algebra exponent root',
    cardBg: 'bg-[#ebf3ff] hover:bg-[#dfeaff] border-[#d6e4fc]',
    iconBg: 'bg-[#7ba7f7]/25',
    iconText: 'text-[#1d4ed8]',
    icon: Calculator,
  },
  {
    id: 'emi',
    title: 'EMI Calculator',
    subtitle: 'Monthly installment planner',
    keywords: 'emi loan interest bank monthly finance mortgage',
    cardBg: 'bg-[#e8faee] hover:bg-[#dcf6e5] border-[#cef0da]',
    iconBg: 'bg-[#6ed48f]/25',
    iconText: 'text-[#15803d]',
    icon: Wallet,
  },
  {
    id: 'discount',
    title: 'Discount Calculator',
    subtitle: 'Calculate savings & percentages',
    keywords: 'discount percent percentage sale price savings retail',
    cardBg: 'bg-[#fff0e3] hover:bg-[#ffe7d2] border-[#f9dfc8]',
    iconBg: 'bg-[#f49b5c]/25',
    iconText: 'text-[#c2410c]',
    icon: Tag,
  },
];

const QUICK_TOOLS_CARDS: DashboardCardDef[] = [
  {
    id: 'wishlist',
    title: 'Wishlist Planner',
    subtitle: 'Plan purchases & budget',
    keywords: 'wishlist goal target purchase savings budget shopping',
    cardBg: 'bg-[#ffedf2] hover:bg-[#ffe1ea] border-[#fbd5e0]',
    iconBg: 'bg-[#f47da0]/20',
    iconText: 'text-[#be185d]',
    icon: ShoppingCart,
    secondaryIcon: Heart,
    secondaryIconClass: 'text-[#ec4899]',
  },
  {
    id: 'weight',
    title: 'Price by Weight',
    subtitle: 'Cost per gram/kg/oz',
    keywords: 'weight price gram kg oz grocery cost budget',
    cardBg: 'bg-[#fff8dd] hover:bg-[#fff2c8] border-[#f8e9b5]',
    iconBg: 'bg-[#f4c94e]/25',
    iconText: 'text-[#b45309]',
    icon: Scale,
  },
  {
    id: 'unit',
    title: 'Unit Converter',
    subtitle: 'Distance, weight, temperature',
    keywords: 'unit convert grams kg liter ml volume weight distance',
    cardBg: 'bg-[#f4edff] hover:bg-[#ebe0ff] border-[#e2d3fc]',
    iconBg: 'bg-[#b38af7]/25',
    iconText: 'text-[#6d28d9]',
    icon: Ruler,
  },
  {
    id: 'currency',
    title: 'Currency Exchange',
    subtitle: 'Global rates, FX conversions',
    keywords: 'currency fx exchange rate dollar euro rupee taka yen',
    cardBg: 'bg-[#e5faf8] hover:bg-[#d7f5f2] border-[#cbeee9]',
    iconBg: 'bg-[#57c7be]/25',
    iconText: 'text-[#0f766e]',
    icon: Globe,
    secondaryIcon: ArrowUpDown,
    secondaryIconClass: 'text-[#0f766e]',
  },
];

export default function DashboardHome({
  searchQuery,
  onSearchChange,
  onSelectTool,
  notes,
  tasksCount,
}: DashboardHomeProps) {
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const [launchingTool, setLaunchingTool] = useState<DashboardTargetTab | null>(null);
  const launchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (launchTimerRef.current) {
        clearTimeout(launchTimerRef.current);
      }
    };
  }, []);

  const handleCardTap = (toolId: DashboardTargetTab) => {
    if (launchTimerRef.current) {
      clearTimeout(launchTimerRef.current);
    }
    setLaunchingTool(toolId);
    launchTimerRef.current = setTimeout(() => {
      setLaunchingTool(null);
      onSelectTool(toolId);
    }, 105);
  };

  const filteredCalculators = useMemo(() => {
    if (!normalizedQuery) return ALL_CALCULATORS_CARDS;
    return ALL_CALCULATORS_CARDS.filter(
      (c) =>
        c.title.toLowerCase().includes(normalizedQuery) ||
        c.subtitle.toLowerCase().includes(normalizedQuery) ||
        c.keywords.includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const filteredQuickTools = useMemo(() => {
    if (!normalizedQuery) return QUICK_TOOLS_CARDS;
    return QUICK_TOOLS_CARDS.filter(
      (c) =>
        c.title.toLowerCase().includes(normalizedQuery) ||
        c.subtitle.toLowerCase().includes(normalizedQuery) ||
        c.keywords.includes(normalizedQuery)
    );
  }, [normalizedQuery]);

  const showMyNotesCard =
    !normalizedQuery ||
    'my notes'.includes(normalizedQuery) ||
    'notes manager'.includes(normalizedQuery);

  const showTasksCard =
    !normalizedQuery ||
    'tasks'.includes(normalizedQuery) ||
    'checklist'.includes(normalizedQuery) ||
    'reminders'.includes(normalizedQuery);

  const hasAnyMatches =
    filteredCalculators.length > 0 ||
    filteredQuickTools.length > 0 ||
    showMyNotesCard ||
    showTasksCard;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pt-4 pb-6 space-y-5 sm:px-6 sm:pt-5 sm:space-y-6">
      {!hasAnyMatches ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.18 }}
          className="bg-white/90 border border-slate-200/80 rounded-2xl p-8 text-center space-y-3 shadow-xs"
        >
          <p className="text-sm font-semibold text-slate-700">
            No calculators, tools, or notes matched &ldquo;{searchQuery}&rdquo;.
          </p>
          <motion.button
            type="button"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => onSearchChange('')}
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Clear search
          </motion.button>
        </motion.div>
      ) : (
        <>
          {/* Section 1: ALL CALCULATORS */}
          {filteredCalculators.length > 0 && (
            <section aria-labelledby="section-all-calculators" className="space-y-2.5">
              <h2
                id="section-all-calculators"
                className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900"
              >
                All Calculators
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {filteredCalculators.map((card, index) => {
                  const Icon = card.icon;
                  const isLaunching = launchingTool === card.id;
                  return (
                    <motion.button
                      key={card.id}
                      type="button"
                      data-dashboard-card="true"
                      initial={false}
                      animate={{
                        scale: isLaunching ? 1.06 : 1,
                      }}
                      transition={
                        isLaunching
                          ? { type: 'spring', stiffness: 520, damping: 24 }
                          : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                      }
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => handleCardTap(card.id)}
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-colors duration-150 cursor-pointer flex flex-col justify-between min-h-[116px] min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg} ${
                        isLaunching ? 'z-10 shadow-lg ring-2 ring-blue-500/40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 mb-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 ${
                            isLaunching ? 'scale-125' : ''
                          } ${card.iconBg} ${card.iconText}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </span>
                      </span>
                      <span className="block min-w-0 w-full">
                        <span className="block text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words">
                          {card.title}
                        </span>
                        <span className="block text-[11px] sm:text-xs text-slate-600 leading-snug mt-0.5 line-clamp-2 break-words">
                          {card.subtitle}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 2: QUICK TOOLS */}
          {filteredQuickTools.length > 0 && (
            <section aria-labelledby="section-quick-tools" className="space-y-2.5">
              <h2
                id="section-quick-tools"
                className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900"
              >
                Quick Tools
              </h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                {filteredQuickTools.map((card, index) => {
                  const Icon = card.icon;
                  const SecondaryIcon = card.secondaryIcon;
                  const isLaunching = launchingTool === card.id;
                  return (
                    <motion.button
                      key={card.id}
                      type="button"
                      data-dashboard-card="true"
                      initial={false}
                      animate={{
                        scale: isLaunching ? 1.06 : 1,
                      }}
                      transition={
                        isLaunching
                          ? { type: 'spring', stiffness: 520, damping: 24 }
                          : { duration: 0.16, ease: [0.22, 1, 0.36, 1] }
                      }
                      whileHover={{ y: -3, scale: 1.02 }}
                      whileTap={{ scale: 0.93 }}
                      onClick={() => handleCardTap(card.id)}
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-colors duration-150 cursor-pointer flex flex-col justify-between min-h-[116px] min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg} ${
                        isLaunching ? 'z-10 shadow-lg ring-2 ring-blue-500/40' : ''
                      }`}
                    >
                      <span className="flex items-center gap-2 mb-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-200 group-hover:scale-110 group-hover:rotate-3 ${
                            isLaunching ? 'scale-125' : ''
                          } ${card.iconBg} ${card.iconText}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </span>
                        {SecondaryIcon && (
                          <SecondaryIcon
                            className={`w-4 h-4 shrink-0 transition-transform duration-200 group-hover:scale-110 ${
                              isLaunching ? 'scale-125' : ''
                            } ${card.secondaryIconClass || ''}`}
                          />
                        )}
                      </span>
                      <span className="block min-w-0 w-full">
                        <span className="block text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words">
                          {card.title}
                        </span>
                        <span className="block text-[11px] sm:text-xs text-slate-600 leading-snug mt-0.5 line-clamp-2 break-words">
                          {card.subtitle}
                        </span>
                      </span>
                    </motion.button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 3: NOTES MANAGER (Strictly Contained Entry — Individual Notes Live Inside Notes Manager View) */}
          {(showMyNotesCard || showTasksCard) && (
            <section
              aria-labelledby="section-notes-manager"
              className="w-full max-w-full overflow-hidden rounded-2xl bg-white/80 border border-slate-200/80 shadow-[0_2px_12px_rgba(15,23,42,0.03)] p-3.5 sm:p-4 space-y-3"
            >
              <div className="flex items-center justify-between gap-2 min-w-0">
                <h2
                  id="section-notes-manager"
                  className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900 truncate"
                >
                  Notes Manager
                </h2>
                <motion.button
                  type="button"
                  whileHover={{ x: 2 }}
                  whileTap={{ scale: 0.96 }}
                  onClick={() => onSelectTool('notes')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 min-h-[36px] px-2 rounded-lg hover:bg-blue-50/70 transition-colors cursor-pointer shrink-0"
                >
                  <span>Open Notes</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </motion.button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 w-full min-w-0 overflow-hidden">
                {showMyNotesCard && (
                  <motion.button
                    type="button"
                    data-dashboard-card="true"
                    animate={{ scale: launchingTool === 'notes' ? 1.05 : 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleCardTap('notes')}
                    className={`w-full min-w-0 overflow-hidden text-left rounded-2xl p-3.5 sm:p-4 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/80 shadow-[0_1px_6px_rgba(15,23,42,0.03)] transition-colors cursor-pointer flex flex-col justify-between min-h-[96px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      launchingTool === 'notes' ? 'ring-2 ring-blue-500/40 shadow-md' : ''
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 mb-1.5 w-full min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        My Notes
                      </span>
                      <StickyNote className="w-4 h-4 text-amber-600 shrink-0" />
                    </span>
                    <span className="block text-xs font-medium text-slate-500 tabular-nums truncate">
                      {notes.length} {notes.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </motion.button>
                )}

                {showTasksCard && (
                  <motion.button
                    type="button"
                    data-dashboard-card="true"
                    animate={{ scale: launchingTool === 'tasks' ? 1.05 : 1 }}
                    transition={{ type: 'spring', stiffness: 520, damping: 24 }}
                    whileHover={{ y: -2, scale: 1.02 }}
                    whileTap={{ scale: 0.94 }}
                    onClick={() => handleCardTap('tasks')}
                    className={`w-full min-w-0 overflow-hidden text-left rounded-2xl p-3.5 sm:p-4 bg-[#eef2ff] hover:bg-[#e3e9ff] border border-[#d6defe] shadow-[0_1px_6px_rgba(15,23,42,0.03)] transition-colors cursor-pointer flex flex-col justify-between min-h-[96px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                      launchingTool === 'tasks' ? 'ring-2 ring-indigo-500/40 shadow-md' : ''
                    }`}
                  >
                    <span className="flex items-center justify-between gap-2 mb-1.5 w-full min-w-0">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        Tasks
                      </span>
                      <ListTodo className="w-4 h-4 text-indigo-600 shrink-0" />
                    </span>
                    <span className="block text-xs font-medium text-slate-600 tabular-nums truncate">
                      {tasksCount} {tasksCount === 1 ? 'Task' : 'Tasks'}
                    </span>
                  </motion.button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
