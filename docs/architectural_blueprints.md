# QuantFlux: Architectural Blueprints

This document outlines the high-level architecture of the QuantFlux platform, focusing on modularity, data parity, and performance.

## Process Overview

The platform is built on a **Layered Modular Architecture** that separates broker-specific logic from core trading engines.

```mermaid
graph TD
    UI[React Frontend] <--> API[FastAPI Layer]
    API <--> CORE[Aggregation Engine]
    CORE <--> STATE[Global State]
    STATE <--> ADAPTER[IBroker Interface]
    
    subgraph Brokers
        ADAPTER <--> FYERS[Fyers Adapter]
        ADAPTER <--> KITE[Zerodha Adapter]
    end
    
    CORE --> DB[(SQLite - market_slots_v2)]
    FYERS -.-> LOGS[logs/broker/fyers.log]
```

---

## 1. IBroker Interface (Adapter Pattern)
Defined in `app/broker_management/base.py`. This ensures the core engine never speaks "Kite" or "Fyers" specifically. New brokers can be added by implementing this interface without touching the business logic.

```mermaid
classDiagram
    class IBroker {
        <<interface>>
        +authenticate(credentials)
        +get_profile()
        +fetch_history(symbol, start, end)
        +start_ticker(symbols, on_tick)
        +stop_ticker()
    }
    class FyersAdapter {
        +100-Day Chunking
        +REST + WebSocket
    }
    class ZerodhaAdapter {
        +KiteConnect Integration
        +REST + WebSocket
    }
    IBroker <|.. FyersAdapter
    IBroker <|.. ZerodhaAdapter
```

---

## 2. Unified Aggregator (Parity Engine)
Defined in `app/core/aggregator.py`.

The aggregator is a **State Machine** that ensures identical data processing regardless of the source:
- **Live Mode**: Subscribes to 1m candles via WebSockets.
- **Historical Mode**: Processes REST API results for backtesting.
- **Backfill Mode**: Automatically recovers missing data after a disconnection.

## 3. Async Database Layer
The platform utilizes **SQLAlchemy 2.0** with `aiosqlite` to handle high-frequency market data writes.

```mermaid
erDiagram
    BROKER_SESSIONS ||--o{ SLOT_DATA : "persists"
    BROKER_SESSIONS {
        int id PK
        string broker "FYERS / ZERODHA"
        string access_token
        string user_name
        int is_active "1=Active, 0=Logged Out"
        datetime created_at
    }
    SLOT_DATA {
        int id PK
        string symbol "NSE:ITC"
        date date
        string slot_label "09:15, 09:40..."
        float open
        float high
        float low
        float close
        int volume
        float percent_change
        float volume_strength
    }
```

- **Storage**: `market_slots_v2.db` (SQLite)
- **Pattern**: Write-Ahead Logging (WAL) is enabled for simultaneous read/write performance.
- **Persistence Logic**:
    - **Sessions**: Stored on successful OAuth callback to enable auto-resumption.
    - **Slots**: Upserted (`ON CONFLICT`) every 25 minutes or whenever a slot boundary is crossed, ensuring data integrity during "catch-up" or backfills.

```mermaid
stateDiagram-v2
    [*] --> Idle
    Idle --> LiveFeed: Authenticated
    LiveFeed --> Aggregating: Tick Received
    Aggregating --> Persisting: Slot Boundary (e.g., 25m)
    Persisting --> DB: Save to market_slots_v2
    Persisting --> LiveFeed: Reset Slot
    LiveFeed --> Backfill: Reconnection
    Backfill --> LiveFeed: Catch-up Complete
```

---

## 4. Broker-Specific Implementations
Each broker adapter handles specific API constraints to ensure a uniform experience.

### Fyers (100-Day Chunking)
Due to the Fyers API limit of 100 days for 1-minute historical data, the `FyersAdapter` implements an internal **request sequencer**:
1.  **Date Normalization**: Standardizes various input formats (DD/MM/YY, etc.) to ISO.
2.  **Chunking**: Splits large requests (e.g., 1 year) into 99-day safe segments.
3.  **Merge**: Joins the resulting candles into a single contiguous list for the core engine.

---

## 5. Testing & Validation Strategy
To ensure platform stability without requiring live market credentials during every build:

1.  **Broker Mocking**: Uses `unittest.mock` to simulate SDK responses from Fyers and Zerodha.
2.  **Aggregation Parity**: Verified that processed slots from Mock data match 1:1 with expected OHLCV calculations.
3.  **Latency Monitoring**: Internal performance counters track round-trip times for critical calls to ensure trading-readiness.
