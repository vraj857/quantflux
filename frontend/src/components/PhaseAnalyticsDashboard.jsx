import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { Activity, BarChart2, TrendingUp, Grid, Info } from 'lucide-react';

// ── Phase Definitions ─────────────────────────────────────────────────────────
const PHASE_NAMES  = ['Morning Phase', 'Midday Chop', 'Trend Formation', 'Closing Session'];
const PHASE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];
const PHASE_LABELS = ['🌅 Morning', '☁️ Midday', '📈 Trend', '🔔 Closing'];
const PHASE_SHORT  = ['Morning', 'Midday', 'Trend', 'Closing'];

// ── Helper ────────────────────────────────────────────────────────────────────
const get = (stats, pha, key, fallback = 0) => stats?.[pha]?.[key] ?? fallback;
const pct  = v => (v > 0 ? `+${v}%` : `${v}%`);

const plotlyConfig = {
    displaylogo: false,
    responsive: true,
    modeBarButtonsToRemove: ['select2d', 'lasso2d', 'autoScale2d'],
    toImageButtonOptions: { format: 'png', scale: 2 },
};

const basePlotLayout = (theme, extra = {}) => ({
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor:  'rgba(0,0,0,0)',
    font:  { color: theme === 'dark' ? '#9ca3af' : '#6b7280', size: 11, family: 'Inter, system-ui, sans-serif' },
    margin: { t: 30, b: 50, l: 60, r: 30 },
    hoverlabel: {
        bgcolor: theme === 'dark' ? '#1f2937' : '#ffffff',
        bordercolor: theme === 'dark' ? '#374151' : '#e5e7eb',
        font: { color: theme === 'dark' ? '#f9fafb' : '#111827', size: 12 },
    },
    ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// SHARED CARD WRAPPER
// ─────────────────────────────────────────────────────────────────────────────
const ChartCard = ({ title, subtitle, note, icon: Icon, children, theme }) => (
    <div className={clsx(
        'rounded-2xl border p-5 flex flex-col gap-3',
        theme === 'dark' ? 'bg-zinc-950/80 border-white/5' : 'bg-white border-gray-200 shadow-sm'
    )}>
        {/* Header */}
        <div>
            <div className='flex items-center gap-2 mb-0.5'>
                <Icon size={14} className='text-indigo-400' />
                <span className={clsx('text-[10px] font-black uppercase tracking-widest',
                    theme === 'dark' ? 'text-gray-300' : 'text-gray-700')}>{title}</span>
            </div>
            {subtitle && (
                <p className={clsx('text-[10px] leading-relaxed', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                    {subtitle}
                </p>
            )}
        </div>

        {/* Chart area */}
        {children}

        {/* Note */}
        {note && (
            <div className={clsx(
                'flex items-start gap-2 text-[10px] leading-relaxed rounded-xl px-3 py-2',
                theme === 'dark' ? 'bg-indigo-500/10 text-indigo-300' : 'bg-indigo-50 text-indigo-700'
            )}>
                <Info size={11} className='mt-0.5 shrink-0' />
                <span>{note}</span>
            </div>
        )}
    </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// CHART A — Phase Momentum Radar
// ─────────────────────────────────────────────────────────────────────────────
const RadarChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#374151' : '#e5e7eb';
    const metrics = ['Avg Move %', 'Market Share', 'Trend Strength', 'Price Swings'];

    const data = PHASE_NAMES.map((pha, i) => ({
        type: 'scatterpolar',
        r: [
            Math.min(Math.abs(get(stats, pha, 'avg_pc')), 100),
            get(stats, pha, 'vol_share'),
            get(stats, pha, 'persistence'),
            Math.min(get(stats, pha, 'volatility') * 15, 100),
        ],
        theta: metrics,
        fill: 'toself',
        name: PHASE_SHORT[i],
        hovertemplate: `<b>${PHASE_SHORT[i]}</b><br>%{theta}: %{r:.1f}<extra></extra>`,
        line: { color: PHASE_COLORS[i], width: 2 },
        fillcolor: `${PHASE_COLORS[i]}28`,
    }));

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme, { margin: { t: 20, b: 50, l: 40, r: 40 } }),
                polar: {
                    bgcolor: 'rgba(0,0,0,0)',
                    radialaxis: {
                        visible: true,
                        color: grid, gridcolor: grid,
                        range: [0, 100],
                        tickfont: { size: 9 },
                        ticksuffix: '',
                    },
                    angularaxis: { color: theme === 'dark' ? '#6b7280' : '#9ca3af', tickfont: { size: 10 } },
                },
                legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center', font: { size: 10 } },
                showlegend: true,
            }}
        />
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHART B — Performance Matrix (Grouped Bar)
// ─────────────────────────────────────────────────────────────────────────────
const PerformanceBarChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const text = theme === 'dark' ? '#9ca3af' : '#6b7280';
    const axisFont = { size: 10, color: text };

    const phaseYields = PHASE_NAMES.map(p => get(stats, p, 'phase_yield'));
    const volShares   = PHASE_NAMES.map(p => get(stats, p, 'vol_share'));

    const data = [
        {
            name: 'Net Price Move',
            x: PHASE_SHORT,
            y: phaseYields,
            type: 'bar',
            marker: { color: phaseYields.map(v => v >= 0 ? '#10b981' : '#f43f5e'), opacity: 0.9 },
            hovertemplate: '<b>%{x}</b><br>Net Move: <b>%{y:+.2f}%</b><extra></extra>',
            yaxis: 'y',
        },
        {
            name: 'Market Share',
            x: PHASE_SHORT,
            y: volShares,
            type: 'bar',
            marker: { color: PHASE_COLORS, opacity: 0.7 },
            hovertemplate: '<b>%{x}</b><br>Activity Share: <b>%{y:.1f}%</b><extra></extra>',
            yaxis: 'y2',
        },
    ];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme, { margin: { t: 10, b: 40, l: 50, r: 20 } }),
                showlegend: false,
                grid: { rows: 2, columns: 1, pattern: 'independent', roworder: 'top to bottom' },
                xaxis: { gridcolor: grid, tickfont: axisFont, fixedrange: true, anchor: 'y2' },
                yaxis: {
                    domain: [0.58, 1],
                    title: { text: 'Price Move %', font: { size: 9, color: '#10b981' } },
                    gridcolor: grid, tickfont: axisFont, fixedrange: true, tickformat: '+.1f'
                },
                yaxis2: {
                    domain: [0, 0.42],
                    title: { text: 'Market Share %', font: { size: 9, color: '#6366f1' } },
                    gridcolor: grid, tickfont: axisFont, fixedrange: true
                },
                annotations: [
                    { x: 0.5, y: 1.12, xref: 'paper', yref: 'y domain', text: 'NET PRICE MOVE', showarrow: false, font: { size: 8, color: text, weight: 'bold' } },
                    { x: 0.5, y: 1.15, xref: 'paper', yref: 'y2 domain', text: 'MARKET ACTIVITY SHARE', showarrow: false, font: { size: 8, color: text, weight: 'bold' } },
                ]
            }}
        />
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHART C — Volume Gathering (Area)
// ─────────────────────────────────────────────────────────────────────────────
const VolumeGatheringChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const axisFont = { size: 10, color: theme === 'dark' ? '#9ca3af' : '#6b7280' };
    const volShares = PHASE_NAMES.map(p => get(stats, p, 'vol_share'));

    const data = [
        {
            x: PHASE_SHORT, y: volShares,
            type: 'scatter', mode: 'lines+markers+text',
            fill: 'tozeroy',
            line: { color: '#6366f1', width: 2.5, shape: 'spline' },
            fillcolor: 'rgba(99,102,241,0.1)',
            marker: { size: 10, color: PHASE_COLORS, line: { color: '#fff', width: 2 } },
            text: volShares.map(v => `${v}%`),
            textposition: 'top center',
            textfont: { size: 11, color: theme === 'dark' ? '#c4b5fd' : '#6366f1' },
            name: 'Volume Share',
            hovertemplate: '<b>%{x} Phase</b><br>Volume Share: <b>%{y:.1f}%</b> of daily total<extra></extra>',
        },
    ];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                xaxis: { gridcolor: grid, tickfont: axisFont, fixedrange: true },
                yaxis: {
                    title: { text: 'Share of Daily Volume (%)', font: { size: 10 } },
                    gridcolor: grid, tickfont: axisFont, fixedrange: true,
                    ticksuffix: '%', range: [0, Math.max(...volShares) * 1.3],
                },
                showlegend: false,
            }}
        />
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHART D — Trend Strength vs Price Swings
// ─────────────────────────────────────────────────────────────────────────────
const TrendStrengthChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const axisFont = { size: 10, color: theme === 'dark' ? '#9ca3af' : '#6b7280' };

    const persistences = PHASE_NAMES.map(p => get(stats, p, 'persistence'));
    const volatilities  = PHASE_NAMES.map(p => get(stats, p, 'volatility'));

    const data = [
        {
            x: PHASE_SHORT, y: persistences,
            name: 'Trend Strength (% green slots)',
            type: 'bar',
            marker: {
                color: persistences.map(v => v >= 60 ? '#10b981' : v >= 40 ? '#f59e0b' : '#f43f5e'),
                opacity: 0.85, line: { width: 0 },
            },
            hovertemplate: '<b>%{x}</b><br>Trend Strength: <b>%{y:.1f}%</b><br>%{y:.1f}% of slots closed in the <br>same direction as phase start<extra></extra>',
        },
        {
            x: PHASE_SHORT, y: volatilities,
            name: 'Price Swings (Avg High-Low %)',
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#f59e0b', width: 2.5, dash: 'dot' },
            marker: { color: '#f59e0b', size: 10, symbol: 'diamond', line: { color: '#fff', width: 1.5 } },
            yaxis: 'y2',
            hovertemplate: '<b>%{x}</b><br>Price Swings: <b>%{y:.2f}%</b><br>Avg candle range (High - Low)<extra></extra>',
        },
    ];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                xaxis: { gridcolor: grid, tickfont: axisFont, fixedrange: true },
                yaxis: {
                    title: { text: '← Trend Strength (%)', font: { size: 10, color: '#10b981' } },
                    gridcolor: grid, tickfont: axisFont, fixedrange: true,
                    ticksuffix: '%', range: [0, 100],
                },
                yaxis2: {
                    title: { text: 'Price Swings % →', font: { size: 10, color: '#f59e0b' } },
                    overlaying: 'y', side: 'right',
                    tickfont: axisFont, gridcolor: 'transparent', fixedrange: true, ticksuffix: '%',
                },
                legend: { orientation: 'h', y: -0.22, x: 0.5, xanchor: 'center', font: { size: 10 } },
                showlegend: true,
                annotations: [
                    { x: 0.5, y: 1.04, xref: 'paper', yref: 'paper', text: '🟢 >60% Trend Strength = Good  🟡 40-60% = Moderate  🔴 <40% = Choppy', showarrow: false, font: { size: 9, color: theme === 'dark' ? '#6b7280' : '#9ca3af' } }
                ],
            }}
        />
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// CHART E — Statistical Summary Table
// ─────────────────────────────────────────────────────────────────────────────
const StatTable = ({ stats, theme }) => {
    const rows = PHASE_NAMES.filter(p => stats?.[p]);

    const columns = [
        {
            key: 'phase_yield',
            label: 'Net Price Move',
            tooltip: 'Total % from open to close of this phase',
            colored: true,
            format: v => pct(v),
        },
        {
            key: 'avg_pc',
            label: 'Avg Slot Change',
            tooltip: 'Average % change per time slot in this phase',
            colored: true,
            format: v => pct(v),
        },
        {
            key: 'mean_price',
            label: 'Avg Price',
            tooltip: 'Mean price during this phase',
            colored: false,
            format: v => `₹${v?.toLocaleString('en-IN')}`,
        },
        {
            key: 'vol_share',
            label: 'Market Share',
            tooltip: '% of total day volume that happened in this phase',
            colored: false,
            format: v => `${v}%`,
        },
        {
            key: 'persistence',
            label: 'Trend Strength',
            tooltip: '% of time slots that closed in the prevailing direction',
            colored: false,
            badge: v => v >= 60 ? 'bg-emerald-500/20 text-emerald-400' : v >= 40 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400',
            format: v => `${v}%`,
        },
        {
            key: 'volatility',
            label: 'Price Swings',
            tooltip: 'Avg High-Low candle range as % of price — higher = wilder',
            colored: false,
            format: v => `${v?.toFixed(2)}%`,
        },
    ];

    const thCls = clsx(
        'text-[9px] font-black uppercase tracking-widest py-3 px-3 text-right first:text-left border-b',
        theme === 'dark' ? 'text-gray-500 border-white/5' : 'text-gray-400 border-gray-100'
    );

    return (
        <div className='overflow-auto rounded-xl'>
            <table className='w-full border-collapse'>
                <thead>
                    <tr className={theme === 'dark' ? 'bg-black/50' : 'bg-gray-50'}>
                        <th className={thCls}>Phase</th>
                        {columns.map(c => (
                            <th key={c.key} className={thCls} title={c.tooltip}>
                                {c.label}
                                <span className='ml-1 opacity-50 cursor-help' title={c.tooltip}>ⓘ</span>
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((pha, i) => {
                        const s = stats[pha];
                        return (
                            <tr key={pha} className={clsx(
                                'border-b transition-colors',
                                theme === 'dark' ? 'border-white/5 hover:bg-white/[0.03]' : 'border-gray-100 hover:bg-gray-50/80'
                            )}>
                                {/* Phase name cell */}
                                <td className='py-3 px-3'>
                                    <div className='flex items-center gap-2'>
                                        <span className='size-2.5 rounded-full shrink-0' style={{ background: PHASE_COLORS[i] }} />
                                        <div>
                                            <div className={clsx('text-[11px] font-bold', theme === 'dark' ? 'text-white' : 'text-gray-800')}>
                                                {PHASE_SHORT[i]}
                                            </div>
                                            <div className={clsx('text-[9px]', theme === 'dark' ? 'text-gray-600' : 'text-gray-400')}>
                                                {s.slots} slots
                                            </div>
                                        </div>
                                    </div>
                                </td>

                                {/* Data cells */}
                                {columns.map(c => {
                                    const raw = s[c.key];
                                    const formatted = c.format(raw);
                                    const num = parseFloat(raw);
                                    const badgeCls = c.badge ? c.badge(num) : null;
                                    const colorCls = c.colored
                                        ? num > 0 ? 'text-emerald-400' : num < 0 ? 'text-rose-400' : (theme === 'dark' ? 'text-gray-500' : 'text-gray-400')
                                        : (theme === 'dark' ? 'text-gray-300' : 'text-gray-700');

                                    return (
                                        <td key={c.key} className='py-3 px-3 text-right' title={c.tooltip}>
                                            {badgeCls ? (
                                                <span className={clsx('px-2 py-0.5 rounded-md text-[10px] font-black', badgeCls)}>
                                                    {formatted}
                                                </span>
                                            ) : (
                                                <span className={clsx('text-xs font-bold font-mono tabular-nums', colorCls)}>
                                                    {formatted}
                                                </span>
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Table legend */}
            <div className={clsx('mt-3 px-2 pb-1 flex flex-wrap gap-x-4 gap-y-1', theme === 'dark' ? 'text-gray-600' : 'text-gray-400')}>
                {columns.map(c => (
                    <span key={c.key} className='text-[9px]'>
                        <span className='font-black'>{c.label}</span>: {c.tooltip}
                    </span>
                ))}
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const PhaseAnalyticsDashboard = ({ phaseStats, watchlistName, theme }) => {
    const mergedStats = useMemo(() => {
        if (!phaseStats) return null;
        const statsList = Array.isArray(phaseStats) ? phaseStats : [phaseStats];
        if (statsList.length === 0) return null;

        const merged = {};
        PHASE_NAMES.forEach(pha => {
            const valid = statsList.filter(s => s?.[pha]);
            if (!valid.length) return;
            const keys = ['avg_pc', 'phase_yield', 'mean_price', 'total_volume', 'vol_share', 'avg_vs', 'volatility', 'persistence', 'slots'];
            merged[pha] = {};
            keys.forEach(k => {
                merged[pha][k] = parseFloat((valid.reduce((sum, m) => sum + (m[pha]?.[k] ?? 0), 0) / valid.length).toFixed(2));
            });
        });
        return merged;
    }, [phaseStats]);

    if (!mergedStats) {
        return (
            <div className='flex flex-col items-center justify-center h-64 opacity-40'>
                <Activity size={40} className='text-indigo-400 mb-3' />
                <p className={clsx('text-[11px] uppercase font-bold tracking-widest', theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>
                    Fetch historical data first to see Phase Analytics
                </p>
            </div>
        );
    }

    const H = 290;

    return (
        <div className='flex flex-col gap-6 pb-10'>

            {/* Page header */}
            <div className={clsx('rounded-2xl border p-5', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-indigo-50/60 border-indigo-100')}>
                <h2 className={clsx('text-xl font-black uppercase italic tracking-tight mb-1', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                    Phase <span className='text-indigo-400'>Analytics</span>
                </h2>
                <p className={clsx('text-[10px] font-medium leading-relaxed max-w-2xl', theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>
                    The trading day is split into <strong>4 phases</strong>. This dashboard shows how <strong>{watchlistName}</strong> behaved differently in each phase —
                    how much price moved, where volume was concentrated, and how consistent the trend was.
                    Use this to identify your best entry windows.
                </p>
                <div className='flex gap-3 mt-3 flex-wrap'>
                    {PHASE_NAMES.map((n, i) => (
                        <div key={n} className={clsx('flex items-center gap-1.5 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest', theme === 'dark' ? 'border-white/10 bg-white/5 text-gray-400' : 'border-gray-200 bg-white text-gray-500')}>
                            <span className='size-2 rounded-full' style={{ background: PHASE_COLORS[i] }} />
                            {PHASE_SHORT[i]}
                        </div>
                    ))}
                </div>
            </div>

            {/* Row 1 */}
            <div className='grid grid-cols-2 gap-5'>
                <ChartCard
                    title='📡 Phase Momentum Overview'
                    subtitle='A spider chart comparing all 4 phases across 4 dimensions. A larger shape means that phase was more active or stronger. Each colour represents one phase.'
                    note='Tip: If the Morning shape is large on "Trend Strength" but the Midday shape is large on "Price Swings", today was a morning-led trend that turned choppy midday.'
                    icon={Activity}
                    theme={theme}
                >
                    <div style={{ height: H }}>
                        <RadarChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>

                <ChartCard
                    title='📊 Price Move vs Volume Share'
                    subtitle={"Green/Red bars = how much price moved each phase. Colored bars = what % of daily volume happened here."}
                    note='Watch for: High volume + small price move = institutions quietly buying/selling. High volume + large price move = strong directional conviction.'
                    icon={BarChart2}
                    theme={theme}
                >
                    <div style={{ height: H }}>
                        <PerformanceBarChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
            </div>

            {/* Row 2 */}
            <div className='grid grid-cols-2 gap-5'>
                <ChartCard
                    title='💧 Market Activity Across Phases'
                    subtitle={"Shows what % of the day total volume happened in each phase. Each dot shows the share."}
                    note='A rising curve (Morning → Closing) signals institutional accumulation. A falling curve means retail was active at open but faded — watch for reversals.'
                    icon={TrendingUp}
                    theme={theme}
                >
                    <div style={{ height: H }}>
                        <VolumeGatheringChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>

                <ChartCard
                    title='💪 Trend Strength vs Price Swings'
                    subtitle='Green bars = Trend Strength (how consistently the price moved in one direction). Dotted amber line = Price Swings (how wide the candles were — high = volatile).'
                    note='Best trading window: High Trend Strength (green bar tall) + Low Price Swings (amber line low). Avoid trading when Trend Strength < 40% — price is going nowhere.'
                    icon={BarChart2}
                    theme={theme}
                >
                    <div style={{ height: H }}>
                        <TrendStrengthChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
            </div>

            {/* Row 3 — Full-width table */}
            <ChartCard
                title='📋 Complete Phase Statistics Table'
                subtitle='All key metrics in one place. Hover the column headers for a full explanation of each metric. Green = positive, Red = negative, Badge colour = strength level.'
                icon={Grid}
                theme={theme}
            >
                <StatTable stats={mergedStats} theme={theme} />
            </ChartCard>
        </div>
    );
};

export default PhaseAnalyticsDashboard;
