import { useState, useEffect, useRef } from 'react';

/**
 * Custom hook to manage WebSocket connection for market ticks.
 * Expected JSON structure:
 * {
 *   "timestamp": "HH:MM:SS",
 *   "watchlist": "Name",
 *   "data": { "SYMBOL": { "price": [], "percent_change": [], "volume": [], "volume_strength": [] } },
 *   "daily_summary": { "SYMBOL": { "current_price": 0, "percent_change": 0, "total_volume": 0 } }
 * }
 */
export const useMarketData = (url) => {
    const wsUrl = url || `ws://127.0.0.1:8000/ws`;
    const [marketData, setMarketData] = useState({ data: {}, daily_summary: {}, timestamp: "", watchlist: "" });
    const [status, setStatus] = useState("connecting");
    const ws = useRef(null);

    useEffect(() => {
        const connect = () => {
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log("WebSocket Connected");
                setStatus("online");
            };

            ws.current.onmessage = (event) => {
                try {
                    const payload = JSON.parse(event.data);
                    if (payload.type === 'MARKET_UPDATE' || payload.data) {
                        // The backend might send the raw payload or wrapped in 'type'.
                        // Based on user request, the structure is direct.
                        const data = payload.type === 'MARKET_UPDATE' ? payload.data : payload;
                        setMarketData(data);
                    }
                } catch (err) {
                    console.error("Failed to parse WS message", err);
                }
            };

            ws.current.onclose = () => {
                console.log("WebSocket Disconnected. Reconnecting...");
                setStatus("offline");
                setTimeout(connect, 3000);
            };

            ws.current.onerror = (err) => {
                console.error("WS Error:", err);
                ws.current.close();
            };
        };

        connect();
        return () => ws.current?.close();
    }, [wsUrl]);

    return { marketData, status };
};
