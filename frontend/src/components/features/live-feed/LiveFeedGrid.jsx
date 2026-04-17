import React, { memo, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Zap, AlertCircle, Radio, Wifi, WifiOff, Monitor, History, Search } from 'lucide-react';
import { TIME_SLOTS_25, PHASES_25, METRIC_CONFIG, getDynamicPhases } from '../../../constants';

// ─── Phase Mapping Helpers ──────────────────────────────────────────────────
// ─── Phase Mapping Helpers ──────────────────────────────────────────────────

const MetricRow = memo(({ symbol, metric, data, isFirst, theme, slotCount, dailySummary, isSubscribed }) => {
    const numMetrics = METRIC_CONFIG.length;
    const isPrice = metric === "Price";
    
    // Memoize High/Low calculations to avoid recalculating on every minor style change
    const { dayHigh, dayLow } = useMemo(() => {
        if (!isPrice) return { dayHigh: null, dayLow: null };
        const prices = (data?.price || []).filter(p => p != null && p !== undefined);
        return {
            dayHigh: prices.length > 0 ? Math.max(...prices) : null,
            dayLow: prices.length > 0 ? Math.min(...prices) : null
        };
    }, [isPrice, data?.price]);

    return (
        <tr className={clsx(
            "border-b transition-colors",
            theme === 'dark' ? "border-white/5 group hover:bg-white/[0.02]" : "border-gray-100 hover:bg-gray-50/50"
        )}>
            {isFirst && (
                <td rowSpan={numMetrics} className={clsx(
                    "p-2 px-3 align-middle border-r min-w-[145px] max-w-[160px]",
                    theme === 'dark' ? "border-white/10 bg-black/40" : "border-gray-200 bg-gray-50"
                )}>
                    <div className="flex flex-col space-y-1">
                        {/* Row 1: Status + Symbol + Price + % */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-1.5 overflow-hidden">
                                <div className={clsx(
                                    "size-1.5 rounded-full flex-shrink-0",
                                    isSubscribed ? "bg-emerald-400 animate-pulse" : "bg-gray-600"
                                )} />
                                <span className={clsx("text-[11px] font-black uppercase tracking-tighter truncate", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                    {symbol.includes(':') ? symbol.split(':')[1] : symbol}
                                </span>
                            </div>
                            <div className="flex items-center space-x-1 shrink-0 ml-1">
                                <span className={clsx("text-[10px] font-black tabular-nums", theme === 'dark' ? "text-white" : "text-gray-900")}>
                                    ₹{dailySummary?.current_price?.toLocaleString('en-IN')}
                                </span>
                            </div>
                        </div>

                        {/* Row 2: Exchange + Vol + PC + INR */}
                        <div className="flex items-center justify-between opacity-80">
                            <div className="flex items-center space-x-1.5">
                                <span className="text-[7px] font-black text-gray-500 uppercase tracking-widest leading-none">
                                    {symbol.includes(':') ? symbol.split(':')[0] : 'NSE'}
                                </span>
                                <span className="text-[8px] font-black text-gray-500 tracking-tighter">
                                    V:{dailySummary?.total_volume ? (dailySummary.total_volume / 100000).toFixed(1) + 'L' : '0L'}
                                </span>
                            </div>
                            <div className="flex items-center space-x-1.5 shrink-0">
                                <span className={clsx(
                                    "text-[8px] font-bold tabular-nums",
                                    dailySummary?.percent_change > 0 ? "text-emerald-500" : "text-rose-500"
                                )}>
                                    {dailySummary?.percent_change > 0 ? '+' : ''}{dailySummary?.percent_change?.toFixed(2)}%
                                </span>
                                <span className={clsx("text-[8px] font-black tracking-tighter tabular-nums", dailySummary?.price_move > 0 ? "text-emerald-500" : "text-rose-500")}>
                                    {dailySummary?.price_move > 0 ? '+' : ''}{dailySummary?.price_move?.toFixed(1)}
                                </span>
                            </div>
                        </div>

                        {/* Row 3: Phase Alerts (Compact inline) */}
                        {data?.phase_alerts && data.phase_alerts.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-1 border-t border-white/5 opacity-90">
                                {data.phase_alerts.slice(0, 2).map((alert, idx) => (
                                    <div key={idx} className={clsx(
                                        "px-1.5 py-0.5 rounded-[3px] text-[7px] font-black uppercase tracking-tight flex items-center space-x-0.5 whitespace-nowrap",
                                        alert.type === 'SIGNAL' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" :
                                        alert.type === 'RISK' ? "bg-rose-500/20 text-rose-400 border border-rose-500/30" :
                                        "bg-gray-500/10 text-gray-400 border border-white/5"
                                    )}>
                                        <Zap size={8} className={clsx(alert.type === 'SIGNAL' && "fill-current animate-pulse")} />
                                        <span>{alert.msg}</span>
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

                const isPriceRow = metric === "Price";
                const isINR = metric === "INR";
                const isPC = metric === "PC %";
                const isVS = metric === "VS %";

                // Tooltip content for Price row
                let tooltip = "";
                if (isPriceRow && val !== undefined && val !== null) {
                    const o = data.price_open?.[i];
                    const h = data.price_high?.[i];
                    const l = data.price_low?.[i];
                    const c = val;
                    if (o !== undefined && h !== undefined && l !== undefined) {
                        tooltip = `O: ${o.toLocaleString('en-IN')} | H: ${h.toLocaleString('en-IN')} | L: ${l.toLocaleString('en-IN')} | C: ${c.toLocaleString('en-IN')}`;
                    }
                }

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
                    <td 
                        key={i} 
                        title={tooltip}
                        className={clsx(
                        "p-2 text-center text-xs font-mono font-bold transition-all border",
                        isPriceRow && "cursor-help",
                        isPC && val > 0 && "text-emerald-500",
                        isPC && val < 0 && "text-rose-500",
                        isINR && val > 0 && (theme === 'dark' ? "text-emerald-400" : "text-emerald-600"),
                        isINR && val < 0 && (theme === 'dark' ? "text-rose-400" : "text-rose-600"),
                        isVS && val > 150 && (theme === 'dark' ? "bg-amber-500/10 text-amber-500" : "bg-amber-50 text-amber-600"),
                        isVS && val < 50 && "text-gray-600 opacity-50",
                        sentimentBg,
                        isPriceRow && val !== undefined && val !== null && val === dayHigh && "ring-2 ring-blue-500 ring-inset z-10",
                        isPriceRow && val !== undefined && val !== null && val === dayLow && "ring-2 ring-rose-700 ring-inset z-10",
                        theme === 'dark' ? "border-white/10" : "border-gray-200"
                    )}>
                        {val !== undefined && val !== null ? (
                            isPC ? `${val > 0 ? '+' : ''}${val}%` :
                                isVS ? `${val}%` :
                                    isPriceRow ? val.toLocaleString('en-IN') :
                                        isINR ? `${val > 0 ? '+' : ''}${val.toFixed(2)}` :
                                            val.toLocaleString('en-IN')
                        ) : '-'}
                    </td>
                );
            })}
        </tr>
    );
});


const LiveFeedGrid = ({ data, snapshot, subscriptions, theme }) => {
    const [searchQuery, setSearchQuery] = useState('');
    
    // ── Symbols to display: Prefer live data, fallback to subscriptions/snapshot ──
    const symbolsFromData = Object.keys(data?.data || {});
    const symbolsFromSubs = (subscriptions?.symbols || []).map(s => s.replace(/-EQ$/, ''));
    const symbolsFromSnap = (snapshot?.quotes || []).map(q => q.symbol);
    
    // Unified unique symbol list for the grid rows
    const allSymbols = symbolsFromData.length > 0 ? symbolsFromData : 
                   (symbolsFromSubs.length > 0 ? symbolsFromSubs : symbolsFromSnap);

    const symbols = useMemo(() => {
        if (!searchQuery) return allSymbols;
        const q = searchQuery.toLowerCase();
        return allSymbols.filter(sym => sym.toLowerCase().includes(q));
    }, [allSymbols, searchQuery]);

    const slotLabels = data.slot_labels || TIME_SLOTS_25;
    const is25Min = slotLabels.length === 15;
    const activeSlots = is25Min ? TIME_SLOTS_25 : slotLabels;
    const slotCount = activeSlots.length;
    const subscribedSet = new Set((subscriptions?.symbols || []).map(s => s.replace(/-EQ$/, '')));
    const isLive = subscriptions?.connected ?? false;

    const phases = useMemo(() => {
        if (!data.phases || data.phases.length === 0) {
            return getDynamicPhases(activeSlots, theme);
        }

        if (data.phases[0] && data.phases[0].colSpan !== undefined) {
            return data.phases;
        }

        const result = [];
        let currentPhase = null;
        (data.phases || []).forEach(slot => {
            const phaseName = slot.phase || "Session";
            if (!currentPhase || currentPhase.name !== phaseName) {
                currentPhase = { name: phaseName, colSpan: 1, bg: getPhaseColor(phaseName, theme) };
                result.push(currentPhase);
            } else {
                currentPhase.colSpan += 1;
            }
        });
        return result;
    }, [data.phases, activeSlots, theme]);

    const getPhaseColor = (name, theme) => {
        if (!name) return theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500";
        if (name.includes("Morning")) return theme === 'dark' ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600";
        if (name.includes("Midday")) return theme === 'dark' ? "bg-blue-500/10 text-blue-500" : "bg-blue-50 text-blue-600";
        if (name.includes("Trend")) return theme === 'dark' ? "bg-indigo-500/10 text-indigo-500" : "bg-indigo-50 text-indigo-600";
        return theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500";
    };

    if (symbols.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 opacity-50 space-y-4">
                <AlertCircle size={48} className="text-gray-500" />
                <h3 className={clsx("text-lg font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-400" : "text-gray-600")}>
                    No Watchlist Selected
                </h3>
                <p className={clsx("text-xs opacity-60", theme === 'dark' ? "text-gray-500" : "text-gray-400")}>
                    Please select a collection to initialize the 24/7 Analytic Grid.
                </p>
            </div>
        );
    }

    const isWaitingForData = symbols.length > 0 && symbolsFromData.length === 0 && isLive;
    if (isWaitingForData) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-4">
                <Radio size={48} className="text-indigo-500 animate-pulse" />
                <h3 className={clsx("text-lg font-black uppercase tracking-widest", theme === 'dark' ? "text-indigo-400" : "text-indigo-500")}>
                    Synchronizing Feed Layout
                </h3>
                <p className={clsx("text-xs opacity-60", theme === 'dark' ? "text-gray-400" : "text-gray-500")}>
                    Re-aggregating {symbols.length} symbols across {slotCount} unique time slots...
                </p>
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col p-4 overflow-hidden">
            {/* Connection Banner & Data Vitality Pulse */}
            <div className={clsx(
                "flex items-center justify-between px-5 py-3 rounded-2xl mb-4 border transition-all shrink-0",
                theme === 'dark' ? "bg-black/40 border-white/10" : "bg-gray-50 border-gray-200"
            )}>
                <div className="flex items-center space-x-3">
                    <div className={clsx("size-2 rounded-full", isLive ? "bg-emerald-400 animate-pulse" : "bg-gray-500")} />
                    <span className={clsx("text-[11px] font-black uppercase tracking-widest", theme === 'dark' ? "text-gray-300" : "text-gray-700")}>
                        {isLive ? `Live Feed Active Engine — ${symbols.length} symbols streaming` : 'Snapshot Mode (No Live Feed)'}
                    </span>
                    {data.timestamp && (
                        <div className={clsx(
                            "flex items-center space-x-2 px-3 py-1 rounded-full border ml-4 shadow-sm transition-all duration-75",
                            theme === 'dark' ? "bg-indigo-500/10 border-indigo-500/30" : "bg-indigo-50 border-indigo-200"
                        )}>
                            <Zap size={10} className="text-amber-500 animate-pulse" />
                            <span className={clsx("text-[10px] font-mono font-black uppercase tracking-widest", theme === 'dark' ? "text-indigo-300" : "text-indigo-600")}>
                                LAST SYNC: {data.timestamp}
                            </span>
                        </div>
                    )}
                </div>
                {/* Right Side Refresh Indicator & Auth Status */}
                <div className="flex items-center space-x-3">
                    {data.authenticated === false && (
                        <div className={clsx(
                            "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center space-x-2 border animate-pulse",
                            theme === 'dark' ? "bg-rose-500/10 border-rose-500/30 text-rose-400" : "bg-rose-50 border-rose-200 text-rose-600"
                        )}>
                            <AlertCircle size={10} />
                            <span>Broker Token Expired — Please Login</span>
                        </div>
                    )}
                    <div className={clsx(
                        "px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-wider flex items-center space-x-2",
                        theme === 'dark' ? "bg-white/5 text-gray-400" : "bg-gray-100 text-gray-500"
                    )}>
                        <span className="size-1.5 bg-emerald-500 rounded-full animate-ping"></span>
                        <span>Auto-Refresh Active</span>
                    </div>
                </div>
            </div>

            <div className={clsx(
                "flex-1 overflow-auto pb-32 scrollbar-hide rounded-3xl border shadow-2xl backdrop-blur-md transition-all relative",
                theme === 'dark' ? "bg-black/40 border-white/5" : "bg-white border-gray-200"
            )}>
                <table className="w-full border-collapse">
                    <thead className={clsx(
                        "sticky top-0 z-30 shadow-sm backdrop-blur-2xl",
                        theme === 'dark' ? "bg-[#13131a]/95" : "bg-white/95"
                    )}>
                        <tr>
                            <th colSpan={2} className={clsx(
                                "p-2 border-b border-r text-left align-bottom",
                                theme === 'dark' ? "border-white/10" : "border-gray-200"
                            )}>
                                <div className={clsx(
                                    "flex items-center space-x-2 px-2 py-1.5 flex-1 rounded border",
                                    theme === 'dark' ? "bg-black/40 border-white/10 focus-within:border-white/30" : "bg-white border-gray-200 focus-within:border-gray-400"
                                )}>
                                    <Search size={12} className={theme === 'dark' ? "text-gray-400" : "text-gray-500"} />
                                    <input 
                                        type="text"
                                        placeholder="SEARCH INSTRUMENT"
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className={clsx(
                                            "bg-transparent border-none outline-none text-[10px] font-black uppercase tracking-widest w-full",
                                            theme === 'dark' ? "text-white placeholder-gray-600" : "text-gray-900 placeholder-gray-400"
                                        )}
                                    />
                                </div>
                            </th>
                            {phases.map((phase, i) => (
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
                                        data={data?.data?.[sym] || {}}
                                        isFirst={idx === 0}
                                        theme={theme}
                                        slotCount={slotCount}
                                        dailySummary={data?.daily_summary?.[sym]}
                                        isSubscribed={subscribedSet.has(sym)}
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
