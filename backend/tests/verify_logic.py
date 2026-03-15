import pandas as pd

# Mock data simulating what Zerodha's kite.instruments("NFO") returns
mock_nfo_instruments = [
    {"instrument_token": 123456, "tradingsymbol": "ITC26MARFUT", "name": "ITC", "exchange": "NFO", "segment": "NFO-FUT"},
    {"instrument_token": 789012, "tradingsymbol": "ITC26MAR210CE", "name": "ITC", "exchange": "NFO", "segment": "NFO-OPT"},
    {"instrument_token": 456789, "tradingsymbol": "RELIANCE26MARFUT", "name": "RELIANCE", "exchange": "NFO", "segment": "NFO-FUT"}
]

mock_nse_instruments = [
    {"instrument_token": 408065, "tradingsymbol": "ITC", "name": "ITC", "exchange": "NSE", "segment": "NSE"}
]

def simulate_get_token(symbols):
    # Combine the lists as the code does
    instruments = mock_nse_instruments + mock_nfo_instruments
    df = pd.DataFrame(instruments)
    
    mapping = {}
    for sym in symbols:
        matching = df[df['tradingsymbol'] == sym.upper()]
        if not matching.empty:
            token = int(matching.iloc[0]['instrument_token'])
            exchange = matching.iloc[0]['exchange']
            mapping[token] = sym.upper()
            print(f"SUCCESS: Mapped {sym} -> Token: {token} from {exchange}")
        else:
            print(f"FAILED: Symbol {sym} not found")
    return mapping

# Test with the user's specific request
simulate_get_token(["ITC", "ITC26MARFUT"])
