
const BASE_URL = 'http://127.0.0.1:8000';

const apiRequest = async (endpoint, options = {}) => {
    const { method = 'GET', body, headers = {} } = options;
    const config = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };
    if (body) config.body = JSON.stringify(body);

    const response = await fetch(`${BASE_URL}${endpoint}`, config);
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'API Request failed');
    }
    return response.json();
};

export const api = {
    // Auth
    getFyersLoginUrl: () => apiRequest('/api/auth/fyers/login'),
    getKiteLoginUrl: () => apiRequest('/api/auth/kite/login'),
    checkSessionStatus: () => apiRequest('/api/auth/status'),
    getProfile: () => apiRequest('/api/auth/profile'),
    logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),

    // Market
    getMarketStatus: () => apiRequest('/api/market/status'),
    getTimeframe: () => apiRequest('/api/market/timeframe'),
    setTimeframe: (minutes) => apiRequest('/api/market/set-timeframe', { method: 'POST', body: { minutes } }),
    getHistoricalOHLC: (symbol, start, end, timeframe) => 
        apiRequest(`/api/market/historical-ohlc?symbol=${symbol}&start_date=${start}&end_date=${end}&timeframe=${timeframe}`),
    setFeedMode: (mode, date, symbol) => 
        apiRequest('/api/market/set-feed-mode', { method: 'POST', body: { mode, date, symbol } }),
    getSystemLogs: () => apiRequest('/api/market/system-logs'),

    // Watchlist
    getWatchlist: (name) => apiRequest(`/api/watchlist?name=${name}`),
    getWatchlistNames: () => apiRequest('/api/watchlist/names'),
    addToWatchlist: (name, symbol) => apiRequest('/api/watchlist/add', { method: 'POST', body: { name, symbol } }),
    removeFromWatchlist: (name, symbol) => apiRequest('/api/watchlist/remove', { method: 'POST', body: { name, symbol } }),
    syncWatchlist: (symbols) => apiRequest('/api/market/update-watchlist', { method: 'POST', body: { symbols } }),
};
