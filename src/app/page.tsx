'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Candlestick,
  TradingSignal,
  PortfolioSummary,
  AgentMode,
  RiskManagementConfig,
  BrokerSettings,
  AgentLog,
  BrokerType,
} from '../types';
import {
  WATCHLIST,
  addCustomTicker,
  fetchLiveCandles,
  fetchLivePrice,
  getCurrencySymbol,
  tickersForMarket,
} from '../lib/marketData';
import type { StockMetadata } from '../lib/marketData';
import { computeAllIndicators } from '../lib/indicators';
import { evaluateStrategy } from '../lib/strategyEngine';
import { BrokerManager } from '../lib/brokers/BrokerManager';
import { Header } from '../components/Header';
import { TradingChart } from '../components/TradingChart';
import { AutonomousAgentPanel } from '../components/AutonomousAgentPanel';
import { PositionsTable } from '../components/PositionsTable';
import { OrdersTable } from '../components/OrdersTable';
import { AgentActivityLogs } from '../components/AgentActivityLogs';
import { RiskSettingsModal } from '../components/RiskSettingsModal';
import { BacktestModal } from '../components/BacktestModal';

export default function AutonomousBrokerApp() {
  // Broker Manager instance
  const brokerManager = BrokerManager.getInstance();

  // Active Symbol & Market Data State
  const [selectedSymbol, setSelectedSymbol] = useState<string>('NVDA');
  const [marketData, setMarketData] = useState<Record<string, Candlestick[]>>({});
  const [market, setMarket] = useState<'US' | 'IN'>('US');
  const [dataStatus, setDataStatus] = useState<Record<string, 'loading' | 'ok' | 'error'>>({});
  const [, setTickerVersion] = useState(0); // bumps when persisted custom tickers are merged in
  const logsLoadedRef = useRef(false);

  // Autonomous Agent Configuration State
  const [autonomousEnabled, setAutonomousEnabled] = useState<boolean>(true);
  const [agentMode, setAgentMode] = useState<AgentMode>('MODERATE');
  const [riskConfig, setRiskConfig] = useState<RiskManagementConfig>({
    maxPositionSizePct: 15,
    defaultStopLossPct: 2.0,
    defaultTakeProfitPct: 4.5,
    maxDailyDrawdownPct: 3.0,
    minRiskRewardRatio: 2.0,
  });

  // Broker Settings State
  const [brokerSettings, setBrokerSettings] = useState<BrokerSettings>(brokerManager.getSettings());
  const [activeBroker, setActiveBroker] = useState<BrokerType>(brokerManager.getActiveBrokerType());

  // Portfolio & Order State
  const [portfolio, setPortfolio] = useState<PortfolioSummary>({
    cash: 100000,
    initialCash: 100000,
    equity: 100000,
    realizedPnl: 0,
    unrealizedPnl: 0,
    dayStartEquity: 100000,
    dayDrawdownPct: 0,
    positions: [],
    orders: [],
  });

  // Latest Signal for the selected symbol
  const [currentSignal, setCurrentSignal] = useState<TradingSignal | null>(null);

  // Terminal Logs
  const [logs, setLogs] = useState<AgentLog[]>([]);
  const [isMounted, setIsMounted] = useState<boolean>(false);

  // Circuit Breaker state
  const [circuitBreakerTripped, setCircuitBreakerTripped] = useState<boolean>(false);

  // Modals state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isBacktestOpen, setIsBacktestOpen] = useState(false);

  const addLog = useCallback((log: Omit<AgentLog, 'id' | 'timestamp'>) => {
    setLogs((prev) => [
      ...prev.slice(-199),
      {
        ...log,
        id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
      },
    ]);
  }, []);

  // Fetch live candles for a symbol and swap them in. No synthetic fallback: on failure the chart shows "unavailable"
  const loadLive = useCallback(
    async (sym: string) => {
      setDataStatus((p) => (p[sym] === 'ok' ? p : { ...p, [sym]: 'loading' }));
      const live = await fetchLiveCandles(sym, 80);
      if (live.length === 0) {
        setDataStatus((p) => (p[sym] === 'ok' ? p : { ...p, [sym]: 'error' }));
        return;
      }
      const last = live[live.length - 1];
      brokerManager.getSimulatedBroker().updateLivePrice(sym, last.close);
      setMarketData((prev) => ({ ...prev, [sym]: live }));
      setDataStatus((p) => ({ ...p, [sym]: 'ok' }));
    },
    [brokerManager]
  );

  // Tick counter for periodic live refresh inside the engine loop
  const tickRef = useRef(0);

  // Initialize market data and logs on client mount
  useEffect(() => {
    setIsMounted(true);
    setLogs([
      {
        id: `init_1_${Date.now()}`,
        timestamp: Date.now() - 3000,
        level: 'INFO',
        title: 'Autonomous Broker Engine Initialized',
        message: 'System online. Connected to Simulated Paper Broker. Hybrid AI quantitative engine active.',
      },
      {
        id: `init_2_${Date.now()}`,
        timestamp: Date.now() - 1500,
        level: 'INFO',
        title: 'Risk Guardrails Armed',
        message: 'Circuit breaker: 3% max daily loss. Max allocation: 15% per ticker. Auto-bracket trailing stops active.',
      },
    ]);

    // Restore market preference (US / IND)
    let startMarket: 'US' | 'IN' = 'US';
    try {
      const saved = localStorage.getItem('asb.market');
      if (saved === 'US' || saved === 'IN') startMarket = saved;
    } catch {}
    setMarket(startMarket);

    // Merge persisted custom tickers, then load live candles for every ticker (no synthetic seed)
    fetch('/api/custom-tickers')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((list: StockMetadata[]) => {
        for (const t of Array.isArray(list) ? list : []) {
          if (t?.symbol) addCustomTicker(t.symbol, t.name, t.market);
        }
        setTickerVersion((v) => v + 1);
        const first = tickersForMarket(startMarket)[0];
        if (first) setSelectedSymbol(first);
        Object.keys(WATCHLIST).forEach((sym) => loadLive(sym));
      });

    // Restore persisted trade/agent logs ahead of this session's startup logs
    fetch('/api/trade-logs')
      .then((r) => (r.ok ? r.json() : []))
      .catch(() => [])
      .then((saved: AgentLog[]) => {
        if (Array.isArray(saved) && saved.length > 0) {
          setLogs((prev) => [...saved, ...prev].slice(-200));
        }
        logsLoadedRef.current = true;
      });

    // Initial portfolio fetch
    brokerManager
      .getBroker()
      .getAccountSummary()
      .then((summary) => setPortfolio(summary));
  }, []);

  // Persist logs (last 200) shortly after they change, once saved logs have been loaded
  useEffect(() => {
    if (!logsLoadedRef.current) return;
    const t = setTimeout(() => {
      fetch('/api/trade-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ logs: logs.slice(-200) }),
      }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [logs]);

  // Live state reference to prevent interval churn and hook array size changes
  const stateRef = useRef({
    selectedSymbol,
    marketData,
    autonomousEnabled,
    agentMode,
    riskConfig,
    circuitBreakerTripped,
    activeBroker,
    portfolio,
  });

  useEffect(() => {
    stateRef.current = {
      selectedSymbol,
      marketData,
      autonomousEnabled,
      agentMode,
      riskConfig,
      circuitBreakerTripped,
      activeBroker,
      portfolio,
    };
  });

  // Autonomous Trading Engine Loop (Runs cleanly on fixed interval)
  useEffect(() => {
    const interval = setInterval(async () => {
      const {
        selectedSymbol: sym,
        marketData: data,
        autonomousEnabled: autoActive,
        agentMode: mode,
        riskConfig: risk,
        circuitBreakerTripped: tripped,
        activeBroker: brokerType,
      } = stateRef.current;

      const currentSeries = data[sym];
      if (!currentSeries || currentSeries.length === 0) return;

      tickRef.current += 1;
      // Full history refresh about once a minute; latest live price every tick (2.4s)
      if (tickRef.current % 25 === 0) {
        loadLive(sym);
      }

      const livePrice = await fetchLivePrice(sym);
      const last = currentSeries[currentSeries.length - 1];
      const updated =
        livePrice == null
          ? currentSeries
          : [
              ...currentSeries.slice(0, -1),
              { ...last, close: livePrice, high: Math.max(last.high, livePrice), low: Math.min(last.low, livePrice) },
            ];

      if (livePrice != null) {
        // Update broker price feed and the forming candle with the real quote
        brokerManager.getSimulatedBroker().updateLivePrice(sym, livePrice);
        setMarketData((prev) => {
          const series = prev[sym];
          if (!series || series.length === 0) return prev;
          const l = series[series.length - 1];
          return {
            ...prev,
            [sym]: [
              ...series.slice(0, -1),
              { ...l, close: livePrice, high: Math.max(l.high, livePrice), low: Math.min(l.low, livePrice) },
            ],
          };
        });
      }

      // Refresh Portfolio
      const broker = brokerManager.getBroker(brokerType);
      const summary = await broker.getAccountSummary();
      setPortfolio(summary);

      // Circuit Breaker Check
      if (summary.dayDrawdownPct >= risk.maxDailyDrawdownPct && !tripped) {
        setCircuitBreakerTripped(true);
        setAutonomousEnabled(false);
        addLog({
          level: 'RISK_ALERT',
          title: 'CIRCUIT BREAKER TRIGGERED',
          message: `Daily drawdown (${summary.dayDrawdownPct.toFixed(2)}%) reached or exceeded maximum limit (${risk.maxDailyDrawdownPct}%). All autonomous trading halted for safety.`,
        });
        return;
      }

      // Run Quantitative & AI Strategy Evaluation
      if (updated.length < 35) return;

      const signal = evaluateStrategy({
        symbol: sym,
        candles: updated,
        mode,
        risk,
        portfolio: summary,
      });

      setCurrentSignal(signal);

      // Autonomous Execution
      if (autoActive && !tripped) {
        const existingPosition = summary.positions.find((p) => p.symbol === sym);

        // BUY Trigger
        if (signal.action === 'BUY' && (!existingPosition || existingPosition.quantity === 0)) {
          const maxAllocation = summary.equity * (risk.maxPositionSizePct / 100);
          const sharesToBuy = Math.max(1, Math.floor(maxAllocation / signal.price));
          const totalCost = sharesToBuy * signal.price;

          if (summary.cash >= totalCost) {
            addLog({
              level: 'SIGNAL',
              symbol: sym,
              title: `Confluence Buy Triggered (${signal.confidence}%)`,
              message: `Evaluating ${sym} in ${signal.regime} regime. Identified high confluence entry at ${getCurrencySymbol(sym)}${signal.price.toFixed(2)}.`,
            });

            const orderResult = await broker.placeOrder({
              symbol: sym,
              side: 'BUY',
              type: 'MARKET',
              quantity: sharesToBuy,
              stopLossPrice: signal.suggestedStopLoss,
              takeProfitPrice: signal.suggestedTakeProfit,
              reason: `Autonomous Confluence BUY: ${signal.confidence}% confidence, R/R ${signal.riskRewardRatio}:1`,
            });

            if (orderResult.success && orderResult.order) {
              addLog({
                level: 'TRADE',
                symbol: sym,
                title: `Executed BUY ${sharesToBuy} shares @ ${getCurrencySymbol(sym)}${orderResult.order.filledPrice}`,
                message: `Bracket armed: Stop-loss at ${getCurrencySymbol(sym)}${signal.suggestedStopLoss.toFixed(2)}, Take-profit at ${getCurrencySymbol(sym)}${signal.suggestedTakeProfit.toFixed(2)}. Target R:R ${signal.riskRewardRatio}:1`,
              });
              const updatedSummary = await broker.getAccountSummary();
              setPortfolio(updatedSummary);
            }
          }
        }

        // SELL / EXIT Trigger
        if (signal.action === 'SELL' && existingPosition && existingPosition.quantity > 0) {
          addLog({
            level: 'SIGNAL',
            symbol: sym,
            title: `Confluence Exit Triggered (${signal.confidence}%)`,
            message: `Bearish inflection detected for ${sym}. Liquidating ${existingPosition.quantity} shares to preserve capital.`,
          });

          const orderResult = await broker.placeOrder({
            symbol: sym,
            side: 'SELL',
            type: 'MARKET',
            quantity: existingPosition.quantity,
            reason: `Autonomous Confluence EXIT: ${signal.reasoning.substring(0, 60)}...`,
          });

          if (orderResult.success && orderResult.order) {
            addLog({
              level: 'TRADE',
              symbol: sym,
              title: `Executed SELL ${existingPosition.quantity} shares @ ${getCurrencySymbol(sym)}${orderResult.order.filledPrice}`,
              message: `Position closed. Realized P&L recorded.`,
            });
            const updatedSummary = await broker.getAccountSummary();
            setPortfolio(updatedSummary);
          }
        }
      }
    }, 2400);

    return () => clearInterval(interval);
  }, [addLog, loadLive]);

  // Select a symbol, generating history for any ticker not yet loaded (e.g. custom or new NSE tickers)
  const handleSelectSymbol = useCallback(
    (sym: string) => {
      setSelectedSymbol(sym);
      if (!stateRef.current.marketData[sym]?.length) loadLive(sym);
    },
    [loadLive]
  );

  // Switch US / IND view, persist it, and jump to a ticker from that market
  const handleChangeMarket = useCallback(
    (m: 'US' | 'IN') => {
      setMarket(m);
      try {
        localStorage.setItem('asb.market', m);
      } catch {}
      const list = tickersForMarket(m);
      if (!list.includes(stateRef.current.selectedSymbol) && list[0]) handleSelectSymbol(list[0]);
    },
    [handleSelectSymbol]
  );

  // Persist a newly added custom ticker
  const handleTickerAdded = useCallback((meta: StockMetadata) => {
    fetch('/api/custom-tickers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: meta.symbol, name: meta.name, market: meta.market }),
    }).catch(() => {});
    setTickerVersion((v) => v + 1);
  }, []);

  // Handle Manual "Run Strategy Now"
  const handleExecuteNow = async () => {
    const series = marketData[selectedSymbol];
    if (!series) return;

    const signal = evaluateStrategy({
      symbol: selectedSymbol,
      candles: series,
      mode: agentMode,
      risk: riskConfig,
      portfolio,
    });
    setCurrentSignal(signal);

    const broker = brokerManager.getBroker(activeBroker);
    const existingPosition = portfolio.positions.find((p) => p.symbol === selectedSymbol);

    if (signal.action === 'BUY' && (!existingPosition || existingPosition.quantity === 0)) {
      const maxAllocation = portfolio.equity * (riskConfig.maxPositionSizePct / 100);
      const sharesToBuy = Math.max(1, Math.floor(maxAllocation / signal.price));
      const res = await broker.placeOrder({
        symbol: selectedSymbol,
        side: 'BUY',
        type: 'MARKET',
        quantity: sharesToBuy,
        stopLossPrice: signal.suggestedStopLoss,
        takeProfitPrice: signal.suggestedTakeProfit,
        reason: 'Manual Trigger Execution (BUY)',
      });

      if (res.success && res.order) {
        addLog({
          level: 'TRADE',
          symbol: selectedSymbol,
          title: `Manual Trigger: BUY ${sharesToBuy} shares`,
          message: `Executed @ ${getCurrencySymbol(selectedSymbol)}${res.order.filledPrice}. Stop-loss: ${getCurrencySymbol(selectedSymbol)}${signal.suggestedStopLoss}`,
        });
        const summary = await broker.getAccountSummary();
        setPortfolio(summary);
      }
    } else if (signal.action === 'SELL' && existingPosition && existingPosition.quantity > 0) {
      const res = await broker.placeOrder({
        symbol: selectedSymbol,
        side: 'SELL',
        type: 'MARKET',
        quantity: existingPosition.quantity,
        reason: 'Manual Trigger Execution (SELL)',
      });

      if (res.success) {
        addLog({
          level: 'TRADE',
          symbol: selectedSymbol,
          title: `Manual Trigger: SELL ${existingPosition.quantity} shares`,
          message: `Position closed.`,
        });
        const summary = await broker.getAccountSummary();
        setPortfolio(summary);
      }
    } else {
      addLog({
        level: 'INFO',
        symbol: selectedSymbol,
        title: `Manual Strategy Evaluation: ${signal.action}`,
        message: signal.reasoning,
      });
    }
  };

  // Close single position
  const handleClosePosition = async (sym: string) => {
    const broker = brokerManager.getBroker(activeBroker);
    const res = await broker.closePosition(sym);
    if (res.success && res.order) {
      addLog({
        level: 'TRADE',
        symbol: sym,
        title: `Manual Position Closed: ${sym}`,
        message: `Liquidated @ ${getCurrencySymbol(sym)}${res.order.filledPrice}. Trade settled.`,
      });
      const summary = await broker.getAccountSummary();
      setPortfolio(summary);
    }
  };

  // Emergency Liquidate All Positions
  const handleEmergencyLiquidate = async () => {
    const broker = brokerManager.getBroker(activeBroker);
    const reports = await broker.closeAllPositions();
    addLog({
      level: 'RISK_ALERT',
      title: 'EMERGENCY LIQUIDATION COMPLETED',
      message: `Closed all open positions (${reports.length} positions liquidated to cash).`,
    });
    const summary = await broker.getAccountSummary();
    setPortfolio(summary);
  };

  // Save Settings from Modal
  const handleSaveSettings = (newBroker: BrokerSettings, newRisk: RiskManagementConfig) => {
    brokerManager.updateSettings(newBroker);
    setBrokerSettings(newBroker);
    setActiveBroker(newBroker.activeBroker);
    setRiskConfig(newRisk);

    addLog({
      level: 'INFO',
      title: 'Configuration Updated',
      message: `Broker switched to ${newBroker.activeBroker}. Risk parameters updated.`,
    });
  };

  const currentCandles = marketData[selectedSymbol] || [];
  const latestIndicators = computeAllIndicators(currentCandles);
  const currencySymbol = getCurrencySymbol(selectedSymbol);

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans">
      {/* Top Header & Metrics Bar */}
      <Header
        portfolio={portfolio}
        autonomousEnabled={autonomousEnabled}
        onToggleAutonomous={() => setAutonomousEnabled(!autonomousEnabled)}
        agentMode={agentMode}
        activeBroker={activeBroker}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenBacktest={() => setIsBacktestOpen(true)}
        circuitBreakerTripped={circuitBreakerTripped}
        currencySymbol={market === 'IN' ? '₹' : '$'}
      />

      {/* Main Terminal Grid */}
      <main className="flex-1 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 max-w-[1920px] mx-auto w-full">
        {/* Left Column (8 cols): Chart + Positions & Orders Tabs */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Main Financial Candlestick Chart */}
          <div className="flex-1 min-h-[460px]">
            <TradingChart
              symbol={selectedSymbol}
              onSelectSymbol={handleSelectSymbol}
              candles={currentCandles}
              orders={portfolio.orders}
              latestIndicators={latestIndicators}
              currencySymbol={currencySymbol}
              market={market}
              onChangeMarket={handleChangeMarket}
              onTickerAdded={handleTickerAdded}
              dataStatus={dataStatus[selectedSymbol]}
            />
          </div>

          {/* Bottom Tabs: Positions & Orders */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PositionsTable
              positions={portfolio.positions}
              onClosePosition={handleClosePosition}
            />
            <OrdersTable orders={portfolio.orders} />
          </div>
        </div>

        {/* Right Column (4 cols): Autonomous AI Decision Engine & Activity Terminal */}
        <div className="lg:col-span-4 flex flex-col gap-3">
          {/* Autonomous AI Decision Engine Panel */}
          <AutonomousAgentPanel
            currentSignal={currentSignal}
            agentMode={agentMode}
            onChangeMode={(m) => {
              setAgentMode(m);
              addLog({
                level: 'INFO',
                title: `Agent Mode Changed to ${m}`,
                message: `Confluence thresholds adjusted.`,
              });
            }}
            autonomousEnabled={autonomousEnabled}
            onExecuteNow={handleExecuteNow}
            onEmergencyLiquidate={handleEmergencyLiquidate}
            positionsCount={portfolio.positions.length}
            currencySymbol={currencySymbol}
          />

          {/* Real-time Streaming Activity Terminal */}
          <div className="flex-1 min-h-[260px]">
            <AgentActivityLogs logs={logs} onClearLogs={() => setLogs([])} />
          </div>
        </div>
      </main>

      {/* Modals */}
      <RiskSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        brokerSettings={brokerSettings}
        riskConfig={riskConfig}
        onSave={handleSaveSettings}
      />

      <BacktestModal
        isOpen={isBacktestOpen}
        onClose={() => setIsBacktestOpen(false)}
        riskConfig={riskConfig}
      />
    </div>
  );
}
