'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart3, PieChart, TrendingUp } from 'lucide-react';
import { HistoryItem } from '../lib/historyStorage';

interface HistoryChartProps {
  history: HistoryItem[];
}

const TYPE_COLORS: Record<string, string> = {
  EMI: '#2563EB',      // Blue
  Wishlist: '#0D9488', // Teal/Emerald
  Discount: '#D97706', // Amber/Orange
  Weight: '#7C3AED',   // Purple
  Unit: '#4F46E5',     // Indigo
  Currency: '#059669', // Green
  Other: '#64748B',    // Slate
};

export default function HistoryChart({ history }: HistoryChartProps) {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {
      EMI: 0,
      Wishlist: 0,
      Discount: 0,
      Weight: 0,
      Unit: 0,
      Currency: 0,
    };

    history.forEach((item) => {
      const typeKey = item.type || 'Other';
      if (counts[typeKey] !== undefined) {
        counts[typeKey] += 1;
      } else {
        counts[typeKey] = (counts[typeKey] || 0) + 1;
      }
    });

    const list = Object.keys(counts)
      .map((key) => ({
        name: key,
        count: counts[key],
        color: TYPE_COLORS[key] || TYPE_COLORS.Other,
      }))
      .filter((item) => item.count > 0 || history.length === 0);

    return list;
  }, [history]);

  const totalCalculations = history.length;

  const topTool = useMemo(() => {
    if (chartData.length === 0) return null;
    return [...chartData].sort((a, b) => b.count - a.count)[0];
  }, [chartData]);

  if (totalCalculations === 0) {
    return (
      <div className="bg-slate-50 border border-slate-100 rounded-3xl p-6 text-center flex flex-col items-center justify-center my-4">
        <BarChart3 className="w-10 h-10 text-slate-300 mb-2" />
        <p className="text-sm font-bold text-slate-600">No Calculation Data Yet</p>
        <p className="text-xs text-slate-400 mt-1">Perform calculations to visualize tool usage distribution.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-3xl p-5 md:p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 my-4 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-base flex items-center gap-2">
              Usage Distribution
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Breakdown of {totalCalculations} total calculation{totalCalculations === 1 ? '' : 's'} performed
            </p>
          </div>
        </div>

        {topTool && topTool.count > 0 && (
          <div className="flex items-center gap-1.5 bg-indigo-50/80 border border-indigo-100 text-indigo-700 px-3 py-1.5 rounded-2xl text-xs font-bold self-start sm:self-center">
            <span>Most Used: <strong className="font-black text-indigo-900">{topTool.name}</strong> ({topTool.count})</span>
          </div>
        )}
      </div>

      <div className="h-52 w-full pt-2">
        {isMounted ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#64748B', fontWeight: 700 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 10, fill: '#94A3B8' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                formatter={(value: number) => [`${value} times`, 'Calculations']}
                labelFormatter={(label: string) => `Tool: ${label}`}
                contentStyle={{
                  backgroundColor: '#0F172A',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                  border: 'none',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.2)',
                }}
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]} maxBarSize={45}>
                {chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-full w-full flex items-center justify-center text-xs text-slate-400">
            Loading chart...
          </div>
        )}
      </div>

      {/* Summary Chips */}
      <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100">
        {chartData.map((item) => {
          const pct = Math.round((item.count / totalCalculations) * 100) || 0;
          return (
            <div
              key={item.name}
              className="flex items-center space-x-2 bg-slate-50 border border-slate-100 px-3 py-1.5 rounded-xl text-xs"
            >
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: item.color }}
              ></span>
              <span className="font-bold text-slate-700">{item.name}:</span>
              <span className="font-black text-slate-900">{item.count}</span>
              <span className="text-[10px] text-slate-400 font-semibold">({pct}%)</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
