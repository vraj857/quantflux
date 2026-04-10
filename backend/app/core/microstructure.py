import pandas as pd
import numpy as np
from typing import Dict, Any

class MicrostructureAnalyzer:
    """
    Analyzes historical slots to determine the Normalized Intraday Market Microstructure Shape.
    """

    @staticmethod
    def calculate_shape(df: pd.DataFrame) -> Dict[str, Any]:
        """
        Takes a DataFrame containing at minimum ['timestamp', 'open', 'high', 'low', 'close', 'volume'].
        Timestamp format expected: 'DD-MM-YYYY HH:MM'.
        Calculates normalized Volatility and Relative Volume, assigns shapes.
        """
        if df.empty or 'timestamp' not in df.columns:
            return {"Detected_Shape": "Undefined", "Timeframe_Data": []}

        # 1. Feature Engineering
        # Split timestamp into Date and Time
        df['Date'] = df['timestamp'].str.slice(0, 10)
        df['Time'] = df['timestamp'].str.slice(11, 16)

        
        # Calculate True Daily VWAP
        df['Typical_Price'] = (df['high'] + df['low'] + df['close']) / 3
        df['Traded_Value'] = df['Typical_Price'] * df['volume']
        df['Cum_Vol_Px'] = df.groupby('Date')['Traded_Value'].cumsum()
        df['Cum_Vol'] = df.groupby('Date')['volume'].cumsum()
        df['VWAP'] = df['Cum_Vol_Px'] / df['Cum_Vol'].replace(0, 1)

        # Baseline 0% Normalization Logic (Anchor to daily open at 09:15)
        # Strictly require 09:15 to be the proxy; missing days are dropped to maintain institutional standard
        daily_open_map = df[df['Time'] == '09:15'][['Date', 'open']].rename(columns={'open': 'Daily_Open'})
        df = df.merge(daily_open_map, on='Date', how='left')
        df = df.dropna(subset=['Daily_Open'])
        
        df['Close_Net_Pct'] = ((df['close'] - df['Daily_Open']) / df['Daily_Open']) * 100
        df['VWAP_Net_Pct'] = ((df['VWAP'] - df['Daily_Open']) / df['Daily_Open']) * 100
        
        # Calculate Total_Daily_Volume and Rel_Volume_Pct
        df['Total_Daily_Volume'] = df.groupby('Date')['volume'].transform('sum')
        # Avoid division by zero
        df['Rel_Volume_Pct'] = (df['volume'] / df['Total_Daily_Volume'].replace(0, 1)) * 100

        # 2. Aggregation Logic
        # Group by Time and calculate means
        grouped = df.groupby('Time').agg({
            'Rel_Volume_Pct': 'mean',
            'Close_Net_Pct': 'mean',
            'VWAP_Net_Pct': 'mean'
        }).reset_index()
        
        # Sort chronologically
        grouped = grouped.sort_values('Time').reset_index(drop=True)

        if grouped.empty:
            return {"Detected_Shape": "Undefined", "Timeframe_Data": []}

        # 3. Shape Classification Logic
        # Phase mappings
        phase_1_times = ['09:15', '09:40', '10:05']
        phase_2_times = ['10:30', '10:55', '11:20', '11:45', '12:10']
        phase_3_times = ['12:35', '13:00', '13:25', '13:50']
        phase_4_times = ['14:15', '14:40', '15:05']

        def get_phase_metrics(times):
            subset = grouped[grouped['Time'].isin(times)]
            if subset.empty:
                return 0.0, 0.0, 0.0
            return (
                subset['Rel_Volume_Pct'].mean(),
                subset['Close_Net_Pct'].mean(),
                subset['VWAP_Net_Pct'].mean()
            )

        p1_vol, p1_close, p1_vwap = get_phase_metrics(phase_1_times)
        p2_vol, p2_close, p2_vwap = get_phase_metrics(phase_2_times)
        p3_vol, p3_close, p3_vwap = get_phase_metrics(phase_3_times)
        p4_vol, p4_close, p4_vwap = get_phase_metrics(phase_4_times)

        # Standard deviation across all times
        vol_std = grouped['Rel_Volume_Pct'].std(ddof=0) if len(grouped) > 1 else 0.0

        detected_shape = "Undefined"

        # Sequential Logic Evaluation
        if vol_std < 1.5:
            detected_shape = "Flatline"
            
        elif p1_vol > (p2_vol * 1.8) and p4_vol < (p2_vol * 1.2):
            detected_shape = "L-Shape"
            
        elif p4_vol > p1_vol and p4_vol > (p3_vol * 1.5):
            detected_shape = "Volume J-Shape"
            
        elif p1_vol > (p2_vol * 1.5) and p4_vol > (p3_vol * 1.5):
            # Check for W-Shape mid-day spike override
            if p3_vol > (p2_vol * 1.2):
                detected_shape = "W-Shape"
            else:
                # --- Advanced Logic: Differentiating the U-Shape Volume Regime ---
                # Check if the heavy closing volume caused a VWAP Breakout
                if (p4_close > p4_vwap) and (p2_close < p2_vwap):
                    detected_shape = "J-Shape Squeeze (Bullish Breakout)"
                elif (p4_close < p4_vwap) and (p2_close > p2_vwap):
                    detected_shape = "Inverted J-Shape (Bearish Dump)"
                else:
                    detected_shape = "U-Shape (Range Bound)"
                    
        else:
            # Fallbacks or mild U-shapes
            if p1_vol > p2_vol and p4_vol > p3_vol:
                detected_shape = "Micro U-Shape"
            else:
                detected_shape = "Random Walk"

        # 4. JSON Payload formatting (Primary Chart)
        timeframe_data = []
        for _, row in grouped.iterrows():
            t = row['Time']
            if t in phase_1_times: phase = "1. Morning Phase"
            elif t in phase_2_times: phase = "2. Midday Chop"
            elif t in phase_3_times: phase = "3. Trend Formation"
            elif t in phase_4_times: phase = "4. Closing Session"
            else: phase = "Unknown Extension"

            # Failsafe NA
            r_vol = float(row['Rel_Volume_Pct']) if not pd.isna(row['Rel_Volume_Pct']) else 0.0
            c_net = float(row['Close_Net_Pct']) if not pd.isna(row['Close_Net_Pct']) else 0.0
            v_net = float(row['VWAP_Net_Pct']) if not pd.isna(row['VWAP_Net_Pct']) else 0.0

            timeframe_data.append({
                "Time": t,
                "Phase": phase,
                "Avg_Rel_Volume_Pct": round(r_vol, 2),
                "Avg_Close_Net_Pct": round(c_net, 4),
                "Avg_VWAP_Net_Pct": round(v_net, 4)
            })

        # --- 5. Secondary Logic: Probabilities & Blueprints ---
        results = []
        df['Assigned_Shape'] = 'Undefined'
        
        for date, group in df.groupby('Date'):
            def get_phase_metrics_day(times):
                subset = group[group['Time'].isin(times)]
                if subset.empty: return 0.0, 0.0, 0.0
                return (subset['Rel_Volume_Pct'].mean(), subset['Close_Net_Pct'].mean(), subset['VWAP_Net_Pct'].mean())
                
            p1_vol_day, p1_close_day, p1_vwap_day = get_phase_metrics_day(phase_1_times)
            p2_vol_day, p2_close_day, p2_vwap_day = get_phase_metrics_day(phase_2_times)
            p3_vol_day, p3_close_day, p3_vwap_day = get_phase_metrics_day(phase_3_times)
            p4_vol_day, p4_close_day, p4_vwap_day = get_phase_metrics_day(phase_4_times)
            
            vol_std_day = group['Rel_Volume_Pct'].std(ddof=0) if len(group) > 1 else 0.0
            day_shape = "Undefined"
            
            if vol_std_day < 1.5:
                day_shape = "Flatline"
            elif p1_vol_day > (p2_vol_day * 1.8) and p4_vol_day < (p2_vol_day * 1.2):
                day_shape = "L-Shape"
            elif p4_vol_day > p1_vol_day and p4_vol_day > (p3_vol_day * 1.5):
                day_shape = "Volume J-Shape"
            elif p1_vol_day > (p2_vol_day * 1.5) and p4_vol_day > (p3_vol_day * 1.5):
                if p3_vol_day > (p2_vol_day * 1.2):
                    day_shape = "W-Shape"
                else:
                    if (p4_close_day > p4_vwap_day) and (p2_close_day < p2_vwap_day):
                        day_shape = "J-Shape Squeeze (Bullish Breakout)"
                    elif (p4_close_day < p4_vwap_day) and (p2_close_day > p2_vwap_day):
                        day_shape = "Inverted J-Shape (Bearish Dump)"
                    else:
                        day_shape = "U-Shape (Range Bound)"
            else:
                if p1_vol_day > p2_vol_day and p4_vol_day > p3_vol_day:
                    day_shape = "Micro U-Shape"
                else:
                    day_shape = "Random Walk"
                    
            results.append({'Date': date, 'Shape': day_shape})
            df.loc[df['Date'] == date, 'Assigned_Shape'] = day_shape

        prob_stats = {"Total_Days_Analyzed": 0, "Shapes": []}
        if results:
            results_df = pd.DataFrame(results)
            shape_counts = results_df['Shape'].value_counts()
            total_days = len(results_df)
            prob_dict_list = [{"name": k, "count": int(v), "prob": float(round((v / total_days) * 100, 2))} for k, v in shape_counts.items()]
            prob_stats = {"Total_Days_Analyzed": total_days, "Shapes": prob_dict_list}

        blueprint_data = {}
        times_to_keep = [
            '09:15', '09:40', '10:05', '10:30', '10:55', 
            '11:20', '11:45', '12:10', '12:35', '13:00', 
            '13:25', '13:50', '14:15', '14:40', '15:05'
        ]
        if 'Assigned_Shape' in df.columns:
            filtered_df = df[df['Time'].isin(times_to_keep)]
            for shape_name, shape_group in filtered_df.groupby('Assigned_Shape'):
                shape_time_group = shape_group.groupby('Time').agg({'Rel_Volume_Pct': 'mean', 'Close_Net_Pct': 'mean', 'VWAP_Net_Pct': 'mean'}).reset_index().sort_values('Time')
                blueprint_data[shape_name] = shape_time_group.to_dict(orient='records')

        return {
            "Detected_Shape": detected_shape,
            "Timeframe_Data": timeframe_data,
            "Probability_Stats": prob_stats,
            "Blueprint_Data": blueprint_data
        }
