import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Layers, TrendingUp, BarChart2, Grid, Maximize2, Minimize2 } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../../api';
import BacktestGrid from './BacktestGrid';
import PhaseAnalyticsDashboard from '../analytics/PhaseAnalyticsDashboard';

const BacktestView = ({ theme, activeView }) => {
    // Mode toggle: 'watchlist' | 'single'
    const [mode, setMode] = useState('single');

    // Watchlist collections
    const [collections, setCollections] = useState([]);
    const [activeCollection, setActiveCollection] = useState('Default');
    const [symbols, setSymbols] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState('');

    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeframe, setTimeframe] = useState(25);
    const [gridData, setGridData] = useState(null);
    const [phaseStatsList, setPhaseStatsList] = useState([]);
    const [resultsTab, setResultsTab] = useState('grid');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [progress, setProgress] = useState('');
    const [isParametersCollapsed, setIsParametersCollapsed] = useState(false);

    // Fetch collection names on mount OR when switching to this view
    useEffect(() => {
        if (activeView !== 'backtest') return;
        const fetchCollections = async () => {
            try {
                const data = await api.getWatchlistNames();
                setCollections(data);
            } catch (e) { setCollections(['Default']); }
        };
        fetchCollections();
    }, [activeView]);

    // Fetch symbols whenever active collection changes OR when switching to this view
    useEffect(() => {
        if (activeView !== 'backtest') return;
        const fetchSymbols = async () => {
            try {
                const data = await api.getWatchlist(activeCollection);
                if (data && data.length > 0) {
                    setSymbols(data);
                    setSelectedSymbol(data[0]);
                } else {
                    setSymbols([]);
                    setSelectedSymbol('');
                }
            } catch (err) { console.error('Failed to fetch symbols', err); }
        };
        fetchSymbols();
    }, [activeCollection, activeView]);

    // Fetch historical data for a single symbol
    const fetchSingle = async (symbol) => {
        return await api.getHistoricalOHLC(symbol, startDate, endDate, timeframe);
    };

    // High-performance Fetch Logic with Parallelization
    const handleFetch = async () => {
        // 1. Reset State (Clean Start)
        setLoading(true);
        setError(null);
        setGridData(null);
        setPhaseStatsList([]);
        setResultsTab('grid');
        setProgress('Initializing engine...');

        try {
            // Guard: Single Mode Validation
            if (mode === 'single') {
                if (!selectedSymbol) return setError('Please select a symbol.');
                
                const resp = await fetchSingle(selectedSymbol);
                if (resp?.s !== 'ok' || !resp?.grid_data) {
                    return setError(resp?.message || 'No data found for this range.');
                }

                setGridData(resp.grid_data);
                if (resp.phase_stats) setPhaseStatsList([{ symbol: selectedSymbol, stats: resp.phase_stats }]);
                return;
            }

            // Guard: Watchlist Mode Validation
            if (!symbols.length) return setError('Selected watchlist has no symbols.');

            // 2. Parallel Execution (Enterprise Scale)
            // Using Promise.all provides a significant speedup vs sequential for-loops
            setProgress(`Syncing 1 / ${symbols.length}...`);
            const fetchResults = await Promise.all(
                symbols.map(async (sym, index) => {
                    try {
                        const res = await fetchSingle(sym);
                        // Progress update (approximate as they run in parallel)
                        if (index % 5 === 0) setProgress(`Processing batch starting at ${index + 1}...`);
                        return { symbol: sym, data: res };
                    } catch (e) {
                        return { symbol: sym, data: null };
                    }
                })
            );

            // 3. Optimized Merging (O(n))
            const merged = { data: {}, slot_labels: [] };
            const allPhaseStats = [];
            let successCount = 0;

            fetchResults.forEach(({ symbol, data: resp }) => {
                if (resp?.s === 'ok' && resp?.grid_data) {
                    // Lock slot_labels from the first healthy payload
                    if (successCount === 0) merged.slot_labels = resp.grid_data.slot_labels ?? [];
                    
                    // Merge metrics
                    if (resp.grid_data.data) Object.assign(merged.data, resp.grid_data.data);
                    
                    // Collect analytics
                    if (resp.phase_stats) allPhaseStats.push({ symbol, stats: resp.phase_stats });
                    successCount++;
                }
            });

            // 4. Final Commit
            setPhaseStatsList(allPhaseStats);
            if (successCount > 0) {
                setGridData(merged);
                if (successCount < symbols.length) {
                    setError(`Warning: Only ${successCount}/${symbols.length} symbols returned data.`);
                }
            } else {
                setError('No historical data found for any symbol in this range.');
            }

        } catch (err) {
            setError('Architectural failure: Backend unreachable or malformed response.');
            console.error(err);
        } finally {
            setLoading(false);
            setProgress('');
        }
    };

    // Clear grid when mode changes
    const handleModeSwitch = (newMode) => {
        setMode(newMode);
        setGridData(null);
        setError(null);
    };

    // Auto-fetch automatically when the user changes the timeframe 
    // to provide a seamless "First Time Right" enterprise experience.
    useEffect(() => {
        if (gridData && !loading) {
            handleFetch();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeframe]);

    return (
        <div className={clsx('flex-1 p-6 flex flex-col min-h-0', theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-white')}>
            <div className="mb-4 flex items-end justify-between shrink-0">
                <div>
                    <h1 className={clsx('text-2xl font-black mb-1 tracking-tight uppercase italic', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                        Historical <span className="text-indigo-500">Backtesting</span>
                    </h1>
                    <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest">Analyze historical OHLCV performance across custom slots</p>
                </div>
            </div>

            <div className={clsx("w-full mb-6 shrink-0 transition-all duration-300", isParametersCollapsed ? "h-0 opacity-0 overflow-hidden mb-0" : "h-auto opacity-100")}>
                <div className={clsx('w-full border rounded-2xl p-4 shadow-sm', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>

                    {/* Mode Toggle */}
                    <div className="flex items-center space-x-3 mb-4">
                        <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Mode:</span>
                        <div className={clsx('flex p-1 rounded-xl border', theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                            <button
                                onClick={() => handleModeSwitch('single')}
                                className={clsx(
                                    'flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                    mode === 'single'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'
                                )}
                            >
                                <TrendingUp size={11} />
                                <span>Single Stock</span>
                            </button>
                            <button
                                onClick={() => handleModeSwitch('watchlist')}
                                className={clsx(
                                    'flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                    mode === 'watchlist'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'
                                )}
                            >
                                <Layers size={11} />
                                <span>Full Watchlist</span>
                            </button>
                        </div>
                        {mode === 'watchlist' && symbols.length > 0 && (
                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                                {symbols.length} stocks will be fetched
                            </span>
                        )}
                    </div>

                    {/* Error/Progress Bar */}
                    {error && (
                        <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center space-x-2">
                            <AlertCircle size={13} className="text-rose-500 shrink-0" />
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-widest">{error}</span>
                        </div>
                    )}
                    {progress && (
                        <div className="mb-3 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center space-x-2">
                            <Loader2 size={13} className="text-indigo-400 animate-spin shrink-0" />
                            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">{progress}</span>
                        </div>
                    )}

                    {/* Parameters Row */}
                    <div className="flex items-end space-x-4">
                        {/* Watchlist Selector — always shown */}
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider flex items-center space-x-1">
                                <Layers size={10} />
                                <span>Watchlist</span>
                            </label>
                            <select
                                value={activeCollection}
                                onChange={e => setActiveCollection(e.target.value)}
                                className={clsx(
                                    'w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold appearance-none',
                                    theme === 'dark' ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300'
                                )}
                            >
                                {collections.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>

                        {/* Symbol Selector — only in single mode */}
                        {mode === 'single' && (
                            <div className="flex-1">
                                <label className="text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider">Symbol</label>
                                <select
                                    value={selectedSymbol}
                                    onChange={e => setSelectedSymbol(e.target.value)}
                                    className={clsx(
                                        'w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold appearance-none',
                                        theme === 'dark' ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300'
                                    )}
                                >
                                    {symbols.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </div>
                        )}

                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider">Start Date</label>
                            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                                className={clsx('w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold', theme === 'dark' ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300')} />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider">End Date</label>
                            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                                className={clsx('w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold', theme === 'dark' ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300')} />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider">Timeframe</label>
                            <select value={timeframe} onChange={e => setTimeframe(Number(e.target.value))}
                                className={clsx('w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold', theme === 'dark' ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300')}>
                                {[5, 10, 15, 25, 30, 45, 60].map(t => <option key={t} value={t}>{t} Min</option>)}
                            </select>
                        </div>
                        <div className="w-44">
                            <button
                                onClick={handleFetch}
                                disabled={loading}
                                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
                            >
                                {loading ? <Loader2 className="animate-spin" size={14} /> : null}
                                <span>{loading ? (mode === 'watchlist' ? 'Fetching All...' : 'Fetching...') : 'Fetch Data'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {gridData && (
                <div className="flex flex-col flex-1 min-h-0">
                    {/* Results Tab Switcher */}
                    <div className="flex items-center justify-between mb-4 shrink-0">
                        <div className="flex items-center">
                            <h3 className={clsx('text-sm font-black tracking-widest uppercase ml-1', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                                Results
                                {mode === 'watchlist' && (
                                    <span className="ml-3 text-indigo-400 normal-case font-bold text-[10px]">
                                        — {activeCollection} ({Object.keys(gridData.data).length} symbols)
                                    </span>
                                )}
                            </h3>
                            <button
                                onClick={() => setIsParametersCollapsed(!isParametersCollapsed)}
                                className={clsx(
                                    "ml-4 p-1.5 rounded-lg border transition-all hover:scale-110",
                                    theme === 'dark' ? "bg-zinc-900 border-white/10 text-gray-400 hover:text-white" : "bg-gray-100 border-gray-200 text-gray-600 hover:text-black"
                                )}
                                title={isParametersCollapsed ? "Show Parameters" : "Maximize Grid"}
                            >
                                {isParametersCollapsed ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                            </button>
                        </div>
                        <div className={clsx('flex p-1 rounded-xl border', theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                            <button
                                onClick={() => setResultsTab('grid')}
                                className={clsx(
                                    'flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                    resultsTab === 'grid'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800'
                                )}
                            >
                                <Grid size={11} />
                                <span>Data Grid</span>
                            </button>
                            <button
                                onClick={() => setResultsTab('phase')}
                                disabled={phaseStatsList.length === 0}
                                className={clsx(
                                    'flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                    resultsTab === 'phase'
                                        ? 'bg-indigo-600 text-white shadow-md'
                                        : theme === 'dark' ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800',
                                    phaseStatsList.length === 0 && 'opacity-40 cursor-not-allowed'
                                )}
                            >
                                <BarChart2 size={11} />
                                <span>Phase Analysis</span>
                            </button>
                        </div>
                    </div>

                    {/* Grid View */}
                    {resultsTab === 'grid' && (
                        <div className="flex flex-col flex-1 min-h-0">
                            <BacktestGrid data={gridData} theme={theme} />
                        </div>
                    )}

                    {/* Phase Analytics View */}
                    {resultsTab === 'phase' && (
                        <div className="flex-1 overflow-auto p-2">
                            <PhaseAnalyticsDashboard
                                phaseStats={phaseStatsList}
                                watchlistName={mode === 'watchlist' ? activeCollection : selectedSymbol}
                                theme={theme}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default BacktestView;
