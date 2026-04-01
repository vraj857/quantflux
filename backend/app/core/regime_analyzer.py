import pandas as pd
import numpy as np

class RegimeAnalyzer:
    """
    Implements a 5-signal Hybrid Scoring System for Market Regime Detection.
    """

    @staticmethod
    def calculate_indicators(df: pd.DataFrame) -> pd.DataFrame:
        """
        Calculates SMA, ROC, Volatility, and ATR.
        Requires df with ['open', 'high', 'low', 'close', 'volume'].
        """
        # Ensure data is sorted
        # df is expected to have a DateTime index or typical OHLC columns
        df['SMA_20'] = df['close'].rolling(window=20).mean()
        df['SMA_50'] = df['close'].rolling(window=50).mean()
        df['SMA_200'] = df['close'].rolling(window=200).mean()
        
        # ROC_50
        df['ROC_50'] = (df['close'] / df['close'].shift(50) - 1) * 100
        
        # Volatility_50 (Rolling std dev of close percent changes)
        df['returns'] = df['close'].pct_change()
        df['Volatility_50'] = df['returns'].rolling(window=50).std() * 100 # converting to % roughly
        
        # ATR_20
        high_low = df['high'] - df['low']
        high_close = np.abs(df['high'] - df['close'].shift())
        low_close = np.abs(df['low'] - df['close'].shift())
        ranges = pd.concat([high_low, high_close, low_close], axis=1)
        true_range = np.max(ranges, axis=1)
        df['ATR_20'] = true_range.rolling(window=20).mean()
        
        return df

    @staticmethod
    def calculate_regime_score(row, prev_10_rows):
        score = 0
        signals = {
            'price_ma': 0,
            'ma_align': 0,
            'momentum': 0,
            'volatility': 0,
            'trend': 0
        }

        # Handle NaNs: skip scoring if essential MAs are missing
        if pd.isna(row['SMA_200']):
            return 0, dict(signals)

        # 1. Price vs Moving Averages (Weight: 30%)
        p_ma = 0
        p_ma += 1 if row['close'] > row['SMA_20'] else -1
        p_ma += 1 if row['close'] > row['SMA_50'] else -1
        p_ma += 1 if row['close'] > row['SMA_200'] else -1
        signals['price_ma'] = p_ma
        score += p_ma

        # 2. Moving Average Alignment (Weight: 20%)
        align = 0
        if row['SMA_20'] > row['SMA_50'] and row['SMA_50'] > row['SMA_200']:
            align = 2
        elif row['SMA_20'] < row['SMA_50'] and row['SMA_50'] < row['SMA_200']:
            align = -2
        signals['ma_align'] = align
        score += align

        # 3. Momentum - ROC_50 (Weight: 30%)
        roc = row['ROC_50']
        roc_score = 0
        if not pd.isna(roc):
            if roc > 15: roc_score = 3
            elif roc > 5: roc_score = 1
            elif roc < -15: roc_score = -3
            elif roc < -5: roc_score = -1
        signals['momentum'] = roc_score
        score += roc_score

        # 4. Volatility (Weight: 20%)
        # Here we assume Volatility_50 is roughly representing daily volatility in %
        vol = row['Volatility_50']
        vol_score = 0
        if not pd.isna(vol):
            if vol < 0.5: vol_score = 2
            elif vol > 1.0: vol_score = -2
        signals['volatility'] = vol_score
        score += vol_score

        # 5. Recent Trend (Weight: 10%)
        trend_score = 0
        if prev_10_rows is not None and len(prev_10_rows) == 10:
            last_high = prev_10_rows['high'].iloc[-1]
            first_high = prev_10_rows['high'].iloc[0]
            last_low = prev_10_rows['low'].iloc[-1]
            first_low = prev_10_rows['low'].iloc[0]
            
            if last_high > first_high and last_low > first_low:
                trend_score = 1
            elif last_high < first_high and last_low < first_low:
                trend_score = -1
        signals['trend'] = trend_score
        score += trend_score

        return score, signals

    @classmethod
    def apply_regime_logic(cls, df: pd.DataFrame):
        df = cls.calculate_indicators(df)
        
        scores = []
        confidences = []
        classifications = []
        signals_list = []

        # We need historical 10-period lookbacks for the trend
        for i in range(len(df)):
            row = df.iloc[i]
            prev_10 = df.iloc[i-10:i] if i >= 10 else None
            
            score, signals = cls.calculate_regime_score(row, prev_10)
            
            # Constraints
            score = max(-11, min(11, score))
            conf = abs(score) / 11.0
            
            # Classification
            cls_text = "Neutral"
            if score >= 6: cls_text = "Strong Bull"
            elif score >= 2: cls_text = "Bull"
            elif score <= -6: cls_text = "Strong Bear"
            elif score <= -2: cls_text = "Bear"
            
            scores.append(score)
            confidences.append(conf)
            classifications.append(cls_text)
            signals_list.append(signals)
            
        df['regime_score'] = scores
        df['regime_confidence'] = confidences
        df['regime_class'] = classifications
        df['signals'] = signals_list
        
        # Part 3: Regime Change Detection
        # 1. Current != Previous
        # 2. Confidence > 0.4
        # 3. Persists for 3 periods
        regime_changes = []
        current_stable_regime = "Neutral"
        
        for i in range(len(df)):
            # Look ahead 3 periods to check persistence, else keep previous stable
            if i + 2 < len(df):
                c0 = df['regime_class'].iloc[i]
                c1 = df['regime_class'].iloc[i+1]
                c2 = df['regime_class'].iloc[i+2]
                conf = df['regime_confidence'].iloc[i]
                
                if c0 == c1 == c2 and c0 != current_stable_regime and conf > 0.4:
                    current_stable_regime = c0
                    regime_changes.append(True)
                else:
                    regime_changes.append(False)
            else:
                # End of dataset
                regime_changes.append(False)
                
        df['is_regime_change'] = regime_changes
        # Forward fill the actual persistent regime state for clean UI visualization
        persistent_regimes = []
        curr = "Neutral"
        for i in range(len(df)):
            if df['is_regime_change'].iloc[i]:
                curr = df['regime_class'].iloc[i]
            persistent_regimes.append(curr)
            
        df['persistent_regime'] = persistent_regimes
        return df

    @classmethod
    def generate_dashboard_payload(cls, df: pd.DataFrame):
        """
        Transforms the calculated DataFrame into JSON-serializable payloads for the React frontend.
        """
        # Downsample to max 500-1000 points to avoid overloading charting libraries
        # User requested: "aggregate data by sampling every 15 intervals"
        
        # We assume df has a 'timestamp' or date field
        has_time = 'timestamp' in df.columns
        
        # Drop nan rows for clean output
        clean_df = df.dropna(subset=['SMA_200']).copy()
        if len(clean_df) > 1000:
            # Sample every 15 if very large, but ensure we don't lose all granularity
            step = max(1, len(clean_df) // 500)
            pl_df = clean_df.iloc[::step].copy()
        else:
            pl_df = clean_df.copy()

        # CHART 1 & 2: Timeseries
        timeseries = []
        for idx, row in pl_df.iterrows():
            ts = row['timestamp'] if has_time else str(idx)
            timeseries.append({
                "time": ts,
                "close": row['close'],
                "sma_20": row['SMA_20'],
                "sma_50": row['SMA_50'],
                "sma_200": row['SMA_200'],
                "score": row['regime_score'],
                "regime": row['persistent_regime'],
                "is_change": bool(row['is_regime_change']),
                "signals": row['signals']
            })
            
        # CHART 4: Distribution
        regime_counts = clean_df['persistent_regime'].value_counts()
        total_periods = len(clean_df)
        distribution = []
        for reg in ["Strong Bull", "Bull", "Neutral", "Bear", "Strong Bear"]:
            count = int(regime_counts.get(reg, 0))
            distribution.append({
                "name": reg,
                "value": count,
                "percentage": round(count / max(1, total_periods) * 100, 1)
            })
            
        # CHART 5: Transition Matrix
        transitions = {r: {c: 0 for c in ["Strong Bull", "Bull", "Neutral", "Bear", "Strong Bear"]} 
                       for r in ["Strong Bull", "Bull", "Neutral", "Bear", "Strong Bear"]}
        
        # find transitions
        stable_regs = clean_df['persistent_regime'].tolist()
        for i in range(1, len(stable_regs)):
            prev = stable_regs[i-1]
            curr = stable_regs[i]
            transitions[prev][curr] += 1
            
        trans_matrix = []
        for r in transitions:
            total = sum(transitions[r].values())
            row_dict = {"regime": r}
            for c in transitions[r]:
                pct = round((transitions[r][c] / total) * 100, 1) if total > 0 else 0
                row_dict[c] = pct
            trans_matrix.append(row_dict)
            
        # SUMMARY STATS
        current_regime = df['persistent_regime'].iloc[-1] if len(df) > 0 else "Neutral"
        current_conf = df['regime_confidence'].iloc[-1] if len(df) > 0 else 0
        total_changes = df['is_regime_change'].sum()
        
        # Absolute latest bar stats (unaffected by dataframe sampling step)
        latest_row = df.iloc[-1] if len(df) > 0 else None
        latest_score = latest_row['regime_score'] if latest_row is not None else 0
        latest_signals = latest_row['signals'] if latest_row is not None else {}
        
        recomm = "100% Buy & Hold - Stay passive"
        if current_regime == "Bull": recomm = "95% Buy & Hold + 5% Hedge"
        elif current_regime == "Neutral": recomm = "80% Buy & Hold + 20% Tactical"
        elif current_regime == "Bear": recomm = "70% Buy & Hold + 30% Mean Reversion"
        elif current_regime == "Strong Bear": recomm = "60% Buy & Hold + 40% Mean Reversion"
            
        return {
            "timeseries": timeseries,
            "distribution": distribution,
            "transitionMatrix": trans_matrix,
            "summary": {
                "currentRegime": current_regime,
                "confidence": round(current_conf, 2),
                "totalChanges": int(total_changes),
                "recommendation": recomm,
                "latestScore": int(latest_score),
                "latestSignals": latest_signals
            }
        }
