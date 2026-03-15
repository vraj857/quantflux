import React, { useState } from 'react';
import { Zap, Shield, ArrowRight, Loader2, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../services/api';

const BROKERS = [
    {
        id: 'FYERS',
        name: 'Fyers',
        tagline: 'Fast & Modern Trading',
        color: 'from-blue-600 to-cyan-500',
        hoverGlow: 'group-hover:shadow-[0_0_60px_rgba(59,130,246,0.3)]',
        borderActive: 'border-blue-500/50 bg-blue-500/5',
        icon: '⚡',
    },
    {
        id: 'ZERODHA',
        name: 'Zerodha',
        tagline: 'India\'s Largest Broker',
        color: 'from-emerald-600 to-teal-500',
        hoverGlow: 'group-hover:shadow-[0_0_60px_rgba(16,185,129,0.3)]',
        borderActive: 'border-emerald-500/50 bg-emerald-500/5',
        icon: '🪁',
    },
];

const BrokerLoginGate = ({ onAuthenticated, error }) => {
    const [selectedBroker, setSelectedBroker] = useState(null);
    const [loading, setLoading] = useState(false);

    const handleConnect = async () => {
        if (!selectedBroker) return;
        setLoading(true);
        
        try {
            // Ask the backend for the broker's login URL
            const res = selectedBroker === 'FYERS' 
                ? await api.getFyersLoginUrl()
                : await api.getKiteLoginUrl();
            
            if (res.url) {
                window.location.href = res.url;
            } else {
                setLoading(false);
                alert('Failed to get login URL. Check backend logs.');
            }
        } catch (err) {
            setLoading(false);
            alert('Backend is not reachable. Make sure it is running on port 8000.');
        }
    };

    return (
        <div className="h-screen w-screen bg-[#0a0a0f] flex items-center justify-center relative overflow-hidden">
            {/* Animated background grid */}
            <div className="absolute inset-0 opacity-[0.03]" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
                backgroundSize: '60px 60px'
            }} />
            
            {/* Radial glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full bg-indigo-600/5 blur-[120px]" />
            
            <div className="relative z-10 w-full max-w-2xl px-8">
                {/* Logo & Title */}
                <div className="text-center mb-16">
                    <div className="inline-flex items-center space-x-3 mb-6">
                        <div className="size-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/30">
                            <Zap size={24} className="text-white" />
                        </div>
                        <h1 className="text-5xl font-black tracking-tighter text-white uppercase italic">
                            Market <span className="text-indigo-500">Flux</span>
                        </h1>
                    </div>
                    <p className="text-gray-500 text-sm font-medium tracking-wide uppercase">
                        Select your broker to begin the session
                    </p>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-8 px-6 py-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center space-x-3">
                        <AlertCircle size={20} className="text-rose-400 shrink-0" />
                        <p className="text-rose-300 text-sm font-medium">{error}</p>
                    </div>
                )}

                {/* Broker Cards */}
                <div className="grid grid-cols-2 gap-6 mb-12">
                    {BROKERS.map(broker => (
                        <button
                            key={broker.id}
                            onClick={() => setSelectedBroker(broker.id)}
                            disabled={loading}
                            className={clsx(
                                "group relative p-8 rounded-3xl border-2 transition-all duration-300 text-left",
                                "hover:scale-[1.02] active:scale-[0.98]",
                                broker.hoverGlow,
                                selectedBroker === broker.id
                                    ? `${broker.borderActive} shadow-2xl`
                                    : "border-white/5 bg-white/[0.02] hover:border-white/10"
                            )}
                        >
                            {/* Selection indicator */}
                            {selectedBroker === broker.id && (
                                <div className="absolute top-4 right-4">
                                    <div className="size-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center">
                                        <Shield size={14} className="text-white" />
                                    </div>
                                </div>
                            )}
                            
                            <div className="text-4xl mb-4">{broker.icon}</div>
                            <h3 className="text-2xl font-black text-white tracking-tight mb-1">
                                {broker.name}
                            </h3>
                            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest">
                                {broker.tagline}
                            </p>
                            
                            {/* Bottom gradient bar */}
                            <div className={clsx(
                                "absolute bottom-0 left-0 right-0 h-1 rounded-b-3xl bg-gradient-to-r opacity-0 transition-opacity duration-300",
                                broker.color,
                                selectedBroker === broker.id ? "opacity-100" : "group-hover:opacity-50"
                            )} />
                        </button>
                    ))}
                </div>

                {/* Connect Button */}
                <button
                    onClick={handleConnect}
                    disabled={!selectedBroker || loading}
                    className={clsx(
                        "w-full py-5 rounded-2xl font-black text-sm uppercase tracking-[0.2em] transition-all duration-300 flex items-center justify-center space-x-3",
                        selectedBroker && !loading
                            ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-2xl shadow-indigo-500/30 hover:shadow-indigo-500/50 hover:scale-[1.01] active:scale-[0.99]"
                            : "bg-white/5 text-gray-600 cursor-not-allowed"
                    )}
                >
                    {loading ? (
                        <>
                            <Loader2 size={18} className="animate-spin" />
                            <span>Redirecting to {selectedBroker}...</span>
                        </>
                    ) : (
                        <>
                            <span>Connect {selectedBroker || 'Broker'}</span>
                            <ArrowRight size={18} />
                        </>
                    )}
                </button>

                {/* Footer */}
                <p className="text-center text-gray-600 text-[10px] mt-8 uppercase tracking-widest font-bold">
                    Secure OAuth 2.0 • Your credentials never touch our servers
                </p>
            </div>
        </div>
    );
};

export default BrokerLoginGate;
