import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, Target } from 'lucide-react';
import { exportWatchlistToCSV } from './exportUtils';

const WatchlistScreenerTable = ({ phaseStats, regimeData, watchlistName, onSelectSymbol, theme }) => {
    const dark = theme === 'dark';
    
    // Flatten data for table view
    const tableData = useMemo(() => {
        if (!regimeData) return [];
        const rows = [];
        const symbols = Object.keys(regimeData).filter(s => s !== 'Aggregate');
        
        // Map PhaseStats for quick O(1) lookup
        const pStatsMap = {};
        if (Array.isArray(phaseStats)) {
            phaseStats.forEach(p => { pStatsMap[p.symbol] = p.stats; });
        }

        for (const symbol of symbols) {
            const ms = regimeData[symbol]?.microstructure;
            if (!ms) continue;
            
            const shapeStr = ms.Detected_Shape || 'Undefined';
            const tfData = ms.Timeframe_Data || [];
            const probs = ms.Probability_Stats?.Shapes || [];
            
            // Calculate Max Vol Spike and Max Price Move
            let maxVol = 0;
            let peakVolPhase = '-';
            let maxPrice = 0;
            
            tfData.forEach(d => {
                if (d.Avg_Rel_Volume_Pct > maxVol) {
                    maxVol = d.Avg_Rel_Volume_Pct;
                    peakVolPhase = d.Phase || d.Time;
                }
                if (Math.abs(d.Avg_Close_Net_Pct) > Math.abs(maxPrice)) {
                    maxPrice = d.Avg_Close_Net_Pct;
                }
            });

            // Most common Daily Shape
            const commonDailyShape = probs.length > 0 ? probs[0].name : '-';
            
            // Average Efficiency
            let avgEff = 0;
            const symStats = pStatsMap[symbol];
            if (symStats) {
                const effs = [];
                Object.values(symStats).forEach(ph => {
                    if (ph.efficiency !== undefined) effs.push(ph.efficiency);
                });
                if (effs.length > 0) avgEff = effs.reduce((a, b) => a + b, 0) / effs.length;
            }

            rows.push({
                symbol,
                efficiency: avgEff,
                shapeStr,
                commonDailyShape,
                maxVol,
                peakVolPhase,
                maxPrice
            });
        }
        return rows;
    }, [regimeData, phaseStats]);

    const [sortCol, setSortCol] = useState('efficiency');
    const [sortDir, setSortDir] = useState('desc');

    const handleSort = (col) => {
        if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortCol(col); setSortDir('desc'); }
    };

    const sortedData = useMemo(() => {
        return [...tableData].sort((a, b) => {
            const av = a[sortCol];
            const bv = b[sortCol];
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1);
        });
    }, [tableData, sortCol, sortDir]);

    const SortIcon = ({ col }) => {
        if (sortCol !== col) return <ChevronsUpDown size={10} className="opacity-30 inline ml-1" />;
        return sortDir === 'asc' ? <ChevronUp size={10} className="inline ml-1 text-indigo-400" /> : <ChevronDown size={10} className="inline ml-1 text-indigo-400" />;
    };

    if (tableData.length === 0) return null;

    return (
        <div className={clsx('rounded-2xl border flex flex-col', dark ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
            {/* Header / Export Row */}
            <div className={clsx('flex items-center justify-between p-4 border-b', dark ? 'border-white/5' : 'border-gray-200')}>
                <div>
                    <h3 className={clsx('text-[14px] font-black uppercase tracking-tight', dark ? 'text-white' : 'text-gray-900')}>
                        Watchlist Dashboard
                    </h3>
                    <p className="text-[9px] font-bold text-gray-500 uppercase tracking-widest mt-0.5">
                        {tableData.length} Symbols · Normalized Microstructure Summary
                    </p>
                </div>
                <button 
                    onClick={() => exportWatchlistToCSV(phaseStats, regimeData, watchlistName)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600/15 hover:bg-indigo-600 border border-indigo-500/30 text-indigo-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-all">
                    <Download size={12} />
                    Download Full CSV
                </button>
            </div>

            {/* Screener Table */}
            <div className="overflow-x-auto p-4">
                <table className="w-full text-left">
                    <thead>
                        <tr className={clsx('text-[9px] font-black uppercase tracking-widest border-b', dark ? 'text-gray-600 border-white/5' : 'text-gray-400 border-gray-200')}>
                            {[
                                { id: 'symbol', label: 'Symbol' },
                                { id: 'efficiency', label: 'Overall Efficiency' },
                                { id: 'shapeStr', label: 'Primary Intraday Shape' },
                                { id: 'commonDailyShape', label: 'Most Common Daily Shape' },
                                { id: 'peakVolPhase', label: 'Peak Vol Phase' },
                                { id: 'maxVol', label: 'Max Spike %' },
                                { id: 'maxPrice', label: 'Max Net Move %' }
                            ].map(col => (
                                <th key={col.id} onClick={() => handleSort(col.id)}
                                    className="pb-2.5 pr-4 whitespace-nowrap cursor-pointer select-none hover:text-indigo-400 transition-colors">
                                    {col.label} <SortIcon col={col.id} />
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className={clsx('text-[10px] font-semibold', dark ? 'text-gray-300' : 'text-gray-700')}>
                        {sortedData.map((row, i) => (
                            <tr key={row.symbol} 
                                onClick={() => onSelectSymbol(row.symbol)}
                                className={clsx('border-b cursor-pointer transition-colors', 
                                    dark ? 'border-white/[0.025] hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50')}>
                                <td className="py-3 pr-4 font-black flex items-center gap-2">
                                    <Target size={11} className="text-indigo-400/50" />
                                    {row.symbol}
                                </td>
                                <td className="py-3 pr-4 tabular-nums">
                                    <span className={clsx(row.efficiency >= 1 ? 'text-emerald-500' : 'text-gray-500')}>
                                        {row.efficiency > 0 ? row.efficiency.toFixed(2) : '-'}
                                    </span>
                                </td>
                                <td className="py-3 pr-4 text-indigo-400">{row.shapeStr}</td>
                                <td className="py-3 pr-4 text-gray-500">{row.commonDailyShape}</td>
                                <td className="py-3 pr-4 text-rose-400/80">{row.peakVolPhase}</td>
                                <td className="py-3 pr-4 tabular-nums">{row.maxVol > 0 ? row.maxVol.toFixed(1) + '%' : '-'}</td>
                                <td className="py-3 pr-4 tabular-nums">
                                    <span className={clsx(row.maxPrice > 0 ? 'text-emerald-500' : row.maxPrice < 0 ? 'text-rose-500' : 'text-gray-500')}>
                                        {row.maxPrice !== 0 ? (row.maxPrice > 0 ? '+' : '') + row.maxPrice.toFixed(2) + '%' : '-'}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 border-t border-white/5 text-center text-[9px] text-gray-500 uppercase tracking-widest font-bold">
                Click any row to view detailed microstructure charts
            </div>
        </div>
    );
};

export default WatchlistScreenerTable;
