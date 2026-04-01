import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { TrendingUp, Activity, AlertTriangle, ArrowRight, ArrowUpRight, ArrowDownRight, Compass, Search } from 'lucide-react';

const RegimeWatchlistTable = ({ dataMap, theme, onSelectSymbol }) => {
    const isDark = theme === 'dark';
    const symbols = Object.keys(dataMap || {});
    const [searchTerm, setSearchTerm] = useState('');
    const [sortConfig, setSortConfig] = useState({ key: 'score', direction: 'desc' });

    const getRegimeColor = (regime) => {
        if (regime === "Strong Bull") return isDark ? '#059669' : '#10b981';
        if (regime === "Bull") return isDark ? '#10b981' : '#34d399';
        if (regime === "Bear") return isDark ? '#ef4444' : '#f87171';
        if (regime === "Strong Bear") return isDark ? '#dc2626' : '#ef4444';
        return isDark ? '#6b7280' : '#9ca3af';
    };

    const tableData = useMemo(() => {
        let filtered = symbols.map(sym => {
            const sum = dataMap[sym].summary;
            return {
                symbol: sym,
                regime: sum.currentRegime,
                score: sum.confidence * (sum.currentRegime.includes('Bear') ? -1 : 1), // Proxy for sorting
                confidence: sum.confidence,
                reversals: sum.totalChanges,
                action: sum.recommendation.split(' - ')[0] || sum.recommendation,
                rawAction: sum.recommendation
            };
        });

        if (searchTerm) {
            filtered = filtered.filter(row => row.symbol.toLowerCase().includes(searchTerm.toLowerCase()));
        }

        filtered.sort((a, b) => {
            if (a[sortConfig.key] < b[sortConfig.key]) return sortConfig.direction === 'asc' ? -1 : 1;
            if (a[sortConfig.key] > b[sortConfig.key]) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return filtered;
    }, [dataMap, symbols, searchTerm, sortConfig]);

    const requestSort = (key) => {
        let direction = 'desc';
        if (sortConfig.key === key && sortConfig.direction === 'desc') {
            direction = 'asc';
        }
        setSortConfig({ key, direction });
    };

    if (symbols.length === 0) {
        return (
            <div className={clsx("p-12 text-center rounded-xl border flex flex-col items-center", isDark ? "bg-[#161618] border-zinc-800" : "bg-gray-50 border-gray-200")}>
                <Compass className={clsx("w-8 h-8 mb-4", isDark ? "text-zinc-600" : "text-gray-400")} />
                <p className={clsx("text-sm font-semibold", isDark ? "text-zinc-400" : "text-gray-500")}>Fetch historical data to populate the Watchlist Trend Matrix.</p>
            </div>
        );
    }

    return (
        <div className={clsx("w-full rounded-xl border p-4 sm:p-6 shadow-sm flex flex-col items-start font-sans h-[calc(100vh-250px)] max-h-[800px]", isDark ? "bg-[#161618] border-zinc-800" : "bg-white border-gray-100")}>
            
            {/* Header / Search */}
            <div className="w-full flex sm:flex-row flex-col items-start sm:items-center justify-between mb-6 gap-4 shrink-0">
                <div className="flex items-center space-x-3">
                    <Compass className={clsx("w-6 h-6", isDark ? "text-indigo-400" : "text-indigo-600")} />
                    <div>
                        <h2 className={clsx("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>
                            Watchlist Trend Matrix
                        </h2>
                        <p className={clsx("text-xs font-semibold mt-0.5", isDark ? "text-zinc-500" : "text-gray-400")}>
                            {symbols.length} Assets Analyzed
                        </p>
                    </div>
                </div>

                <div className="relative w-full sm:w-64">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Search className={clsx("h-4 w-4", isDark ? "text-zinc-500" : "text-gray-400")} />
                    </div>
                    <input
                        type="text"
                        placeholder="Search Symbol..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className={clsx(
                            "w-full pl-9 pr-3 py-2 rounded-lg text-xs font-semibold tracking-wide border outline-none focus:ring-1 transition-all",
                            isDark ? "bg-zinc-900 border-zinc-800 focus:border-indigo-500 text-white placeholder-zinc-600" : "bg-gray-50 border-gray-200 focus:border-indigo-500 text-gray-900 placeholder-gray-400"
                        )}
                    />
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-auto flex-1 border rounded-lg shadow-sm" style={{ borderColor: isDark ? '#27272a' : '#f3f4f6' }}>
                <table className="w-full text-left border-collapse">
                    <thead className={clsx("sticky top-0 z-10 text-[10px] font-black uppercase tracking-widest", isDark ? "bg-zinc-900 text-zinc-400 border-b border-zinc-800" : "bg-gray-100 text-gray-600 border-b border-gray-200")}>
                        <tr>
                            <th className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => requestSort('symbol')}>Symbol {sortConfig.key === 'symbol' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                            <th className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => requestSort('score')}>Market Trend {sortConfig.key === 'score' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                            <th className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => requestSort('confidence')}>Strength {sortConfig.key === 'confidence' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                            <th className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => requestSort('reversals')}>Reversals {sortConfig.key === 'reversals' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                            <th className="p-4 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors" onClick={() => requestSort('action')}>Action {sortConfig.key === 'action' && (sortConfig.direction === 'asc' ? '↑' : '↓')}</th>
                            <th className="p-4 text-right">Drilldown</th>
                        </tr>
                    </thead>
                    <tbody className={clsx("text-sm", isDark ? "divide-y divide-zinc-800/80 bg-[#161618]" : "divide-y divide-gray-100 bg-white")}>
                        {tableData.map((row) => {
                            const regimeColor = getRegimeColor(row.regime);
                            const isBull = row.regime.includes('Bull');
                            const isBear = row.regime.includes('Bear');

                            return (
                                <tr key={row.symbol} className={clsx("transition-colors hover:bg-black/5", isDark ? "dark:hover:bg-white/5" : "")}>
                                    <td className="p-4">
                                        <div className="flex items-center space-x-2">
                                            <div className="w-1.5 h-6 rounded-full" style={{ backgroundColor: regimeColor }}></div>
                                            <span className={clsx("font-bold tracking-tight", isDark ? "text-gray-200" : "text-gray-900")}>
                                                {row.symbol}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="flex items-center space-x-2">
                                            {isBull ? <ArrowUpRight className="w-4 h-4" style={{ color: regimeColor }} /> : isBear ? <ArrowDownRight className="w-4 h-4" style={{ color: regimeColor }} /> : <Activity className="w-4 h-4" style={{ color: regimeColor }} />}
                                            <span className="font-semibold text-[13px]" style={{ color: regimeColor }}>
                                                {row.regime.replace("Strong ", "Extreme ")}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <span className={clsx("text-xs font-bold", isDark ? "text-zinc-300" : "text-gray-600")}>
                                            {(row.confidence * 100).toFixed(0)}%
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={clsx("text-xs font-semibold px-2 py-1 rounded-md", isDark ? "bg-zinc-800 text-zinc-300" : "bg-gray-100 text-gray-600")}>
                                            {row.reversals} Shifts
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <span className={clsx("text-xs font-bold uppercase tracking-widest px-2 py-1 flex items-center w-max rounded-md", 
                                            row.action.includes('Buy') || row.rawAction.includes('Passive') ? (isDark ? "bg-emerald-900/30 text-emerald-400" : "bg-emerald-100 text-emerald-700") :
                                            row.action.includes('Sell') || row.action.includes('Reduce') ? (isDark ? "bg-rose-900/30 text-rose-400" : "bg-rose-100 text-rose-700") :
                                            (isDark ? "bg-indigo-900/30 text-indigo-400" : "bg-indigo-100 text-indigo-700")
                                        )}>
                                            {row.action}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => onSelectSymbol(row.symbol)}
                                            className={clsx(
                                                "p-2 rounded-lg transition-transform hover:scale-110",
                                                isDark ? "bg-zinc-800 text-indigo-400 hover:bg-indigo-600 hover:text-white" : "bg-gray-100 text-indigo-600 hover:bg-indigo-500 hover:text-white"
                                            )}
                                            title={`View Charts for ${row.symbol}`}
                                        >
                                            <ArrowRight className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {tableData.length === 0 && (
                            <tr>
                                <td colSpan={6} className={clsx("p-8 text-center text-sm font-semibold", isDark ? "text-zinc-500" : "text-gray-400")}>
                                    No assets match your search.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

export default RegimeWatchlistTable;
