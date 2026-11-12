'use client';

import React from 'react';
import { Order } from '../types';
import { getCurrencySymbol } from '../lib/marketData';
import { Clock, CheckCircle, XCircle } from 'lucide-react';

interface OrdersTableProps {
  orders: Order[];
  currencySymbol?: string; // optional override; defaults to each order's own currency
}

export const OrdersTable: React.FC<OrdersTableProps> = ({ orders, currencySymbol }) => {
  const cur = (sym: string) => currencySymbol ?? getCurrencySymbol(sym);
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);
  return (
    <div className="bg-broker-card border border-broker-border rounded-lg overflow-hidden flex flex-col h-full select-none">
      <div className="bg-[#0f1420] border-b border-broker-border px-4 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold font-mono text-slate-200 uppercase tracking-wide">
            Execution Log &amp; Order Fills ({orders.length})
          </h3>
        </div>
        <div className="text-[11px] font-mono text-slate-400">Audit Trail</div>
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[260px]">
        {orders.length > 0 ? (
          <table className="w-full text-left border-collapse text-xs font-mono">
            <thead>
              <tr className="border-b border-broker-border/80 bg-[#090d16] text-[10px] text-slate-400 uppercase tracking-wider">
                <th className="py-2.5 px-3">Time</th>
                <th className="py-2.5 px-3">Symbol</th>
                <th className="py-2.5 px-3">Side</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3 text-right">Shares</th>
                <th className="py-2.5 px-3 text-right">Fill Price</th>
                <th className="py-2.5 px-3 text-right">Comm.</th>
                <th className="py-2.5 px-3 text-center">Status</th>
                <th className="py-2.5 px-3">Execution Trigger / Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-broker-border/40">
              {orders.map((o) => {
                const isBuy = o.side === 'BUY';
                const timeStr = isMounted
                  ? new Date(o.timestamp).toLocaleTimeString('en-US', {
                      hour12: false,
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                    })
                  : '--:--:--';

                return (
                  <tr key={o.id} className="hover:bg-[#111726] transition-colors">
                    <td suppressHydrationWarning className="py-2 px-3 text-slate-400 text-[11px] whitespace-nowrap">
                      {timeStr}
                    </td>
                    <td className="py-2 px-3 font-bold text-white">{o.symbol}</td>
                    <td className="py-2 px-3">
                      <span
                        className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                          isBuy ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {o.side}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-300 text-[11px]">{o.type}</td>
                    <td className="py-2 px-3 text-right text-slate-200">{o.quantity}</td>
                    <td className="py-2 px-3 text-right font-semibold text-white">
                      {cur(o.symbol)}{o.filledPrice?.toFixed(2) ?? '---'}
                    </td>
                    <td className="py-2 px-3 text-right text-slate-400 text-[11px]">
                      {cur(o.symbol)}{o.commission.toFixed(2)}
                    </td>
                    <td className="py-2 px-3 text-center">
                      <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-semibold">
                        <CheckCircle className="w-3 h-3" />
                        FILLED
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-400 text-[11px] max-w-xs truncate" title={o.reason}>
                      {o.reason || 'Autonomous Confluence Trigger'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className="py-12 flex flex-col items-center justify-center text-center p-4">
            <Clock className="w-8 h-8 text-slate-700 mb-2" />
            <div className="text-xs font-semibold text-slate-400 font-mono">No Orders Placed Yet</div>
            <div className="text-[11px] text-slate-500 font-mono mt-1">
              Orders executed by the autonomous agent or manual triggers will appear here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
