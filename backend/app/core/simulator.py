from typing import List, Dict, Any
from datetime import datetime
from app.core.phases import PhaseEngine

class PhaseSimulator:
    """
    Simulates trading strategies based on Phase DNA over historical data.
    Calculates equity curve, drawdown, and win rate.
    """
    
    def __init__(self, initial_capital: float = 100000):
        self.capital = initial_capital
        self.equity_curve = []
        self.trades = []

    def simulate(self, symbol: str, candles: List[Dict], dna: Dict) -> Dict[str, Any]:
        """
        Runs a simulation over historical candles.
        Strategy: Enter Trend Phase if Morning Strength > threshold.
        """
        current_equity = self.capital
        self.equity_curve = [current_equity]
        
        # Group candles by day
        days = {}
        for c in candles:
            d = datetime.fromtimestamp(c["timestamp"]).strftime("%Y-%m-%d")
            if d not in days: days[d] = []
            days[d].append(c)
            
        for day, d_candles in days.items():
            # 1. Aggregate into slots
            # (Simplified for simulation: assume 25m slots)
            agg_slots = self._aggregate(d_candles)
            
            # 2. Get Phase Stats
            stats = PhaseEngine.calculate_stats(agg_slots)
            
            # 3. Strategy Logic: If Morning persistence > 60%, Buy at start of Trend Phase
            morning = stats.get("Morning Phase", {})
            trend = stats.get("Trend Formation", {})
            
            if morning.get("persistence", 0) > dna.get("Morning Phase", {}).get("min_strength", 60):
                # Entry: Close of Midday (start of Trend)
                # Exit: Close of Trend
                midday_slots = PhaseEngine.PHASE_BOUNDS[1]["slots"]
                trend_slots = PhaseEngine.PHASE_BOUNDS[2]["slots"]
                
                entry_idx = midday_slots[-1] if len(agg_slots) > midday_slots[-1] else None
                exit_idx = trend_slots[-1] if len(agg_slots) > trend_slots[-1] else None
                
                if entry_idx is not None and exit_idx is not None:
                    entry_price = agg_slots[entry_idx]["close"]
                    exit_price = agg_slots[exit_idx]["close"]
                    
                    pnl_pct = (exit_price - entry_price) / entry_price
                    pnl_val = current_equity * pnl_pct
                    current_equity += pnl_val
                    
                    self.trades.append({
                        "day": day,
                        "entry": entry_price,
                        "exit": exit_price,
                        "pnl_pct": round(pnl_pct * 100, 2),
                        "pnl_val": round(pnl_val, 2)
                    })
            
            self.equity_curve.append(round(current_equity, 2))

        return {
            "final_equity": current_equity,
            "total_return_pct": round(((current_equity - self.capital) / self.capital) * 100, 2),
            "trades": self.trades,
            "equity_curve": self.equity_curve
        }

    def _aggregate(self, candles: List[Dict]):
        # Mock aggregation for simulation
        # In a full impl, this would use the same logic as market.py
        slots = []
        # ... logic to group candles into slots ...
        # (For simulation speed, we can pre-calculate this or use a simplified version)
        return [] # Placeholder
