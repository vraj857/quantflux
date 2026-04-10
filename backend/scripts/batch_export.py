import argparse
import requests
import json
import time
import os
from datetime import datetime

# ==========================================
# QuantFlux Batch Export Utility
# ==========================================

def get_watchlist_symbols(base_url, watchlist_name):
    print(f"[*] Fetching symbols for watchlist: {watchlist_name}")
    resp = requests.get(f"{base_url}/api/watchlist?name={watchlist_name}")
    resp.raise_for_status()
    symbols = resp.json()
    print(f"[+] Found {len(symbols)} symbols in '{watchlist_name}'.")
    return symbols

def main():
    parser = argparse.ArgumentParser(description="QuantFlux CLI Batch Exporter for Phase Analytics")
    parser.add_argument("--watchlist", type=str, default="Default", help="Watchlist name to process")
    parser.add_argument("--start", type=str, required=True, help="Start date (YYYY-MM-DD)")
    parser.add_argument("--end", type=str, required=True, help="End date (YYYY-MM-DD)")
    parser.add_argument("--timeframe", type=int, default=25, help="Timeframe in minutes (default 25)")
    parser.add_argument("--host", type=str, default="http://127.0.0.1:8000", help="Backend API base URL")
    parser.add_argument("--output", type=str, default="", help="Custom output CSV filename")
    
    args = parser.parse_args()
    
    symbols = get_watchlist_symbols(args.host, args.watchlist)
    if not symbols:
        print("[-] No symbols found. Exiting.")
        return

    phase_stats_map = {}
    regime_data_map = {}

    print(f"[*] Beginning deep historical extraction for {len(symbols)} symbols...")
    print(f"[*] Range: {args.start} to {args.end} @ {args.timeframe}m")

    for idx, symbol in enumerate(symbols, 1):
        print(f"[{idx}/{len(symbols)}] Processing {symbol}...", end="", flush=True)
        
        # 1. Fetch OHLC / Phase Stats
        try:
            ohlc_url = f"{args.host}/api/market/historical-ohlc?symbol={symbol}&start_date={args.start}&end_date={args.end}&timeframe={args.timeframe}"
            ohlc_resp = requests.get(ohlc_url)
            ohlc_data = ohlc_resp.json()
            
            if ohlc_resp.status_code == 200 and ohlc_data.get('s') == 'ok':
                meta = ohlc_data.get('fetch_meta', {})
                source = meta.get('source', 'UNKNOWN')
                sync_details = meta.get('sync_details', '')
                elapsed_ms = meta.get('elapsed_ms', 0)
                
                # Feedback on what approach was followed + timing
                if source == "BROKER_API":
                    print(f" [GAP SYNC: {sync_details}] ({elapsed_ms}ms)", end="", flush=True)
                else:
                    print(f" [CACHE HIT] ({elapsed_ms}ms)", end="", flush=True)

                phase_stats = ohlc_data.get('phase_stats', {})
                phase_stats_map[symbol] = phase_stats
            else:
                print(" [SKIPPED - No History Data]")
                continue
                
            # 2. Fetch Regime Data
            regime_url = f"{args.host}/api/market/historical-regime?symbol={symbol}&start_date={args.start}&end_date={args.end}&timeframe={args.timeframe}"
            regime_resp = requests.get(regime_url)
            regime_data = regime_resp.json()
            
            if regime_resp.status_code == 200 and 'microstructure' in regime_data:
                regime_data_map[symbol] = regime_data
                print(" [OK]")
            else:
                print(" [SKIPPED - No Regime Data]")
        except Exception as e:
            print(f" [FAILED: {e}]")
            
        # Slight delay to prevent overloading local event loop if hitting heavy DB caches
        time.sleep(0.05)


    print(f"\n[*] Extraction complete. Building Megasheet for {len(regime_data_map)} valid symbols...")

    # Data transformation logic (Mirrors frontend exportUtils.js)
    summary_rows = []
    microstructure_rows = []
    prob_rows = []
    blueprint_rows = []

    valid_symbols = list(regime_data_map.keys())

    # --- POPULATE SECTIONS ---
    for sym in valid_symbols:
        data = regime_data_map[sym].get('microstructure', {})
        if not data:
            continue
            
        shape_str = data.get('Detected_Shape', 'Undefined')
        tf_data = data.get('Timeframe_Data', [])
        probs = data.get('Probability_Stats', {'Total_Days_Analyzed': 0, 'Shapes': []})
        bp = data.get('Blueprint_Data', {})

        # Calculate max vol and price moves
        max_vol = 0
        peak_vol_phase = '-'
        max_price = 0
        
        for d in tf_data:
            r_vol = d.get('Avg_Rel_Volume_Pct', 0)
            c_net = d.get('Avg_Close_Net_Pct', 0)
            if r_vol > max_vol:
                max_vol = r_vol
                peak_vol_phase = d.get('Phase') or d.get('Time')
            if abs(c_net) > abs(max_price):
                max_price = c_net

        # Aggregate Phase Efficiency
        sym_stats = phase_stats_map.get(sym, {})
        effs = []
        for ph_name, ph_data in sym_stats.items():
            if 'efficiency' in ph_data:
                effs.append(ph_data['efficiency'])
                
        avg_eff = round(sum(effs) / len(effs), 2) if effs else 'N/A'
        
        common_shape = probs.get('Shapes', [])
        common_shape_name = common_shape[0].get('name') if common_shape else 'N/A'

        # 1. Summary Block
        summary_rows.append({
            'Symbol': sym,
            'Overall Efficiency': avg_eff,
            'Detected Intraday Shape': shape_str,
            'Most Common Daily Shape': common_shape_name,
            'Days Analyzed': probs.get('Total_Days_Analyzed', 0),
            'Peak Vol Phase': peak_vol_phase,
            'Max Rel Vol Spike (%)': round(max_vol, 2) if max_vol > 0 else 'N/A',
            'Max Price Move (%)': round(max_price, 2) if max_price != 0 else 'N/A',
            'Available Blueprint Shapes': len(bp)
        })

        # 2. Timeframe Microstructure Block
        for d in tf_data:
            microstructure_rows.append({
                'Symbol': sym,
                'Time': d.get('Time', ''),
                'Phase': d.get('Phase', ''),
                'Avg Rel Volume %': d.get('Avg_Rel_Volume_Pct', 0),
                'Avg Close Net %': d.get('Avg_Close_Net_Pct', 0),
                'Avg VWAP Net %': d.get('Avg_VWAP_Net_Pct', 0)
            })

        # 3. Shape Probabilities Block
        for s in probs.get('Shapes', []):
            prob_rows.append({
                'Symbol': sym,
                'Shape': s.get('name', ''),
                'Count': s.get('count', 0),
                'Probability %': s.get('prob', 0),
                'Total Days Analyzed': probs.get('Total_Days_Analyzed', 0)
            })

        # 4. Intraday Blueprints Block
        for shape_name, timeslots in bp.items():
            for t in timeslots:
                blueprint_rows.append({
                    'Symbol': sym,
                    'Shape': shape_name,
                    'Time': t.get('Time', ''),
                    'Rel Vol %': t.get('Rel_Volume_Pct', 0),
                    'Close Net %': t.get('Close_Net_Pct', 0),
                    'VWAP Net %': t.get('VWAP_Net_Pct', 0)
                })

    # --- WRITING TO CSV ---
    def generate_csv_section(title, rows):
        if not rows:
            return ""
        headers = list(rows[0].keys())
        lines = []
        lines.append(f'"{title}"')
        lines.append(','.join([f'"{h}"' for h in headers]))
        for row in rows:
            line = ','.join([f'"{row.get(h, "")}"' for h in headers])
            lines.append(line)
        lines.append("")
        lines.append("")
        return '\n'.join(lines)


    csv_str = ""
    csv_str += generate_csv_section("--- 1. WATCHLIST DASHBOARD SUMMARY ---", summary_rows)
    csv_str += generate_csv_section("--- 2. TIMEFRAME MICROSTRUCTURE ---", microstructure_rows)
    csv_str += generate_csv_section("--- 3. SHAPE PROBABILITIES ---", prob_rows)
    csv_str += generate_csv_section("--- 4. INTRADAY BLUEPRINTS ---", blueprint_rows)

    if not args.output:
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{args.watchlist}_Analytics_Batch_{ts}.csv"
    else:
        filename = args.output

    with open(filename, "w", encoding="utf-8") as f:
        f.write(csv_str)

    print(f"\n[+] SUCCESS! Batch data exported to: {os.path.abspath(filename)}")

if __name__ == "__main__":
    main()
