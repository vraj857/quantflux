/**
 * useMarketData Hook
 * Description: Manages real-time market data synchronization via WebSocket with an
 *              automatic polling fallback for maximum reliability.
 * Version: 1.2.0
 */
import { useState, useEffect, useRef } from 'react';
import axios from 'axios';

/**
 * Custom hook to manage WebSocket connection for market ticks with a Fail-Safe Polling Fallback.
 */
export const useMarketData = (url) => {
    const wsUrl = url || `ws://127.0.0.1:8000/ws`;
    const [marketData, setMarketData] = useState({ data: {}, daily_summary: {}, timestamp: "", watchlist: "" });
    const [status, setStatus] = useState("connecting");
    const ws = useRef(null);
    const lastMessageTime = useRef(Date.now());

    // ── WebSocket Logic ──
    useEffect(() => {
        const connect = () => {
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log("WebSocket Connected");
                setStatus("online");
            };

            ws.current.onmessage = (event) => {
                lastMessageTime.current = Date.now();
                try {
                    const payload = JSON.parse(event.data);
                    if (payload.type === 'MARKET_UPDATE' || payload.data) {
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

    // ── Initial & Fail-Safe Polling ──
    // Ensures the UI is warm from the start and stays updated even if WS fails
    useEffect(() => {
        const fetchCurrentState = async () => {
            try {
                const response = await axios.get('http://127.0.0.1:8000/api/market/full-state');
                if (response.data && Object.keys(response.data.data || {}).length > 0) {
                    setMarketData(response.data);
                }
            } catch (err) {
                console.warn("Initial state fetch failed:", err);
            }
        };

        // Immediate fetch on mount
        fetchCurrentState();

        // Continue polling ONLY if WebSocket is not 'online' AND no recent messages
        const interval = setInterval(() => {
            const timeSinceLastMessage = Date.now() - lastMessageTime.current;
            if (status !== 'online' && timeSinceLastMessage > 5000) {
                fetchCurrentState();
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [status]);

    return { marketData, status };
};
