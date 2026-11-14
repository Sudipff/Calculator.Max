'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
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
  CheckSquare,
  Square,
  ExternalLink,
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
  onSelectTool: (tab: DashboardTargetTab) => void;
  notes: NoteItem[];
  tasksCount: number;
  closeNotePreviewSignal?: number;
  onNotePreviewChange?: (isOpen: boolean) => void;
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
  onSelectTool,
  notes,
  tasksCount,
  closeNotePreviewSignal = 0,
  onNotePreviewChange,
}: DashboardHomeProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const normalizedQuery = searchQuery.trim().toLowerCase();

  useEffect(() => {
    if (closeNotePreviewSignal > 0) {
      setSelectedNoteId(null);
    }
  }, [closeNotePreviewSignal]);

  const selectedNote = useMemo(
    () => (selectedNoteId ? notes.find((n) => n.id === selectedNoteId) || null : null),
    [notes, selectedNoteId]
  );

  useEffect(() => {
    onNotePreviewChange?.(Boolean(selectedNote));
  }, [selectedNote, onNotePreviewChange]);

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
    return notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(normalizedQuery) ||
          n.content.toLowerCase().includes(normalizedQuery) ||
          n.checklistItems.some((item) => item.text.toLowerCase().includes(normalizedQuery))
      )
      .slice(0, 6);
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
    <div className="w-full max-w-5xl mx-auto px-4 pt-4 pb-6 space-y-5 sm:px-6 sm:pt-5 sm:space-y-6">
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
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[116px] min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg}`}
                    >
                      <span className="flex items-center gap-2 mb-2.5">
                        <span
                          className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-150 group-hover:scale-105 ${card.iconBg} ${card.iconText}`}
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
                      className={`group text-left rounded-2xl p-3.5 sm:p-4 border shadow-[0_2px_10px_rgba(15,23,42,0.03)] transition-all duration-150 active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[116px] min-w-0 overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${card.cardBg}`}
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
                      <span className="block min-w-0 w-full">
                        <span className="block text-[13px] sm:text-sm font-bold text-slate-900 leading-snug break-words">
                          {card.title}
                        </span>
                        <span className="block text-[11px] sm:text-xs text-slate-600 leading-snug mt-0.5 line-clamp-2 break-words">
                          {card.subtitle}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          {/* Section 3: NOTES MANAGER (Strictly Contained) */}
          {(showMyNotesCard || showTasksCard || filteredNotes.length > 0) && (
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
                <button
                  type="button"
                  onClick={() => onSelectTool('notes')}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 min-h-[36px] px-2 rounded-lg hover:bg-blue-50/70 transition-colors cursor-pointer shrink-0"
                >
                  <span>Open Notes</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Strictly Contained Responsive Card Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3 w-full min-w-0 overflow-hidden">
                {showMyNotesCard && (
                  <button
                    type="button"
                    onClick={() => onSelectTool('notes')}
                    className="w-full min-w-0 overflow-hidden text-left rounded-2xl p-3.5 bg-slate-50/90 hover:bg-slate-100/90 border border-slate-200/80 shadow-[0_1px_6px_rgba(15,23,42,0.03)] transition-colors active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                  </button>
                )}

                {filteredNotes.map((note) => {
                  const previewText = note.isChecklist
                    ? `${note.checklistItems.filter((i) => i.completed).length}/${note.checklistItems.length} checked`
                    : note.content.trim() || 'Open note';
                  const isExpanded = selectedNote?.id === note.id;

                  return (
                    <button
                      key={note.id}
                      type="button"
                      aria-expanded={isExpanded}
                      onClick={() =>
                        setSelectedNoteId((prev) => (prev === note.id ? null : note.id))
                      }
                      className={`w-full min-w-0 overflow-hidden text-left rounded-2xl p-3.5 border shadow-[0_1px_6px_rgba(15,23,42,0.03)] transition-colors active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                        isExpanded ? 'ring-2 ring-blue-500 ring-offset-1' : ''
                      } ${getNoteSurfaceClass(note.color)}`}
                    >
                      <span className="block text-xs sm:text-sm font-bold text-slate-900 truncate w-full">
                        {note.title || 'Untitled Note'}
                      </span>
                      <span className="block text-[11px] text-slate-600 line-clamp-2 break-words mt-1 leading-snug w-full">
                        {previewText}
                      </span>
                    </button>
                  );
                })}

                {showTasksCard && (
                  <button
                    type="button"
                    onClick={() => onSelectTool('tasks')}
                    className="w-full min-w-0 overflow-hidden text-left rounded-2xl p-3.5 bg-[#eef2ff] hover:bg-[#e3e9ff] border border-[#d6defe] shadow-[0_1px_6px_rgba(15,23,42,0.03)] transition-colors active:scale-[0.98] cursor-pointer flex flex-col justify-between min-h-[92px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
                  </button>
                )}
              </div>

              {/* In-Section Contained Note Preview Drawer (prevents unexpected navigation out of section) */}
              {selectedNote && (
                <div
                  role="region"
                  aria-label="Selected note preview"
                  className={`w-full min-w-0 overflow-hidden rounded-2xl border p-3.5 sm:p-4 space-y-2.5 ${getNoteSurfaceClass(
                    selectedNote.color
                  )}`}
                >
                  <div className="flex items-start justify-between gap-2 min-w-0">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-slate-900 break-words">
                        {selectedNote.title || 'Untitled Note'}
                      </h3>
                      {selectedNote.labels.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedNote.labels.slice(0, 4).map((label) => (
                            <span
                              key={label}
                              className="inline-block text-[10px] font-semibold text-slate-700 bg-white/80 border border-slate-200/80 px-2 py-0.5 rounded-md truncate max-w-[140px]"
                            >
                              #{label}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => setSelectedNoteId(null)}
                      className="min-w-[32px] min-h-[32px] rounded-lg bg-white/80 hover:bg-white text-slate-500 hover:text-slate-800 flex items-center justify-center border border-slate-200/70 transition-colors cursor-pointer shrink-0"
                      aria-label="Close note preview"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {selectedNote.isChecklist && selectedNote.checklistItems.length > 0 ? (
                    <ul className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {selectedNote.checklistItems.slice(0, 8).map((item) => (
                        <li
                          key={item.id}
                          className="flex items-start gap-2 text-xs text-slate-700 min-w-0"
                        >
                          {item.completed ? (
                            <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                          ) : (
                            <Square className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                          )}
                          <span
                            className={`break-words min-w-0 ${
                              item.completed ? 'line-through text-slate-400' : ''
                            }`}
                          >
                            {item.text}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-slate-700 whitespace-pre-wrap break-words max-h-36 overflow-y-auto leading-relaxed">
                      {selectedNote.content.trim() || 'This note has no body text yet.'}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-900/10">
                    <button
                      type="button"
                      onClick={() => setSelectedNoteId(null)}
                      className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 bg-white/80 hover:bg-white border border-slate-200/80 transition-colors cursor-pointer"
                    >
                      Collapse
                    </button>
                    <button
                      type="button"
                      onClick={() => onSelectTool('notes')}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 transition-colors cursor-pointer"
                    >
                      <span>Open in Notes</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
