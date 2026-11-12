'use client';

import React from 'react';
import {
  Brain,
  Shield,
  Zap,
  Crosshair,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  RotateCcw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Percent,
} from 'lucide-react';
import { TradingSignal, AgentMode, ConfluenceFactor } from '../types';

interface AutonomousAgentPanelProps {
  currentSignal: TradingSignal | null;
  agentMode: AgentMode;
  onChangeMode: (mode: AgentMode) => void;
  autonomousEnabled: boolean;
  onExecuteNow: () => void;
  onEmergencyLiquidate: () => void;
  positionsCount: number;
  currencySymbol?: string;
}

export const AutonomousAgentPanel: React.FC<AutonomousAgentPanelProps> = ({
  currentSignal,
  agentMode,
  onChangeMode,
  autonomousEnabled,
  onExecuteNow,
  onEmergencyLiquidate,
  positionsCount,
  currencySymbol = '$',
}) => {
  const getActionColor = (action: string) => {
    switch (action) {
      case 'BUY':
        return 'text-emerald-400 bg-emerald-950/70 border-emerald-700';
      case 'SELL':
        return 'text-rose-400 bg-rose-950/70 border-rose-700';
      default:
        return 'text-amber-300 bg-amber-950/70 border-amber-800';
    }
  };

  const getVerdictIcon = (verdict: ConfluenceFactor['verdict']) => {
    switch (verdict) {
      case 'BULLISH':
        return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'BEARISH':
        return <XCircle className="w-3.5 h-3.5 text-rose-400" />;
      default:
        return <HelpCircle className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  return (
    <div className="bg-broker-card border border-broker-border rounded-lg p-4 flex flex-col gap-4 select-none">
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-broker-border pb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-cyan-950/80 border border-cyan-800/80 text-cyan-400">
            <Brain className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-wide">AUTONOMOUS DECISION ENGINE</h2>
            <div className="text-[11px] text-slate-400">Hybrid AI &amp; Quantitative Confluence</div>
          </div>
        </div>

        {/* Aggressiveness Mode Selector */}
        <div className="flex items-center gap-1 bg-[#0c101a] p-1 rounded-md border border-broker-border text-xs font-mono">
          {(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => onChangeMode(mode)}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-all ${
                agentMode === mode
                  ? mode === 'CONSERVATIVE'
                    ? 'bg-blue-600 text-white'
                    : mode === 'MODERATE'
                    ? 'bg-amber-600 text-white'
                    : 'bg-rose-600 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {mode.substring(0, 4)}
            </button>
          ))}
        </div>
      </div>

      {currentSignal ? (
        <div className="space-y-3.5">
          {/* Signal Action & Confidence Meter */}
          <div className="grid grid-cols-2 gap-3">
            <div className={`p-3 rounded-md border flex flex-col justify-between ${getActionColor(currentSignal.action)}`}>
              <div className="text-[10px] uppercase font-mono tracking-wider font-semibold opacity-80">
                Action Signal
              </div>
              <div className="text-xl font-bold font-mono flex items-center gap-2 mt-1">
                {currentSignal.action === 'BUY' && <TrendingUp className="w-5 h-5 text-emerald-400" />}
                {currentSignal.action === 'SELL' && <TrendingDown className="w-5 h-5 text-rose-400" />}
                {currentSignal.action === 'HOLD' && <Shield className="w-5 h-5 text-amber-400" />}
                {currentSignal.action}
              </div>
              <div className="text-[11px] mt-1 font-mono opacity-90">
                Regime: <span className="font-semibold">{currentSignal.regime.replace('_', ' ')}</span>
              </div>
            </div>

            <div className="p-3 rounded-md border border-broker-border bg-[#0b101d] flex flex-col justify-between font-mono">
              <div className="flex items-center justify-between text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                <span>Confidence</span>
                <span className="text-cyan-400 font-bold">{currentSignal.confidence}%</span>
              </div>
              {/* Progress bar */}
              <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    currentSignal.confidence >= 70
                      ? 'bg-emerald-500'
                      : currentSignal.confidence >= 50
                      ? 'bg-amber-500'
                      : 'bg-slate-500'
                  }`}
                  style={{ width: `${currentSignal.confidence}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 mt-2 flex items-center justify-between">
                <span>R:R Target:</span>
                <span className="text-slate-200 font-semibold">{currentSignal.riskRewardRatio}:1</span>
              </div>
            </div>
          </div>

          {/* AI Step-by-Step Reasoning */}
          <div className="bg-[#0b0f19] border border-broker-border rounded-md p-3">
            <div className="text-[11px] text-cyan-400 font-mono font-semibold flex items-center gap-1.5 mb-1.5">
              <Zap className="w-3.5 h-3.5 text-cyan-400" />
              <span>AI AGENT SYNTHESIS &amp; REASONING</span>
            </div>
            <p className="text-xs text-slate-300 font-mono leading-relaxed bg-[#111726]/60 p-2.5 rounded border border-slate-800/80">
              {currentSignal.reasoning}
            </p>
          </div>

          {/* Bracket Order Guardrails */}
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="bg-[#121929] border border-rose-900/40 p-2 rounded">
              <div className="text-[10px] text-rose-400 font-semibold">STOP-LOSS (1.5x ATR)</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {currencySymbol}{currentSignal.suggestedStopLoss.toFixed(2)}
              </div>
            </div>
            <div className="bg-[#121929] border border-emerald-900/40 p-2 rounded">
              <div className="text-[10px] text-emerald-400 font-semibold">TAKE-PROFIT TARGET</div>
              <div className="text-sm font-bold text-white mt-0.5">
                {currencySymbol}{currentSignal.suggestedTakeProfit.toFixed(2)}
              </div>
            </div>
          </div>

          {/* Confluence Factor Breakdown */}
          <div className="border border-broker-border rounded-md overflow-hidden bg-[#0c101a]">
            <div className="bg-[#131926] px-3 py-1.5 text-[11px] font-mono font-semibold text-slate-300 border-b border-broker-border flex items-center justify-between">
              <span>Confluence Factors</span>
              <span className="text-[10px] text-slate-500">Multifactor Alignment</span>
            </div>
            <div className="divide-y divide-broker-border/60 max-h-[140px] overflow-y-auto">
              {currentSignal.confluenceFactors.map((factor, idx) => (
                <div key={idx} className="p-2 flex items-start gap-2 text-[11px] font-mono hover:bg-[#111724]">
                  <div className="mt-0.5">{getVerdictIcon(factor.verdict)}</div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200">{factor.name}</span>
                      <span
                        className={`text-[9px] px-1 rounded ${
                          factor.verdict === 'BULLISH'
                            ? 'bg-emerald-950 text-emerald-400'
                            : factor.verdict === 'BEARISH'
                            ? 'bg-rose-950 text-rose-400'
                            : 'bg-slate-800 text-slate-400'
                        }`}
                      >
                        {factor.verdict}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px] mt-0.5 leading-snug">{factor.description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="py-8 text-center text-xs text-slate-500 font-mono">
          Awaiting market ticks and indicator warm-up...
        </div>
      )}

      {/* Manual Agent Override Buttons */}
      <div className="pt-2 border-t border-broker-border flex items-center gap-2">
        <button
          onClick={onExecuteNow}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold font-mono transition-colors shadow-sm"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>RUN STRATEGY NOW</span>
        </button>

        <button
          onClick={onEmergencyLiquidate}
          disabled={positionsCount === 0}
          className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded text-xs font-semibold font-mono transition-colors ${
            positionsCount > 0
              ? 'bg-rose-900/60 hover:bg-rose-800 text-rose-200 border border-rose-700'
              : 'bg-slate-900 text-slate-600 border border-slate-800 cursor-not-allowed'
          }`}
          title="Emergency Close All Open Positions Immediately"
        >
          <AlertTriangle className="w-3.5 h-3.5" />
          <span>LIQUIDATE ALL</span>
        </button>
      </div>
    </div>
  );
};
