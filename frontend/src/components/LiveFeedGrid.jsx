import React from 'react';
import { clsx } from 'clsx';
import { Zap, AlertCircle } from 'lucide-react';
import { TIME_SLOTS_25, PHASES_25, METRIC_CONFIG } from '../constants';

const MetricRow = ({ symbol, metric, data, isFirst, theme, slotCount, dailySummary }) => {
    const numMetrics = METRIC_CONFIG.length;
    const isPrice = metric === "Price";
    
    let dayHigh = null;
    let dayLow = null;
    if (isPrice) {
        const prices = (data.price || []).filter(p => p != null && p !== undefined);
        if (prices.length > 0) {
            dayHigh = Math.max(...prices);
            dayLow = Math.min(...prices);
        }
    }

    return (
        <tr className={clsx(
            "border-b transition-colors",
            theme === 'dark' ? "border-white/5 group hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50/50"
        )}>
            {isFirst && (
                <td rowSpan={numMetrics} className={clsx(
                    "p-3 px-4 align-middle border-r min-w-[200px]",
                    theme === 'dark' ? "border-white/10 bg-black/40" : "border-gray-200 bg-gray-50"
                )}>
                    <div className="flex items-center space-x-4">
                        {/* Symbol Name */}
                        <div className="flex flex-col shrink-0">
                            <span className={clsx(
                                "text-[7px] font-black uppercase tracking-widest leading-none mb-1 opacity-60",
                                theme === 'dark' ? "text-indigo-400" : "text-indigo-600"
                            )}>
                                {symbol.includes(':') ? symbol.split(':')[0] : 'NSE'}
                            </span>
                            <span className={clsx("text-sm font-black tracking-tighter uppercase whitespace-nowrap", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                {symbol.includes(':') ? symbol.split(':')[1] : symbol}
                            </span>
                        </div>

                        {/* Daily Stats (Inline) */}
                        <div className={clsx("flex flex-col border-l pl-3 shrink-0", theme === 'dark' ? "border-white/10" : "border-gray-200")}>
                            <div className="flex items-baseline space-x-1.5 leading-none mb-1">
                                <span className={clsx("text-xs font-black", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                    ₹{dailySummary?.current_price?.toLocaleString('en-IN')}
                                </span>
                                <span className={clsx(
                                    "text-[9px] font-bold",
                                    dailySummary?.percent_change > 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {dailySummary?.percent_change > 0 ? '▲' : '▼'}{Math.abs(dailySummary?.percent_change || 0).toFixed(2)}%
                                </span>
                            </div>
                            <div className="flex items-center space-x-2">
                                <span className="text-[8px] font-black text-gray-500 uppercase tracking-tighter">
                                    VOL: {dailySummary?.total_volume?.toLocaleString('en-IN')}
                                </span>
                                <span className={clsx("text-[8px] font-black uppercase tracking-tighter", dailySummary?.price_move > 0 ? "text-emerald-500" : "text-rose-500")}>
                                    INR: {dailySummary?.price_move > 0 ? '+' : ''}{dailySummary?.price_move?.toFixed(2)}
                                </span>
                            </div>
                        </div>

                        {/* Phase Health Alerts */}
                        {data.phase_alerts && data.phase_alerts.length > 0 && (
                            <div className="flex flex-col space-y-1 pl-3 border-l border-white/5 ml-auto overflow-hidden">
                                {data.phase_alerts.slice(0, 2).map((alert, idx) => (
                                    <div key={idx} className={clsx(
                                        "px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-tighter flex items-center space-x-1 animate-in fade-in slide-in-from-right-2",
                                        alert.type === 'SIGNAL' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                                        alert.type === 'RISK' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                                        "bg-gray-500/10 text-gray-400 border border-white/5"
                                    )}>
                                        <Zap size={10} className={clsx(alert.type === 'SIGNAL' && "fill-current animate-pulse")} />
                                        <span className="truncate max-w-[100px]">{alert.msg}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </td>
            )}
            <td className={clsx(
                "p-1 px-2 text-[10px] uppercase font-black tracking-widest border-r whitespace-nowrap",
                theme === 'dark' ? "text-gray-500 bg-black/20" : "text-gray-400 bg-gray-50/50"
            )}>
                {metric}
            </td>
            {Array.from({ length: slotCount }).map((_, i) => {
                const metricEntry = METRIC_CONFIG.find(m => m.label === metric);
                const dataKey = metricEntry ? metricEntry.key : 'price';
                const val = data[dataKey]?.[i];
                
                const pcVal = data.percent_change?.[i];
                const vsVal = data.volume_strength?.[i];

                const isPrice = metric === "Price";
                const isINR = metric === "INR";
                const isPC = metric === "PC %";
                const isVS = metric === "VS %";

                let sentimentBg = theme === 'dark' ? "bg-zinc-900/40" : "bg-gray-100/60";
                if (vsVal !== undefined && pcVal !== undefined) {
                    if (vsVal > 120) {
                        if (pcVal > 0) sentimentBg = theme === 'dark' ? "bg-emerald-500/20" : "bg-emerald-100";
                        else if (pcVal < 0) sentimentBg = theme === 'dark' ? "bg-rose-500/20" : "bg-rose-100";
                    } else if (vsVal < 70) {
                        if (pcVal > 0) sentimentBg = theme === 'dark' ? "bg-emerald-500/10" : "bg-emerald-50";
                        else if (pcVal < 0) sentimentBg = theme === 'dark' ? "bg-rose-500/10" : "bg-rose-50";
                    }
                }

                return (
                    <td key={i} className={clsx(
                        "p-2 text-center text-xs font-mono font-bold transition-all border",
                        isPC && val > 0 && "text-emerald-500",
                        isPC && val < 0 && "text-rose-500",
                        isINR && val > 0 && (theme === 'dark' ? "text-emerald-400" : "text-emerald-600"),
                        isINR && val < 0 && (theme === 'dark' ? "text-rose-400" : "text-rose-600"),
                        isVS && val > 150 && (theme === 'dark' ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-600"),
                        isVS && val < 50 && "text-gray-600 opacity-50",
                        sentimentBg,
                        isPrice && val !== undefined && val === dayHigh && "ring-2 ring-blue-500 ring-inset z-10",
                        isPrice && val !== undefined && val === dayLow && "ring-2 ring-rose-700 ring-inset z-10",
                        theme === 'dark' ? "border-white/10" : "border-gray-200"
                    )}>
                        {val !== undefined && val !== null ? (
                            isPC ? `${val > 0 ? '+' : ''}${val}%` :
                                isVS ? `${val}%` :
                                    isPrice ? val.toLocaleString('en-IN') :
                                        isINR ? `${val > 0 ? '+' : ''}${val.toFixed(2)}` :
                                            val.toLocaleString('en-IN')
                        ) : '-'}
                    </td>
                );
            })}
        </tr>
    );
};


const LiveFeedGrid = ({ data, theme }) => {
    if (!data || !data.data) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-50">
                <div className="size-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin"></div>
                <p className="text-gray-500 font-bold uppercase tracking-widest text-[10px]">Initializing Market Feed...</p>
            </div>
        );
    }

    const symbols = Object.keys(data.data);
    const slotLabels = data.slot_labels || [];
    const is25Min = slotLabels.length === 15;
    const activeSlots = is25Min ? TIME_SLOTS_25 : slotLabels;
    const slotCount = activeSlots.length;

    const getPhases = () => {
        if (is25Min) return PHASES_25(theme);
        if (!data.phases || data.phases.length === 0) return [{ name: "Market Session", colSpan: slotCount, bg: "bg-indigo-500/10 text-indigo-500" }];

        // Check if phases are already formatted as {name, colSpan, bg}
        if (data.phases[0] && data.phases[0].colSpan !== undefined) {
            return data.phases;
        }

        const phases = [];
        let currentPhase = null;
        data.phases.forEach(slot => {
            const phaseName = slot.phase || "Session";
            if (!currentPhase || currentPhase.name !== phaseName) {
                currentPhase = { name: phaseName, colSpan: 1, bg: getPhaseColor(phaseName, theme) };
                phases.push(currentPhase);
            } else {
                currentPhase.colSpan += 1;
            }
        });
        return phases;
    };

    const getPhaseColor = (name, theme) => {
        if (!name) return theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500";
        if (name.includes("Morning")) return theme === 'dark' ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600";
        if (name.includes("Midday")) return theme === 'dark' ? "bg-blue-500/10 text-blue-500" : "bg-blue-50 text-blue-600";
        if (name.includes("Trend")) return theme === 'dark' ? "bg-indigo-500/10 text-indigo-500" : "bg-indigo-50 text-indigo-600";
        return theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500";
    };

    if (symbols.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center space-y-4 opacity-50">
                <AlertCircle size={48} className="text-gray-500" />
                <p className="text-gray-500 font-bold uppercase tracking-widest text-xs">Waiting for market ticks...</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-auto p-4 scrollbar-hide">
            <div className={clsx(
                "rounded-3xl border shadow-2xl overflow-hidden backdrop-blur-md transition-all",
                theme === 'dark' ? "bg-black/40 border-white/5" : "bg-white border-gray-200"
            )}>
                <table className="w-full border-collapse">
                    <thead>
                        <tr>
                            <th colSpan={2} className={clsx(
                                "p-2 border-b border-r text-left",
                                theme === 'dark' ? "border-white/10 bg-black/60" : "border-gray-200 bg-gray-50"
                            )}>
                                <div className="flex items-center space-x-2">
                                    <div className="size-2 bg-indigo-500 rounded-full animate-pulse"></div>
                                    <span className={clsx("text-[10px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>Instrument</span>
                                </div>
                            </th>
                            {getPhases().map((phase, i) => (
                                <th key={i} colSpan={phase.colSpan} className={clsx(
                                    "p-1.5 text-[10px] font-black uppercase tracking-[0.2em] border-b text-center border-l",
                                    phase.bg,
                                    theme === 'dark' ? "border-white/10" : "border-gray-200"
                                )}>
                                    {phase.name}
                                </th>
                            ))}
                        </tr>
                        <tr>
                            <th colSpan={2} className={clsx(
                                "p-2 border-b border-r",
                                theme === 'dark' ? "bg-black/40 border-white/10" : "bg-gray-100 border-gray-200"
                            )}></th>
                            {activeSlots.map((label, i) => (
                                <th key={i} className={clsx(
                                    "p-2 text-[11px] font-mono font-black border-b border-l text-center transition-colors",
                                    theme === 'dark'
                                        ? "text-white bg-zinc-900 border-white/10"
                                        : "text-black bg-white border-gray-200"
                                )}>
                                    {label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {symbols.map(sym => (
                            <React.Fragment key={sym}>
                                {METRIC_CONFIG.map((m, idx) => (
                                    <MetricRow
                                        key={`${sym}-${m.label}`}
                                        symbol={sym}
                                        metric={m.label}
                                        data={data.data[sym]}
                                        isFirst={idx === 0}
                                        theme={theme}
                                        slotCount={slotCount}
                                        dailySummary={data.daily_summary[sym]}
                                    />
                                ))}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LiveFeedGrid;
