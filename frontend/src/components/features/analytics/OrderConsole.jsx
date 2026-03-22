import React, { useState, useEffect } from 'react';
import { clsx } from 'clsx';
import { Shield, Target, Clock, XCircle, AlertCircle } from 'lucide-react';

const OrderConsole = ({ theme }) => {
    const [summary, setSummary] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchSummary = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('http://127.0.0.1:8000/api/market/order-summary');
            const data = await res.json();
            setSummary(data);
        } catch (e) {
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchSummary();
        const interval = setInterval(fetchSummary, 5000);
        return () => clearInterval(interval);
    }, []);

    const killSwitch = async () => {
        if (!window.confirm("CRITICAL: This will attempt to cancel all pending orders and close all automated positions. Proceed?")) return;
        try {
            await fetch('http://127.0.0.1:8000/api/market/close-all-positions', { method: 'POST' });
            fetchSummary();
        } catch (e) {
            console.error(e);
        }
    };

    return (
        <div className="p-8 flex flex-col gap-6 h-full overflow-auto">
            <header className="flex justify-between items-center">
                <div>
                    <h1 className={clsx("text-3xl font-black uppercase italic tracking-tighter", theme === 'dark' ? "text-white" : "text-gray-900")}>
                        Order <span className="text-rose-500">Console</span>
                    </h1>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-widest mt-1">Live Automated Execution Monitor</p>
                </div>
                
                <button 
                    onClick={killSwitch}
                    className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-rose-900/30 active:scale-95 flex items-center gap-2"
                >
                    <XCircle size={14} />
                    Global Kill Switch
                </button>
            </header>

            <div className="grid grid-cols-4 gap-4">
                <div className={clsx("p-5 rounded-2xl border", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200")}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Active Positions</span>
                    <p className="text-2xl font-black text-white mt-1">{summary?.active_count || 0}</p>
                </div>
                <div className={clsx("p-5 rounded-2xl border", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200")}>
                    <span className="text-[10px] font-black uppercase tracking-widest text-gray-500">Total Trades Today</span>
                    <p className="text-2xl font-black text-white mt-1">{summary?.history_count || 0}</p>
                </div>
            </div>

            {/* Active Positions Table */}
            <div className={clsx("flex-1 rounded-2xl border p-6", theme === 'dark' ? "bg-zinc-950 border-white/5" : "bg-white border-gray-200 shadow-sm")}>
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <Target size={14} className="text-emerald-400" />
                        <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Live Trades</span>
                    </div>
                </div>

                {!summary?.positions || Object.keys(summary.positions).length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-20">
                        <Shield size={48} className="text-gray-400 mb-3" />
                        <p className="text-sm font-black uppercase tracking-widest text-center">No Active Automated Positions</p>
                    </div>
                ) : (
                    <table className="w-full text-left">
                        <thead>
                            <tr className="text-[9px] font-black uppercase tracking-widest text-gray-600 border-b border-white/5">
                                <th className="pb-3">Symbol</th>
                                <th className="pb-3 text-center">Side</th>
                                <th className="pb-3 text-right">Qty</th>
                                <th className="pb-3 text-right">Entry</th>
                                <th className="pb-3 text-right">PNL</th>
                                <th className="pb-3">Time</th>
                            </tr>
                        </thead>
                        <tbody className="text-[11px] font-bold">
                            {Object.entries(summary.positions).map(([sym, pos]) => (
                                <tr key={sym} className="border-b border-white/[0.02]">
                                    <td className="py-4 text-white uppercase italic">{sym}</td>
                                    <td className="py-4 text-center">
                                        <span className={clsx("px-2 py-0.5 rounded text-[9px] font-black", pos.side === 'BUY' ? "bg-emerald-500/10 text-emerald-400" : "bg-rose-500/10 text-rose-400")}>
                                            {pos.side}
                                        </span>
                                    </td>
                                    <td className="py-4 text-right text-gray-400">{pos.qty}</td>
                                    <td className="py-4 text-right text-white tabular-nums">₹{pos.entry_price}</td>
                                    <td className="py-4 text-right text-emerald-400">+₹0.00</td>
                                    <td className="py-4 text-gray-500 font-mono text-[10px]"><Clock size={10} className="inline mr-1" />{new Date(pos.entry_time).toLocaleTimeString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            <div className={clsx("p-4 rounded-xl flex items-center gap-3", theme === 'dark' ? "bg-indigo-500/5 text-indigo-400/80 border border-indigo-500/10" : "bg-indigo-50 text-indigo-700")}>
                <AlertCircle size={14} />
                <span className="text-[10px] font-bold uppercase tracking-wide">
                    The Order Console currently reflects automated Phase-DNA strategies. Manual trades might not appear here depending on broker sync status.
                </span>
            </div>
        </div>
    );
};

export default OrderConsole;
