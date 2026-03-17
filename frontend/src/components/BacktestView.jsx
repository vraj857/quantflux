import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Layers, TrendingUp, BarChart2, Grid } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';
import BacktestGrid from './BacktestGrid';
import PhaseAnalyticsDashboard from './PhaseAnalyticsDashboard';

const BacktestView = ({ theme }) => {
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

    // Fetch collection names on mount
    useEffect(() => {
        const fetchCollections = async () => {
            try {
                const data = await api.getWatchlistNames();
                setCollections(data);
            } catch (e) { setCollections(['Default']); }
        };
        fetchCollections();
    }, []);

    // Fetch symbols whenever active collection changes
    useEffect(() => {
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
    }, [activeCollection]);

    // Fetch historical data for a single symbol
    const fetchSingle = async (symbol) => {
        return await api.getHistoricalOHLC(symbol, startDate, endDate, timeframe);
    };

    const handleFetch = async () => {
        setLoading(true);
        setError(null);
        setGridData(null);
        setPhaseStatsList([]);
        setResultsTab('grid');
        setProgress('');

        try {
            if (mode === 'single') {
                // ── Single stock mode ──
                if (!selectedSymbol) { setError('Please select a symbol.'); return; }
                const data = await fetchSingle(selectedSymbol);
                if (data.s === 'ok' && data.grid_data) {
                    setGridData(data.grid_data);
                    if (data.phase_stats) setPhaseStatsList([{ symbol: selectedSymbol, stats: data.phase_stats }]);
                } else {
                    setError(data.message || 'No data found for this date range/symbol.');
                }
            } else {
                // ── Watchlist mode: fetch all symbols and deep-merge grid_data ──
                // BacktestGrid expects: { data: { SYMBOL: {...} }, slot_labels: [...] }
                // Each fetchSingle returns a grid_data with that same shape.
                // We must keep slot_labels from the first result and merge all inner `data` maps.
                if (symbols.length === 0) { setError('Selected watchlist has no symbols.'); return; }
                
                const merged = { data: {}, slot_labels: [] };
                const allPhaseStats = [];
                let successCount = 0;

                for (let i = 0; i < symbols.length; i++) {
                    const sym = symbols[i];
                    setProgress(`Fetching ${i + 1} / ${symbols.length}: ${sym}`);
                    try {
                        const resp = await fetchSingle(sym);
                        if (resp.s === 'ok' && resp.grid_data) {
                            const gd = resp.grid_data;
                            // Use slot_labels from the first successful result
                            if (successCount === 0 && gd.slot_labels) {
                                merged.slot_labels = gd.slot_labels;
                            }
                            // Deep-merge the inner `data` object (each key is a symbol)
                            if (gd.data) {
                                Object.assign(merged.data, gd.data);
                            }
                            // Collect phase stats per symbol
                            if (resp.phase_stats) allPhaseStats.push({ symbol: sym, stats: resp.phase_stats });
                            successCount++;
                        }
                    } catch (e) { /* skip failed symbols */ }
                }
                setPhaseStatsList(allPhaseStats);

                setProgress('');
                if (Object.keys(merged.data).length > 0) {
                    setGridData(merged);
                    if (successCount < symbols.length) {
                        setError(`Data loaded for ${successCount}/${symbols.length} symbols. Some had no data for this range.`);
                    }
                } else {
                    setError('No data found for any symbol in this watchlist for the selected date range.');
                }
            }
        } catch (err) {
            setError('Backend service error. Check connection.');
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

            <div className="w-full mb-6 shrink-0">
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
                        <h3 className={clsx('text-sm font-black tracking-widest uppercase ml-1', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>
                            Results
                            {mode === 'watchlist' && (
                                <span className="ml-3 text-indigo-400 normal-case font-bold text-[10px]">
                                    — {activeCollection} ({Object.keys(gridData.data).length} symbols)
                                </span>
                            )}
                        </h3>
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
