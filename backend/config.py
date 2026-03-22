"""
Standardized Enterprise Configuration using Pydantic Settings v2.
Handles environment variables, project paths, and market constants.
"""
import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", 
        env_file_encoding="utf-8", 
        extra="ignore"
    )

    # Project Structure Management
    BASE_DIR: str = os.path.dirname(os.path.abspath(__file__))
    PROJECT_ROOT: str = os.path.dirname(BASE_DIR)
    LOGS_DIR: str = os.path.join(PROJECT_ROOT, "logs")

    # Application Defaults
    DEFAULT_WATCHLIST: str = "Custom Portfolio A"
    FRONTEND_URL: str = "http://127.0.0.1:3000"

    # Broker Credentials (Prioritize .env values)
    KITE_API_KEY: str = Field(default="your_api_key", validation_alias="KITE_API_KEY")
    KITE_API_SECRET: str = Field(default="your_api_secret", validation_alias="KITE_API_SECRET")
    REDIRECT_URL: str = "http://127.0.0.1:8000/api/zerodha/callback"

    FYERS_APP_ID: str = Field(default="your_fyers_app_id", validation_alias="FYERS_APP_ID")
    FYERS_SECRET_KEY: str = Field(default="your_fyers_secret", validation_alias="FYERS_SECRET_KEY")
    FYERS_REDIRECT_URL: str = "http://127.0.0.1:8000/api/auth/fyers/callback"

    # Market Configuration (IST)
    MARKET_START: str = "09:15"
    MARKET_END: str = "15:30"
    SLOT_SIZE_MINUTES: int = 25

# Global Settings Instance
settings = Settings()

# Ensure global logs directory exists
if not os.path.exists(settings.LOGS_DIR):
    os.makedirs(settings.LOGS_DIR, exist_ok=True)

# Maintain backward compatibility for existing imports
KITE_API_KEY = settings.KITE_API_KEY
KITE_API_SECRET = settings.KITE_API_SECRET
REDIRECT_URL = settings.REDIRECT_URL
FYERS_APP_ID = settings.FYERS_APP_ID
FYERS_SECRET_KEY = settings.FYERS_SECRET_KEY
FYERS_REDIRECT_URL = settings.FYERS_REDIRECT_URL
FRONTEND_URL = settings.FRONTEND_URL
MARKET_START = settings.MARKET_START
MARKET_END = settings.MARKET_END
SLOT_SIZE_MINUTES = settings.SLOT_SIZE_MINUTES
LOGS_DIR = settings.LOGS_DIR

