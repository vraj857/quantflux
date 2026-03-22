from datetime import datetime, timedelta
from typing import List, Dict, Any

class PhaseEngine:
    """
    Shared logic for calculating market phase statistics.
    Used by both Historical Backtesting and Live Tick Aggregation.
    """
    
    # Phase boundaries in absolute hour/minute coordinates
    PHASE_BOUNDS = [
        {"name": "Morning Phase",    "label": "Morning (9:15–10:30)",      "start": (9, 15), "end": (10, 30)},
        {"name": "Midday Chop",      "label": "Midday Chop (10:30–12:35)", "start": (10, 30), "end": (12, 35)},
        {"name": "Trend Formation",  "label": "Trend Formation (12:35–14:15)", "start": (12, 35), "end": (14, 15)},
        {"name": "Closing Session",  "label": "Closing Session (14:15–15:30)","start": (14, 15), "end": (15, 30)},
    ]

    @staticmethod
    def calculate_stats(aggregated_slots: List[Dict]) -> Dict[str, Any]:
        """
        Calculates statistics for each phase as an expert Quantitative Analyst.
        aggregated_slots: List of dicts with keys: open, high, low, close, volume, epoch
        """
        if not aggregated_slots:
            return {}

        # Group slots by day string for 'average per day' calculations
        days_map = {}
        for s in aggregated_slots:
            day_key = datetime.fromtimestamp(s["epoch"]).strftime("%Y-%m-%d")
            if day_key not in days_map: days_map[day_key] = []
            days_map[day_key].append(s)

        def safe_avg(lst):
            return round(sum(lst) / len(lst), 2) if lst else 0.0

        phase_stats = {}
        
        # We'll calculate totals across all days for volume share, 
        # but efficiency is averaged per day.
        all_vols = [s["volume"] for s in aggregated_slots]
        total_vol = sum(all_vols) or 1

        for phase in PhaseEngine.PHASE_BOUNDS:
            # 1. Collect all slots for this phase across all days
            all_phase_slots = []
            day_efficiencies = []
            
            for day_key, day_slots in days_map.items():
                p_day_slots = []
                start_mins = phase["start"][0] * 60 + phase["start"][1]
                end_mins = phase["end"][0] * 60 + phase["end"][1]
                
                for s in day_slots:
                    dt = datetime.fromtimestamp(s["epoch"])
                    slot_mins = dt.hour * 60 + dt.minute
                    
                    if phase["name"] == "Closing Session":
                        if start_mins <= slot_mins <= end_mins:
                            p_day_slots.append(s)
                    else:
                        if start_mins <= slot_mins < end_mins:
                            p_day_slots.append(s)
                
                if not p_day_slots: continue
                
                all_phase_slots.extend(p_day_slots)
                
                # Calculate Trend Efficiency for THIS day/phase
                # (Absolute Directional Move % / Sum of Absolute Interval Moves %)
                first_o = p_day_slots[0]["open"]
                last_c = p_day_slots[-1]["close"]
                directional_move = abs(((last_c - first_o) / first_o) * 100) if first_o > 0 else 0.0
                
                sum_interval_moves = 0
                for s in p_day_slots:
                    sum_interval_moves += abs(((s["close"] - s["open"]) / s["open"]) * 100) if s["open"] > 0 else 0
                
                efficiency = (directional_move / sum_interval_moves) if sum_interval_moves > 0 else 0.0
                day_efficiencies.append(efficiency)

            if not all_phase_slots: continue

            # Metrics for the Markdown Table
            p_pcs_abs = [abs(((s["close"] - s["open"]) / s["open"]) * 100) if s["open"] > 0 else 0 for s in all_phase_slots]
            p_vols = [s["volume"] for s in all_phase_slots]
            p_prices = [s["close"] for s in all_phase_slots]
            p_yields = [] # used for net move
            
            # For the original yield/pc metrics (legacy/extra)
            p_pcs = [((s["close"] - s["open"]) / s["open"]) * 100 if s["open"] > 0 else 0 for s in all_phase_slots]
            
            # Volatility = avg slot high-low range as % of open
            p_hl_pct = [((s["high"] - s["low"]) / s["open"]) * 100 if s["open"] > 0 else 0 for s in all_phase_slots]

            phase_stats[phase["name"]] = {
                "label":        phase["label"],
                "avg_pc_abs":   safe_avg(p_pcs_abs), # USER: Avg % Move
                "avg_volume":   safe_avg(p_vols),   # USER: Average Volume
                "efficiency":   round(sum(day_efficiencies) / len(day_efficiencies), 2) if day_efficiencies else 0.0, # USER: Trend Efficiency
                "vol_share":    round((sum(p_vols) / total_vol) * 100, 1),
                "volatility":   safe_avg(p_hl_pct),
                "persistence":  round((sum(1 for x in p_pcs if x > 0) / len(p_pcs)) * 100, 1) if p_pcs else 0.0,
                "slots":        len(all_phase_slots),
                "mean_price":   safe_avg(p_prices),
                "phase_yield":  safe_avg(p_pcs) * (len(all_phase_slots) / max(1, len(days_map))) / 2 # Approx yield
            }
            
        return phase_stats

class PhaseSentinel:
    """
    Monitors live phase stats against thresholds to generate signals.
    'DNA' refers to historical averages/thresholds for a symbol.
    """
    
    @staticmethod
    def evaluate(symbol: str, phase_name: str, stats: Dict, dna: Dict) -> List[Dict]:
        """
        Evaluates a single phase's stats against DNA benchmarks.
        Returns a list of 'alerts' or 'signals'.
        """
        alerts = []
        
        strength = stats.get("persistence", 0)
        volatility = stats.get("volatility", 0)
        vol_share = stats.get("vol_share", 0)
        
        # 1. SIGNAL: High Conviction Trend
        target_strength = dna.get("min_strength", 65)
        if strength >= target_strength and vol_share > dna.get("min_vol", 15):
            alerts.append({
                "type": "SIGNAL",
                "symbol": symbol,
                "msg": f"🔥 {phase_name} Conviction: Strength {strength}% with high volume.",
                "severity": "high"
            })
            
        # 2. RISK: Excessive Volatility
        max_volatility = dna.get("max_volatility", 2.0)
        if volatility > max_volatility:
            alerts.append({
                "type": "RISK",
                "symbol": symbol,
                "msg": f"⚠️ {phase_name} Risk: Extreme Volatility ({volatility}%) detected.",
                "severity": "critical"
            })
            
        # 3. RISK: Low Participation (Chop)
        if vol_share < 5 and phase_name != "Closing Session":
            alerts.append({
                "type": "NOTE",
                "symbol": symbol,
                "msg": f"☁️ {phase_name} Chop: Very low volume share ({vol_share}%).",
                "severity": "low"
            })
            
        return alerts
