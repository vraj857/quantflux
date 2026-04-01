/**
 * QuantFlux Enterprise Web Application
 * Version: 2.5.0
 * Author: Senior Architect
 * Description: Main application shell orchestrating global state, view routing, 
 *              and real-time broker connectivity.
 */
import React, { useState, useEffect } from 'react';
import Sidebar from './components/layout/Sidebar';
import LiveFeedGrid from './components/features/live-feed/LiveFeedGrid';
import BacktestView from './components/features/backtest/BacktestView';
import SettingsView from './components/features/settings/SettingsView';
import PhaseSimulatorView from './components/features/simulator/PhaseSimulatorView';
import OrderConsole from './components/features/analytics/OrderConsole';
import BrokerLoginGate from './components/layout/BrokerLoginGate';
import { useMarketData } from './hooks/useMarketData';
import { Monitor, History, LayoutDashboard, Zap, ShieldCheck, Settings as SettingsIcon, Play, Target, Maximize2, Minimize2 } from 'lucide-react';

import { clsx } from 'clsx';
import { api } from './api';

const App = () => {
    // Session state — null means "not authenticated"
    const [session, setSession] = useState(() => {
        // 1. Check URL for immediate success (Redirect phase)
        // Doing this here ensures the DASHBOARD renders on the very first frame.
        const urlParams = new URLSearchParams(window.location.search);
        const success = urlParams.get('auth_success');
        if (success) {
            const provisional = { broker: success.toUpperCase(), authenticatedAt: new Date().toISOString() };
            sessionStorage.setItem('BROKER_SESSION', JSON.stringify(provisional));
            return provisional;
        }

        // 2. Fallback to existing storage
        const stored = sessionStorage.getItem('BROKER_SESSION');
        return stored ? JSON.parse(stored) : null;
    });
    const [authError, setAuthError] = useState(null);

    const [activeView, setActiveView] = useState('live');
    const [theme, setTheme] = useState('dark');
    const [currentTime, setCurrentTime] = useState(new Date());
    const [logs, setLogs] = useState([]);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [notification, setNotification] = useState(null);
    const [selectedTimeframe, setSelectedTimeframe] = useState(() => {
        const stored = localStorage.getItem('DASHBOARD_TIMEFRAME');
        return stored ? parseInt(stored) : 25;
    });
    const [watchlistCollections, setWatchlistCollections] = useState(() => {
        const stored = localStorage.getItem('DASHBOARD_WATCHLIST');
        return stored ? Array.from(new Set(['Default', stored])) : ['Default'];
    });
    const [activeWatchlist, setActiveWatchlist] = useState(() => {
        const stored = localStorage.getItem('DASHBOARD_WATCHLIST');
        return stored || 'Default';
    });
    const [brokerProfile, setBrokerProfile] = useState(null);
    const [snapshot, setSnapshot] = useState(null);
    const [isLiveFeedFullscreen, setIsLiveFeedFullscreen] = useState(false);
    const [subscriptions, setSubscriptions] = useState(null);
    const { marketData, status } = useMarketData();

    // ── On mount: check if backend has an active session ──
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const successParams = urlParams.get('auth_success');
        const errorParams = urlParams.get('auth_error');
        const isDashboardPath = window.location.pathname.includes('/dashboard');

        // Note: 'session' is already set at boot-time if successParams exists.
        // We only handle side-effects (Notifications and URL cleanup) here.
        if (successParams) {
            setNotification({ message: `${successParams.toUpperCase()} Login Successful! Connecting...`, type: 'success' });
            setTimeout(() => setNotification(null), 6000);
            window.history.replaceState({}, document.title, window.location.origin + '/');
        } else if (errorParams) {
            setAuthError(errorParams);
            window.history.replaceState({}, document.title, window.location.origin + '/');
        } else if (isDashboardPath) {
            // Safety: if we land on /dashboard due to cache or external settings, 
            // just move everything to the root.
            window.history.replaceState({}, document.title, window.location.origin + '/');
        }

        const checkSession = async () => {
            try {
                const data = await api.checkSessionStatus();
                if (data.authenticated && data.broker) {
                    const newSession = { broker: data.broker, authenticatedAt: new Date().toISOString() };
                    sessionStorage.setItem('BROKER_SESSION', JSON.stringify(newSession));
                    setSession(newSession);
                } else {
                    console.warn('Session check reports unauthenticated. Forcing gate.');
                    handleLogout(); // Use shared logout logic for consistency
                }
            } catch (e) {
                console.error('Core session check failed:', e);
                // Hard reset on failure to ensure user isn't stuck on a dead dashboard
                handleLogout();
            }
        };

        const fetchConfig = async () => {
            try {
                const stored = localStorage.getItem('DASHBOARD_TIMEFRAME');
                if (stored) {
                    const mins = parseInt(stored, 10);
                    setSelectedTimeframe(mins);
                    await api.setTimeframe(mins); // Enforce frontend preference on backend
                } else {
                    const data = await api.getTimeframe();
                    if (data.interval_minutes) setSelectedTimeframe(data.interval_minutes);
                }
            } catch (e) {}
        };

        const fetchWatchlistNames = async () => {
            try {
                const data = await api.getWatchlistNames();
                if (data && data.length > 0) setWatchlistCollections(data);
            } catch (e) {}
        };
        
        const fetchProfile = async () => {
            try {
                const data = await api.getProfile();
                if (data.authenticated) setBrokerProfile(data);
            } catch (e) {
                console.error('Core profile fetch failed:', e);
            }
        };

        checkSession();
        fetchConfig();
        fetchWatchlistNames();
        fetchProfile();
    }, []);

    // ── Auto-sync persisted watchlist on startup ──
    useEffect(() => {
        if (session && activeWatchlist) {
            handleWatchlistChange(activeWatchlist);
        }
    }, [!!session]); // Triggered once session is ready

    // ── Periodic updates (only when authenticated) ──
    useEffect(() => {
        if (!session) return;

        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        const logTimer = setInterval(async () => {
            try {
                const data = await api.getSystemLogs();
                setLogs(data);
            } catch (e) { /* silent */ }
        }, 3000);

        return () => {
            clearInterval(timer);
            clearInterval(logTimer);
        };
    }, [session]);

    const handleAuthSuccess = (message) => {
        setNotification({ message, type: 'success' });
        setActiveView('live');
        setTimeout(() => setNotification(null), 5000);
    };

    const handleLogout = async () => {
        try {
            await api.logout();
        } catch (e) { /* proceed with frontend logout even if backend is unreachable */ }
        sessionStorage.removeItem('BROKER_SESSION');
        setSession(null);
        setBrokerProfile(null);
        setActiveView('live');
    };

    const handleTimeframeChange = async (minutes) => {
        try {
            setSelectedTimeframe(minutes);
            localStorage.setItem('DASHBOARD_TIMEFRAME', minutes);
            await api.setTimeframe(minutes);
            
            // Re-sync the core sequence to backfill the newly structured aggregated slots
            if (activeWatchlist && session) {
                handleWatchlistChange(activeWatchlist);
            } else {
                setNotification({ message: `Aggregation Timeframe updated to ${minutes} mins. Syncing slots...`, type: 'success' });
                setTimeout(() => setNotification(null), 3000);
            }
        } catch (err) {}
    };

    const handleWatchlistChange = async (name) => {
        setActiveWatchlist(name);
        localStorage.setItem('DASHBOARD_WATCHLIST', name);
        try {
            const symbols = await api.getWatchlist(name);
            await api.syncWatchlist(symbols);
            
            // Immediate data refresh so the UI updates the count and data grid instantly
            const [snap, subs] = await Promise.all([
                api.getSnapshot(name),
                api.getSubscriptions()
            ]);
            setSnapshot(snap);
            setSubscriptions(subs);

            setNotification({ message: `Watchlist switched to "${name}" (${symbols.length} symbols)`, type: 'success' });
            setTimeout(() => setNotification(null), 3000);
        } catch (err) {
            console.error('Failed to sync watchlist:', err);
            setNotification({ message: `Sync failed: ${err.message}`, type: 'error' });
            setTimeout(() => setNotification(null), 3000);
        }
    };

    // ── Auto-subscribe on first login ──
    useEffect(() => {
        if (session && activeWatchlist && activeView === 'live' && !marketData.timestamp) {
            handleWatchlistChange(activeWatchlist);
        }
    }, [session, activeWatchlist, activeView]);

    // ── Load snapshot + subscription status when on live view ──
    useEffect(() => {
        if (!session || activeView !== 'live') return;

        const loadLiveViewData = async () => {
            try {
                const [snap, subs] = await Promise.all([
                    api.getSnapshot(activeWatchlist),
                    api.getSubscriptions()
                ]);
                setSnapshot(snap);
                setSubscriptions(subs);
            } catch (e) {
                console.warn('Could not load snapshot/subscriptions:', e);
            }
        };

        loadLiveViewData();
        // Refresh every 30s to keep subscription status current
        const interval = setInterval(loadLiveViewData, 30000);
        return () => clearInterval(interval);
    }, [session, activeView, activeWatchlist]);

    const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    const toggleSidebar = () => setIsSidebarCollapsed(prev => !prev);

    // ── GATE: If not authenticated, show the Login Gate ──
    if (!session) {
        return <BrokerLoginGate onAuthenticated={setSession} error={authError} />;
    }

    // ── DASHBOARD: User is authenticated ──
    const mStatus = marketData.market_status?.[0] || "CHECKING";
    const mReason = marketData.market_status?.[1] || "Connecting...";
    const latestLogs = Array.isArray(logs) ? logs.filter(l => l.includes('SUCCESS') || l.includes('INFO')).slice(0, 3) : [];

    return (
        <div className={clsx(
            "flex h-screen transition-colors duration-500 font-sans selection:bg-indigo-500/30",
            theme === 'dark' ? "bg-[#13131a] text-gray-200" : "bg-gray-50 text-gray-900"
        )}>
            <Sidebar
                activeView={activeView}
                setActiveView={setActiveView}
                isCollapsed={isSidebarCollapsed}
                toggleSidebar={toggleSidebar}
                theme={theme}
                toggleTheme={toggleTheme}
                session={session}
                wsStatus={status}
                onLogout={handleLogout}
            />

            <main className="flex-1 flex flex-col overflow-hidden relative">
                {/* Top System Bar */}
                <div className={clsx(
                    "px-8 py-3 flex justify-between items-center border-b backdrop-blur-md z-40",
                    theme === 'dark' ? "bg-black/20 border-white/5" : "bg-white/80 border-gray-200"
                )}>
                    {/* Left: Date & Market Status */}
                    <div className="flex items-center space-x-6">
                        <div className="flex flex-col">
                            <span className={clsx("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-500" : "text-gray-400")}>
                                {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
                            </span>
                            <span className={clsx("text-lg font-black tracking-tighter tabular-nums", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                {currentTime.toLocaleTimeString('en-IN', { hour12: false })}
                            </span>
                        </div>
                        <div className="h-8 w-px bg-white/10"></div>
                        <div className="flex flex-col">
                            <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 mb-0.5">Market Status</span>
                            <div className={clsx(
                                "flex items-center space-x-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-wider",
                                mStatus === 'OPEN'
                                    ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/30"
                                    : "bg-rose-500/10 text-rose-500 border-rose-500/30"
                            )}>
                                <div className={clsx("size-1.5 rounded-full", mStatus === 'OPEN' ? "bg-emerald-500 animate-pulse" : "bg-rose-500")}></div>
                                <span>{mStatus} | {mReason}</span>
                            </div>
                        </div>
                    </div>

                    {/* Right: Broker Profile */}
                    <div className="flex items-center space-x-4">
                        {brokerProfile?.user_name ? (
                            <div className={clsx(
                                "flex items-center space-x-3 px-4 py-2 rounded-xl border",
                                theme === 'dark' ? "bg-indigo-500/10 border-indigo-500/20" : "bg-indigo-50 border-indigo-200"
                            )}>
                                <div className="size-7 rounded-full bg-indigo-600 flex items-center justify-center shadow-md shrink-0">
                                    <span className="text-white font-black text-[10px]">
                                        {brokerProfile.user_name.charAt(0).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex flex-col">
                                    <span className={clsx("text-xs font-black tracking-tight leading-none", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                        {brokerProfile.user_name}
                                    </span>
                                    <span className="text-[9px] font-bold text-indigo-400 tracking-widest uppercase leading-none mt-0.5">
                                        {brokerProfile.broker} · {brokerProfile.user_id}
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className={clsx(
                                "flex items-center space-x-2 px-3 py-1.5 rounded-xl border bg-indigo-500/10 border-indigo-500/30"
                            )}>
                                <div className="size-1.5 rounded-full bg-indigo-400 animate-pulse"></div>
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-300">
                                    {session.broker} Session
                                </span>
                            </div>
                        )}
                    </div>
                </div>

                {activeView === 'live' && (
                    <div className={clsx("flex-1 flex flex-col h-full", theme === 'dark' ? "bg-[#13131a]" : "bg-white")}>
                        {/* Header Section for Branding/Navigation */}
                        <div className="px-8 pt-6 pb-2 flex justify-between items-end border-b border-white/[0.02]">
                            <div className={clsx("flex-1 flex items-start justify-between transition-all duration-300", isLiveFeedFullscreen && activeView === 'live' && "opacity-0 h-0 overflow-hidden mb-0")}>
                                <div>
                                    <h1 className={clsx(
                                        "text-4xl font-black tracking-tighter uppercase italic leading-none",
                                        theme === 'dark' ? "text-white" : "text-gray-900"
                                    )}>
                                        Market <span className="text-indigo-500">Flux</span>
                                    </h1>
                                    <div className="flex items-center space-x-2 mt-2">
                                        <Monitor size={12} className="text-indigo-400 opacity-80" />
                                        <span className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">
                                            Quantum Aggregator | {marketData.slot_labels?.length || '15'} Slots
                                        </span>
                                    </div>
                                </div>
                                
                                {/* Right Controls: Watchlist + Timeframe */}
                                <div className="flex items-center space-x-3">
                                    {/* Watchlist Collection Selector */}
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] uppercase font-black text-gray-600 tracking-widest mb-1">Watchlist</span>
                                        <select
                                            value={activeWatchlist}
                                            onChange={e => handleWatchlistChange(e.target.value)}
                                            className={clsx(
                                                "border rounded-xl px-3 py-1.5 text-[10px] font-black uppercase tracking-wider outline-none appearance-none cursor-pointer transition-all",
                                                theme === 'dark' ? "bg-zinc-900 border-white/10 text-indigo-300 hover:border-indigo-500/50" : "bg-white border-gray-200 text-indigo-700 hover:border-indigo-400"
                                            )}
                                        >
                                            {watchlistCollections.map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>

                                    {/* Separator */}
                                    <div className="h-8 w-px bg-white/10"></div>

                                    {/* Aggregation Interval Selector */}
                                    <div className="flex flex-col items-end">
                                        <span className="text-[8px] uppercase font-black text-gray-600 tracking-widest mb-1">Aggregation</span>
                                        <div className="flex items-center bg-black/10 rounded-xl p-1 border border-white/5 shadow-inner">
                                            {[25, 45, 75].map(min => (
                                                <button
                                                    key={min}
                                                    onClick={() => handleTimeframeChange(min)}
                                                    className={clsx(
                                                        "px-4 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                                                        selectedTimeframe === min
                                                            ? "bg-indigo-600 text-white shadow-md"
                                                            : theme === 'dark' ? "text-gray-400 hover:text-white hover:bg-white/5" : "text-gray-500 hover:text-black hover:bg-black/5"
                                                    )}
                                                >
                                                    {min}m
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    {/* Fullscreen Toggle */}
                                    <div className="h-8 w-px bg-white/10"></div>
                                    <button
                                        onClick={() => setIsLiveFeedFullscreen(!isLiveFeedFullscreen)}
                                        className={clsx(
                                            "size-8 flex items-center justify-center rounded-xl border transition-all hover:scale-105 active:scale-95",
                                            theme === 'dark' ? "bg-white/5 border-white/10 text-gray-400 hover:text-white" : "bg-gray-100 border-gray-200 text-gray-600 hover:text-black"
                                        )}
                                        title={isLiveFeedFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}
                                    >
                                        {isLiveFeedFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                    </button>
                                </div>
                            </div>

                            {/* Activity Ticker Bar */}
                            <div className={clsx("flex-1 flex items-center justify-end space-x-4 max-w-2xl overflow-hidden transition-all duration-300", isLiveFeedFullscreen && activeView === 'live' && "opacity-0 h-0 overflow-hidden")}>
                                {latestLogs.length > 0 ? (
                                    <div className="flex items-center space-x-2 animate-in fade-in slide-in-from-right-4 duration-500">
                                        <div className="size-1.5 bg-indigo-500 rounded-full animate-pulse"></div>
                                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500 shrink-0">Recent Activity:</span>
                                        <div className="flex items-center space-x-2 overflow-hidden truncate">
                                            {latestLogs.map((log, i) => (
                                                <div key={i} className={clsx(
                                                    "px-2 py-0.5 rounded text-[9px] font-bold font-mono whitespace-nowrap border",
                                                    log.includes('SUCCESS')
                                                        ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                                                        : "bg-indigo-500/10 text-indigo-400 border-indigo-500/20"
                                                )}>
                                                    {log.replace(/\[.*\]\s/, '')}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-600 italic">Syncing event logs...</span>
                                )}
                            </div>
                        </div>

                        {/* The highly performant grid */}
                        <LiveFeedGrid data={marketData} snapshot={snapshot} subscriptions={subscriptions} theme={theme} />
                    </div>
                )}

                <div className={clsx("flex-1 overflow-auto", activeView === 'backtest' ? "flex flex-col" : "hidden")}>
                    <BacktestView theme={theme} activeView={activeView} />
                </div>
                {activeView === 'simulator' && <PhaseSimulatorView theme={theme} />}
                {activeView === 'orders' && <OrderConsole theme={theme} />}
                {activeView === 'settings' && <SettingsView theme={theme} onAuthSuccess={handleAuthSuccess} />}

                {activeView === 'analytics' && (
                    <div className={clsx("flex-1 flex items-center justify-center p-12", theme === 'dark' ? "bg-zinc-950" : "bg-gray-100")}>
                        <div className="text-center max-w-xl">
                            <div className="size-20 bg-emerald-500/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-emerald-500/20 shadow-[0_0_40px_rgba(16,185,129,0.1)]">
                                <LayoutDashboard size={40} className="text-emerald-500" />
                            </div>
                            <h2 className={clsx("text-4xl font-bold mb-4 tracking-tight", theme === 'dark' ? "text-white" : "text-gray-900")}>Strategy Heatmaps</h2>
                            <p className="text-gray-400 text-lg leading-relaxed font-medium">
                                Sector correlations and intra-day trend persistence analysis powered by our SQLAlchemy historical engine.
                            </p>
                            <button className="mt-8 px-10 py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] transition-all shadow-xl shadow-emerald-900/20 active:scale-95">
                                Generate Performance Matrix
                            </button>
                        </div>
                    </div>
                )}
            </main>

            {/* Global Notification Popup */}
            {notification && (
                <div className="fixed bottom-12 right-12 z-[100] animate-in fade-in slide-in-from-bottom-8 duration-500">
                    <div className={clsx(
                        "px-8 py-5 rounded-3xl border shadow-2xl backdrop-blur-2xl flex items-center space-x-4",
                        notification.type === 'success' 
                            ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-100" 
                            : "bg-rose-500/10 border-rose-500/30 text-rose-100"
                    )}>
                        <div className={clsx(
                            "size-10 rounded-2xl flex items-center justify-center border",
                            notification.type === 'success' ? "bg-emerald-500/20 border-emerald-500/40" : "bg-rose-500/20 border-rose-500/40"
                        )}>
                            {notification.type === 'success' ? <Zap size={20} className="text-emerald-400" /> : <ShieldCheck size={20} className="text-rose-400" />}
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 mb-1">System Message</h4>
                            <p className="font-bold text-sm tracking-tight">{notification.message}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;
