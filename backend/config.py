"""
Configuration for backend watchlists and market settings.
"""

WATCHLISTS = {
    "Custom Portfolio A": ["ITC", "TCS", "RELIANCE", "INFY", "HDFCBANK"],
    "Nifty 50": ["RELIANCE", "TCS", "HDFCBANK", "ICICIBANK", "INFY"],
    "IT Sector": ["TCS", "INFY", "WIPRO", "HCLTECH", "TECHM"]
}

import os
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

# Project Structure Management
BASE_DIR = os.path.dirname(os.path.abspath(__file__)) # Pointing to /backend/
PROJECT_ROOT = os.path.dirname(BASE_DIR) # Pointing to /trading_platform/
LOGS_DIR = os.path.join(PROJECT_ROOT, "logs")

# Ensure global logs directory exists
if not os.path.exists(LOGS_DIR):
    os.makedirs(LOGS_DIR, exist_ok=True)

DEFAULT_WATCHLIST = "Custom Portfolio A"

# Zerodha Credentials (Prioritize .env values)
KITE_API_KEY = os.getenv("KITE_API_KEY", "your_api_key")
KITE_API_SECRET = os.getenv("KITE_API_SECRET", "your_api_secret")
REDIRECT_URL = os.getenv("REDIRECT_URL", "http://127.0.0.1:8000/api/zerodha/callback")

# Fyers Credentials
FYERS_APP_ID = os.getenv("FYERS_APP_ID", "your_fyers_app_id")
FYERS_SECRET_KEY = os.getenv("FYERS_SECRET_KEY", "your_fyers_secret")
FYERS_REDIRECT_URL = os.getenv("FYERS_REDIRECT_URL", "http://127.0.0.1:8000/api/auth/fyers/callback")

# Frontend URL (where users access the dashboard)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://127.0.0.1:3000")

# Market hours (IST)
MARKET_START = "09:15"
MARKET_END = "15:30"
SLOT_SIZE_MINUTES = 25
