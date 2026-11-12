'use client';

import React from 'react';
import {
  Activity,
  ShieldAlert,
  Sliders,
  Play,
  Pause,
  TrendingUp,
  TrendingDown,
  Layers,
  Terminal,
  BarChart3,
  Globe,
} from 'lucide-react';
import { PortfolioSummary, BrokerType, AgentMode } from '../types';

interface HeaderProps {
  currencySymbol?: string;
  portfolio: PortfolioSummary;
  autonomousEnabled: boolean;
  onToggleAutonomous: () => void;
  agentMode: AgentMode;
  activeBroker: BrokerType;
  onOpenSettings: () => void;
  onOpenBacktest: () => void;
  circuitBreakerTripped: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  portfolio,
  autonomousEnabled,
  onToggleAutonomous,
  agentMode,
  activeBroker,
  onOpenSettings,
  onOpenBacktest,
  circuitBreakerTripped,
  currencySymbol = '$',
}) => {
  const dayPnl = portfolio.realizedPnl + portfolio.unrealizedPnl;
  const dayPnlPct = portfolio.initialCash > 0 ? (dayPnl / portfolio.initialCash) * 100 : 0;
  const isPnlPositive = dayPnl >= 0;

  return (
    <header className="border-b border-broker-border bg-[#0d121c] px-4 py-3 select-none">
      <div className="flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Broker Status */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-500/20 to-blue-600/30 border border-cyan-500/30 text-cyan-400">
            <Terminal className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg tracking-wide text-white flex items-center gap-2 font-mono">
                AURA <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-sans font-semibold">AUTONOMOUS BROKER</span>
              </h1>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 font-mono">
                <Globe className="w-3 h-3 text-cyan-400" />
                {activeBroker === 'INTERACTIVE_BROKERS' ? (
                  <span className="text-amber-400 font-medium">IBKR Client Portal Gateway</span>
                ) : (
                  <span className="text-emerald-400 font-medium">Simulated Paper Engine</span>
                )}
              </span>
              <span>•</span>
              <span className="text-slate-400">Mode: <strong className="text-slate-200">{agentMode}</strong></span>
            </div>
          </div>
        </div>

        {/* Portfolio Live Metrics */}
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="bg-[#131926] border border-broker-border px-3 py-1.5 rounded-md">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Net Equity</div>
            <div className="text-sm font-semibold text-white">
              {currencySymbol}{portfolio.equity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="bg-[#131926] border border-broker-border px-3 py-1.5 rounded-md">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Day P&amp;L</div>
            <div className={`text-sm font-semibold flex items-center gap-1 ${isPnlPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
              {isPnlPositive ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
              {isPnlPositive ? '+' : ''}${dayPnl.toFixed(2)} ({isPnlPositive ? '+' : ''}{dayPnlPct.toFixed(2)}%)
            </div>
          </div>

          <div className="hidden sm:block bg-[#131926] border border-broker-border px-3 py-1.5 rounded-md">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Cash Available</div>
            <div className="text-sm font-semibold text-slate-200">
              {currencySymbol}{portfolio.cash.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>

          <div className="hidden md:block bg-[#131926] border border-broker-border px-3 py-1.5 rounded-md">
            <div className="text-slate-400 text-[10px] uppercase tracking-wider">Active Positions</div>
            <div className="text-sm font-semibold text-cyan-400 flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" />
              {portfolio.positions.length} Open
            </div>
          </div>
        </div>

        {/* Controls & Actions */}
        <div className="flex items-center gap-2">
          {/* Circuit Breaker Warning */}
          {circuitBreakerTripped && (
            <div className="flex items-center gap-1 px-2.5 py-1.5 rounded bg-rose-950/80 border border-rose-700 text-rose-300 text-xs font-semibold animate-pulse">
              <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
              <span>CIRCUIT BREAKER HIT</span>
            </div>
          )}

          {/* Autonomous Play/Pause Button */}
          <button
            onClick={onToggleAutonomous}
            disabled={circuitBreakerTripped}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shadow-sm ${
              circuitBreakerTripped
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                : autonomousEnabled
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white glow-emerald'
                : 'bg-amber-600 hover:bg-amber-500 text-white'
            }`}
          >
            {autonomousEnabled ? (
              <>
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                <Pause className="w-3.5 h-3.5 ml-1" />
                <span>AUTONOMOUS ACTIVE</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                <span>ENGAGE AGENT</span>
              </>
            )}
          </button>

          {/* Backtest Runner Button */}
          <button
            onClick={onOpenBacktest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#192233] hover:bg-[#222e44] border border-broker-border text-slate-200 text-xs font-medium transition-colors"
          >
            <BarChart3 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="hidden sm:inline">Backtest</span>
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={onOpenSettings}
            className="flex items-center justify-center p-2 rounded-md bg-[#192233] hover:bg-[#222e44] border border-broker-border text-slate-300 transition-colors"
            title="Configure Risk & Broker Settings"
          >
            <Sliders className="w-4 h-4" />
          </button>
        </div>
      </div>
    </header>
  );
};
