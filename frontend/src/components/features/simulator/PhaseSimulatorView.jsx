import React, { useState } from 'react';
import Plot from 'react-plotly.js';
import { clsx } from 'clsx';
import { Play, TrendingUp, DollarSign, Activity, List } from 'lucide-react';

const PhaseSimulatorView = ({ theme }) => {
    const [symbol, setSymbol] = useState('');
    const [isSimulating, setIsSimulating] = useState(false);
    const [results, setResults] = useState(null);

    const runSimulation = async () => {
        if (!symbol) return;
        setIsSimulating(true);
        try {
            // In a real flow, we retrieve the DNA first
            // For now, we use a default DNA or assume it's saved in state
            const dna = { "Morning Phase": { "min_strength": 60 } };
            
            const res = await fetch('http://127.0.0.1:8000/api/market/simulate-phase-strategy', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ symbol, dna })
            });
            const data = await res.json();
            if (data.status === 'success') {
                setResults(data.results);
            } else {
                alert(data.message || 'Simulation failed');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSimulating(false);
        }
    };

    return (
        <div className="p-8 flex flex-col gap-6 h-full overflow-auto">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className={clsx("text-3xl font-black uppercase italic tracking-tighter", theme === 'dark' ? "text-white" : "text-gray-900")}>
                        Phase <span className="text-indigo-500">Simulator</span>
                    </h1>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Multi-Year DNA Strategy Backtest</p>
                </div>
                
                <div className="flex gap-3">
                    <input 
                        type="text" 
                        placeholder="SYMBOL (e.g. NSE:RELIANCE)"
                        value={symbol}
                        onChange={e => setSymbol(e.target.value.toUpperCase())}
                        className={clsx(
                            "px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border outline-none",
                            theme === 'dark' ? "bg-zinc-900 border-white/10 text-white" : "bg-white border-gray-200 text-black"
                        )}
                    />
                    <button 
                        onClick={runSimulation}
                        disabled={isSimulating}
                        className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 active:scale-95 flex items-center gap-2"
                    >
                        {isSimulating ? <div className="size-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play size={12} />}
                        {isSimulating ? 'Running...' : 'Run 5-Year Sim'}
                    </button>
                </div>
            </header>

            {!results && !isSimulating && (
                <div className="flex-1 flex flex-col items-center justify-center opacity-30">
                    <TrendingUp size={64} className="text-indigo-500 mb-4" />
                    <p className="text-sm font-black uppercase tracking-[0.3em]">Enter symbol to simulate DNA persistence</p>
                </div>
            )}

            {results && (
                <div className="grid grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
                    {/* Stats */}
                    <div className={clsx("p-6 rounded-2xl border flex flex-col justify-center", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200 shadow-sm")}>
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-1">Final Equity</span>
                        <span className="text-3xl font-black tabular-nums text-indigo-400">₹{results.final_equity?.toLocaleString()}</span>
                        <div className={clsx("mt-2 text-xs font-bold", results.total_return_pct >= 0 ? "text-emerald-500" : "text-rose-500")}>
                            {results.total_return_pct >= 0 ? '+' : ''}{results.total_return_pct}% Total Return
                        </div>
                    </div>

                    {/* Equity Curve */}
                    <div className={clsx("col-span-2 p-6 rounded-2xl border", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200 shadow-sm")}>
                        <div className="flex items-center gap-2 mb-4">
                            <Activity size={14} className="text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Equity Growth Curve</span>
                        </div>
                        <div className="h-64">
                            <Plot 
                                data={[{
                                    y: results.equity_curve,
                                    type: 'scatter',
                                    mode: 'lines',
                                    fill: 'tozeroy',
                                    fillcolor: 'rgba(99,102,241,0.1)',
                                    line: { color: '#6366f1', width: 3, shape: 'spline' }
                                }]}
                                layout={{
                                    paper_bgcolor: 'rgba(0,0,0,0)',
                                    plot_bgcolor: 'rgba(0,0,0,0)',
                                    margin: { t: 10, b: 30, l: 50, r: 10 },
                                    xaxis: { showgrid: false, zeroline: false, color: '#4b5563' },
                                    yaxis: { gridcolor: 'rgba(255,255,255,0.03)', color: '#4b5563' }
                                }}
                                config={{ displayModeBar: false }}
                                style={{ width: '100%', height: '100%' }}
                            />
                        </div>
                    </div>

                    {/* Trade Log */}
                    <div className={clsx("col-span-3 p-6 rounded-2xl border", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200 shadow-sm")}>
                        <div className="flex items-center gap-2 mb-4">
                            <List size={14} className="text-indigo-400" />
                            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Strategy Trade Log</span>
                        </div>
                        <div className="overflow-auto max-h-96">
                            <table className="w-full text-left">
                                <thead className="sticky top-0 bg-zinc-950 z-10">
                                    <tr className="text-[9px] font-black uppercase tracking-widest text-gray-600 border-b border-white/5">
                                        <th className="pb-3 px-4">Date</th>
                                        <th className="pb-3 px-4 text-right">Entry</th>
                                        <th className="pb-3 px-4 text-right">Exit</th>
                                        <th className="pb-3 px-4 text-right">PnL %</th>
                                        <th className="pb-3 px-4 text-right">PnL Val</th>
                                    </tr>
                                </thead>
                                <tbody className="text-[10px] font-bold tracking-tight">
                                    {results.trades?.map((t, i) => (
                                        <tr key={i} className="border-b border-white/[0.02] hover:bg-white/[0.02]">
                                            <td className="py-3 px-4 text-gray-400">{t.day}</td>
                                            <td className="py-3 px-4 text-right tabular-nums text-white">₹{t.entry}</td>
                                            <td className="py-3 px-4 text-right tabular-nums text-white">₹{t.exit}</td>
                                            <td className={clsx("py-3 px-4 text-right tabular-nums", t.pnl_pct >= 0 ? "text-emerald-400" : "text-rose-400")}>
                                                {t.pnl_pct}%
                                            </td>
                                            <td className={clsx("py-3 px-4 text-right tabular-nums", t.pnl_val >= 0 ? "text-emerald-400/80" : "text-rose-400/80")}>
                                                ₹{t.pnl_val}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PhaseSimulatorView;
