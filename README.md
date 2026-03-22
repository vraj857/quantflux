# Market Flux: Modular Trading Platform

A high-performance algorithmic trading platform supporting Fyers and Zerodha (Kite) with real-time OHLCV aggregation and live dashboards.

## Project Structure

### Backend (`/backend`)
The backend is built with FastAPI and follows a modular architecture.
- **`app/main.py`**: Entry point of the FastAPI application.
- **`app/broker_management/`**: Contains adapters for various brokers (Fyers, Zerodha).
- **`app/historical_engine/`**: Logic for fetching and processing historical OHLCV data.
- **`app/database/`**: SQLAlchemy engine, models, and session management.
- **`app/constants/`**: Market holidays, session timings, and global constants.
- **`app/core/`**: Core engines like the `Aggregator` and `ResilienceManager`.
- **`app/api/`**: Modular API routers (auth, market, watchlist).
- **`logs/`**: Tiered logging (`broker/` and `app/`).
- **`tests/`**: Unit tests, functional tests, and simulation scripts.

### Frontend (`/frontend`)
A React-based dashboard optimized for speed.
- **`src/App.jsx`**: Main application container.
- **`src/components/`**: UI components (Dashboard, Settings, Charts).
- **`src/hooks/`**: Custom hooks for market data and state.
- **`src/services/`**: Centralized API service layer.

### Documentation (`/docs`)
- Permanent technical documentation and architectural blueprints.

## Key Features
- **Zero-Flash Dashboard**: Boot-time session activation for instant rendering.
- **Resilient WebSockets**: Automatic reconnection and ticker restoration.
- **Historical Chunking**: Seamlessly fetch years of historical data despite broker limitations.
- **Tiered Logging**: Separated system and broker traffic logs for easier debugging.

## Setup
### Recommended (Windows)
Double-click `run_quantflux.bat` from the root directory — it opens both the Backend and Frontend in separate CMD windows.

### Manual
1. **Backend**: `cd backend && python -m uvicorn app.main:app --reload`
2. **Frontend**: `cd frontend && npm run dev`

---
*Access the platform at http://127.0.0.1:3000*
