import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { Activity, BarChart2, TrendingUp, Grid } from 'lucide-react';

// ── Constants ─────────────────────────────────────────────────────────────────
const PHASE_NAMES  = ['Morning Phase', 'Midday Chop', 'Trend Formation', 'Closing Session'];
const PHASE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b']; // green, blue, indigo, amber
const PHASE_LABELS = ['Morning', 'Midday', 'Trend', 'Closing'];

// ── Helper ────────────────────────────────────────────────────────────────────
const get = (stats, pha, key, fallback = 0) => stats?.[pha]?.[key] ?? fallback;
const pct  = v => (v > 0 ? `+${v}%` : `${v}%`);

const plotlyConfig = { displaylogo: false, responsive: true, modeBarButtonsToRemove: ['select2d', 'lasso2d'] };

const basePlotLayout = (theme, extra = {}) => ({
    paper_bgcolor: theme === 'dark' ? 'rgba(10,10,10,0)'  : 'rgba(255,255,255,0)',
    plot_bgcolor:  theme === 'dark' ? 'rgba(10,10,10,0)'  : 'rgba(255,255,255,0)',
    font:  { color: theme === 'dark' ? '#9ca3af' : '#6b7280', size: 11, family: 'Inter, sans-serif' },
    margin: { t: 30, b: 40, l: 55, r: 20 },
    ...extra,
});

// ─────────────────────────────────────────────────────────────────────────────
// SUB-COMPONENTS
// ─────────────────────────────────────────────────────────────────────────────

/** Card wrapper for each chart */
const ChartCard = ({ title, icon: Icon, children, theme, className }) => (
    <div className={clsx(
        'rounded-2xl border p-5 flex flex-col gap-4',
        theme === 'dark' ? 'bg-zinc-950/70 border-white/5' : 'bg-white border-gray-200',
        className
    )}>
        <div className='flex items-center gap-2'>
            <Icon size={14} className='text-indigo-400' />
            <span className={clsx('text-[10px] font-black uppercase tracking-widest',
                theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>{title}</span>
        </div>
        {children}
    </div>
);

/** A. Phase Momentum Radar */
const RadarChart = ({ stats, theme }) => {
    // Axes: Avg % PC (clipped), Vol Share %, Persistence %, Volatility
    const metrics  = ['Avg PC %', 'Volume Share', 'Persistence', 'Volatility'];
    const data = PHASE_NAMES.map((pha, i) => ({
        type: 'scatterpolar',
        r: [
            Math.abs(get(stats, pha, 'avg_pc')),
            get(stats, pha, 'vol_share'),
            get(stats, pha, 'persistence'),
            get(stats, pha, 'volatility') * 10, // scale up for visibility
        ],
        theta: metrics,
        fill: 'toself',
        name: PHASE_LABELS[i],
        line: { color: PHASE_COLORS[i], width: 2 },
        fillcolor: `${PHASE_COLORS[i]}22`,
    }));

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                polar: {
                    bgcolor: 'rgba(0,0,0,0)',
                    radialaxis: { visible: true, color: theme === 'dark' ? '#374151' : '#e5e7eb', gridcolor: theme === 'dark' ? '#374151' : '#e5e7eb', range: [0, 100] },
                    angularaxis: { color: theme === 'dark' ? '#6b7280' : '#9ca3af' },
                },
                legend: { orientation: 'h', y: -0.1, font: { size: 10 } },
                showlegend: true,
                margin: { t: 20, b: 50, l: 40, r: 40 },
            }}
        />
    );
};

/** B. Phase Performance Matrix (Grouped Bar) */
const PerformanceBarChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const text = theme === 'dark' ? '#9ca3af' : '#6b7280';

    const phaseYields = PHASE_NAMES.map(p => get(stats, p, 'phase_yield'));
    const volShares   = PHASE_NAMES.map(p => get(stats, p, 'vol_share'));

    const data = [
        {
            name: 'Phase Yield %',
            x: PHASE_LABELS,
            y: phaseYields,
            type: 'bar',
            marker: {
                color: phaseYields.map(v => v >= 0 ? '#10b981' : '#f43f5e'),
                opacity: 0.85,
            },
            yaxis: 'y',
        },
        {
            name: 'Volume Share %',
            x: PHASE_LABELS,
            y: volShares,
            type: 'bar',
            marker: { color: PHASE_COLORS, opacity: 0.5 },
            yaxis: 'y2',
        },
    ];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                barmode: 'group',
                xaxis: { gridcolor: grid, tickfont: { size: 10, color: text } },
                yaxis:  { title: 'Yield %',  gridcolor: grid, tickfont: { size: 10, color: text } },
                yaxis2: { title: 'Vol Share %', overlaying: 'y', side: 'right', tickfont: { size: 10, color: text }, gridcolor: 'transparent' },
                legend: { orientation: 'h', y: -0.2, font: { size: 10 } },
                showlegend: true,
            }}
        />
    );
};

/** C. Volume Gathering — Area Chart */
const VolumeGatheringChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const text = theme === 'dark' ? '#9ca3af' : '#6b7280';

    const data = [{
        x: PHASE_LABELS,
        y: PHASE_NAMES.map(p => get(stats, p, 'vol_share')),
        type: 'scatter',
        mode: 'lines+markers',
        fill: 'tozeroy',
        line: { color: '#6366f1', width: 2.5 },
        fillcolor: 'rgba(99,102,241,0.15)',
        marker: { size: 8, color: '#6366f1', line: { color: '#fff', width: 1.5 } },
        name: 'Volume %',
    }];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                xaxis: { gridcolor: grid, tickfont: { size: 10, color: text } },
                yaxis: { title: 'Vol Share %', gridcolor: grid, tickfont: { size: 10, color: text } },
                showlegend: false,
            }}
        />
    );
};

/** D. Persistence & Volatility Comparison */
const PersistVolChart = ({ stats, theme }) => {
    const grid = theme === 'dark' ? '#1f2937' : '#e5e7eb';
    const text = theme === 'dark' ? '#9ca3af' : '#6b7280';

    const persistences = PHASE_NAMES.map(p => get(stats, p, 'persistence'));
    const volatilities = PHASE_NAMES.map(p => get(stats, p, 'volatility'));

    const data = [
        {
            x: PHASE_LABELS, y: persistences, name: 'Persistence %',
            type: 'bar', marker: { color: '#10b981', opacity: 0.8 },
        },
        {
            x: PHASE_LABELS, y: volatilities, name: 'Volatility (H-L%) ×10',
            type: 'scatter', mode: 'lines+markers',
            line: { color: '#f59e0b', width: 2 },
            marker: { color: '#f59e0b', size: 8 },
            yaxis: 'y2',
        },
    ];

    return (
        <Plot data={data} config={plotlyConfig} style={{ width: '100%', height: '100%' }}
            layout={{
                ...basePlotLayout(theme),
                xaxis: { gridcolor: grid, tickfont: { size: 10, color: text } },
                yaxis:  { title: 'Persistence %', gridcolor: grid, tickfont: { size: 10, color: text } },
                yaxis2: { title: 'Volatility %', overlaying: 'y', side: 'right', tickfont: { size: 10, color: text }, gridcolor: 'transparent' },
                legend: { orientation: 'h', y: -0.2, font: { size: 10 } },
                showlegend: true,
            }}
        />
    );
};

/** E. Phase Summary Stats Table */
const StatTable = ({ stats, theme }) => {
    const rows = PHASE_NAMES.filter(p => stats?.[p]);
    const th = 'text-[9px] font-black uppercase tracking-widest text-gray-500 py-2 px-3 text-right';
    const td = (val, colored = false) => {
        const num = parseFloat(val);
        return clsx(
            'py-2 px-3 font-mono text-xs font-bold text-right tabular-nums',
            colored && num > 0 && 'text-emerald-400',
            colored && num < 0 && 'text-rose-400',
            colored && num === 0 && (theme === 'dark' ? 'text-gray-400' : 'text-gray-500'),
            !colored && (theme === 'dark' ? 'text-gray-300' : 'text-gray-700'),
        );
    };

    return (
        <div className='overflow-auto rounded-xl'>
            <table className='w-full border-collapse text-left'>
                <thead>
                    <tr className={theme === 'dark' ? 'bg-black/40' : 'bg-gray-50'}>
                        <th className='text-[9px] font-black uppercase tracking-widest text-gray-500 py-2 px-3'>Phase</th>
                        <th className={th}>Yield %</th>
                        <th className={th}>Avg PC %</th>
                        <th className={th}>Mean Price</th>
                        <th className={th}>Vol Share</th>
                        <th className={th}>Persistence</th>
                        <th className={th}>Volatility</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((pha, i) => {
                        const s = stats[pha];
                        return (
                            <tr key={pha} className={clsx(
                                'border-t transition-colors',
                                theme === 'dark' ? 'border-white/5 hover:bg-white/[0.02]' : 'border-gray-100 hover:bg-gray-50'
                            )}>
                                <td className='py-2 px-3'>
                                    <div className='flex items-center gap-2'>
                                        <span className='size-2 rounded-full inline-block' style={{ background: PHASE_COLORS[i] }} />
                                        <span className={clsx('text-[10px] font-bold', theme === 'dark' ? 'text-white' : 'text-gray-800')}>{PHASE_LABELS[i]}</span>
                                    </div>
                                </td>
                                <td className={td(s.phase_yield, true)}>{pct(s.phase_yield)}</td>
                                <td className={td(s.avg_pc, true)}>{pct(s.avg_pc)}</td>
                                <td className={td(s.mean_price)}>₹{s.mean_price?.toLocaleString('en-IN')}</td>
                                <td className={td(s.vol_share)}>{s.vol_share}%</td>
                                <td className={td(s.persistence)}>{s.persistence}%</td>
                                <td className={td(s.volatility)}>{s.volatility?.toFixed(2)}%</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const PhaseAnalyticsDashboard = ({ phaseStats, watchlistName, theme }) => {
    // When phaseStats is multi-symbol (from watchlist), merge by averaging
    const mergedStats = useMemo(() => {
        if (!phaseStats) return null;

        // phaseStats can be an array (one per symbol) or a single object
        const statsList = Array.isArray(phaseStats) ? phaseStats : [phaseStats];
        if (statsList.length === 0) return null;

        const merged = {};
        PHASE_NAMES.forEach(pha => {
            const valid = statsList.filter(s => s?.[pha]);
            if (!valid.length) return;
            const keys = ['avg_pc', 'phase_yield', 'mean_price', 'total_volume', 'vol_share', 'avg_vs', 'volatility', 'persistence'];
            merged[pha] = {};
            keys.forEach(k => {
                merged[pha][k] = parseFloat((valid.reduce((s, m) => s + (m[pha]?.[k] ?? 0), 0) / valid.length).toFixed(2));
            });
        });
        return merged;
    }, [phaseStats]);

    if (!mergedStats) {
        return (
            <div className='flex flex-col items-center justify-center h-64 opacity-40'>
                <Activity size={40} className='text-indigo-400 mb-3' />
                <p className={clsx('text-[11px] uppercase font-bold tracking-widest', theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>
                    No phase data — fetch historical data first
                </p>
            </div>
        );
    }

    const CHART_HEIGHT = 280;

    return (
        <div className='flex flex-col gap-5 pb-10'>
            {/* Header */}
            <div>
                <h2 className={clsx('text-xl font-black uppercase italic tracking-tight mb-0.5', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                    Phase <span className='text-indigo-400'>Analytics</span>
                </h2>
                <p className={clsx('text-[10px] font-bold uppercase tracking-widest', theme === 'dark' ? 'text-gray-500' : 'text-gray-400')}>
                    {watchlistName} · Statistical Breakdown Across All 4 Market Phases
                </p>
            </div>

            {/* Row 1: Radar + Bar */}
            <div className='grid grid-cols-2 gap-5'>
                <ChartCard title='Phase Momentum Radar' icon={Activity} theme={theme}>
                    <div style={{ height: CHART_HEIGHT }}>
                        <RadarChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
                <ChartCard title='Phase Performance Matrix — Yield vs Volume' icon={BarChart2} theme={theme}>
                    <div style={{ height: CHART_HEIGHT }}>
                        <PerformanceBarChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
            </div>

            {/* Row 2: Volume Gather + Persistence */}
            <div className='grid grid-cols-2 gap-5'>
                <ChartCard title='Volume Gathering Across Phases' icon={TrendingUp} theme={theme}>
                    <div style={{ height: CHART_HEIGHT }}>
                        <VolumeGatheringChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
                <ChartCard title='Persistence vs Volatility' icon={BarChart2} theme={theme}>
                    <div style={{ height: CHART_HEIGHT }}>
                        <PersistVolChart stats={mergedStats} theme={theme} />
                    </div>
                </ChartCard>
            </div>

            {/* Row 3: Full-width Summary Table */}
            <ChartCard title='Phase Statistical Summary Table' icon={Grid} theme={theme} className='col-span-2'>
                <StatTable stats={mergedStats} theme={theme} />
            </ChartCard>
        </div>
    );
};

export default PhaseAnalyticsDashboard;
