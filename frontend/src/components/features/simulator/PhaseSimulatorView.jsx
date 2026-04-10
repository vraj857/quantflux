import React, { useState, useEffect, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { api } from '../../../api';
import { generateSlots, runBacktest, exportCSV } from './simEngine';
import EdgeOptimizer from './EdgeOptimizer';
import {
    Loader2, AlertCircle, Download, TrendingUp, Layers,
    Activity, Target, IndianRupee, BarChart3, Play, Crosshair,
    ChevronLeft, ChevronRight, ChevronUp, ChevronDown, ChevronsUpDown,
    RefreshCw, BadgeInfo,
} from 'lucide-react';

// ─── Tiny helpers ──────────────────────────────────────────────────────────────
const Toggle = ({ value, onChange, label, dark }) => (
    <div className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <button onClick={() => onChange(!value)}
            className={clsx('relative w-10 h-5 rounded-full transition-all shrink-0', value ? 'bg-indigo-600' : dark ? 'bg-zinc-700' : 'bg-gray-300')}>
            <span className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-200', value ? 'left-5' : 'left-0.5')} />
        </button>
    </div>
);

const fmt = (v, prefix = '₹') => {
    if (v === '—' || v === '∞' || v == null) return v ?? '—';
    const n = parseFloat(v);
    if (isNaN(n)) return v;
    return `${n < 0 ? '-' : ''}${prefix}${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

function kpiColor(val, higherBetter = true, dark = true) {
    const n = parseFloat(val);
    if (isNaN(n)) return dark ? 'text-gray-300' : 'text-gray-700';
    return (n > 0) === higherBetter ? 'text-emerald-500' : 'text-rose-500';
}

// ─── Quick stat pill ───────────────────────────────────────────────────────────
const Stat = ({ label, value, color }) => (
    <div className="flex flex-col items-center px-4">
        <span className="text-[8px] font-black uppercase tracking-widest text-gray-500 mb-0.5">{label}</span>
        <span className={clsx('text-sm font-black tabular-nums', color)}>{value}</span>
    </div>
);

// ─── Performance row ───────────────────────────────────────────────────────────
const PerfRow = ({ label, all, long, short, prefix = '₹', pct = false, dark }) => {
    const cell = (v) => {
        if (v === null) return <span className="text-gray-600">—</span>;
        const raw = parseFloat(v);
        const col = isNaN(raw) ? (dark ? 'text-gray-300' : 'text-gray-700')
            : raw > 0 ? 'text-emerald-500' : raw < 0 ? 'text-rose-500' : (dark ? 'text-gray-300' : 'text-gray-700');
        const display = pct ? `${v}%` : (isNaN(raw) ? v : fmt(v, prefix));
        return <span className={clsx('tabular-nums', col)}>{display}</span>;
    };
    return (
        <tr className={clsx('border-b text-xs', dark ? 'border-white/[0.04] hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50')}>
            <td className={clsx('py-2 pr-4 font-semibold text-[11px]', dark ? 'text-gray-400' : 'text-gray-600')}>{label}</td>
            <td className="py-2 pr-4 text-right">{cell(all)}</td>
            <td className="py-2 pr-4 text-right">{cell(long)}</td>
            <td className="py-2 text-right">{cell(short)}</td>
        </tr>
    );
};

// ─── Sort icon helper ──────────────────────────────────────────────────────────
const SortIcon = ({ col, active, dir }) => {
    if (active !== col) return <ChevronsUpDown size={10} className="opacity-30 ml-1 inline" />;
    return dir === 'asc' ? <ChevronUp size={10} className="ml-1 inline text-indigo-400" />
                         : <ChevronDown size={10} className="ml-1 inline text-indigo-400" />;
};

// ─── MAIN ──────────────────────────────────────────────────────────────────────
const StrategySimulatorView = ({ theme }) => {
    const dark = theme === 'dark';

    // Data loader
    const [mode, setMode] = useState('single');
    const [collections, setCollections] = useState([]);
    const [activeCollection, setActiveCollection] = useState('Default');
    const [symbols, setSymbols] = useState([]);
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const [startDate, setStartDate] = useState(() => { const d = new Date(); d.setFullYear(d.getFullYear() - 1); return d.toISOString().split('T')[0]; });
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [timeframe, setTimeframe] = useState(25);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [fetchMeta, setFetchMeta] = useState(null);
    const [simData, setSimData] = useState(null);

    // Strategy params
    const intradaySlots = useMemo(() => generateSlots(timeframe), [timeframe]);
    const allExitSlots  = useMemo(() => [...intradaySlots, 'NextDayOpen'], [intradaySlots]);
    const [direction, setDirection]             = useState('Long');
    const [entrySlot, setEntrySlot]             = useState('09:15');
    const [exitSlot, setExitSlot]               = useState('NextDayOpen');
    const [requireVWAP, setRequireVWAP]         = useState(true);
    const [requireVolSpike, setRequireVolSpike] = useState(true);
    const [volThreshold, setVolThreshold]       = useState(1.5);
    const [startingCapital, setStartingCapital] = useState(50000);
    const [slippage, setSlippage]               = useState(0.05);
    const [qtyMode, setQtyMode]                 = useState('auto'); // 'auto' or 'fixed'
    const [fixedQtyVal, setFixedQtyVal]         = useState(1);

    // F&O / Instrument state
    const [instrumentInfo, setInstrumentInfo]   = useState(null); // { lot_size, type }
    const [isSyncing, setIsSyncing]             = useState(false);
    const [syncMsg, setSyncMsg]                 = useState(null);

    const segment = useMemo(() => {
        const type = instrumentInfo?.type;
        if (type === 'FUT' || type === 'INDEX' || selectedSymbol?.endsWith('FUT')) return 'FNO_FUT';
        if (type === 'OPT' || selectedSymbol?.match(/\d+(CE|PE)$/)) return 'FNO_OPT';
        return 'EQ_INTRADAY';
    }, [selectedSymbol, instrumentInfo]);

    const segmentLabel = { 'FNO_FUT': 'FUT', 'FNO_OPT': 'OPT', 'EQ_INTRADAY': 'EQ' }[segment];
    const segmentColor = { 'FNO_FUT': 'text-amber-400 bg-amber-500/10 border-amber-500/20', 'FNO_OPT': 'text-purple-400 bg-purple-500/10 border-purple-500/20', 'EQ_INTRADAY': 'text-sky-400 bg-sky-500/10 border-sky-500/20' }[segment];

    // Top-level view mode
    const [viewMode, setViewMode] = useState('simulator');

    // Report UI
    const [activeTab, setActiveTab]   = useState('overview');
    const [page, setPage]             = useState(1);
    const [sortCol, setSortCol]       = useState('date');
    const [sortDir, setSortDir]       = useState('asc');
    const PAGE_SIZE = 25;

    const results = useMemo(() => {
        if (!simData) return null;
        return runBacktest(simData, { 
            direction, entrySlot, exitSlot, requireVWAP, requireVolSpike, 
            volThreshold, startingCapital, slippage,
            qtyMode, fixedQtyVal
        });
    }, [simData, direction, entrySlot, exitSlot, requireVWAP, requireVolSpike, volThreshold, startingCapital, slippage, qtyMode, fixedQtyVal]);

    useEffect(() => { api.getWatchlistNames().then(setCollections).catch(() => setCollections(['Default'])); }, []);
    useEffect(() => {
        api.getWatchlist(activeCollection).then(data => {
            if (data?.length > 0) { setSymbols(data); setSelectedSymbol(data[0]); }
            else { setSymbols([]); setSelectedSymbol(''); }
        }).catch(() => {});
    }, [activeCollection]);
    useEffect(() => {
        const s = generateSlots(timeframe);
        if (!s.includes(entrySlot)) setEntrySlot(s[0]);
        if (exitSlot !== 'NextDayOpen' && !s.includes(exitSlot)) setExitSlot('NextDayOpen');
    }, [timeframe]);

    const handleFetch = async () => {
        if (!selectedSymbol) return setError('Select a symbol first.');
        setLoading(true); setError(null); setSimData(null); setFetchMeta(null); setInstrumentInfo(null);
        try {
            // Load sim data and instrument info in parallel
            const [resp, instResp] = await Promise.all([
                api.getSimulationData(selectedSymbol, startDate, endDate, timeframe),
                api.getInstrumentInfo(selectedSymbol).catch(() => null),
            ]);

            if (resp?.s !== 'ok') return setError(resp?.message || 'No data returned.');

            const info = instResp || { lot_size: 1, type: 'EQ' };
            setInstrumentInfo(info);

            // Enrich sim_data with lot size so simEngine can use it
            const enrichedSimData = { ...resp.sim_data, lotSize: info.lot_size || 1 };
            setSimData(enrichedSimData);

            if (resp.fetch_meta) setFetchMeta(resp.fetch_meta);
            setActiveTab('overview'); setPage(1);
        } catch { setError('Backend unreachable.'); }
        finally { setLoading(false); }
    };

    const handleSyncFno = async () => {
        setIsSyncing(true); setSyncMsg(null);
        try {
            const resp = await api.syncFnoLots();
            setSyncMsg(`✓ Synced ${resp.updated_count} F&O instruments`);
        } catch {
            setSyncMsg('✗ Sync failed — is the backend running?');
        } finally {
            setIsSyncing(false);
        }
    };

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('asc'); }
        setPage(1);
    };

    // Sorted trades
    const sortedTrades = useMemo(() => {
        if (!results?.trades) return [];
        return [...results.trades].sort((a, b) => {
            let av = a[sortCol], bv = b[sortCol];
            if (typeof av === 'string') av = av.toLowerCase(), bv = bv.toLowerCase();
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
    }, [results?.trades, sortCol, sortDir]);

    const totalPages = Math.ceil(sortedTrades.length / PAGE_SIZE);
    const pageTrades = sortedTrades.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    // Style helpers
    const inputCls = clsx('w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold',
        dark ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300');
    const labelCls = 'text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider';
    const cardCls  = clsx('rounded-2xl border p-4', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200');

    // KPIs shorthand
    const K = results?.kpis;
    const L = K?.long;
    const S = K?.short;

    // ── RENDER ─────────────────────────────────────────────────────────────────
    return (
        <div className={clsx('flex-1 p-6 flex flex-col min-h-0 gap-4 overflow-auto', dark ? 'bg-[#0a0a0a]' : 'bg-gray-50')}>

            {/* HEADER */}
            <div className="shrink-0">
                <h1 className={clsx('text-2xl font-black mb-0.5 tracking-tight uppercase italic', dark ? 'text-white' : 'text-gray-900')}>
                    Strategy <span className="text-indigo-500">Simulator</span>
                </h1>
                <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest">
                    Deterministic intraday slot backtesting · entry &amp; exit windows · Long &amp; Short
                </p>
            </div>

            {/* DATA LOADER */}
            <div className={cardCls}>
                <div className="flex items-center space-x-3 mb-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-gray-500">Mode:</span>
                    <div className={clsx('flex p-1 rounded-xl border', dark ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                        {[['single','Single Stock',TrendingUp],['watchlist','Full Watchlist',Layers]].map(([v,lbl,Icon]) => (
                            <button key={v} onClick={() => setMode(v)}
                                className={clsx('flex items-center space-x-1.5 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                    mode === v ? 'bg-indigo-600 text-white shadow-md' : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
                                <Icon size={11}/><span>{lbl}</span>
                            </button>
                        ))}
                    </div>
                    {mode === 'watchlist' && <span className="text-[9px] font-bold text-amber-400/80 uppercase">Watchlist mode — coming soon</span>}
                </div>
                {error && (
                    <div className="mb-3 p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center gap-2">
                        <AlertCircle size={13} className="text-rose-500 shrink-0"/>
                        <span className="text-[10px] font-bold text-rose-400">{error}</span>
                    </div>
                )}
                <div className="flex items-end gap-3">
                    <div className="flex-1">
                        <label className={labelCls}>Watchlist</label>
                        <select value={activeCollection} onChange={e => setActiveCollection(e.target.value)} className={inputCls}>
                            {collections.map(c => <option key={c}>{c}</option>)}
                        </select>
                    </div>
                    {mode === 'single' && (
                        <div className="flex-1">
                            <label className={labelCls}>Symbol</label>
                            <select value={selectedSymbol} onChange={e => setSelectedSymbol(e.target.value)} className={inputCls}>
                                {symbols.map(s => <option key={s}>{s}</option>)}
                            </select>
                        </div>
                    )}
                    <div className="flex-1"><label className={labelCls}>Start Date</label><input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className={inputCls}/></div>
                    <div className="flex-1"><label className={labelCls}>End Date</label><input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className={inputCls}/></div>
                    <div className="flex-1">
                        <label className={labelCls}>Timeframe</label>
                        <select value={timeframe} onChange={e => setTimeframe(Number(e.target.value))} className={inputCls}>
                            {[5,10,15,25,30,45,60].map(t => <option key={t} value={t}>{t} Min</option>)}
                        </select>
                    </div>
                    <div className="w-44 flex flex-col gap-1">
                        <div className="h-[18px] flex items-center">
                            {fetchMeta && !loading && (
                                <span className="text-[8px] font-black uppercase tracking-wider text-indigo-500/80">
                                    {fetchMeta.source === 'DB_CACHE' ? 'DB Cache' : 'Broker API'}<span className="opacity-40 mx-1">·</span>{fetchMeta.elapsed_ms}ms
                                </span>
                            )}
                        </div>
                        <button onClick={handleFetch} disabled={loading}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2">
                            {loading ? <Loader2 className="animate-spin" size={13}/> : <Play size={12}/>}
                            <span>{loading ? 'Loading…' : 'Load & Simulate'}</span>
                        </button>
                    </div>
                </div>

                {/* F&O Sync Row */}
                <div className="flex items-center gap-3 pt-3 border-t border-white/5 mt-1">
                    <button onClick={handleSyncFno} disabled={isSyncing}
                        className={clsx('flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all',
                            dark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400 hover:bg-amber-500/20' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100',
                            isSyncing && 'opacity-60 cursor-not-allowed')}>
                        <RefreshCw size={11} className={isSyncing ? 'animate-spin' : ''}/>
                        {isSyncing ? 'Syncing F&O Lots…' : 'Sync F&O Lot Sizes'}
                    </button>
                    {syncMsg && (
                        <span className={clsx('text-[9px] font-bold', syncMsg.startsWith('✓') ? 'text-emerald-400' : 'text-rose-400')}>
                            {syncMsg}
                        </span>
                    )}
                    <BadgeInfo size={12} className="text-gray-600 shrink-0 ml-auto"/>
                    <span className="text-[8px] text-gray-600">Run quarterly when NSE revises lot sizes</span>
                </div>
            </div>

            {/* VIEW MODE TABS — shown only after data is loaded */}
            {simData && !loading && (
                <div className={clsx('flex items-center gap-1 p-1 rounded-xl border shrink-0', dark ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                    {[['simulator', 'Strategy Simulator', BarChart3], ['optimizer', 'Intraday Edge Optimizer', Crosshair]].map(([v, lbl, Icon]) => (
                        <button key={v} onClick={() => setViewMode(v)}
                            className={clsx('flex items-center gap-1.5 px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all',
                                viewMode === v ? 'bg-indigo-600 text-white shadow-md' : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
                            <Icon size={12} /><span>{lbl}</span>
                        </button>
                    ))}
                </div>
            )}

            {/* ── EDGE OPTIMIZER VIEW ── */}
            {simData && !loading && viewMode === 'optimizer' && (
                <EdgeOptimizer simData={simData} theme={theme} selectedSymbol={selectedSymbol} startingSlippage={slippage} />
            )}

            {/* STRATEGY PARAMS — only in simulator mode */}
            {viewMode === 'simulator' && (<>
            <div className={cardCls}>
                <div className="grid grid-cols-10 gap-3 items-end">
                    <div>
                        <label className={labelCls}>Direction</label>
                        <div className={clsx('flex p-1 rounded-xl border', dark ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                            {['Long','Short'].map(d => (
                                <button key={d} onClick={() => setDirection(d)}
                                    className={clsx('flex-1 px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                                        direction === d
                                            ? d === 'Long' ? 'bg-emerald-600 text-white shadow-md' : 'bg-rose-600 text-white shadow-md'
                                            : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
                                    {d}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}><Target size={9} className="inline mr-1"/>Entry</label>
                        <select value={entrySlot} onChange={e => setEntrySlot(e.target.value)} className={inputCls}>
                            {intradaySlots.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}><Activity size={9} className="inline mr-1"/>Exit</label>
                        <select value={exitSlot} onChange={e => setExitSlot(e.target.value)} className={inputCls}>
                            {allExitSlots.map(s => <option key={s}>{s}</option>)}
                        </select>
                    </div>
                    <div className="flex flex-col gap-2.5 pb-0.5">
                        <Toggle value={requireVWAP}     onChange={setRequireVWAP}     label="VWAP" dark={dark}/>
                        <Toggle value={requireVolSpike} onChange={setRequireVolSpike} label="Vol Spike"   dark={dark}/>
                    </div>
                    <div>
                        <label className={labelCls}>Volume Threshold · <span className="text-indigo-400">{volThreshold}×</span></label>
                        <input type="range" min="1" max="3" step="0.1" value={volThreshold}
                            onChange={e => setVolThreshold(Number(e.target.value))} className="w-full accent-indigo-500 mt-2"/>
                    </div>
                    <div>
                        <label className={labelCls}><IndianRupee size={9} className="inline mr-1"/>Capital</label>
                        <input type="number" value={startingCapital} onChange={e => setStartingCapital(e.target.value)} className={inputCls} step="1000" min="1000"/>
                    </div>
                    <div>
                        <label className={labelCls}>Slip (%)</label>
                        <input type="number" value={slippage} onChange={e => setSlippage(e.target.value)} className={inputCls} step="0.01" min="0" max="5"/>
                    </div>
                    
                    {/* Position Sizing Mode */}
                    <div>
                        <label className={labelCls}>Qty Mode</label>
                        <div className={clsx('flex p-1 rounded-xl border', dark ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                            {[['auto','Auto'],['fixed','Fixed']].map(([m,lbl]) => (
                                <button key={m} onClick={() => setQtyMode(m)}
                                    className={clsx('flex-1 px-2 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                                        qtyMode === m ? 'bg-indigo-600 text-white shadow-md' : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
                                    {lbl}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Fixed Size Input */}
                    <div>
                        <label className={labelCls}>{segment === 'EQ_INTRADAY' ? 'Fixed Qty' : 'Fixed Lots'}</label>
                        <input type="number" value={fixedQtyVal} onChange={e => setFixedQtyVal(e.target.value)} 
                            disabled={qtyMode==='auto'}
                            className={clsx(inputCls, qtyMode==='auto' && 'opacity-30 cursor-not-allowed')} 
                            step="1" min="1"/>
                    </div>

                    <div className={clsx('rounded-xl border p-2 text-center', dark ? 'bg-indigo-600/10 border-indigo-500/20' : 'bg-indigo-50 border-indigo-200')}>
                        <div className="text-[8px] font-black uppercase tracking-widest text-indigo-400/70 mb-0.5">Slots</div>
                        <div className="text-xl font-black text-indigo-400">{intradaySlots.length}</div>
                        <div className="text-[8px] text-gray-500">{timeframe}m</div>
                    </div>
                </div>
            </div>

            {/* RESULTS */}
            {results && !loading && (
                <div className="flex flex-col gap-0 animate-in fade-in slide-in-from-bottom-4 duration-400">

                    {/* Error / No trades */}
                    {results.error ? (
                        <div className="p-3 rounded-xl mb-3 bg-amber-500/10 border border-amber-500/20 flex items-center gap-2">
                            <AlertCircle size={13} className="text-amber-400 shrink-0"/>
                            <span className="text-[10px] font-bold text-amber-400">{results.error}</span>
                        </div>
                    ) : results.trades.length === 0 ? (
                        <div className={clsx('p-3 rounded-xl mb-3 border text-center', dark ? 'bg-zinc-900 border-white/5' : 'bg-gray-50 border-gray-200')}>
                            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">
                                No trades matched. Try relaxing VWAP / Volume filters.
                            </span>
                        </div>
                    ) : null}

                    {K && (
                        <div className={clsx('rounded-2xl border', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>

                            {/* TAB BAR */}
                            <div className={clsx('flex items-center border-b px-4', dark ? 'border-white/5' : 'border-gray-200')}>
                                {[['overview','Overview'],['performance','Performance Summary'],['trades','List of Trades']].map(([tab, label]) => (
                                    <button key={tab} onClick={() => setActiveTab(tab)}
                                        className={clsx('px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all -mb-px',
                                            activeTab === tab
                                                ? 'border-indigo-500 text-indigo-400'
                                                : 'border-transparent text-gray-500 hover:text-gray-400')}>
                                        {label}
                                    </button>
                                ))}
                                <div className="ml-auto pr-1 flex items-center gap-2 text-[9px] text-gray-600 font-bold">
                                    {/* Segment Badge */}
                                    <span className={clsx('px-2 py-0.5 rounded-md border text-[8px] font-black uppercase tracking-widest', segmentColor)}>
                                        {segmentLabel}
                                    </span>
                                    {instrumentInfo && segment !== 'EQ_INTRADAY' && (
                                        <span className="text-indigo-400/70 font-bold text-[8px]">
                                            Lot Size: {instrumentInfo.lot_size}
                                        </span>
                                    )}
                                    {selectedSymbol} · {direction} · {entrySlot}→{exitSlot}
                                </div>
                            </div>

                            {/* ── OVERVIEW TAB ── */}
                            {activeTab === 'overview' && (
                                <div className="p-4 flex flex-col gap-4">
                                    {/* Quick stats strip */}
                                    <div className={clsx('flex items-center justify-center divide-x rounded-xl py-3', dark ? 'divide-white/5 bg-zinc-900/40' : 'divide-gray-200 bg-gray-50')}>
                                        <Stat label="Net Profit"    value={`₹${parseFloat(K.netProfit) >= 0 ? '+' : ''}${Number(K.netProfit).toLocaleString('en-IN')}`}   color={kpiColor(K.netProfit, true, dark)}/>
                                        <Stat label="Net Return"    value={`${K.netPct}%`}       color={kpiColor(K.netPct, true, dark)}/>
                                        <Stat label="Total Trades"  value={K.totalTrades}         color={dark ? 'text-white' : 'text-gray-900'}/>
                                        <Stat label="Win Rate"      value={`${K.winRate}%`}       color={kpiColor(K.winRate, true, dark)}/>
                                        <Stat label="Profit Factor" value={K.profitFactor}        color={kpiColor(K.profitFactor, true, dark)}/>
                                        <Stat label="Max Drawdown"  value={`${K.maxDrawdown}%`}  color="text-rose-500"/>
                                        <Stat label="Sharpe"        value={K.sharpe}              color={kpiColor(K.sharpe, true, dark)}/>
                                        <Stat label="Sortino"       value={K.sortino}             color={kpiColor(K.sortino, true, dark)}/>
                                        {K.totalCharges !== undefined && (
                                            <Stat label="Total Charges" value={`₹${Number(K.totalCharges).toLocaleString('en-IN')}`} color="text-amber-500"/>
                                        )}
                                    </div>

                                    {/* Equity Curve */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <BarChart3 size={12} className="text-indigo-400"/>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Equity Curve</span>
                                            <span className="ml-auto text-[9px] text-gray-600">{results.trades.length} trades</span>
                                        </div>
                                        <div style={{ height: 200 }}>
                                            <Plot
                                                data={[{
                                                    x: results.equityDates, y: results.equityCurve,
                                                    type: 'scatter', mode: 'lines', fill: 'tozeroy',
                                                    fillcolor: 'rgba(99,102,241,0.07)',
                                                    line: { color: '#6366f1', width: 2, shape: 'spline' },
                                                    name: 'Equity',
                                                    hovertemplate: '%{x}<br>₹%{y:,.0f}<extra></extra>',
                                                }]}
                                                layout={{
                                                    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                                                    margin: { t: 8, b: 30, l: 70, r: 15 },
                                                    xaxis: { showgrid: false, zeroline: false, color: '#6b7280', tickfont: { size: 9 } },
                                                    yaxis: { gridcolor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)', zeroline: false, color: '#6b7280', tickformat: ',.0f', tickfont: { size: 9 } },
                                                    hovermode: 'x unified', showlegend: false,
                                                    shapes: [{
                                                        type: 'line', xref: 'paper', x0: 0, x1: 1,
                                                        yref: 'y', y0: Number(startingCapital), y1: Number(startingCapital),
                                                        line: { color: dark ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.5)', width: 1.5, dash: 'dash' }
                                                    }],
                                                }}
                                                config={{ displayModeBar: false, responsive: true }}
                                                style={{ width: '100%', height: '100%' }}
                                            />
                                        </div>
                                    </div>

                                    {/* Drawdown Chart */}
                                    <div>
                                        <div className="flex items-center gap-2 mb-2">
                                            <Activity size={12} className="text-rose-400"/>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Drawdown</span>
                                        </div>
                                        <div style={{ height: 130 }}>
                                            <Plot
                                                data={[{
                                                    x: results.drawdownSeries.map(d => d.date),
                                                    y: results.drawdownSeries.map(d => d.dd),
                                                    type: 'scatter', mode: 'lines', fill: 'tozeroy',
                                                    fillcolor: 'rgba(239,68,68,0.08)',
                                                    line: { color: '#ef4444', width: 1.5, shape: 'hv' },
                                                    hovertemplate: '%{x}<br>%{y:.2f}%<extra></extra>',
                                                }]}
                                                layout={{
                                                    paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
                                                    margin: { t: 4, b: 30, l: 52, r: 15 },
                                                    xaxis: { showgrid: false, zeroline: false, color: '#6b7280', tickfont: { size: 9 } },
                                                    yaxis: { gridcolor: dark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.04)', zeroline: false, color: '#6b7280', tickformat: '.1f', ticksuffix: '%', tickfont: { size: 9 } },
                                                    hovermode: 'x unified', showlegend: false,
                                                }}
                                                config={{ displayModeBar: false, responsive: true }}
                                                style={{ width: '100%', height: '100%' }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* ── PERFORMANCE SUMMARY TAB ── */}
                            {activeTab === 'performance' && (
                                <div className="p-4 overflow-x-auto">
                                    <table className="w-full">
                                        <thead>
                                            <tr className={clsx('text-[9px] font-black uppercase tracking-widest text-right border-b', dark ? 'text-gray-600 border-white/5' : 'text-gray-400 border-gray-200')}>
                                                <th className="pb-2.5 text-left font-black">Metric</th>
                                                <th className="pb-2.5 pr-4">All Trades</th>
                                                <th className="pb-2.5 pr-4">Long Trades</th>
                                                <th className="pb-2.5">Short Trades</th>
                                            </tr>
                                        </thead>
                                        <tbody className={dark ? 'text-gray-300' : 'text-gray-700'}>
                                            {/* Profitability */}
                                            <tr><td colSpan={4} className={clsx('pt-3 pb-1.5 text-[9px] font-black uppercase tracking-widest', dark ? 'text-indigo-400/70' : 'text-indigo-600/70')}>Profitability</td></tr>
                                            <PerfRow label="Net Profit (₹)"      all={K.netProfit}    long={L?.netProfit}    short={S?.netProfit}    dark={dark}/>
                                            <PerfRow label="Net Profit (%)"      all={K.netPct}       long={L?.netPct}       short={S?.netPct}       pct dark={dark}/>
                                            <PerfRow label="Gross Profit (₹)"    all={K.grossProfit}  long={L?.grossProfit}  short={S?.grossProfit}  dark={dark}/>
                                            <PerfRow label="Gross Loss (₹)"      all={`-${K.grossLoss}`} long={L ? `-${L.grossLoss}` : null} short={S ? `-${S.grossLoss}` : null} dark={dark}/>
                                            <PerfRow label="Profit Factor"        all={K.profitFactor} long={L?.profitFactor} short={S?.profitFactor} prefix="" dark={dark}/>
                                            {K.totalCharges !== undefined && (
                                                <PerfRow label="Total Charges (₹)" all={K.totalCharges} long={null} short={null} prefix="₹" dark={dark}/>
                                            )}

                                            {/* Risk */}
                                            <tr><td colSpan={4} className={clsx('pt-3 pb-1.5 text-[9px] font-black uppercase tracking-widest', dark ? 'text-indigo-400/70' : 'text-indigo-600/70')}>Risk-Adjusted</td></tr>
                                            <PerfRow label="Sharpe Ratio"    all={K.sharpe}       long={L ? K.sharpe : null}  short={S ? K.sortino : null} prefix="" dark={dark}/>
                                            <PerfRow label="Sortino Ratio"   all={K.sortino}      long={null}                 short={null}                 prefix="" dark={dark}/>
                                            <PerfRow label="Max Drawdown (%)" all={K.maxDrawdown} long={null}                 short={null}                 pct dark={dark}/>

                                            {/* Trade stats */}
                                            <tr><td colSpan={4} className={clsx('pt-3 pb-1.5 text-[9px] font-black uppercase tracking-widest', dark ? 'text-indigo-400/70' : 'text-indigo-600/70')}>Trade Statistics</td></tr>
                                            <PerfRow label="Total Closed Trades"   all={K.totalTrades}  long={L?.totalTrades ?? '—'}  short={S?.totalTrades ?? '—'}  prefix="" dark={dark}/>
                                            <PerfRow label="Winning Trades"        all={K.wins}         long={L?.wins ?? '—'}         short={S?.wins ?? '—'}         prefix="" dark={dark}/>
                                            <PerfRow label="Losing Trades"         all={K.losses}       long={L?.losses ?? '—'}       short={S?.losses ?? '—'}       prefix="" dark={dark}/>
                                            <PerfRow label="Win Rate (%)"          all={K.winRate}      long={L?.winRate}             short={S?.winRate}             pct dark={dark}/>
                                            <PerfRow label="Avg Trade (₹)"         all={K.avgTrade}     long={L?.avgTrade}            short={S?.avgTrade}            dark={dark}/>
                                            <PerfRow label="Avg Winning Trade (₹)" all={K.avgWin}       long={L?.avgWin}              short={S?.avgWin}              dark={dark}/>
                                            <PerfRow label="Avg Losing Trade (₹)"  all={K.avgLoss}      long={L?.avgLoss}             short={S?.avgLoss}             dark={dark}/>
                                            <PerfRow label="Largest Win (₹)"       all={K.largestWin}   long={L?.largestWin}          short={S?.largestWin}          dark={dark}/>
                                            <PerfRow label="Largest Loss (₹)"      all={K.largestLoss}  long={L?.largestLoss}         short={S?.largestLoss}         dark={dark}/>

                                            {/* Streaks */}
                                            <tr><td colSpan={4} className={clsx('pt-3 pb-1.5 text-[9px] font-black uppercase tracking-widest', dark ? 'text-indigo-400/70' : 'text-indigo-600/70')}>Streaks &amp; Slots</td></tr>
                                            <PerfRow label="Max Consecutive Wins"   all={K.maxConWins}   long={L?.maxConWins ?? '—'}   short={S?.maxConWins ?? '—'}   prefix="" dark={dark}/>
                                            <PerfRow label="Max Consecutive Losses" all={K.maxConLosses} long={L?.maxConLosses ?? '—'} short={S?.maxConLosses ?? '—'} prefix="" dark={dark}/>
                                            <PerfRow label="Avg Slots in Trade"     all={K.avgSlots}     long={L?.avgSlots ?? '—'}     short={S?.avgSlots ?? '—'}     prefix="" dark={dark}/>
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* ── LIST OF TRADES TAB ── */}
                            {activeTab === 'trades' && (
                                <div className="p-4 flex flex-col gap-3">
                                    {/* Toolbar */}
                                    <div className="flex items-center justify-between">
                                        <span className={clsx('text-[10px] font-black uppercase tracking-widest', dark ? 'text-gray-500' : 'text-gray-400')}>
                                            {results.trades.length} trades · page {page}/{totalPages || 1}
                                        </span>
                                        <button onClick={() => exportCSV(results.trades, selectedSymbol)}
                                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600/15 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white text-[9px] font-black uppercase tracking-widest transition-all">
                                            <Download size={11}/>Export CSV
                                        </button>
                                    </div>

                                    {/* Table */}
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left">
                                            <thead>
                                                <tr className={clsx('text-[9px] font-black uppercase tracking-widest border-b', dark ? 'text-gray-600 border-white/5' : 'text-gray-400 border-gray-200')}>
                                                    {[['#','#'],['date','Date'],['direction','Dir'],['entryTime','Entry'],['entryPrice','Entry ₹'],
                                                      ['exitTime','Exit'],['exitPrice','Exit ₹'],['qty','Qty'],['grossPnl','Gross PnL'],
                                                      ['slippageCost','Slip'],['charges','Charges'],['pnl','Net PnL'],['ret','Ret %'],['cumPnl','Cum PnL'],['equity','Equity']
                                                    ].map(([col, hdr]) => (
                                                        <th key={col} onClick={() => col !== '#' && handleSort(col)}
                                                            className={clsx('pb-2.5 pr-4 last:pr-0 whitespace-nowrap', col !== '#' && 'cursor-pointer select-none hover:text-indigo-400 transition-colors')}>
                                                            {hdr}<SortIcon col={col} active={sortCol} dir={sortDir}/>
                                                        </th>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className={clsx('text-[10px] font-semibold', dark ? 'text-gray-300' : 'text-gray-700')}>
                                                {pageTrades.map((t, i) => {
                                                    const win = t.pnl >= 0;
                                                    return (
                                                        <tr key={i} className={clsx('border-b transition-colors',
                                                            dark
                                                                ? win ? 'border-white/[0.025] hover:bg-emerald-500/[0.04]' : 'border-white/[0.025] hover:bg-rose-500/[0.04]'
                                                                : win ? 'border-gray-100 hover:bg-emerald-50' : 'border-gray-100 hover:bg-rose-50')}>
                                                            <td className="py-2 pr-4 text-gray-500">{(page-1)*PAGE_SIZE + i + 1}</td>
                                                            <td className="py-2 pr-4 text-gray-500 whitespace-nowrap">{t.date}</td>
                                                            <td className={clsx('py-2 pr-4 font-black text-[9px] uppercase', t.direction === 'Long' ? 'text-emerald-500' : 'text-rose-500')}>{t.direction}</td>
                                                            <td className="py-2 pr-4">{t.entryTime}</td>
                                                            <td className="py-2 pr-4 tabular-nums">₹{t.entryPrice.toFixed(2)}</td>
                                                            <td className="py-2 pr-4">{t.exitTime}</td>
                                                            <td className="py-2 pr-4 tabular-nums">₹{t.exitPrice.toFixed(2)}</td>
                                                            <td className="py-2 pr-4 tabular-nums">{t.qty.toLocaleString()}</td>
                                                            <td className={clsx('py-2 pr-4 tabular-nums', win ? 'text-emerald-500' : 'text-rose-500')}>
                                                                {win ? '+' : ''}₹{t.grossPnl.toFixed(0)}
                                                            </td>
                                                            <td className="py-2 pr-4 tabular-nums text-gray-500">₹{t.slippageCost.toFixed(0)}</td>
                                                            {/* Charges Column */}
                                                            <td className="py-2 pr-4 tabular-nums text-amber-500" title={t.chargeDetails ? `Brokerage: ₹${t.chargeDetails.brokerage} | STT: ₹${t.chargeDetails.stt} | GST: ₹${t.chargeDetails.gst} | Txn: ₹${t.chargeDetails.txnCharge} | SEBI: ₹${t.chargeDetails.sebi} | Stamp: ₹${t.chargeDetails.stampDuty}${t.chargeDetails.dpCharges ? ` | DP: ₹${t.chargeDetails.dpCharges}` : ''}` : ''}>
                                                                ₹{(t.charges || 0).toFixed(0)}
                                                            </td>
                                                            <td className={clsx('py-2 pr-4 tabular-nums font-black', win ? 'text-emerald-500' : 'text-rose-500')}>
                                                                {win ? '+' : ''}₹{t.pnl.toFixed(0)}
                                                            </td>
                                                            <td className={clsx('py-2 pr-4 tabular-nums font-black', win ? 'text-emerald-500' : 'text-rose-500')}>
                                                                {win ? '+' : ''}{t.ret.toFixed(2)}%
                                                            </td>
                                                            <td className={clsx('py-2 pr-4 tabular-nums', t.cumPnl >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                                                                {t.cumPnl >= 0 ? '+' : ''}₹{t.cumPnl.toFixed(0)}
                                                            </td>
                                                            <td className="py-2 tabular-nums">₹{t.equity.toFixed(0)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Pagination */}
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-center gap-2 pt-2">
                                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                                                className={clsx('p-1.5 rounded-lg border transition-all', dark ? 'border-white/5 hover:border-indigo-500 text-gray-400 hover:text-white disabled:opacity-20' : 'border-gray-200 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 disabled:opacity-30')}>
                                                <ChevronLeft size={14}/>
                                            </button>
                                            <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">
                                                {page} / {totalPages}
                                            </span>
                                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                                                className={clsx('p-1.5 rounded-lg border transition-all', dark ? 'border-white/5 hover:border-indigo-500 text-gray-400 hover:text-white disabled:opacity-20' : 'border-gray-200 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 disabled:opacity-30')}>
                                                <ChevronRight size={14}/>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* EMPTY STATE */}
            {!simData && !loading && (
                <div className="flex-1 flex flex-col items-center justify-center opacity-20 select-none">
                    <TrendingUp size={56} className="text-indigo-500 mb-4"/>
                    <p className="text-sm font-black uppercase tracking-[0.3em] text-center">
                        Configure parameters above and click Load &amp; Simulate
                    </p>
                </div>
            )}
            </>)}
        </div>
    );
};

export default StrategySimulatorView;
