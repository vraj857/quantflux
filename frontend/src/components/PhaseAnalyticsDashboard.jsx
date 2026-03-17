import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { Activity, BarChart2, TrendingUp, Grid, Info, Zap } from 'lucide-react';

// ── Phase Definitions ─────────────────────────────────────────────────────────
const PHASE_NAMES  = ['Morning Phase', 'Midday Chop', 'Trend Formation', 'Closing Session'];
const PHASE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];
const PHASE_LABELS = ['🌅 Morning', '☁️ Midday', '📈 Trend', '🔔 Closing'];
const PHASE_SHORT  = ['Morning', 'Midday', 'Trend', 'Closing'];

// ── Helper ────────────────────────────────────────────────────────────────────
// ── Statistical Summary Table ────────────────────────────────────────────────
// CHART E — Statistical Summary Table (Simplified & Expert)
// ─────────────────────────────────────────────────────────────────────────────
const StatTable = ({ stats, theme }) => {
    const rows = PHASE_NAMES.filter(p => stats?.[p]);

    const thCls = clsx(
        'text-[10px] font-black uppercase tracking-widest py-4 px-4 text-left border-b',
        theme === 'dark' ? 'text-gray-500 border-white/5' : 'text-gray-400 border-gray-100'
    );

    return (
        <div className={clsx(
            'overflow-auto rounded-2xl border', 
            theme === 'dark' ? 'bg-zinc-950 border-white/5' : 'bg-white border-gray-100 shadow-sm'
        )}>
            <table className='w-full border-collapse'>
                <thead>
                    <tr className={theme === 'dark' ? 'bg-zinc-900/50' : 'bg-gray-50/50 border-b border-gray-100'}>
                        <th className={thCls}>Phase</th>
                        <th className={thCls}>Time Window</th>
                        <th className={thCls}>Avg % Move (per 25-min)</th>
                        <th className={thCls}>Average Volume</th>
                        <th className={thCls}>Trend Efficiency</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.map((pha, i) => {
                        const s = stats[pha];
                        const timeWindow = PHASE_LABELS[i].split(' ')[1] + ' ' +(pha === 'Morning Phase' ? '9:15-10:30' : 
                                           pha === 'Midday Chop' ? '10:30-12:35' : 
                                           pha === 'Trend Formation' ? '12:35-14:15' : '14:15-15:30');

                        return (
                            <tr key={pha} className={clsx(
                                'border-b transition-colors group',
                                theme === 'dark' ? 'border-white/5 hover:bg-white/[0.03]' : 'border-gray-100/50 hover:bg-indigo-50/20'
                            )}>
                                <td className='py-4 px-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='size-2 rounded-full' style={{ background: PHASE_COLORS[i] }} />
                                        <span className={clsx('text-xs font-black uppercase tracking-tight', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                                            {pha}
                                        </span>
                                    </div>
                                </td>
                                <td className='py-4 px-4 text-[10px] font-bold text-gray-500 font-mono'>
                                    {PHASE_BOUNDS_TEXT[i]}
                                </td>
                                <td className='py-4 px-4 text-xs font-bold text-emerald-400 font-mono'>
                                    {s.avg_pc_abs?.toFixed(2)}%
                                </td>
                                <td className='py-4 px-4 text-xs font-bold text-indigo-400 font-mono'>
                                    {s.avg_volume?.toLocaleString('en-IN')}
                                </td>
                                <td className='py-4 px-4'>
                                    <div className='flex items-center gap-2'>
                                        <span className={clsx(
                                            'px-2 py-0.5 rounded text-[10px] font-black font-mono',
                                            s.efficiency > 0.6 ? 'bg-emerald-500/20 text-emerald-400' : 
                                            s.efficiency > 0.4 ? 'bg-amber-500/20 text-amber-400' : 'bg-rose-500/20 text-rose-400'
                                        )}>
                                            {s.efficiency?.toFixed(2)}
                                        </span>
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

const PHASE_BOUNDS_TEXT = [
    "09:15 AM – 10:30 AM",
    "10:30 AM – 12:35 PM",
    "12:35 PM – 02:15 PM",
    "02:15 PM – 03:30 PM"
];

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const PhaseAnalyticsDashboard = ({ phaseStats, watchlistName, theme }) => {
    const [selectedSymbol, setSelectedSymbol] = React.useState('Aggregate');

    // Extract available symbols for manual selection
    const availableSymbols = useMemo(() => {
        if (!Array.isArray(phaseStats)) return [];
        return phaseStats.map(s => s.symbol).filter(Boolean);
    }, [phaseStats]);

    // Compute stats based on selection (Aggregate or Specific Symbol)
    const mergedStats = useMemo(() => {
        if (!phaseStats || phaseStats.length === 0) return null;
        
        const statsList = Array.isArray(phaseStats) ? phaseStats : [phaseStats];
        
        // CASE 1: Individual Symbol Selection
        if (selectedSymbol !== 'Aggregate') {
            const match = statsList.find(s => s.symbol === selectedSymbol);
            return match ? match.stats : null;
        }

        // CASE 2: Aggregate Portfolio View
        const merged = {};
        PHASE_NAMES.forEach(pha => {
            const valid = statsList.filter(s => s.stats?.[pha]);
            if (!valid.length) return;
            
            const keys = ['avg_pc_abs', 'avg_volume', 'efficiency', 'vol_share', 'volatility', 'persistence', 'slots'];
            merged[pha] = {};
            keys.forEach(k => {
                const values = valid.map(m => m.stats[pha]?.[k]).filter(v => v !== undefined);
                if (values.length > 0) {
                    merged[pha][k] = parseFloat((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(2));
                }
            });
        });
        return merged;
    }, [phaseStats, selectedSymbol]);

    const [isSaving, setIsSaving] = React.useState(false);
    const [saveSuccess, setSaveSuccess] = React.useState(false);

    const handleSaveDNA = async () => {
        const targetSymbol = selectedSymbol === 'Aggregate' ? watchlistName : selectedSymbol;
        if (!targetSymbol || !mergedStats) return;
        
        setIsSaving(true);
        try {
            const response = await fetch('/api/market/save-phase-dna', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    symbol: targetSymbol,
                    benchmarks: mergedStats,
                    period: selectedSymbol === 'Aggregate' ? `Watchlist: ${watchlistName}` : 'Quantitative Analysis'
                }),
            });
            if (response.ok) {
                setSaveSuccess(true);
                setTimeout(() => setSaveSuccess(false), 3000);
            }
        } catch (err) {
            console.error('Failed to save DNA:', err);
        } finally {
            setIsSaving(false);
        }
    };

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

    return (
        <div className='flex flex-col gap-6 pb-10'>

            {/* Page header */}
            <div className={clsx('rounded-2xl border p-5 relative overflow-hidden', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-indigo-50/60 border-indigo-100')}>
                
                <div className='flex justify-between items-start'>
                    <div className='flex-1'>
                        <div className='flex items-center gap-3 mb-1'>
                            <h2 className={clsx('text-xl font-black uppercase italic tracking-tight', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                                Quantitative <span className='text-indigo-400'>Phase Analysis</span>
                            </h2>
                            
                            {/* Symbol Selector Dropdown */}
                            {availableSymbols.length > 1 && (
                                <div className='ml-4 flex items-center gap-2'>
                                    <span className='text-[9px] font-black uppercase text-gray-500 tracking-widest'>View:</span>
                                    <select
                                        value={selectedSymbol}
                                        onChange={(e) => setSelectedSymbol(e.target.value)}
                                        className={clsx(
                                            'px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-tight border outline-none transition-all',
                                            theme === 'dark' ? 'bg-black border-white/10 text-indigo-400' : 'bg-white border-gray-200 text-indigo-600'
                                        )}
                                    >
                                        <option value="Aggregate">Portfolio Average</option>
                                        {availableSymbols.map(sym => (
                                            <option key={sym} value={sym}>{sym}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                        
                        <p className={clsx('text-[10px] font-medium leading-relaxed max-w-2xl', theme === 'dark' ? 'text-gray-400' : 'text-gray-500')}>
                            {selectedSymbol === 'Aggregate' 
                                ? `Portfolio-wide analysis of ${watchlistName} performance across 4 strict intraday time phases.` 
                                : `Expert analysis of ${selectedSymbol} performance across 4 strict intraday time phases.`
                            }
                        </p>
                    </div>

                    <button
                        onClick={handleSaveDNA}
                        disabled={isSaving}
                        className={clsx(
                            'group relative flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:grayscale',
                            saveSuccess 
                                ? 'bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)]' 
                                : theme === 'dark' 
                                    ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500 hover:text-white' 
                                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                        )}
                    >
                        {isSaving ? (
                            <div className='size-3 border-2 border-current border-t-transparent rounded-full animate-spin' />
                        ) : saveSuccess ? (
                            <Activity size={12} className='animate-bounce' />
                        ) : (
                            <Zap size={12} className='group-hover:animate-pulse' />
                        )}
                        <span>{isSaving ? 'Exporting...' : saveSuccess ? 'DNA Exported!' : 'Sync to Live Sentinel'}</span>
                    </button>
                </div>
            </div>

            {/* Expert Analysis Table */}
            <div className={clsx('rounded-2xl border p-1', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                <StatTable stats={mergedStats} theme={theme} />
            </div>

            {/* Analyst Methodology Note */}
            <div className={clsx(
                'flex items-start gap-4 p-5 rounded-2xl border border-dashed',
                theme === 'dark' ? 'bg-black/40 border-white/10 text-gray-400' : 'bg-gray-50 border-gray-300 text-gray-600'
            )}>
                <Info size={20} className='text-indigo-400 shrink-0' />
                <div className='space-y-2'>
                    <h4 className='text-[11px] font-black uppercase tracking-widest text-indigo-400'>Methodology Note</h4>
                    <p className='text-[10px] leading-relaxed'>
                        <strong>Trend Efficiency:</strong> Calculated as (Absolute Directional Move / Sum of Absolute Interval Moves). A score of 1.0 indicates a perfectly linear trend, while &lt; 0.3 indicates high noise/chop.
                    </p>
                    <p className='text-[10px] leading-relaxed'>
                        <strong>Deductions:</strong> The Recommended Trading Style and Key Characteristics are automatically deduced using institutional benchmarks for volatility, participation, and persistence.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PhaseAnalyticsDashboard;
