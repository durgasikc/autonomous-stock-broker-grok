# AURA Autonomous Stock Broker 🚀📈

A high-performance, autonomous hybrid AI and quantitative stock broking application built with **Next.js 15, TypeScript, and Tailwind CSS**, featuring modular execution adapters for **Interactive Brokers (IBKR Client Portal Web API)** and a simulated **Paper Trading Engine**.

---

## 🏛️ System Architecture

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        AURA BROKER TERMINAL UI                         │
│  Interactive Candlestick Chart  •  AI Decision Feed  •  Active Book    │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   AUTONOMOUS HYBRID STRATEGY ENGINE                    │
│                                                                        │
│  [Quantitative Indicator Confluence]       [Market Regime Classifier]   │
│   • RSI(14) Mean Reversion                  • Bullish / Bearish Trend  │
│   • MACD(12,26,9) Histogram Cross           • Consolidation / Volatile │
│   • Bollinger Bands(20,2) Envelope                                     │
│   • EMA(9, 21) & SMA(50, 200) Alignment                                │
│                                                                        │
│  [AI Reasoning Layer]                      [Dynamic Bracket Generator] │
│   • Confluence Scoring (0-100%)             • Stop-Loss (1.5x ATR)     │
│   • Natural Language Trade Rationale        • Take-Profit Target (R:R) │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     RISK MANAGEMENT GUARDRAILS                         │
│   • Daily Maximum Drawdown Circuit Breaker (Halts trading on breach)   │
│   • Position Sizing Allocation Cap (% of Net Equity)                   │
│   • Dynamic Bracket Order Verification (Min 2.0:1 R/R requirement)     │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                         MODULAR BROKER LAYER                           │
│                       (IBrokerAdapter Interface)                       │
│                                                                        │
│   ┌─────────────────────────────┐       ┌───────────────────────────┐  │
│   │    SIMULATED PAPER BROKER   │       │   INTERACTIVE BROKERS     │  │
│   │ • Real-time Slippage (0.05%)│       │ • Client Portal Gateway   │  │
│   │ • Commission ($0.005/share) │       │ • /v1/api/iserver routes  │  │
│   │ • Automated Bracket Fills   │       │ • Heartbeat Keep-Alive    │  │
│   └─────────────────────────────┘       └───────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────┘
```

---

## ✨ Core Features

### 1. Hybrid Quantitative & AI Decision Engine
- **Multifactor Technical Confluence:** Analyzes price action across 4 distinct mathematical models:
  - **Trend:** Exponential Moving Averages (EMA 9, EMA 21) & 50/200-period Simple Moving Averages.
  - **Momentum:** Wilder's 14-period RSI (oversold buying opportunities and overbought exhaustion).
  - **Divergence:** MACD Line vs Signal Line crossover with histogram slope analysis.
  - **Volatility:** Bollinger Bands (20-period SMA $\pm$ 2 standard deviations) with bandwidth squeeze detection.
  - **Volatility Pegging (ATR):** Dynamically spaces stop-losses and profit targets according to Average True Range ($1.5 \times \text{ATR}$).
- **Autonomous Operating Modes:**
  - `CONSERVATIVE`: Requires $\ge 70\%$ confluence, minimum 3 aligned factors, and strict 2.2:1 Risk-Reward ratio.
  - `MODERATE`: Standard balanced algorithmic mode ($\ge 55\%$ confluence).
  - `AGGRESSIVE`: Momentum scalping mode ($\ge 45\%$ confluence threshold).

### 2. Autonomous Trading Loop & Execution
- Evaluates real-time market data ticks every 2.4 seconds.
- Automatically calculates position sizing based on available cash and risk parameters.
- Dispatches bracket orders with automated protective stop-losses and profit targets.
- Logs full step-by-step reasoning in the **Agent Activity Terminal**.

### 3. Modular Broker Architecture
- **Simulated Paper Trading Engine:**
  - $100,000 initial virtual cash.
  - Bid-Ask spread and slippage modeling ($0.05\%$).
  - Per-share commission calculation ($0.005 / share with $1.00 minimum).
  - Mark-to-market unrealized P&L and realized P&L accounting.
- **Interactive Brokers (IBKR Client Portal Web API):**
  - Production adapter for IBKR CP Gateway (`https://localhost:5000/v1/api`).
  - Session heartbeat tickler to maintain connection.
  - Endpoints mapped for accounts, positions, market snapshots, and order placement (`/iserver/account/{id}/orders`).

### 4. Interactive Financial Terminal UI
- **Trading Chart:** Interactive candlestick chart with SVG renderers for Japanese Candlesticks, volume histogram, Bollinger Band shaded envelopes, and EMA/SMA lines.
- **Visual Trade Markers:** Directly plots historical BUY and SELL executions on the price chart.
- **Positions & Orders:** Real-time tables for tracking open positions, unrealized returns, stop-losses, and order history.
- **Emergency Overrides:** One-click "Liquidate All" panic button and "Run Strategy Now" manual trigger.

### 5. Historical Backtesting Simulator
- Built-in simulation engine allows testing the hybrid strategy against historical hourly data (30, 60, 90, 180 days).
- Computes **Total Return %**, **Win Rate %**, **Profit Factor**, **Max Drawdown %**, and **Sharpe Ratio**.
- Displays interactive SVG equity curve and trade-by-trade audit logs.

---

## 🚀 Getting Started

### 1. Prerequisites
- **Node.js** v20+ or v24+
- **npm** v10+

### 2. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Production Build
```bash
npm run build
npm start
```

---

## 🔌 Connecting Interactive Brokers (IBKR)

To use your Interactive Brokers account (Paper or Live):
1. Download and start the **IBKR Client Portal Gateway**:
   ```bash
   # Extract and run the gateway from IBKR
   bin/run.sh root/conf.yaml
   ```
2. Log in through your browser at `https://localhost:5000` to establish the authenticated session.
3. In the AURA Broker UI, click the **Settings (Sliders)** icon:
   - Select **Interactive Brokers (IBKR)** as the active broker.
   - Enter your IBKR Account ID (e.g., `DU123456` for paper or `U123456` for live).
   - Base URL defaults to `https://localhost:5000/v1/api`.
   - Click **Save Configuration**.

---

## 🛡️ Risk Management Guidelines

- **Circuit Breaker:** If day drawdown reaches the specified limit (e.g. 3.0%), the system immediately cuts autonomous execution.
- **Position Allocation:** Defaults to a maximum of 15% equity per stock to ensure portfolio diversification.
- Always test strategies thoroughly using the **Backtest Simulator** and **Paper Trading Engine** before connecting to live capital.

## Live market data (WebSocket)

`npm run dev` starts two processes via `concurrently`:

- **next** – the Next.js app on http://localhost:3001 (`npm run dev:next` to run it alone)
- **ws** – the market-data WebSocket server on ws://localhost:3002 (`npm run ws` to run it alone; port via `WS_PORT`)

The browser loads hourly history once from `/api/market-data` (refreshed about once a minute), then
subscribes over the WebSocket to the selected symbol (`{"action":"subscribe","symbol":"NVDA"}`, add
`"market":"IN"` for NSE; the server appends `.NS`). The server keeps one shared upstream subscription
per symbol to Yahoo Finance's streamer (true push), sends a chart-endpoint snapshot on subscribe, and falls
back to polling the chart endpoint (with backoff on errors / HTTP 429) when the streamer is quiet or down.
Only changed prices are pushed. The client reconnects automatically with exponential backoff.
Override the client URL with `NEXT_PUBLIC_WS_URL`.
