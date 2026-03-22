# QuantFlux — Strategy Builder & Simulation Engine Blueprint

## Background

This document defines the complete architecture for a **Regime-Switching Contextual Strategy Builder** and a **Historical Simulation Engine** for QuantFlux. The existing codebase provides:
- `HistoryCache` + `/api/market/historical-ohlc` — the data layer backbone
- `TradeLog` model — extended for simulated trades
- `PhaseDNA` model — extended for strategy configs
- `PhaseSimulatorView` — upgraded to strategy-aware results dashboard

---

## Module 1 — Strategy Builder UI (Frontend)

### Component Hierarchy

```
StrategyBuilderView
├── StrategyHeader          (name, save/delete/run controls)
├── InstrumentPanel         (symbol + execution timeframe)
├── RegimeFilterBlock       (Higher-TF EMA, Daily bias)
├── TimeOfDayFilterBlock    (entry window start/end)
├── VolumeProfileBlock      (POC logic)
├── TriggerConditionBlock   (candle rules, dynamic rows)
├── RiskManagementBlock     (capital, sizing, exits, kill-switch)
└── StrategyResultsDashboard
    ├── EquityCurveChart   (Plotly line + drawdown fill)
    ├── MetricsKPIGrid     (PnL, WinRate, MDD, Sharpe, etc.)
    └── TradeLogTable      (paginated, sortable)
```

### State Structure (`strategyState`)

```json
{
  "id": null,
  "name": "NIFTY Regime Breakout",
  "instrument": {
    "symbol": "NSE:NIFTY50-INDEX",
    "execution_timeframe": 25
  },
  "regime_filter": {
    "enabled": true,
    "htf": "daily",
    "condition": "close > ema",
    "ema_period": 20
  },
  "time_filter": {
    "enabled": true,
    "entry_start": "14:15",
    "entry_end": "15:15"
  },
  "volume_profile": {
    "enabled": true,
    "rule": "price_above_poc"
  },
  "trigger_conditions": [
    { "field": "close", "operator": ">", "ref": "prev_high" },
    { "field": "volume", "operator": ">", "ref": "prev_volume", "multiplier": 1.5 }
  ],
  "risk": {
    "starting_capital": 500000,
    "sizing_mode": "atr_volatility",
    "atr_period": 14,
    "risk_per_trade_pct": 1.0,
    "fixed_quantity": null,
    "fixed_capital": null,
    "stop_loss_type": "trailing",
    "trailing_ref": "prev_candle_low",
    "take_profit_pts": null,
    "static_sl_pct": null,
    "max_daily_drawdown_pct": 2.0
  }
}
```

### API Contracts

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `GET` | `/api/strategy/` | — | List all saved strategies |
| `POST` | `/api/strategy/` | `strategyState` JSON | Save new strategy |
| `PUT` | `/api/strategy/{id}` | `strategyState` JSON | Update strategy |
| `DELETE` | `/api/strategy/{id}` | — | Delete strategy |
| `POST` | `/api/strategy/{id}/run` | `{ start, end }` | Kick off simulation |
| `GET` | `/api/strategy/run/{run_id}` | — | Poll result status |

---

## Module 2 — Risk Management Data Structures

### Position Sizing Modes (Python Enum)

```python
class SizingMode(str, Enum):
    FIXED_CAPITAL = "fixed_capital"    # e.g. ₹50,000 per trade
    FIXED_QUANTITY = "fixed_quantity"  # e.g. 50 units always
    ATR_VOLATILITY = "atr_volatility"  # qty = (capital * risk%) / (ATR * atr_mult)
```

### Stop-Loss Modes

```python
class StopLossType(str, Enum):
    STATIC_PCT = "static_pct"          # e.g. entry_price * (1 - 0.01)
    STATIC_POINTS = "static_points"    # e.g. entry_price - 50
    TRAILING_CANDLE = "trailing_candle" # trail to low/high of prev candle
    TRAILING_ATR = "trailing_atr"      # trail = close - (N * ATR)
```

---

## Module 3 — Historical Data Feed Pipeline

### Multi-Timeframe Fetch Strategy

```
StrategyRunner.prepare_data(symbol, start, end)
│
1. Fetch Daily candles → 1x API call (cached)
   └─ Compute:: EMA(20), ATR(14)
2. Fetch 1-Min candles → chunked 60-day API calls (cached)
   └─ Resample to execution_tf (e.g. 25min)
   └─ Compute:: OHLCV, POC, Volume Strength
3. Join: align daily context (EMA/ATR) to each intraday candle
```

---

## Module 4 — Strategy Simulation Engine

### Class Architecture

```python
class StrategyEngine:
    """Top-level orchestrator."""
    def __init__(self, config: StrategyConfig, data: MultiTFData): ...
    async def run(self) -> SimulationResult: ...

class ConditionEvaluator:
    """Evaluates strategy rules against current bar state."""
    def check_entry(self, i: int) -> bool: ...

class PositionSizer:
    def calculate_qty(self, price: float, atr: float, capital: float) -> int: ...

class OrderManager:
    """Manages virtual positions and exit triggers."""
    def open_long(self, ts, price, qty, sl, tp): ...
    def check_exits(self, i, bar): ...

class MetricsEngine:
    def compute(self, trades, equity_curve) -> dict: ...
```

---

## Module 5 — Database Schema

```python
class Strategy(Base):
    __tablename__ = "strategies"
    id          = Column(Integer, primary_key=True)
    name        = Column(String, unique=True, index=True)
    config_json = Column(JSON)      # Full strategyState dict
    created_at  = Column(DateTime, default=datetime.utcnow)

class SimulationRun(Base):
    __tablename__ = "simulation_runs"
    id           = Column(Integer, primary_key=True)
    strategy_id  = Column(Integer, ForeignKey("strategies.id"))
    symbol       = Column(String)
    start_date   = Column(Date)
    end_date     = Column(Date)
    status       = Column(String)
    
    # Summary metrics
    net_pnl         = Column(Float)
    win_rate        = Column(Float)
    max_drawdown    = Column(Float)
    
    # Full result payload
    equity_curve_json = Column(JSON)
    trades_json       = Column(JSON)
    metrics_json      = Column(JSON)
```

---

## Implementation Phases

| Phase | Scope |
|-------|-------|
| **Phase 1** | DB models (`Strategy`, `SimulationRun`), CRUD API, `StrategyBuilderView` form UI |
| **Phase 2** | `StrategyEngine` + `ConditionEvaluator`, basic exits |
| **Phase 3** | `MetricsEngine`, equity curve, `TradeLogTable` |
| **Phase 4** | Advanced sizing & `DailyKillSwitch` |
| **Phase 5** | Multi-timeframe join & POC calculation |
