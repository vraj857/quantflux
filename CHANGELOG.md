# QuantFlux Changelog

## [2.5.0] - 2026-04-10

### Added
- **Batch CLI Exporter (`backend/scripts/batch_export.py`)**: Added a python CLI tool to bypass frontend browser timeouts during massive historical data exports (e.g., 5-year history for 200+ stocks).
- **Megasheet CSV Structure**: Enhanced export logic to format complex JSON analytics (Microstructure, Blueprints, Probabilities) into a vertically stacked multi-table CSV file.
- **Smart Gap Synchronization Logging**: Increased visibility into local caching; API requests now expose explicitly whether data was served from the local `historical_data.db` (`[CACHE HIT]`) or fetched from the broker (`[GAP SYNC]`).

### Enhanced
- **Watchlist Screener Accuracy**: Integrated the real backend data (`Timeframe_Data`, `Probability_Stats`) to the `WatchlistScreenerTable`. The grid now correctly calculates and displays: Overall phase efficiency, Max Volume Spikes, Max Net Move, and Primary Intraday Shapes.
- **API Fetch Meta**: Modified `/api/market/historical-ohlc` to return `elapsed_ms` and `sync_details` directly to the client, improving system observability.

### Fixed
- **Dashboard JSX Render Crash**: Rebuilt malformed ternary closing tags inside `PhaseAnalyticsDashboard.jsx` allowing the Watchlist Screener to render effectively.
- **Broker Profile Loading Bypass**: Patched `/api/auth/profile` backend endpoint to retrieve cached in-memory session details instantly to prevent unhandled exceptions during FYERS restarts.

### Components Introduced Un-Tracked
- `IntradayBlueprintGrid.jsx`, `MicrostructureChart.jsx`, `ShapeProbabilityChart.jsx`
- `WatchlistScreenerTable.jsx`, `exportUtils.js`
- `EdgeOptimizer.jsx`, `chargesEngine.js`, `simEngine.js`
- `backend/app/core/microstructure.py`, `backend/app/core/historical_store.py`, `backend/app/core/fno_sync.py`
