import React, { useMemo, useState, useCallback } from 'react';
import Plot from 'react-plotly.js';
import { Activity, TrendingUp, AlertTriangle, Compass, CheckCircle2, Info } from 'lucide-react';
import { clsx } from 'clsx';

// Unified Theme System
const getThemeColors = (theme) => {
    const isDark = theme === 'dark';
    return {
        bg: isDark ? '#0a0a0a' : '#ffffff',
        paper: 'transparent',
        text: isDark ? '#d1d5db' : '#374151',
        title: isDark ? '#f3f4f6' : '#111827',
        grid: isDark ? '#27272a' : '#e5e7eb', // zinc-800 or gray-200
        zeroLine: isDark ? '#52525b' : '#9ca3af',
        bull: '#10b981', // Emerald 500
        strongBull: '#059669', // Emerald 600
        bear: '#f43f5e', // Rose 500
        strongBear: '#e11d48', // Rose 600
        neutral: '#71717a', // Zinc 500
        signals: {
            price_ma: '#8b5cf6', // Violet
            ma_align: '#ec4899', // Pink
            momentum: '#06b6d4', // Cyan
            volatility: '#eab308', // Yellow
            trend: '#f97316' // Orange
        }
    };
};

// Insightful Stat Card
const StatCard = ({ title, value, subtext, icon: Icon, theme, accentColor, tooltipContent }) => {
    const isDark = theme === 'dark';
    return (
        <div className={clsx(
            "rounded-xl border p-5 flex flex-col justify-between transition-colors shadow-sm relative group",
            isDark ? "bg-[#161618] border-zinc-800 hover:border-zinc-700" : "bg-white border-gray-100 hover:border-gray-200"
        )}>
            <div className="flex justify-between items-start mb-3">
                <div className="flex items-center space-x-1.5 z-10 cursor-help">
                    <h3 className={clsx("text-sm font-semibold tracking-wide", isDark ? "text-zinc-400" : "text-gray-500")}>
                        {title}
                    </h3>
                    {tooltipContent && <Info className={clsx("w-3.5 h-3.5 mb-px opacity-70", isDark ? "text-indigo-400" : "text-indigo-600")} />}
                </div>
                <div 
                    className="p-2 rounded-lg" 
                    style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
                >
                    <Icon className="w-5 h-5" />
                </div>
            </div>
            <div className="flex flex-col">
                <span className={clsx("text-2xl font-bold tracking-tight mb-1", isDark ? "text-white" : "text-gray-900")}>{value}</span>
                {subtext && <span className={clsx("text-xs font-medium", isDark ? "text-zinc-500" : "text-gray-400")}>{subtext}</span>}
            </div>
            {tooltipContent && (
                <div className={clsx(
                    "absolute top-full left-0 mt-3 w-72 p-4 rounded-xl shadow-2xl text-xs z-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none",
                    isDark ? "bg-[#1f1f22] border border-zinc-700 text-zinc-300" : "bg-white border border-gray-200 text-gray-600"
                )}>
                    {tooltipContent}
                </div>
            )}
        </div>
    );
};

// Explanatory Panel Wrapper
const PanelWithCaption = ({ children, title, description, theme, className }) => {
    const isDark = theme === 'dark';
    return (
        <div className={clsx(
            "p-4 rounded-xl border flex flex-col shadow-sm",
            isDark ? "bg-[#161618] border-zinc-800" : "bg-white border-gray-100",
            className
        )}>
            <div className="mb-2">
                <h3 className={clsx("text-[13px] font-bold tracking-wide uppercase", isDark ? "text-zinc-200" : "text-gray-800")}>{title}</h3>
                <div className="flex items-start mt-1 space-x-1.5 opacity-90">
                    <Info className={clsx("w-3.5 h-3.5 mt-0.5 shrink-0", isDark ? "text-indigo-400" : "text-indigo-600")} />
                    <p className={clsx("text-[11px] leading-snug", isDark ? "text-zinc-400" : "text-gray-500")}>
                        {description}
                    </p>
                </div>
            </div>
            <div className="flex-1 w-full h-full">
                {children}
            </div>
        </div>
    );
};

const RegimeDashboard = ({ data, isLoading, theme = 'dark' }) => {
    const [syncRange, setSyncRange] = useState(null);
    const [msConfig, setMsConfig] = useState({ showBullish: true, showBearish: true });
    
    // 0. Base Styles & Theme
    const th = getThemeColors(theme);
    const isDark = theme === 'dark';

    // 0.1 Data Preparation (Safe destructuring)
    const { timeseries = [], distribution = [], transitionMatrix = [], summary = {} } = data || {};
    const dates = useMemo(() => timeseries.map(d => d.time), [timeseries]);
    const prices = useMemo(() => timeseries.map(d => d.close), [timeseries]);
    const sma20 = useMemo(() => timeseries.map(d => d.sma_20), [timeseries]);
    const sma50 = useMemo(() => timeseries.map(d => d.sma_50), [timeseries]);
    const scores = useMemo(() => timeseries.map(d => d.score), [timeseries]);

    const baseLayout = useMemo(() => ({
        paper_bgcolor: th.paper,
        plot_bgcolor: th.paper,
        font: { family: 'Inter, system-ui, sans-serif', color: th.text, size: 10 },
        xaxis: { gridcolor: th.grid, zerolinecolor: th.zeroLine, tickfont: { size: 9 }, showgrid: true, zeroline: false },
        yaxis: { gridcolor: th.grid, zerolinecolor: th.zeroLine, tickfont: { size: 9 }, showgrid: true, zeroline: false },
        margin: { t: 10, r: 10, l: 40, b: 30 },
        hovermode: 'x unified',
        hoverlabel: { bgcolor: isDark ? '#18181b' : '#ffffff', font: { color: th.text, family: 'Inter' }, bordercolor: th.grid }
    }), [th, isDark]);

    // 0.2 Dynamic Range Benchmarks
    const rangeMetrics = useMemo(() => {
        if (!prices || prices.length === 0) return { high: 0, low: 0, ltp: 0 };
        return {
            high: Math.max(...prices),
            low: Math.min(...prices),
            ltp: prices[prices.length - 1]
        };
    }, [prices]);

    // Dynamic Regime Colors
    const getRegimeColor = useCallback((regime, opacity = 1.0) => {
        let hex = th.neutral;
        if (regime === "Strong Bull") hex = th.strongBull;
        else if (regime === "Bull") hex = th.bull;
        else if (regime === "Bear") hex = th.bear;
        else if (regime === "Strong Bear") hex = th.strongBear;
        
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return `rgba(${r}, ${g}, ${b}, ${opacity})`;
    }, [th]);

    // 1. Price Action w/ Regime Shading
    const shapes = useMemo(() => {
        const s = [];
        if (!timeseries || timeseries.length === 0) return s;
        
        let currentRegime = timeseries[0].regime;
        let startIndex = 0;
        
        for (let i = 1; i < timeseries.length; i++) {
            if (timeseries[i].regime !== currentRegime || i === timeseries.length - 1) {
                s.push({
                    type: 'rect', xref: 'x', yref: 'paper',
                    x0: dates[startIndex], x1: dates[i],
                    y0: 0, y1: 1,
                    fillcolor: getRegimeColor(currentRegime, isDark ? 0.15 : 0.08),
                    line: { width: 0 }, layer: 'below'
                });
                
                currentRegime = timeseries[i].regime;
                startIndex = i;
            }
        }
        return s;
    }, [timeseries, dates, isDark, getRegimeColor]);

    // 2. Market Structure (Pivots)
    const marketStructurePoints = useMemo(() => {
        const ms = { x: [], y: [], text: [], color: [], position: [] };
        if (!prices || prices.length < 10) return ms;

        let lastHigh = null;
        let lastLow = null;
        const window = 5;

        for (let i = window; i < prices.length - window; i++) {
            const cur = prices[i];
            const isPeak = prices.slice(i - window, i + window + 1).every(p => p <= cur);
            const isValley = prices.slice(i - window, i + window + 1).every(p => p >= cur);

            if (isPeak) {
                let label = 'H';
                if (lastHigh !== null) label = cur > lastHigh ? 'HH' : 'LH';
                if ((label === 'HH' && msConfig.showBullish) || (label === 'LH' && msConfig.showBearish) || (label === 'H' && (msConfig.showBullish || msConfig.showBearish))) {
                    ms.x.push(dates[i]);
                    ms.y.push(prices[i]);
                    ms.text.push(label);
                    ms.color.push(label === 'HH' ? th.bull : th.bear);
                    ms.position.push('top center');
                }
                lastHigh = cur;
            } else if (isValley) {
                let label = 'L';
                if (lastLow !== null) label = cur > lastLow ? 'HL' : 'LL';
                if ((label === 'HL' && msConfig.showBullish) || (label === 'LL' && msConfig.showBearish) || (label === 'L' && (msConfig.showBullish || msConfig.showBearish))) {
                    ms.x.push(dates[i]);
                    ms.y.push(prices[i]);
                    ms.text.push(label);
                    ms.color.push(label === 'HL' ? th.strongBull : th.strongBear);
                    ms.position.push('bottom center');
                }
                lastLow = cur;
            }
        }
        return ms;
    }, [prices, dates, th, msConfig]);

    const handleZoom = (e) => {
        const x0 = e['xaxis.range[0]'];
        const x1 = e['xaxis.range[1]'];
        if (x0 && x1) {
            if (!syncRange || syncRange[0] !== x0 || syncRange[1] !== x1) setSyncRange([x0, x1]);
        } else if (e['xaxis.autorange']) {
            if (syncRange !== null) setSyncRange(null);
        }
    };

    // EARLY RETURNS: ONLY AFTER ALL HOOKS
    if (isLoading) {
        return (
            <div className={clsx("w-full h-96 flex items-center justify-center rounded-xl border", isDark ? "bg-[#161618] border-zinc-800" : "bg-gray-50 border-gray-200")}>
                <div className="flex flex-col items-center space-y-4">
                    <Activity className={clsx("w-10 h-10 animate-spin", isDark ? "text-indigo-500" : "text-indigo-600")} />
                    <span className={clsx("text-sm font-semibold tracking-widest", isDark ? "text-zinc-400" : "text-gray-500")}>Processing Deep Analytics...</span>
                </div>
            </div>
        );
    }

    if (!data || timeseries.length === 0) {
        return (
            <div className={clsx("w-full p-12 text-center rounded-xl border", isDark ? "bg-[#161618] border-zinc-800" : "bg-gray-50 border-gray-200")}>
                <AlertTriangle className={clsx("w-10 h-10 mx-auto mb-4", isDark ? "text-zinc-600" : "text-gray-400")} />
                <p className={clsx("text-base font-medium", isDark ? "text-zinc-400" : "text-gray-500")}>We need historical data points to generate trend graphs.</p>
            </div>
        );
    }

    const priceLayout = {
        ...baseLayout,
        shapes: shapes,
        showlegend: true,
        legend: { orientation: "h", y: 1.05, x: 1, xanchor: 'right', font: { size: 10 }, bgcolor: 'transparent' },
        xaxis: { ...baseLayout.xaxis, ...(syncRange ? { range: syncRange } : {}) },
        yaxis: { ...baseLayout.yaxis, tickformat: '.2f', title: { text: "Price", font: { size: 9, color: th.text } } },
        margin: { t: 10, r: 10, l: 45, b: 30 }
    };

    const strengthLayout = {
        ...baseLayout,
        margin: { t: 10, r: 10, l: 40, b: 30 },
        xaxis: { ...baseLayout.xaxis, ...(syncRange ? { range: syncRange } : {}) },
        yaxis: { ...baseLayout.yaxis, range: [-12, 12], tickvals: [-6, -2, 0, 2, 6], title: { text: "Velocity", font: { size: 9, color: th.text } } },
        shapes: [
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 6, y1: 6, line: { color: th.strongBull, dash: 'dot', width: 1.5 } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 2, y1: 2, line: { color: th.bull, dash: 'dot', width: 1.5 } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: 0, y1: 0, line: { color: th.neutral, width: 2 } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: -2, y1: -2, line: { color: th.bear, dash: 'dot', width: 1.5 } },
            { type: 'line', xref: 'paper', x0: 0, x1: 1, y0: -6, y1: -6, line: { color: th.strongBear, dash: 'dot', width: 1.5 } }
        ]
    };

    // 2. Heatmap Layout (Removed redundant standalone oscillator code)

    // 3. Markov Heatmap (Transition Probability)
    const regimesList = ["Strong Bull", "Bull", "Neutral", "Bear", "Strong Bear"];
    const zValues = regimesList.map(r1 => regimesList.map(r2 => {
        const row = transitionMatrix.find(t => t.regime === r1);
        return row ? row[r2] : 0;
    }));
    
    const heatMapLayout = {
        ...baseLayout,
        annotations: [],
        margin: { t: 20, r: 20, l: 70, b: 30 },
        xaxis: { ...baseLayout.xaxis, tickangle: -45 }
    };
    
    for (let i = 0; i < regimesList.length; i++) {
        for (let j = 0; j < regimesList.length; j++) {
            const val = zValues[i][j];
            heatMapLayout.annotations.push({
                x: regimesList[j],
                y: regimesList[i],
                text: val.toFixed(1) + "%",
                font: { color: isDark ? (val > 40 ? '#000' : '#fff') : (val > 40 ? '#fff' : '#000'), size: 9 },
                showarrow: false
            });
        }
    }

    // 4. Time Spent Pie Chart
    const pieValues = distribution.map(d => d.value);
    const pieLabels = distribution.map(d => d.name);
    const pieColors = pieLabels.map(l => getRegimeColor(l, 0.95));

    // 5. Stacked Signal Decomposition
    const sigGroups = { "Strong Bull": {}, "Bull": {}, "Neutral": {}, "Bear": {}, "Strong Bear": {} };
    timeseries.forEach(t => {
        const r = t.regime;
        if (!sigGroups[r] || !t.signals) return;
        Object.keys(t.signals).forEach(k => {
            if (!sigGroups[r][k]) sigGroups[r][k] = 0;
            sigGroups[r][k] += Math.abs(t.signals[k] || 0);
        });
    });

    const signalTraces = Object.keys(th.signals).map(sigKey => {
        return {
            x: regimesList,
            y: regimesList.map(r => sigGroups[r][sigKey] || 0),
            name: sigKey.replace('_', ' ').toUpperCase(),
            type: 'bar',
            marker: { color: th.signals[sigKey], line: { color: th.bg, width: 1 } }
        };
    });

    const stackLayout = {
        ...baseLayout,
        barmode: 'stack',
        showlegend: true,
        legend: { orientation: "h", y: -0.2, font: { size: 9 } }
    };

    // Derived Display Data
    const currentRegimeColor = getRegimeColor(summary?.currentRegime, 1);
    
    let recommendationTitle = "Hold";
    let recommendationSub = summary?.recommendation || "Analyzing...";
    if (recommendationSub.includes("100%")) { recommendationTitle = "Strong Buy"; recommendationSub = "Passive Allocation"; }
    else if (recommendationSub.includes("80%")) { recommendationTitle = "Hold / Monitor"; recommendationSub = "20% Tactical"; }
    else if (recommendationSub.includes("95%")) { recommendationTitle = "Buy"; recommendationSub = "5% Hedged"; }
    else if (recommendationSub.includes("70%")) { recommendationTitle = "Reduce Exposure"; recommendationSub = "30% Mean Reversion"; }
    else if (recommendationSub.includes("60%")) { recommendationTitle = "Strong Sell"; recommendationSub = "40% Mean Reversion"; }

    const latestSignals = summary?.latestSignals || {};
    const currentScore = summary?.latestScore || 0;
    
    // Contextual Reversal Engine
    const reversalRate = timeseries.length > 0 ? (((summary?.totalChanges || 0) / timeseries.length) * 100) : 0;
    let chopProfileText = "Average Volatility";
    if (reversalRate < 1.0) chopProfileText = "Clean & Highly Trending";
    else if (reversalRate < 2.5) chopProfileText = "Stable Trending Market";
    else if (reversalRate >= 4.5) chopProfileText = "High Chop / Ranging";
    else if (reversalRate >= 3.0) chopProfileText = "Choppy Environment";
    
    const breakdownData = [
        { name: "Price vs Moving Averages", desc: "Is price > 20, 50, and 200 SMA?", pts: latestSignals?.price_ma || 0, max: 3 },
        { name: "Moving Average Alignment", desc: "Are MAs perfectly stacked and trending?", pts: latestSignals?.ma_align || 0, max: 2 },
        { name: "Momentum (Rate of Change)", desc: "Velocity of the 50-period trend.", pts: latestSignals?.momentum || 0, max: 3 },
        { name: "Volatility (StdDev)", desc: "Is market action smooth or choppy?", pts: latestSignals?.volatility || 0, max: 2 },
        { name: "Recent Structure", desc: "Making Higher-Highs or Lower-Lows?", pts: latestSignals?.trend || 0, max: 1 }
    ];

    return (
        <div className="w-full space-y-5 font-sans pb-10">
            
            {/* Master Trend Speedometer (Instant Clarity) */}
            <div className={clsx(
                "w-full rounded-2xl border p-8 shadow-md text-center flex flex-col items-center justify-center overflow-hidden relative",
                isDark ? "bg-[#161618] border-zinc-800" : "bg-white border-gray-100"
            )}>
                {/* Background ambient glow based on score */}
                <div className={clsx(
                    "absolute inset-0 opacity-10 pointer-events-none transition-colors duration-1000",
                    currentScore > 0 ? "bg-emerald-500" : currentScore < 0 ? "bg-rose-500" : "bg-zinc-500"
                )} />

                <h1 className={clsx("text-4xl md:text-5xl font-black mb-2 tracking-tight z-10", 
                    currentScore > 0 ? (isDark ? "text-emerald-400" : "text-emerald-600") : 
                    currentScore < 0 ? (isDark ? "text-rose-400" : "text-rose-600") : 
                    (isDark ? "text-zinc-400" : "text-gray-500")
                )}>
                    {(summary?.currentRegime || 'N/A').toUpperCase()}
                </h1>
                
                <p className={clsx("text-sm md:text-base font-medium mb-6 z-10 opacity-90", isDark ? "text-zinc-300" : "text-gray-600")}>
                    The algorithm is <span className="font-bold">{((summary?.confidence || 0)*100).toFixed(0)}% confident</span> the asset is experiencing a <span className="font-bold underline decoration-dashed decoration-zinc-500 underline-offset-4">{chopProfileText}</span>.
                </p>

                {/* Score Gauge Bar */}
                <div className="w-full max-w-4xl relative z-10 mt-2">
                    <div className={clsx("flex justify-between w-full text-[10px] font-black uppercase mb-3 tracking-widest", isDark ? "text-zinc-500" : "text-gray-400")}>
                        <span>Deep Bear (-11)</span>
                        <span>Neutral (0)</span>
                        <span>Deep Bull (+11)</span>
                    </div>
                    
                    {/* Background Track */}
                    <div className={clsx("h-4 rounded-full w-full relative overflow-hidden flex shadow-inner", isDark ? "bg-[#27272a]" : "bg-gray-200")}>
                        {/* Center Zero Line Divider */}
                        <div className={clsx("absolute left-1/2 top-0 bottom-0 w-[3px] z-20", isDark ? "bg-zinc-600" : "bg-gray-400")} />
                        
                        {/* Bear Fill (Left Side) - Extends backwards from Center */}
                        <div className="w-1/2 h-full flex justify-end">
                            {currentScore < 0 && (
                                <div 
                                    className="h-full bg-gradient-to-l from-rose-500 to-rose-700 transition-all duration-1000 ease-out"
                                    style={{ width: `${Math.abs((currentScore / 11) * 100)}%` }}
                                />
                            )}
                        </div>
                        
                        {/* Bull Fill (Right Side) - Extends forwards from Center */}
                        <div className="w-1/2 h-full flex justify-start">
                            {currentScore > 0 && (
                                <div 
                                    className="h-full bg-gradient-to-r from-emerald-500 to-emerald-700 transition-all duration-1000 ease-out"
                                    style={{ width: `${(currentScore / 11) * 100}%` }}
                                />
                            )}
                        </div>
                    </div>
                    
                    <div className={clsx("text-center mt-4 text-[11px] font-black uppercase tracking-widest", isDark ? "text-zinc-400" : "text-gray-500")}>
                        Total Algorithm Output: <span className={currentScore > 0 ? (isDark ? "text-emerald-400" : "text-emerald-600") : currentScore < 0 ? (isDark ? "text-rose-400" : "text-rose-600") : ""}>{currentScore > 0 ? '+' : ''}{currentScore} points</span>
                    </div>
                </div>
            </div>

            {/* Top Insight Bar */}
            <div className={clsx("rounded-xl border p-5 shadow-sm", isDark ? "bg-[#161618] border-zinc-800" : "bg-white border-gray-100")}>
                <div className="flex items-center space-x-3 mb-5">
                    <Compass className={clsx("w-6 h-6", isDark ? "text-indigo-400" : "text-indigo-600")} />
                    <h2 className={clsx("text-lg font-bold", isDark ? "text-white" : "text-gray-900")}>
                        Core Structural Metrics
                    </h2>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                    <StatCard 
                        title="Current Trend" 
                        value={(summary?.currentRegime || 'N/A').replace("Strong ", "Extreme ")} 
                        subtext="As of latest historical bar"
                        icon={TrendingUp}
                        theme={theme}
                        accentColor={currentRegimeColor}
                    />
                    <StatCard 
                        title="Trend Strength" 
                        value={`${((summary?.confidence || 0) * 100).toFixed(0)}% ${(summary?.currentRegime || '').includes('Bear') ? 'Bear' : (summary?.currentRegime || '').includes('Bull') ? 'Bull' : ''}`}
                        subtext="Momentum & MA confirmation"
                        icon={Activity}
                        theme={theme}
                        accentColor={isDark ? '#60a5fa' : '#3b82f6'}
                        tooltipContent={
                            <div className="flex flex-col space-y-2">
                                <div className={clsx("font-bold border-b pb-2 mb-1", isDark ? "border-zinc-700 text-white" : "border-gray-200 text-gray-900")}>
                                    Live Scoring Engine Output
                                </div>
                                {breakdownData.map(r => (
                                    <div key={r.name} className="flex justify-between items-center text-[11px]">
                                        <span>{r.name}</span>
                                        <span className={clsx("font-black tracking-wider", r.pts > 0 ? (isDark ? "text-emerald-400" : "text-emerald-600") : r.pts < 0 ? (isDark ? "text-rose-400" : "text-rose-600") : "text-gray-500")}>
                                            {r.pts > 0 ? '+' : ''}{r.pts} <span className={clsx("font-normal ml-1", isDark ? "text-zinc-500" : "text-gray-400")}>/ &plusmn;{r.max}</span>
                                        </span>
                                    </div>
                                ))}
                                <div className={clsx("border-t pt-2 mt-2 flex justify-between font-black", isDark ? "border-zinc-700 text-indigo-400" : "border-gray-200 text-indigo-600")}>
                                    <span>Total Hybrid Score</span>
                                    <span>{currentScore > 0 ? '+' : ''}{currentScore} <span className="text-[10px] font-normal tracking-normal ml-1 border border-current px-1 rounded">Limit: ±11</span></span>
                                </div>
                            </div>
                        }
                    />
                    <StatCard 
                        title="Trend Reversals" 
                        value={summary?.totalChanges || 0}
                        subtext={chopProfileText}
                        icon={AlertTriangle}
                        theme={theme}
                        accentColor={isDark ? '#fbbf24' : '#d97706'}
                        tooltipContent={
                            <div className="flex flex-col space-y-2">
                                <div className={clsx("font-bold border-b pb-2 mb-1", isDark ? "border-zinc-700 text-white" : "border-gray-200 text-gray-900")}>
                                    Reversal Detection Algorithm
                                </div>
                                <span className={clsx("text-[11px] font-medium opacity-90 mb-1", isDark ? "text-zinc-400" : "text-gray-500")}>
                                    A trend shift is mathematically validated only when:
                                </span>
                                
                                <div className="flex items-start space-x-2 text-[11px]">
                                    <div className={clsx("w-1.5 h-1.5 rounded-full mt-1 shrink-0", isDark ? "bg-amber-400" : "bg-amber-600")} />
                                    <span>Score crosses Neutral boundary (&plusmn;2 pts)</span>
                                </div>
                                <div className="flex items-start space-x-2 text-[11px]">
                                    <div className={clsx("w-1.5 h-1.5 rounded-full mt-1 shrink-0", isDark ? "bg-amber-400" : "bg-amber-600")} />
                                    <span>Persists for <strong>3 consecutive periods</strong> (Anti-chop filter)</span>
                                </div>
                                <div className="flex items-start space-x-2 text-[11px]">
                                    <div className={clsx("w-1.5 h-1.5 rounded-full mt-1 shrink-0", isDark ? "bg-amber-400" : "bg-amber-600")} />
                                    <span>Strength hits <strong>&gt;40% Conviction</strong></span>
                                </div>

                                <div className={clsx("border-t pt-2 mt-2 font-black text-[11px] flex justify-between items-center", isDark ? "border-zinc-700 text-amber-500" : "border-gray-200 text-amber-600")}>
                                    <span>Total Verified Shifts</span>
                                    <div className="text-right leading-none">
                                        <span className="text-sm">{summary?.totalChanges || 0}</span>
                                        <div className="text-[9px] uppercase tracking-widest mt-1 opacity-80">{chopProfileText}</div>
                                    </div>
                                </div>
                            </div>
                        }
                    />
                    <StatCard 
                        title="Suggested Action" 
                        value={recommendationTitle}
                        subtext={recommendationSub}
                        icon={CheckCircle2}
                        theme={theme}
                        accentColor={summary?.recommendation?.includes("Mean Reversion") ? th.bear : th.bull}
                        tooltipContent={
                            <div className="flex flex-col space-y-1">
                                <span>Strategy output derived from current Market state.</span>
                                <span className="mt-1 font-bold">100% Passive = Full Buy & Hold rules.</span>
                                <span className="font-bold">20-40% Tactical = Short term trading rules.</span>
                            </div>
                        }
                    />
                </div>
            </div>

            {/* Visual Analytics Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                
                {/* Panel 1: Price Action */}
                <PanelWithCaption 
                    theme={theme} 
                    className="col-span-full"
                >
                    {/* Dynamic Range Benchmarks Bar */}
                    {rangeMetrics.high > 0 && (
                        <div className={clsx(
                            "flex items-center space-x-6 mb-4 px-4 py-2 rounded-xl border shadow-sm overflow-hidden group",
                            isDark ? "bg-zinc-900 border-zinc-800" : "bg-gray-100/50 border-gray-200"
                        )}>
                           <div className="flex flex-col">
                               <span className={clsx("text-[8px] font-black uppercase tracking-tighter", isDark ? "text-zinc-500" : "text-gray-400")}>Active Range</span>
                               <span className={clsx("text-[14px] font-black italic uppercase tracking-tighter", isDark ? "text-white" : "text-gray-900")}>
                                   {summary?.symbol || 'N/A'}
                               </span>
                           </div>
                           
                           <div className={clsx("h-8 w-[1px] mx-2", isDark ? "bg-zinc-800" : "bg-gray-200")} />
                           
                           <div className="flex flex-col">
                               <span className={clsx("text-[8px] font-black uppercase", isDark ? "text-zinc-500" : "text-gray-400")}>Range High</span>
                               <div className="flex items-baseline space-x-2">
                                   <span className="text-[13px] font-black text-rose-400">{rangeMetrics.high.toLocaleString()}</span>
                                   <span className="text-[10px] font-bold text-rose-500/80">
                                       {((rangeMetrics.ltp / rangeMetrics.high - 1) * 100).toFixed(1)}%
                                   </span>
                               </div>
                           </div>

                           <div className="hidden sm:flex flex-col">
                               <span className={clsx("text-[8px] font-black uppercase", isDark ? "text-zinc-500" : "text-gray-400")}>Range Low</span>
                               <div className="flex items-baseline space-x-2">
                                   <span className="text-[13px] font-black text-emerald-400">{rangeMetrics.low.toLocaleString()}</span>
                                   <span className="text-[10px] font-bold text-emerald-500/80">
                                       + {((rangeMetrics.ltp - rangeMetrics.low) / rangeMetrics.low * 100).toFixed(1)}% away
                                   </span>
                               </div>
                           </div>

                           <div className="ml-auto flex flex-col items-end">
                               <span className={clsx("text-[8px] font-black uppercase tracking-widest", isDark ? "text-zinc-500" : "text-gray-400")}>Last Price</span>
                               <span className={clsx("text-lg font-black tracking-tighter", isDark ? "text-white" : "text-gray-900")}>
                                   {rangeMetrics.ltp?.toLocaleString() || '---'}
                               </span>
                           </div>
                        </div>
                    )}

                    {/* Structure Toggles */}
                    <div className="flex items-center space-x-2 mb-4 p-1 rounded-lg border border-zinc-800/40 bg-zinc-900/10">
                        <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2 mr-1">Pivot Filters:</span>
                        
                        <button 
                            onClick={() => setMsConfig(prev => ({...prev, showBullish: !prev.showBullish}))}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-bold transition-all border",
                                msConfig.showBullish 
                                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.1)]" 
                                    : "bg-transparent border-zinc-800 text-zinc-600 grayscale opacity-50"
                            )}
                        >
                            BULLISH (HH/HL)
                        </button>
                        
                        <button 
                            onClick={() => setMsConfig(prev => ({...prev, showBearish: !prev.showBearish}))}
                            className={clsx(
                                "px-3 py-1 rounded text-[10px] font-bold transition-all border",
                                msConfig.showBearish 
                                    ? "bg-rose-500/10 border-rose-500/50 text-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.1)]" 
                                    : "bg-transparent border-zinc-800 text-zinc-600 grayscale opacity-50"
                            )}
                        >
                            BEARISH (LL/LH)
                        </button>
                    </div>

                    <Plot
                        data={[
                            { x: dates, y: prices, type: 'scatter', mode: 'lines', name: 'Price', line: { color: isDark ? '#ffffff' : '#111827', width: 2 } },
                            { 
                                x: marketStructurePoints.x, 
                                y: marketStructurePoints.y, 
                                type: 'scatter', 
                                mode: 'text', 
                                text: marketStructurePoints.text,
                                textposition: marketStructurePoints.position,
                                textfont: { family: 'Inter', size: 8, weight: '900', color: marketStructurePoints.color },
                                showlegend: false,
                                hoverinfo: 'none'
                            },
                            { x: dates, y: sma20, type: 'scatter', mode: 'lines', name: 'SMA20', line: { color: th.signals.ma_align, width: 1, dash: 'dot' }, opacity: 0.8 },
                            { x: dates, y: sma50, type: 'scatter', mode: 'lines', name: 'SMA50', line: { color: th.neutral, width: 1, dash: 'dash' }, opacity: 0.8 }
                        ]}
                        layout={priceLayout}
                        onRelayout={handleZoom}
                        useResizeHandler={true}
                        style={{ width: '100%', height: '100%', minHeight: '350px' }}
                        config={{ displayModeBar: false, responsive: true }}
                    />
                </PanelWithCaption>

                {/* Panel 2: Trend Strength Velocity (Reborn underneath) */}
                <PanelWithCaption 
                    title="Trend Strength Velocity" 
                    description="Shows the velocity and acceleration of the trend score over time on a scale from -11 (Deep Bear Market) to +11 (Deep Bull Market). Zoom syncs automatically with the Price table." 
                    theme={theme} 
                    className="col-span-full"
                >
                        <Plot
                            data={[
                                { 
                                    x: dates, 
                                    y: scores, 
                                    type: 'scatter', 
                                    mode: 'lines', 
                                    fill: 'tozeroy',
                                    fillcolor: isDark ? 'rgba(99, 102, 241, 0.15)' : 'rgba(79, 70, 229, 0.08)',
                                    line: { color: isDark ? '#818cf8' : '#4f46e5', width: 2, shape: 'spline' },
                                    name: 'Velocity' 
                                }
                            ]}
                            layout={strengthLayout}
                            onRelayout={handleZoom}
                            useResizeHandler={true}
                            style={{ width: '100%', height: '100%', minHeight: '250px' }}
                            config={{ displayModeBar: false, responsive: true }}
                        />
                </PanelWithCaption>


                {/* Advanced Quant Dropdown */}
                <details className={clsx("group mt-8 p-6 rounded-xl border transition-all shadow-sm", isDark ? "bg-[#111113] border-zinc-800" : "bg-gray-50 border-gray-200")}>
                    <summary className={clsx("flex items-center justify-between cursor-pointer font-bold text-sm tracking-widest uppercase outline-none select-none", isDark ? "text-zinc-400 hover:text-white" : "text-gray-600 hover:text-black")}>
                        <div className="flex items-center space-x-2">
                            <Activity className="w-5 h-5 opacity-70" />
                            <span>Advanced Algorithmic Breakdown</span>
                        </div>
                        <span className="transition-transform group-open:rotate-180 text-xl font-normal leading-none opacity-50">+</span>
                    </summary>
                    
                    <div className="pt-8 grid grid-cols-1 lg:grid-cols-2 gap-5 animate-in fade-in slide-in-from-top-4 duration-500">
                        {/* Panel 2: Time Spent Pie */}
                        <PanelWithCaption 
                            title="Trend Distribution" 
                            description="Displays exactly what percentage of time the asset was situated within each specific market trend." 
                            theme={theme} 
                            className="lg:col-span-1"
                        >
                            <Plot
                                data={[{
                                    values: pieValues,
                                    labels: pieLabels,
                                    type: 'pie',
                                    marker: { colors: pieColors, line: { color: th.bg, width: 2 } },
                                    textinfo: "percent",
                                    textfont: { size: 12, color: '#fff', family: 'Inter', weight: 600 },
                                    hole: 0.65,
                                    hoverinfo: "label+percent"
                                }]}
                                layout={{
                                    ...baseLayout, 
                                    showlegend: true,
                                    legend: { orientation: 'h', y: -0.1 },
                                    margin: { t: 20, b: 30, l: 30, r: 30 }
                                }}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '100%', minHeight: '350px' }}
                                config={{ displayModeBar: false, responsive: true }}
                            />
                        </PanelWithCaption>

                        {/* Panel 4: Heatmap */}
                        <PanelWithCaption 
                            title="Transition Probabilities" 
                            description="A 'Markov Heatmap'. It mathematically calculates the chance that if you are currently in a Y-axis trend, what the odds are the next bar will result in an X-axis trend." 
                            theme={theme} 
                            className="lg:col-span-1"
                        >
                             <Plot
                                data={[{
                                    z: zValues,
                                    x: regimesList,
                                    y: regimesList,
                                    type: 'heatmap',
                                    colorscale: isDark ? 'YlGnBu' : 'Blues',
                                    reversescale: isDark,
                                    showscale: false,
                                    hoverongaps: false
                                }]}
                                layout={heatMapLayout}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '100%', minHeight: '300px' }}
                                config={{ displayModeBar: false, responsive: true }}
                            />
                        </PanelWithCaption>



                        {/* Panel 5: Decomposition */}
                        <PanelWithCaption 
                            title="Signal Decomposition" 
                            description="Breaks down which underlying technical algorithms (e.g. Price vs Momentum vs Volatility) had the most powerful influence on the trend scores." 
                            theme={theme} 
                            className="col-span-full"
                        >
                             <Plot
                                data={signalTraces}
                                layout={stackLayout}
                                useResizeHandler={true}
                                style={{ width: '100%', height: '100%', minHeight: '300px' }}
                                config={{ displayModeBar: false, responsive: true }}
                            />
                        </PanelWithCaption>
                    </div>
                </details>

            </div>
        </div>
    );
};

export default RegimeDashboard;
