'use client';

import React, { useMemo } from 'react';
import {
  Search,
  X,
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
  searchInputRef: React.RefObject<HTMLInputElement | null>;
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

function getNoteSurfaceClass(color?: string): string {
  switch (color) {
    case 'mint':
    case 'sage':
      return 'bg-[#e9faef] hover:bg-[#dcf5e5] border-[#d0eedb]';
    case 'sand':
    case 'peach':
    case 'yellow':
      return 'bg-[#fff3e2] hover:bg-[#ffe9cc] border-[#f7dec0]';
    case 'sky':
    case 'blue':
    case 'fog':
      return 'bg-[#eaf3ff] hover:bg-[#deebff] border-[#d2e2fb]';
    case 'rose':
    case 'blossom':
      return 'bg-[#ffedf2] hover:bg-[#ffe1ea] border-[#f9d4df]';
    case 'lavender':
    case 'purple':
      return 'bg-[#f4edff] hover:bg-[#eae0ff] border-[#e1d2fa]';
    default:
      return 'bg-[#f8fafc] hover:bg-[#f1f5f9] border-slate-200/80';
  }
}

export default function DashboardHome({
  searchQuery,
  onSearchChange,
  searchInputRef,
  onSelectTool,
  notes,
  tasksCount,
}: DashboardHomeProps) {
  const normalizedQuery = searchQuery.trim().toLowerCase();

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

  const filteredNotes = useMemo(() => {
    if (!normalizedQuery) return notes.slice(0, 4);
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(normalizedQuery) ||
        n.content.toLowerCase().includes(normalizedQuery) ||
        n.checklistItems.some((item) => item.text.toLowerCase().includes(normalizedQuery))
    );
  }, [notes, normalizedQuery]);

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
    showTasksCard ||
    filteredNotes.length > 0;

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pt-3 pb-6 space-y-5 sm:px-6 sm:pt-4 sm:space-y-6">
      {/* Full-Width Search Bar */}
      <div className="relative w-full">
        <Search className="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search calculators, tools..."
          aria-label="Search calculators, tools, and notes"
          className="w-full min-h-[46px] bg-white/95 border border-slate-200/80 rounded-2xl pl-11 pr-10 py-2.5 text-sm font-medium text-slate-900 placeholder:text-slate-400 shadow-[0_2px_12px_rgba(15,23,42,0.04)] focus:outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="absolute right-2 top-1/2 -translate-y-1/2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!hasAnyMatches ? (
        <div className="bg-white/90 border border-slate-200/80 rounded-2xl p-8 text-center space-y-3 shadow-xs">
          <p className="text-sm font-semibold text-slate-700">
            No calculators, tools, or notes matched &ldquo;{searchQuery}&rdquo;.
          </p>
          <button
            type="button"
            onClick={() => onSearchChange('')}
            className="inline-flex items-center justify-center px-4 py-2 min-h-[44px] rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
          >
            Clear search
          </button>
        </div>
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
                {filteredCalculators.map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => onSelectTool(card.id)}
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[116px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg}`}
                    >
                      <span className="flex items-center gap-2 mb-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${card.iconBg} ${card.iconText}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </span>
                      </span>
                      <span className="block min-w-0">
                        <span className="block text-[13px] sm:text-sm font-bold text-slate-900 leading-snug">
                          {card.title}
                        </span>
                        <span className="block text-[11px] sm:text-xs text-slate-600 leading-snug mt-0.5 line-clamp-2">
                          {card.subtitle}
                        </span>
                      </span>
                    </button>
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
                {filteredQuickTools.map((card) => {
                  const Icon = card.icon;
                  const SecondaryIcon = card.secondaryIcon;
                  return (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => onSelectTool(card.id)}
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[116px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg}`}
                    >
                      <span className="flex items-center gap-2 mb-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${card.iconBg} ${card.iconText}`}
                        >
                          <Icon className="w-4.5 h-4.5" />
                        </span>
                        {SecondaryIcon && (
                          <SecondaryIcon
                            className={`w-4 h-4 shrink-0 ${card.secondaryIconClass || ''}`}
                          />
                        )}
                      </span>
                      <span className="block min-w-0">
                        <span className="block text-[13px] sm:text-sm font-bold text-slate-900 leading-snug">
                          {card.title}
                        </span>
                        <span className="block text-[11px] sm:text-xs text-slate-600 leading-snug mt-0.5 line-clamp-2">
                          {card.subtitle}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 3: NOTES MANAGER */}
          {(showMyNotesCard || showTasksCard || filteredNotes.length > 0) && (
            <section aria-labelledby="section-notes-manager" className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h2
                  id="section-notes-manager"
                  className="text-xs sm:text-sm font-extrabold uppercase tracking-wider text-slate-900"
                >
                  Notes Manager
                </h2>
                <button
                  type="button"
                  onClick={() => onSelectTool('notes')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 min-h-[36px] px-1 cursor-pointer"
                >
                  <span>Open Notes</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory md:grid md:grid-cols-3 lg:grid-cols-4 md:overflow-visible md:pb-0">
                {showMyNotesCard && (
                  <button
                    type="button"
                    onClick={() => onSelectTool('notes')}
                    className="snap-start shrink-0 w-[156px] md:w-auto text-left rounded-2xl p-3.5 bg-white/95 hover:bg-slate-50 border border-slate-200/80 shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px]"
                  >
                    <span className="flex items-center justify-between gap-2 mb-1.5 w-full">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        My Notes
                      </span>
                      <StickyNote className="w-4 h-4 text-amber-600 shrink-0" />
                    </span>
                    <span className="block text-xs font-medium text-slate-500 tabular-nums">
                      {notes.length} {notes.length === 1 ? 'Item' : 'Items'}
                    </span>
                  </button>
                )}

                {filteredNotes.map((note) => {
                  const previewText = note.isChecklist
                    ? `${note.checklistItems.filter((i) => i.completed).length}/${note.checklistItems.length} checked`
                    : note.content.trim() || 'Open note';

                  return (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => onSelectTool('notes')}
                      className={`snap-start shrink-0 w-[168px] md:w-auto text-left rounded-2xl p-3.5 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px] ${getNoteSurfaceClass(
                        note.color
                      )}`}
                    >
                      <span className="block text-xs sm:text-sm font-bold text-slate-900 line-clamp-1">
                        {note.title || 'Untitled Note'}
                      </span>
                      <span className="block text-[11px] text-slate-600 line-clamp-2 mt-1 leading-snug">
                        {previewText}
                      </span>
                    </button>
                  );
                })}

                {showTasksCard && (
                  <button
                    type="button"
                    onClick={() => onSelectTool('tasks')}
                    className="snap-start shrink-0 w-[156px] md:w-auto text-left rounded-2xl p-3.5 bg-[#eef2ff] hover:bg-[#e3e9ff] border border-[#d6defe] shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px]"
                  >
                    <span className="flex items-center justify-between gap-2 mb-1.5 w-full">
                      <span className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                        Tasks
                      </span>
                      <ListTodo className="w-4 h-4 text-indigo-600 shrink-0" />
                    </span>
                    <span className="block text-xs font-medium text-slate-600 tabular-nums">
                      {tasksCount} {tasksCount === 1 ? 'Task' : 'Tasks'}
                    </span>
                  </button>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
