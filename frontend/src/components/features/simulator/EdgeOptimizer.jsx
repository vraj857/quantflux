import React, { useState, useMemo } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { Download, Crosshair, Trophy, Target, Activity } from 'lucide-react';
import { generateSlots } from './simEngine';
import { calculateCharges } from './chargesEngine';

// ─── Toggle Helper ─────────────────────────────────────────────────────────────
const Toggle = ({ value, onChange, label, dark }) => (
    <div className="flex items-center justify-between gap-3 py-0.5">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</span>
        <button onClick={() => onChange(!value)}
            className={clsx('relative w-10 h-5 rounded-full transition-all shrink-0', value ? 'bg-indigo-600' : dark ? 'bg-zinc-700' : 'bg-gray-300')}>
            <span className={clsx('absolute top-0.5 w-4 h-4 bg-white rounded-full shadow-md transition-all duration-200', value ? 'left-5' : 'left-0.5')} />
        </button>
    </div>
);

// ─── CSV Export ─────────────────────────────────────────────────────────────────
function exportHeatmapCSV(matrix, symbol) {
    const hdr = ['Entry Slot', 'Exit Slot', 'Win Rate (%)', 'Total PnL (%)'];
    const rows = matrix.map(r => [r.entry, r.exit, r.winRate.toFixed(2), r.pnl.toFixed(2)]);
    const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), {
        href: url, download: `edge_optimizer_${symbol}_${new Date().toISOString().split('T')[0]}.csv`,
    });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}


function getSegment(symbol) {
    const s = symbol.toUpperCase();
    if (s.endsWith('FUT')) return 'FNO_FUT';
    if (s.match(/\d+(CE|PE)$/)) return 'FNO_OPT';
    if (s.includes('NIFTY') || s.includes('BANKNIFTY')) {
        if (!s.includes('-EQ')) return 'FNO_FUT';
    }
    return 'EQ_INTRADAY';
}

// ─── Optimization Matrix Builder ───────────────────────────────────────────────
function buildOptMatrix(simData, direction, slippage, requireVWAP, requireVolSpike, volThreshold, smartEOD) {
    const intraday = generateSlots(simData.timeframe);
    const slots = [...intraday, 'NextDayOpen'];
    const slipPct = Number(slippage) / 100;
    const flatResults = [];
    const lastIntradaySlot = intraday[intraday.length - 1];
    
    const symbol = simData.symbol || '';
    const segment = getSegment(symbol);
    const lotSize = simData.lotSize || 1;

    // --- High-Performance Tax Model ---
    // Instead of calling calculateCharges millions of times, we pre-calc factors.
    // Estimates for Apr 1, 2026 normas:
    let taxFactor = 0.0006; // Default (~6 bps)
    let flatFee = 0;
    
    if (segment === 'EQ_INTRADAY') taxFactor = 0.0007; // Brokerage + STT (sell) + Txn + GST
    else if (segment === 'FNO_FUT') taxFactor = 0.0009; // Higher STT in 2026 (0.05% on Sell)
    else if (segment === 'FNO_OPT') { taxFactor = 0.0020; flatFee = 47.20; } // ₹40 + GST + STT (0.15% sell premium)
    
    for (let ei = 0; ei < slots.length; ei++) {
        for (let xi = ei + 1; xi < slots.length; xi++) {
            const entry = slots[ei];
            const exit = slots[xi];
            let wins = 0, total = 0, cumPnlPct = 0;
            let grossProfit = 0, grossLoss = 0;
            let peakPnl = 0, currentCumPnl = 0, maxDD = 0;

            for (const day of simData.days) {
                const eC = day.slots[entry];
                let xC = day.slots[exit];
                if (!eC || !xC) continue;

                // --- FILTERS ---
                if (requireVWAP && eC.vwap != null) {
                    if (direction === 'Long' && eC.price <= eC.vwap) continue;
                    if (direction === 'Short' && eC.price >= eC.vwap) continue;
                }
                if (requireVolSpike && ei > 0) {
                    const prevC = day.slots[slots[ei - 1]];
                    if (!prevC?.volume || eC.volume <= Number(volThreshold) * (prevC.volume || 1)) continue;
                }

                const entryPrice = eC.price;
                let exitPrice = xC.price;

                // --- SMART EOD EXIT ---
                if (smartEOD && exit === 'NextDayOpen') {
                    const eodC = day.slots[lastIntradaySlot];
                    if (eodC) {
                        const isLossAtEod = direction === 'Long' ? eodC.price < entryPrice : eodC.price > entryPrice;
                        if (isLossAtEod) exitPrice = eodC.price;
                    }
                }

                const grossPnl = direction === 'Long' ? (exitPrice - entryPrice) : (entryPrice - exitPrice);
                const slippageAmt = entryPrice * slipPct;
                
                // Optimized net calculation (Net = Gross - Slippage - (Turnover * factor) - Flat)
                const turnover = entryPrice + exitPrice;
                const netPnlPerUnit = grossPnl - slippageAmt - (turnover * taxFactor) - (flatFee / lotSize);
                const ret = (netPnlPerUnit / entryPrice) * 100;

                // Track Equity Curve for MDD
                currentCumPnl += ret;
                if (currentCumPnl > peakPnl) peakPnl = currentCumPnl;
                const drawdown = peakPnl - currentCumPnl;
                if (drawdown > maxDD) maxDD = drawdown;

                cumPnlPct += ret;
                if (netPnlPerUnit > 0) {
                    wins++;
                    grossProfit += (netPnlPerUnit * lotSize);
                } else {
                    grossLoss += Math.abs(netPnlPerUnit * lotSize);
                }
                total++;
            }

            if (total > 0) {
                const pf = grossLoss === 0 ? (grossProfit > 0 ? 100 : 0) : grossProfit / grossLoss;
                flatResults.push({
                    entry, exit, ei, xi,
                    pnl: cumPnlPct,
                    winRate: (wins / total) * 100,
                    profitFactor: pf,
                    maxDrawdown: maxDD,
                    totalDays: total
                });
            }
        }
    }
    return { flatResults, slots };
}

// ─── COMPONENT ─────────────────────────────────────────────────────────────────
const EdgeOptimizer = ({ simData, theme, selectedSymbol, startingSlippage = 0.05 }) => {
    const dark = theme === 'dark';

    const [direction, setDirection] = useState('Long');
    const [requireVWAP, setRequireVWAP] = useState(true);
    const [requireVolSpike, setRequireVolSpike] = useState(false);
    const [smartEOD, setSmartEOD] = useState(true);
    const [volThreshold, setVolThreshold] = useState(1.5);
    const [slippage, setSlippage] = useState(startingSlippage);
    const [minWinRate, setMinWinRate] = useState(55);
    const [minProfitFactor, setMinProfitFactor] = useState(1.5);
    const [maxDDLimit, setMaxDDLimit] = useState(5.0);
    const [selectedMetric, setSelectedMetric] = useState('pnl'); // 'pnl', 'winRate', 'profitFactor', 'maxDrawdown', 'totalDays'

    // ── Matrix computation (memoized) ──────────────────────────────────────────
    const { flatResults, filteredResults, slots, optimal, peaks, zData, zText, hoverText } = useMemo(() => {
        if (!simData) return { flatResults: [], filteredResults: [], slots: [], optimal: null, peaks: { pnl: null, winRate: null, profitFactor: null, maxDrawdown: null, totalDays: null }, zData: [], zText: [], hoverText: [] };

        const { flatResults, slots } = buildOptMatrix(
            simData, direction, slippage, requireVWAP, requireVolSpike, volThreshold, smartEOD
        );

        const n = slots.length;
        const zData = Array.from({ length: n }, () => Array(n).fill(null));
        const zText = Array.from({ length: n }, () => Array(n).fill(''));
        const hoverText = Array.from({ length: n }, () => Array(n).fill(''));
        let filteredResults = [];

        let optimal = null;
        let peaks = {
            pnl: null,
            winRate: null,
            profitFactor: null,
            maxDrawdown: null, // This tracks the "Min-Max Drawdown" (safest)
            totalDays: null
        };

        for (const r of flatResults) {
            // APPLY THRESHOLDS (Determine if "DNA Matched")
            const satisfiesFilters = r.winRate >= minWinRate && r.profitFactor >= minProfitFactor && r.maxDrawdown <= maxDDLimit;

            // Always Populate Matrix Visibility
            const val = r[selectedMetric];
            zData[r.ei][r.xi] = val;

            // Only show text label if filtered in
            if (satisfiesFilters) {
                let txt = '';
                if (selectedMetric === 'totalDays') txt = val.toString();
                else if (selectedMetric === 'pnl' || selectedMetric === 'winRate' || selectedMetric === 'maxDrawdown') txt = val.toFixed(1);
                else txt = val.toFixed(2);

                zText[r.ei][r.xi] = txt;
                filteredResults.push(r);

                // Track Peaks
                if (!optimal || r.pnl > optimal.pnl) optimal = r;
                if (!peaks.pnl || r.pnl > peaks.pnl.pnl) peaks.pnl = r;
                if (!peaks.winRate || r.winRate > peaks.winRate.winRate) peaks.winRate = r;
                if (!peaks.profitFactor || r.profitFactor > peaks.profitFactor.profitFactor) peaks.profitFactor = r;
                if (!peaks.maxDrawdown || r.maxDrawdown < peaks.maxDrawdown.maxDrawdown) peaks.maxDrawdown = r; // Lowest DD is best
                if (!peaks.totalDays || r.totalDays > peaks.totalDays.totalDays) peaks.totalDays = r;
            }

            hoverText[r.ei][r.xi] = [
                `<b>${r.entry} → ${r.exit}</b>`,
                `Net PnL: <b>${r.pnl >= 0 ? '+' : ''}${r.pnl.toFixed(2)}%</b>`,
                `Win Rate: ${r.winRate.toFixed(1)}%`,
                `Profit Factor: ${r.profitFactor.toFixed(2)}`,
                `Max Drawdown: <span style="color: #fca5a5">${r.maxDrawdown.toFixed(2)}%</span>`,
                `Days Traded: ${r.totalDays}`,
                !satisfiesFilters ? `<span style="color: #ef4444"><b>FILTER MISS [DNA REJECTED]</b></span>` : `<span style="color: #22c55e"><b>DNA MATCHED</b></span>`,
                smartEOD && r.exit === 'NextDayOpen' ? `Smart EOD: Active` : '',
            ].filter(Boolean).join('<br>');
        }

        return { flatResults, filteredResults, slots, optimal, peaks, zData, zText, hoverText };
    }, [simData, direction, slippage, requireVWAP, requireVolSpike, volThreshold, smartEOD, minWinRate, minProfitFactor, maxDDLimit, selectedMetric]);

    if (!simData) {
        return (
            <div className="flex flex-col items-center justify-center h-64 opacity-20 select-none">
                <Crosshair size={48} className="text-indigo-500 mb-4" />
                <p className="text-xs font-black uppercase tracking-[0.2em] text-center">
                    Load data first to generate the Optimization Matrix
                </p>
            </div>
        );
    }

    const inputCls = clsx('w-full border rounded-xl p-2.5 text-xs outline-none transition-all font-bold',
        dark ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300');
    const cardCls = clsx('rounded-2xl border p-4', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200');
    const labelCls = 'text-[10px] font-bold text-gray-400 block mb-1.5 uppercase tracking-wider';

    // ── Heatmap chart config ───────────────────────────────────────────────────
    const n = slots.length;
    const cellPx = Math.max(28, Math.min(46, Math.floor(620 / n)));
    const chartH = n * cellPx + 160;
    const chartPaper = dark ? '#0a0a0a' : '#ffffff';
    const chartPlot = dark ? '#0d0d0d' : '#f9fafb';
    const textColor = dark ? '#d1d5db' : '#374151';
    const mutedColor = dark ? '#6b7280' : '#9ca3af';
    const gridLine = dark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

    // Build Plotly annotations: one per valid cell with PnL value as text
    const cellAnnotations = [];
    for (const r of flatResults) {
        const isOptimal = optimal && r.ei === optimal.ei && r.xi === optimal.xi;
        const passFilters = r.winRate >= minWinRate && r.profitFactor >= minProfitFactor && r.maxDrawdown <= maxDDLimit;

        if (passFilters && zText[r.ei][r.xi]) {
            cellAnnotations.push({
                x: slots[r.xi],
                y: slots[r.ei],
                xref: 'x',
                yref: 'y',
                text: zText[r.ei][r.xi],
                showarrow: false,
                font: {
                    size: Math.max(8, cellPx * 0.32),
                    color: dark ? '#ffffff' : '#111827',
                    family: 'monospace',
                    weight: isOptimal ? 'bold' : 'normal'
                },
                ...(isOptimal ? {
                    bgcolor: 'rgba(250,204,21,0.22)',
                    bordercolor: '#facc15',
                    borderwidth: 2,
                    borderpad: 2,
                } : {}),
            });
        }
    }

    // Dynamic colorscale logic
    let colorscale = [];
    let zBound = 0;
    let zMid = 0;
    let metricLabel = '';

    if (selectedMetric === 'pnl') {
        metricLabel = 'Total Net PnL %';
        colorscale = [
            [0.00, '#8b0000'], [0.25, '#c0392b'], [0.45, '#e67e22'],
            [0.50, dark ? '#1c1c1c' : '#f3f4f6'],
            [0.55, '#27ae60'], [0.75, '#16a34a'], [1.00, '#064e3b'],
        ];
        const all = flatResults.map(r => r.pnl);
        const absMax = Math.max(Math.abs(Math.min(...all)), Math.abs(Math.max(...all)));
        zBound = Math.ceil(absMax / 5) * 5 || 10;
        zMid = 0;
    } else if (selectedMetric === 'winRate') {
        metricLabel = 'Win Rate %';
        colorscale = [
            [0.00, '#c0392b'], [0.50, '#facc15'], [1.00, '#16a34a']
        ];
        zBound = 100;
        zMid = 50;
    } else if (selectedMetric === 'profitFactor') {
        metricLabel = 'Profit Factor';
        colorscale = [
            [0.00, dark ? '#1c1c1c' : '#f3f4f6'], [0.20, '#d1d5db'], [0.40, '#a5b4fc'], [1.00, '#4f46e5']
        ];
        zBound = Math.max(2, ...flatResults.map(r => r.profitFactor));
        zMid = 1;
    } else {
        metricLabel = 'Total Trades';
        colorscale = [
            [0.00, dark ? '#1c1c1c' : '#f3f4f6'], [1.00, '#0ea5e9']
        ];
        zBound = Math.max(1, ...flatResults.map(r => r.totalDays));
        zMid = zBound / 2;
    }

    const filterDesc = [
        requireVWAP ? 'VWAP Break' : null,
        requireVolSpike ? `Vol ${volThreshold}×` : null,
        smartEOD ? 'Smart EOD' : null,
        !requireVWAP && !requireVolSpike && !smartEOD ? 'Unconditional Trades' : null,
    ].filter(Boolean).join(' · ') || 'Unconditional Trades';

    const chartTitle = `${selectedSymbol || '—'} Edge Optimizer (${filterDesc})`;

    return (
        <div className="flex flex-col gap-4">

            {/* ── PROFESSIONAL QUANT CONTROL STRIP ────────────────────────── */}
            <div className="flex flex-wrap items-stretch gap-3">

                {/* 1. Strategy Profile */}
                <div className={clsx('flex flex-col gap-3 px-4 py-3 rounded-2xl border min-w-[140px]', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60 flex items-center gap-1.5">
                        <Target size={10} /> Strategy Profile
                    </div>
                    <div className="flex flex-col gap-3">
                        <div className={clsx('flex p-1 rounded-xl border', dark ? 'bg-black/20 border-white/5' : 'bg-gray-100 border-gray-200')}>
                            {['Long', 'Short'].map(d => (
                                <button key={d} onClick={() => setDirection(d)}
                                    className={clsx('flex-1 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                                        direction === d
                                            ? d === 'Long' ? 'bg-emerald-600 text-white shadow-md' : 'bg-rose-600 text-white shadow-md'
                                            : dark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-800')}>
                                    {d}
                                </button>
                            ))}
                        </div>
                        <div className="flex flex-col gap-1">
                            <label className={labelCls}>Slippage (%)</label>
                            <input type="number" value={slippage} onChange={e => setSlippage(e.target.value)}
                                className={clsx('w-full border rounded-lg px-2 py-1.5 text-[10px] outline-none transition-all font-bold',
                                    dark ? 'bg-black text-white border-white/10' : 'bg-gray-50 text-gray-900 border-gray-300')}
                                step="0.01" min="0" max="5" />
                        </div>
                    </div>
                </div>

                {/* 2 & 3. Execution Strategy (Entry & Exit Combined) */}
                <div className={clsx('flex flex-col gap-3 px-4 py-3 rounded-2xl border grow', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60 flex items-center gap-1.5">
                        <Activity size={10} /> Execution Strategy
                    </div>
                    <div className="flex items-stretch gap-6 h-full">
                        {/* Entry Logic */}
                        <div className="flex flex-col gap-2 min-w-[120px]">
                            <div className="text-[7px] font-black uppercase text-gray-500/80 mb-0.5 tracking-wider">Entry</div>
                            <Toggle value={requireVWAP} onChange={setRequireVWAP} label="Price > VWAP" dark={dark} />
                            <Toggle value={requireVolSpike} onChange={setRequireVolSpike} label="Vol Spike" dark={dark} />
                        </div>

                        {/* Optional Vol Mult Slider */}
                        {requireVolSpike && (
                            <div className="grow max-w-[120px]">
                                <div className="text-[7px] font-black uppercase text-gray-500/80 mb-0.5 tracking-wider">Threshold</div>
                                <label className={labelCls}>Vol · <span className="text-indigo-400">{volThreshold}×</span></label>
                                <input type="range" min="1" max="3" step="0.1" value={volThreshold}
                                    onChange={e => setVolThreshold(Number(e.target.value))} className="w-full accent-indigo-500 mt-1" />
                                <div className="flex justify-between text-[7px] text-gray-600 mt-0.5"><span>1.0×</span><span>3.0×</span></div>
                            </div>
                        )}

                        {/* Divider */}
                        <div className={clsx('w-px self-stretch my-1', dark ? 'bg-white/10' : 'bg-gray-200/80')} />

                        {/* Exit Logic */}
                        <div className="flex flex-col gap-2 min-w-[150px]">
                            <div className="text-[7px] font-black uppercase text-gray-500/80 mb-0.5 tracking-wider">Exit</div>
                            <Toggle value={smartEOD} onChange={setSmartEOD} label="Smart EOD Exit" dark={dark} />
                            <div className="text-[8px] text-gray-500 leading-tight">
                                Auto-square off at 3:15 if in loss.<br />Hold for NextOpen if profitable.
                            </div>
                        </div>
                    </div>
                </div>

                {/* 4. Quality Constraints */}
                <div className={clsx('flex flex-col gap-3 px-4 py-3 rounded-2xl border grow', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                    <div className="text-[8px] font-black uppercase tracking-widest text-indigo-400/60 flex items-center gap-1.5">
                        <Trophy size={10} /> Optimizer Constraints
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="grow">
                            <label className={labelCls}>Win Rate · <span className="text-indigo-400">{minWinRate}%</span></label>
                            <input type="range" min="0" max="90" step="5" value={minWinRate}
                                onChange={e => setMinWinRate(Number(e.target.value))} className="w-full accent-indigo-500 mt-1" />
                            <div className="flex justify-between text-[7px] text-gray-600 mt-0.5"><span>0%</span><span>90%</span></div>
                        </div>
                        <div className="grow">
                            <label className={labelCls}>Prof. Factor · <span className="text-indigo-400">{minProfitFactor.toFixed(1)}</span></label>
                            <input type="range" min="0" max="5" step="0.1" value={minProfitFactor}
                                onChange={e => setMinProfitFactor(Number(e.target.value))} className="w-full accent-indigo-500 mt-1" />
                            <div className="flex justify-between text-[7px] text-gray-600 mt-0.5"><span>0.0</span><span>5.0</span></div>
                        </div>
                        <div className="grow">
                            <label className={labelCls}>Max DD · <span className="text-rose-500">{maxDDLimit.toFixed(1)}%</span></label>
                            <input type="range" min="0.5" max="25" step="0.5" value={maxDDLimit}
                                onChange={e => setMaxDDLimit(Number(e.target.value))} className="w-full accent-rose-500 mt-1" />
                            <div className="flex justify-between text-[7px] text-gray-600 mt-0.5"><span>0.5%</span><span>25%</span></div>
                        </div>
                    </div>
                </div>

                {/* 5. System Status */}
                <div className="flex flex-col gap-2 min-w-[120px]">
                    <div className={clsx('flex-1 rounded-2xl border px-4 py-3 text-center flex flex-col justify-center',
                        dark ? 'bg-indigo-600/5 border-indigo-500/10' : 'bg-indigo-50 border-indigo-200')}>
                        <div className="text-[7px] font-black uppercase tracking-[0.15em] text-indigo-400/70 mb-1">DNA Matched</div>
                        <div className="text-2xl font-black text-indigo-400 tracking-tighter leading-none">
                            {filteredResults.length.toLocaleString()}
                        </div>
                    </div>
                    <button onClick={() => exportHeatmapCSV(filteredResults, selectedSymbol)}
                        title="Export Filtered Matrix"
                        className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-indigo-500/20 active:scale-95">
                        <Download size={12} /> Export
                    </button>
                </div>
            </div>

            {/* ── METRIC NAVIGATION ─────────────────────────────────────────── */}
            <div className="flex items-center gap-1 p-1 rounded-xl bg-indigo-600/5 border border-indigo-500/10 self-start">
                {[
                    { id: 'pnl', label: 'Net PnL %', icon: Activity },
                    { id: 'winRate', label: 'Win Rate %', icon: Trophy },
                    { id: 'profitFactor', label: 'Prof. Factor', icon: Target },
                    { id: 'maxDrawdown', label: 'Max DD %', icon: Activity },
                    { id: 'totalDays', label: 'Trades (N)', icon: Crosshair },
                ].map(m => (
                    <button key={m.id} onClick={() => setSelectedMetric(m.id)}
                        className={clsx('flex items-center gap-2 px-4 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all',
                            selectedMetric === m.id
                                ? 'bg-indigo-600 text-white shadow-md'
                                : dark ? 'text-gray-400 hover:text-white hover:bg-white/5' : 'text-gray-500 hover:text-gray-800 hover:bg-gray-100')}>
                        <m.icon size={10} /> {m.label}
                    </button>
                ))}
            </div>

            {/* ── HEATMAP CHART ───────────────────────────────────────────── */}
            <div className={clsx('rounded-2xl border overflow-hidden', dark ? 'border-white/5' : 'border-gray-200')}>
                <div style={{ height: chartH, background: chartPaper }}>
                    <Plot
                        data={[{
                            z: zData,
                            x: slots,
                            y: slots,
                            type: 'heatmap',
                            colorscale: selectedMetric === 'maxDrawdown'
                                ? [[0, dark ? '#1c1c1c' : '#f9fafb'], [0.2, '#fed7aa'], [0.5, '#ef4444'], [1, '#7f1d1d']]
                                : colorscale,
                            zmin: selectedMetric === 'pnl' ? -zBound : 0,
                            zmax: zBound,
                            zmid: zMid,
                            hoverongaps: false,
                            text: hoverText,
                            hoverinfo: 'text',
                            xgap: 2,
                            ygap: 2,
                            colorbar: {
                                title: {
                                    text: metricLabel,
                                    font: { size: 10, color: mutedColor },
                                    side: 'right',
                                },
                                tickfont: { size: 9, color: mutedColor },
                                thickness: 14,
                                len: 0.88,
                                bgcolor: 'rgba(0,0,0,0)',
                                bordercolor: gridLine,
                                borderwidth: 1,
                            },
                        }]}
                        layout={{
                            paper_bgcolor: chartPaper,
                            plot_bgcolor: chartPlot,
                            margin: { t: 60, b: 90, l: 72, r: 80 },
                            title: {
                                text: chartTitle,
                                font: { size: 13, color: textColor, family: 'Inter, sans-serif' },
                                x: 0.5,
                                xanchor: 'center',
                                y: 0.98,
                            },
                            xaxis: {
                                title: {
                                    text: 'Exit Slot',
                                    font: { size: 11, color: mutedColor },
                                    standoff: 12,
                                },
                                tickfont: { size: 9, color: mutedColor },
                                tickangle: -45,
                                side: 'bottom',
                                gridcolor: 'rgba(255,255,255,0)',
                                linecolor: gridLine,
                            },
                            yaxis: {
                                title: {
                                    text: 'Entry Slot',
                                    font: { size: 11, color: mutedColor },
                                    standoff: 10,
                                },
                                tickfont: { size: 9, color: mutedColor },
                                autorange: 'reversed',
                                gridcolor: 'rgba(255,255,255,0)',
                                linecolor: gridLine,
                            },
                            annotations: cellAnnotations,
                            hoverlabel: {
                                bgcolor: dark ? '#18181b' : '#ffffff',
                                bordercolor: dark ? '#3f3f46' : '#e5e7eb',
                                font: { size: 11, color: dark ? '#e4e4e7' : '#111827' },
                            },
                        }}
                        config={{ displayModeBar: false, responsive: true }}
                        style={{ width: '100%', height: '100%' }}
                    />
                </div>
            </div>

            {/* ── KPI PANEL & PEAK MATRIX ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 1. Best Overall (PnL Focus) */}
                {optimal && (
                    <div className={clsx(cardCls, 'lg:col-span-1')}>
                        <div className="flex items-center gap-2 mb-4">
                            <Trophy size={13} className="text-amber-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Primary Alpha DNA</span>
                            <span className={clsx('ml-auto text-[9px] font-black uppercase tracking-widest px-2.5 py-1 rounded-lg border',
                                dark ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-amber-50 border-amber-200 text-amber-600')}>
                                ★ Max PnL
                            </span>
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            {[
                                { icon: Target, label: 'Entry', value: optimal.entry, color: dark ? 'text-white' : 'text-gray-900' },
                                { icon: Activity, label: 'Exit', value: optimal.exit, color: dark ? 'text-white' : 'text-gray-900' },
                                { icon: null, label: 'Net PnL', value: `${optimal.pnl >= 0 ? '+' : ''}${optimal.pnl.toFixed(2)}%`, color: optimal.pnl >= 0 ? 'text-emerald-500' : 'text-rose-500' },
                                { icon: null, label: 'Win Rate', value: `${optimal.winRate.toFixed(1)}%`, color: optimal.winRate >= 50 ? 'text-emerald-500' : 'text-rose-500' },
                            ].map(({ icon: Icon, label, value, color }) => (
                                <div key={label} className={clsx('rounded-xl border p-3 text-center', dark ? 'bg-zinc-900/50 border-white/5' : 'bg-gray-50 border-gray-200')}>
                                    <div className="flex items-center justify-center gap-1 mb-1">
                                        {Icon && <Icon size={11} className="text-indigo-400 opacity-60" />}
                                        <span className="text-[8px] font-black uppercase tracking-widest text-gray-500">{label}</span>
                                    </div>
                                    <div className={clsx('text-lg font-black tabular-nums tracking-tight', color)}>{value}</div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* 2. Peak Matrix Table */}
                <div className={clsx(cardCls, 'lg:col-span-2')}>
                    <div className="flex items-center gap-2 mb-4">
                        <Activity size={13} className="text-indigo-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Quantitative Peak Matrix</span>
                        <div className="ml-auto text-[8px] text-gray-500 italic">Validating best combination per metric category</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-separate border-spacing-y-1.5">
                                    <thead>
                                        <tr className="text-[8px] font-black uppercase tracking-widest text-gray-500/60">
                                            <th className="px-3 pb-1">Optimization Goal</th>
                                            <th className="px-3 pb-1">Entry</th>
                                            <th className="px-3 pb-1">Exit</th>
                                            <th className="px-3 pb-1 text-right">Net PnL %</th>
                                            <th className="px-3 pb-1 text-right">Win Rate %</th>
                                            <th className="px-3 pb-1 text-right">Prof. Factor</th>
                                            <th className="px-3 pb-1 text-right">Max DD %</th>
                                            <th className="px-3 pb-1 text-right">Trades (N)</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-[10px] font-bold">
                                        {[
                                            { label: 'Max Total PnL (%)', key: 'pnl' },
                                            { label: 'Max Win Rate (%)', key: 'winRate' },
                                            { label: 'Max Profit Factor', key: 'profitFactor' },
                                            { label: 'Lowest Drawdown (%)', key: 'maxDrawdown' },
                                            { label: 'Max Trades (N)', key: 'totalDays' }
                                        ].map(({ label, key }) => {
                                            const r = peaks[key];
                                            if (!r) return null;
                                            return (
                                                <tr key={key} className={clsx('transition-all border border-transparent hover:border-indigo-500/20',
                                                    dark ? 'bg-white/[0.02]' : 'bg-gray-50')}>
                                                    <td className="px-3 py-2.5 rounded-l-xl text-indigo-400 font-black">{label}</td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums', dark ? 'text-white' : 'text-gray-900')}>{r.entry}</td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums', dark ? 'text-white' : 'text-gray-900')}>{r.exit}</td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums text-right', key === 'pnl' ? 'text-emerald-500 font-black text-xs' : 'text-gray-500')}>
                                                        {r.pnl >= 0 ? '+' : ''}{r.pnl.toFixed(2)}%
                                                    </td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums text-right', key === 'winRate' ? 'text-emerald-500 font-black text-xs' : 'text-gray-500')}>
                                                        {r.winRate.toFixed(1)}%
                                                    </td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums text-right', key === 'profitFactor' ? 'text-indigo-400 font-black text-xs' : 'text-gray-500')}>
                                                        {r.profitFactor.toFixed(2)}
                                                    </td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums text-right', key === 'maxDrawdown' ? 'text-emerald-500 font-black text-xs' : 'text-rose-400')}>
                                                        {r.maxDrawdown.toFixed(2)}%
                                                    </td>
                                                    <td className={clsx('px-3 py-2.5 tabular-nums text-right rounded-r-xl', key === 'totalDays' ? 'text-sky-400 font-black text-xs' : 'text-gray-500')}>
                                                        {r.totalDays}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default EdgeOptimizer;
