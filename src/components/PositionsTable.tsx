'use client';

import React from 'react';
import { Position } from '../types';
import { getCurrencySymbol } from '../lib/marketData';
import { Layers, XCircle, TrendingUp, TrendingDown, Target, ShieldAlert } from 'lucide-react';

interface PositionsTableProps {
  positions: Position[];
  onClosePosition: (symbol: string) => void;
  currencySymbol?: string; // optional override; defaults to each position's own currency
}

export const PositionsTable: React.FC<PositionsTableProps> = ({
  positions,
  onClosePosition,
  currencySymbol,
}) => {
  const cur = (sym: string) => currencySymbol ?? getCurrencySymbol(sym);
  return (
    <div className="bg-broker-card border border-broker-border rounded-lg overflow-hidden flex flex-col h-full select-none">
      <div className="bg-[#0f1420] border-b border-broker-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wide">
            Open Portfolio Positions ({positions.length})
          </h3>
        </div>
        <div className="text-[11px] font-mono text-slate-400">Mark to Market</div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[260px]">
        {positions.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-broker-border/80 bg-[#090d16] text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3 text-right">Qty</th>
                <th className="py-2.5 px-3 text-right">Avg Entry</th>
                <th className="py-2.5 px-3 text-right">Current Price</th>
                <th className="py-2.5 px-3 text-right">Market Value</th>
                <th className="py-2.5 px-3 text-right">Unrealized P&amp;L</th>
                <th className="py-2.5 px-3 text-center">Stop Loss</th>
                <th className="py-2.5 px-3 text-center">Take Profit</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-broker-border/40">
              {positions.map((pos) => {
                const isProfitable = pos.unrealizedPnl >= 0;
                const marketVal = pos.quantity * pos.currentPrice;

                return (
                  <tr key={pos.symbol} className="hover:bg-[#111726] transition-colors">
                    <td className="py-2.5 px-3 font-bold text-white flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                      {pos.symbol}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-200">{pos.quantity}</td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{cur(pos.symbol)}{pos.averagePrice.toFixed(2)}</td>
                    <td className="py-2.5 px-3 text-right font-semibold text-white">
                      {cur(pos.symbol)}{pos.currentPrice.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300">{cur(pos.symbol)}{marketVal.toFixed(2)}</td>
                    <td
                      className={`py-2.5 px-3 text-right font-semibold ${
                        isProfitable ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <div className="flex items-center justify-end gap-1">
                        {isProfitable ? '+' : ''}{cur(pos.symbol)}{pos.unrealizedPnl.toFixed(2)}
                        <span className="text-[10px] opacity-80">
                          ({isProfitable ? '+' : ''}
                          {pos.unrealizedPnlPct.toFixed(2)}%)
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {pos.stopLoss ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 border border-rose-900/40 text-[10px]">
                          <ShieldAlert className="w-2.5 h-2.5" />
                          {cur(pos.symbol)}{pos.stopLoss.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-600">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      {pos.takeProfit ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-900/40 text-[10px]">
                          <Target className="w-2.5 h-2.5" />
                          {cur(pos.symbol)}{pos.takeProfit.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-slate-600">---</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <button
                        onClick={() => onClosePosition(pos.symbol)}
                        className="px-2 py-1 rounded bg-[#201524] hover:bg-rose-950 text-rose-400 hover:text-rose-300 border border-rose-900/60 text-[10px] font-semibold transition-colors"
                        title={`Market Close {cur(pos.symbol)}{pos.symbol}`}
                      >
                        Close
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center p-4">
            <Layers className="w-8 h-8 text-slate-700 mb-2" />
            <div className="text-xs font-semibold text-slate-400 font-mono">No Open Positions</div>
            <div className="text-[11px] text-slate-500 font-mono mt-1 max-w-sm">
              The autonomous agent will automatically enter positions when quantitative indicators meet confluence thresholds.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
