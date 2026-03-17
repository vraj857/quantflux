import React from 'react';
import { clsx } from 'clsx';
import { Download, CalendarDays } from 'lucide-react';
import { METRIC_CONFIG, PHASES_25 } from '../constants';

const BacktestGridSymbolBlock = ({ symbol, dates, timeMap, dataObj, theme, unifiedTimes }) => {
    const numMetrics = METRIC_CONFIG.length;
    const rows = [];
    dates.forEach((dateStr, dateIdx) => {
        // Compute daily summary dynamically for the given date
        const dateIndices = Object.values(timeMap[dateStr]).filter(idx => idx !== undefined).sort((a,b) => a-b);
        const firstIdx = dateIndices[0];
        const lastIdx = dateIndices[dateIndices.length - 1];
        
        const dayLastPrice = dataObj.price?.[lastIdx] || 0;
        const dayTotalVol = dateIndices.reduce((sum, idx) => sum + (dataObj.volume?.[idx] || 0), 0);
        const dayINRMove = dataObj.price_move ? dateIndices.reduce((sum, idx) => sum + (dataObj.price_move[idx] || 0), 0) : 0;
        
        let dayPC = 0;
        if (dataObj.price && dataObj.percent_change && firstIdx !== undefined && lastIdx !== undefined) {
            const firstPrice = dataObj.price[firstIdx];
            const firstSlotPC = dataObj.percent_change[firstIdx];
            const prevClose = firstPrice / (1 + (firstSlotPC / 100));
            if (prevClose > 0) {
                dayPC = ((dayLastPrice - prevClose) / prevClose) * 100;
            }
        }

        METRIC_CONFIG.forEach((m, metricIdx) => {
            const isFirstOfSymbol = dateIdx === 0 && metricIdx === 0;
            const isFirstOfDate = metricIdx === 0;
            
            const dataKey = m.key;
            const isPrice = m.label === "Price";
            const isMoveINR = m.label === "INR";
            const isPC = m.label === "PC %";
            const isVS = m.label === "VS %";

            let dayHigh = null;
            let dayLow = null;
            if (isPrice) {
                const dateIndices = Object.values(timeMap[dateStr] || {});
                const datePrices = dateIndices.map(idx => dataObj.price?.[idx]).filter(p => p != null && p !== undefined);
                if (datePrices.length > 0) {
                    dayHigh = Math.max(...datePrices);
                    dayLow = Math.min(...datePrices);
                }
            }

            rows.push(
                <tr key={`${symbol}-${dateStr}-${m.label}`} className={clsx(
                    "border-b transition-colors",
                    theme === 'dark' ? "border-white/5 hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50/50"
                )}>
                    {isFirstOfSymbol && (
                        <td rowSpan={dates.length * numMetrics} className={clsx(
                            "p-4 align-top border-r min-w-[100px] max-w-[100px] sticky left-0 z-20 overflow-hidden",
                            theme === 'dark' ? "border-white/10 bg-[#0a0a0a]" : "border-gray-200 bg-white"
                        )}>
                            <div className="flex flex-col space-y-4">
                                <div className="flex flex-col shrink-0">
                                    <span className={clsx(
                                        "text-[8px] font-black uppercase tracking-widest leading-none mb-1 opacity-60",
                                        theme === 'dark' ? "text-indigo-400" : "text-indigo-600"
                                    )}>
                                        {symbol.includes(':') ? symbol.split(':')[0] : 'NSE'}
                                    </span>
                                    <span className={clsx("text-base font-black tracking-tighter uppercase whitespace-nowrap", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                        {symbol.includes(':') ? symbol.split(':')[1] : symbol}
                                    </span>
                                </div>
                            </div>
                        </td>
                    )}
                    {isFirstOfDate && (
                        <td rowSpan={numMetrics} className={clsx(
                            "p-3 align-middle border-r min-w-[80px] max-w-[80px] text-center sticky left-[100px] z-20 whitespace-normal",
                            theme === 'dark' ? "border-white/10 bg-[#111111]" : "border-gray-200 bg-gray-50"
                        )}>
                            <div className="flex flex-col items-center justify-center space-y-1">
                                <CalendarDays size={14} className={theme === 'dark' ? "text-indigo-400" : "text-indigo-500"} />
                                <span className={clsx("text-[10px] font-black uppercase tracking-widest leading-tight", theme === 'dark' ? "text-gray-300" : "text-gray-700")}>
                                    {dateStr.replace(' ', '\n')}
                                </span>
                            </div>
                        </td>
                    )}
                    <td className={clsx(
                        "p-1 px-3 text-[10px] uppercase font-black tracking-widest border-r whitespace-nowrap sticky left-[180px] z-20 min-w-[60px] max-w-[60px]",
                        theme === 'dark' ? "text-gray-500 bg-[#181818]" : "text-gray-400 bg-gray-100/90"
                    )}>
                        {m.label}
                    </td>
                    {unifiedTimes.map((timeKey) => {
                        const dataIndex = timeMap[dateStr]?.[timeKey];
                        const val = dataIndex !== undefined ? dataObj[dataKey]?.[dataIndex] : undefined;
                        
                        // Sentiment logic: Requires both Price Change % and Volume Strength %
                        const pcVal = dataIndex !== undefined ? dataObj.percent_change?.[dataIndex] : undefined;
                        const vsVal = dataIndex !== undefined ? dataObj.volume_strength?.[dataIndex] : undefined;

                        let sentimentBg = theme === 'dark' ? "bg-zinc-900/40" : "bg-gray-100/60";
                        if (vsVal !== undefined && pcVal !== undefined) {
                            if (vsVal > 120) {
                                // High Conviction
                                if (pcVal > 0) sentimentBg = theme === 'dark' ? "bg-emerald-500/20" : "bg-emerald-100";
                                else if (pcVal < 0) sentimentBg = theme === 'dark' ? "bg-rose-500/20" : "bg-rose-100";
                            } else if (vsVal < 70) {
                                // Muted / Low Conviction
                                if (pcVal > 0) sentimentBg = theme === 'dark' ? "bg-emerald-500/10" : "bg-emerald-50";
                                else if (pcVal < 0) sentimentBg = theme === 'dark' ? "bg-rose-500/10" : "bg-rose-50";
                            }
                        }
                        
                        return (
                            <td key={timeKey} className={clsx(
                                "p-2 text-center text-xs font-mono font-bold transition-all border",
                                isPC && val > 0 && "text-emerald-500",
                                isPC && val < 0 && "text-rose-500",
                                isMoveINR && val > 0 && (theme === 'dark' ? "text-emerald-400" : "text-emerald-600"),
                                isMoveINR && val < 0 && (theme === 'dark' ? "text-rose-400" : "text-rose-600"),
                                isVS && val > 150 && (theme === 'dark' ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-600"),
                                isVS && val < 50 && "text-gray-600 opacity-50",
                                sentimentBg,
                                // Range Markers
                                isPrice && val !== undefined && val === dayHigh && "ring-2 ring-blue-500 ring-inset z-10",
                                isPrice && val !== undefined && val === dayLow && "ring-2 ring-rose-700 ring-inset z-10",
                                theme === 'dark' ? "border-white/10" : "border-gray-200"
                            )}>
                                {val !== undefined && val !== null ? (
                                    isPC ? `${val > 0 ? '+' : ''}${val}%` :
                                        isVS ? `${val}%` :
                                            isPrice ? val.toLocaleString('en-IN') :
                                                isMoveINR ? `${val > 0 ? '+' : ''}${val.toFixed(2)}` :
                                                    val.toLocaleString('en-IN')
                                ) : '-'}
                            </td>
                        );
                    })}
                    <td className={clsx(
                        "p-2 text-center text-xs font-mono font-bold transition-all border sticky right-0 z-20",
                        theme === 'dark' ? "border-white/10 bg-zinc-900" : "border-gray-300 bg-gray-100"
                    )}>
                        {m.label === "Price" ? dayLastPrice.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) :
                         m.label === "INR" ? (
                            <span className={clsx(dayINRMove > 0 ? "text-emerald-500" : dayINRMove < 0 ? "text-rose-500" : "text-gray-500")}>
                                {dayINRMove > 0 ? '+' : ''}{dayINRMove.toFixed(2)}
                            </span>
                         ) :
                         m.label === "PC %" ? (
                             <span className={clsx(dayPC > 0 ? "text-emerald-500" : dayPC < 0 ? "text-rose-500" : "text-gray-500")}>
                                 {dayPC > 0 ? '+' : ''}{dayPC.toFixed(2)}%
                             </span>
                         ) :
                         m.label === "Vol" ? dayTotalVol.toLocaleString('en-IN') :
                         m.label === "VS %" ? <span className="text-gray-500 opacity-50">-</span> : "-"}
                    </td>
                </tr>
            );
        });
    });

    return <>{rows}</>;
};

const BacktestGrid = ({ data, theme }) => {
    if (!data || !data.data) return null;

    const symbols = Object.keys(data.data);
    const rawLabels = data.slot_labels || [];
    
    const uniqueTimesSet = new Set();
    const timeMap = {}; // timeMap[dateKey][timeKey] = idx

    rawLabels.forEach((lbl, idx) => {
        const parts = lbl.split(' ');
        const dateKey = parts.length >= 3 ? `${parts[0]} ${parts[1]}` : 'Unknown';
        const timeKey = parts.length >= 3 ? parts[2] : lbl;
        
        uniqueTimesSet.add(timeKey);
        
        if (!timeMap[dateKey]) timeMap[dateKey] = {};
        timeMap[dateKey][timeKey] = idx;
    });

    const unifiedTimes = Array.from(uniqueTimesSet).sort();
    const dates = Object.keys(timeMap);

    const is25Min = unifiedTimes.length === 15;
    const getPhases = () => {
        if (is25Min) return PHASES_25(theme);
        return [{ name: "Market Session", colSpan: unifiedTimes.length, bg: theme === 'dark' ? "bg-indigo-500/10 text-indigo-500" : "bg-indigo-50 text-indigo-600" }];
    };

    const downloadCSV = () => {
        let csv = 'Date,Time,Symbol,Price,INR,PC %,Volume,VS %\n';
        symbols.forEach(sym => {
            const symData = data.data[sym];
            dates.forEach(dateStr => {
                unifiedTimes.forEach(timeKey => {
                    const idx = timeMap[dateStr][timeKey];
                    if (idx !== undefined) {
                        const price = symData.price?.[idx] || 0;
                        const inr = symData.price_move?.[idx] || 0;
                        const pc = symData.percent_change?.[idx] || 0;
                        const vol = symData.volume?.[idx] || 0;
                        const vs = symData.volume_strength?.[idx] || 0;
                        csv += `${dateStr},${timeKey},${sym},${price},${inr},${pc},${vol},${vs}\n`;
                    }
                });
            });
        });
        
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `backtest_${symbols[0]}_${dates[0].replace(' ', '-')}_to_${dates[dates.length-1].replace(' ', '-')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="flex-1 flex flex-col pb-6 h-full overflow-hidden">
            <div className="flex justify-end mb-4 pr-2">
                <button 
                    onClick={downloadCSV}
                    className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-xl active:scale-95"
                >
                    <Download size={14} />
                    <span>Download CSV</span>
                </button>
            </div>

            <div className={clsx(
                "rounded-3xl border shadow-xl flex-1 overflow-auto scrollbar-hide",
                theme === 'dark' ? "bg-black/40 border-white/5" : "bg-white border-gray-200"
            )}>
                <table className="w-full border-collapse min-w-max">
                    <thead>
                        <tr className="h-8">
                            <th colSpan={3} className={clsx(
                                "p-2 border-b border-r text-center sticky top-0 left-0 z-40",
                                theme === 'dark' ? "border-white/10 bg-[#0a0a0a]" : "border-gray-200 bg-gray-100"
                            )}>
                                <span className={clsx("text-[9px] font-black uppercase tracking-widest opacity-60", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>Time Phases</span>
                            </th>
                            {getPhases().map((phase, i) => (
                                <th key={i} colSpan={phase.colSpan} className={clsx(
                                    "p-1.5 text-[10px] font-black uppercase tracking-[0.2em] border-b text-center border-l sticky top-0 z-30",
                                    phase.bg,
                                    theme === 'dark' ? "border-white/10" : "border-gray-200"
                                )}>
                                    {phase.name}
                                </th>
                            ))}
                            <th className={clsx(
                                "p-2 py-4 text-[11px] font-black uppercase tracking-widest border-b border-l border-r text-center sticky top-0 right-0 z-40 shadow-sm",
                                theme === 'dark' ? "text-indigo-400 bg-zinc-900 border-white/10" : "text-indigo-600 bg-gray-50 border-gray-200"
                            )} rowSpan={2}>
                                Day Close
                            </th>
                        </tr>
                        <tr>
                            <th className={clsx(
                                "p-3 py-4 border-b border-r text-left sticky top-8 left-0 z-30 min-w-[100px] max-w-[100px]",
                                theme === 'dark' ? "border-white/10 bg-[#0a0a0a]" : "border-gray-200 bg-gray-100"
                            )}>
                                <span className={clsx("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>Instrument</span>
                            </th>
                            <th className={clsx(
                                "p-3 py-4 border-b border-r text-center sticky top-8 left-[100px] z-30 min-w-[80px] max-w-[80px]",
                                theme === 'dark' ? "border-white/10 bg-[#111111]" : "border-gray-200 bg-gray-100"
                            )}>
                                <span className={clsx("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>Date</span>
                            </th>
                            <th className={clsx(
                                "p-3 py-4 border-b border-r text-center sticky top-8 left-[180px] z-30 min-w-[60px] max-w-[60px]",
                                theme === 'dark' ? "border-white/10 bg-[#181818]" : "border-gray-200 bg-gray-100"
                            )}>
                                <span className={clsx("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>Metric</span>
                            </th>
                            {unifiedTimes.map((timeKey, i) => (
                                <th key={i} className={clsx(
                                    "p-2 py-4 text-[11px] font-mono font-black border-b text-center border-l sticky top-8 z-20 shadow-sm",
                                    theme === 'dark' ? "text-white bg-zinc-900 border-white/10" : "text-black bg-gray-50 border-gray-200"
                                )}>
                                    {timeKey}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {symbols.map(sym => (
                            <BacktestGridSymbolBlock
                                key={sym}
                                symbol={sym}
                                dates={dates}
                                timeMap={timeMap}
                                dataObj={data.data[sym]}
                                theme={theme}
                                unifiedTimes={unifiedTimes}
                            />
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default BacktestGrid;
