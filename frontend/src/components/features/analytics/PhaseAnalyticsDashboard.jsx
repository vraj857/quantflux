import React, { useMemo } from 'react';
import { clsx } from 'clsx';
import { Activity, Info, Zap } from 'lucide-react';
import { PHASE_NAMES, PHASE_LABELS } from '../../../constants';
import MicrostructureChart from './MicrostructureChart';
import { ShapeProbabilityChart } from './ShapeProbabilityChart';
import { IntradayBlueprintGrid } from './IntradayBlueprintGrid';
import WatchlistScreenerTable from './WatchlistScreenerTable';

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
const PhaseAnalyticsDashboard = ({ phaseStats, regimeData, watchlistName, theme }) => {
    const [selectedSymbol, setSelectedSymbol] = React.useState('Aggregate');

    // Extract available symbols for manual selection
    const availableSymbols = useMemo(() => {
        if (!Array.isArray(phaseStats)) return [];
        return phaseStats.map(s => s.symbol).filter(Boolean);
    }, [phaseStats]);

    // Automatically select the real symbol if 'single' mode is active and the dropdown is hidden
    const effectiveSymbol = useMemo(() => {
        if (availableSymbols.length === 1) return availableSymbols[0];
        return selectedSymbol;
    }, [availableSymbols, selectedSymbol]);

    // Extract Microstructure Data for specific symbol
    const microstructureData = useMemo(() => {
        if (!regimeData) return null;
        if (effectiveSymbol !== 'Aggregate') {
            return regimeData[effectiveSymbol]?.microstructure || null;
        }
        return null;
    }, [regimeData, effectiveSymbol]);

    // Compute stats based on selection (Aggregate or Specific Symbol)
    const mergedStats = useMemo(() => {
        if (!phaseStats || phaseStats.length === 0) return null;
        
        const statsList = Array.isArray(phaseStats) ? phaseStats : [phaseStats];
        
        // CASE 1: Individual Symbol Selection
        if (effectiveSymbol !== 'Aggregate') {
            const match = statsList.find(s => s.symbol === effectiveSymbol);
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

    const [activeChartTab, setActiveChartTab] = React.useState('microstructure');

    const chartTabs = [
        { id: 'microstructure', label: 'Normalized Microstructure', show: !!microstructureData },
        { id: 'probability', label: 'Shape Probability', show: !!microstructureData?.Probability_Stats },
        { id: 'blueprint', label: 'Intraday Blueprint', show: !!microstructureData?.Blueprint_Data }
    ].filter(t => t.show);

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
        <div className='flex flex-col gap-4 pb-10'>
            {/* Minimal Symbol Selector & Local Tabs */}
            <div className={clsx('flex items-center justify-between border-b px-2 pb-0', theme === 'dark' ? 'border-white/5' : 'border-gray-200')}>
                {/* Horizontal Chart Tabs */}
                <div className='flex items-center -mb-px'>
                    {chartTabs.map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveChartTab(tab.id)}
                            className={clsx(
                                'px-4 py-3 text-[10px] font-black uppercase tracking-widest border-b-2 transition-all outline-none whitespace-nowrap',
                                activeChartTab === tab.id
                                    ? 'border-indigo-500 text-indigo-400'
                                    : 'border-transparent text-gray-500 hover:text-gray-400'
                            )}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Symbol Selector */}
                {availableSymbols.length > 1 && (
                    <div className='flex items-center gap-2 pr-2'>
                        <span className='text-[10px] font-black uppercase text-gray-500 tracking-widest leading-none'>SYMBOL:</span>
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

            {/* Chart Area */}
            {microstructureData && effectiveSymbol !== 'Aggregate' ? (
                <div className="flex flex-col gap-4 animate-in fade-in duration-300">
                    {activeChartTab === 'microstructure' && (
                        <div className={clsx('rounded-2xl border p-1', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                            <MicrostructureChart data={microstructureData} theme={theme} />
                        </div>
                    )}
                    
                    {activeChartTab === 'probability' && microstructureData.Probability_Stats && (
                        <div className="animate-in slide-in-from-bottom-2 duration-300">
                            <ShapeProbabilityChart data={microstructureData.Probability_Stats} theme={theme} />
                        </div>
                    )}
                    
                    {activeChartTab === 'blueprint' && microstructureData.Blueprint_Data && (
                        <div className="animate-in slide-in-from-bottom-2 duration-300">
                            <IntradayBlueprintGrid data={microstructureData} theme={theme} />
                        </div>
                    )}
                </div>
            ) : effectiveSymbol === 'Aggregate' && regimeData ? (
                <div className="animate-in fade-in duration-300">
                    <WatchlistScreenerTable 
                        phaseStats={phaseStats}
                        regimeData={regimeData} 
                        watchlistName={watchlistName} 
                        onSelectSymbol={setSelectedSymbol}
                        theme={theme} 
                    />
                </div>
            ) : (
                <div className="flex flex-col items-center justify-center h-64 opacity-20 select-none">
                    <Activity size={48} className="text-indigo-500 mb-4" />
                    <p className="text-xs font-black uppercase tracking-[0.2em] text-center">
                        Select a specific symbol to view Microstructure detail
                    </p>
                </div>
            )}
        </div>
    );
};

export default PhaseAnalyticsDashboard;
