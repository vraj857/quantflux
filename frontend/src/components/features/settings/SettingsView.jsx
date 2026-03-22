import React, { useState, useEffect, useCallback } from 'react';
import {
    Power,
    Plus,
    X,
    Layers,
    Trash2,
    FolderPlus,
    ChevronRight,
    Upload
} from 'lucide-react';
import { clsx } from 'clsx';
import { api } from '../../../api';

const SettingsView = ({ theme, onAuthSuccess }) => {
    const storedSession = JSON.parse(sessionStorage.getItem('BROKER_SESSION') || '{}');
    const [selectedBroker, setSelectedBroker] = useState(storedSession.broker || 'ZERODHA');
    const [streamConnected, setStreamConnected] = useState(!!storedSession.token);

    // Watchlist collection state
    const [collections, setCollections] = useState([]); // all collection names
    const [activeCollection, setActiveCollection] = useState('Default');
    const [symbols, setSymbols] = useState([]); // symbols in active collection

    // UI state
    const [newSymbol, setNewSymbol] = useState('');
    const [bulkText, setBulkText] = useState('');
    const [newCollectionName, setNewCollectionName] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    };

    // Fetch all collection names on mount
    const fetchCollections = useCallback(async () => {
        try {
            const names = await api.getWatchlistNames();
            setCollections(prev => {
                // Merge server names with any locally "pending" collections
                // We assume anything in `prev` that isn't in `names` might be a pending new collection
                // (except if it was just deleted, but delete logic handles that)
                const merged = [...new Set([...names, ...prev])];
                return merged;
            });
        } catch (e) { 
            setCollections(prev => [...new Set(['Default', ...prev])]); 
        }
    }, []); // Removed activeCollection to prevent re-fetch loops

    // Fetch symbols for the currently active collection
    const fetchSymbols = useCallback(async (name) => {
        if (!name) return;
        try {
            const data = await api.getWatchlist(name);
            setSymbols(data);
        } catch (e) { setSymbols([]); }
    }, []);

    useEffect(() => { fetchCollections(); }, [fetchCollections]);
    useEffect(() => { 
        if (activeCollection && collections.includes(activeCollection)) {
            fetchSymbols(activeCollection); 
        }
    }, [activeCollection, collections, fetchSymbols]);

    const startLoginFlow = async () => {
        try {
            localStorage.setItem('ACTIVE_BROKER', selectedBroker);
            const res = selectedBroker === 'FYERS'
                ? await api.getFyersLoginUrl()
                : await api.getKiteLoginUrl();
            window.location.href = res.url;
        } catch (e) { showMessage('Failed to generate Login URL.', 'error'); }
    };

    const refreshLiveFeed = async (collectionName) => {
        try {
            const symbols = await api.getWatchlist(collectionName);
            await api.syncWatchlist(symbols);
        } catch (e) { /* silent */ }
    };

    const createCollection = async () => {
        const name = newCollectionName.trim();
        if (!name || collections.includes(name)) return;
        // Adding a dummy symbol to create the collection, then remove if empty
        // Simpler: just add the name to local state (it will be persisted when first symbol is added)
        setCollections(prev => [...prev, name]);
        setActiveCollection(name);
        setSymbols([]);
        setNewCollectionName('');
        showMessage(`Collection "${name}" created. Add symbols to save it.`);
    };

    const deleteCollection = async (name) => {
        if (name === 'Default') return;
        try {
            await api.deleteWatchlist(name);
            const remaining = collections.filter(c => c !== name);
            setCollections(remaining);
            setActiveCollection(remaining[0] || 'Default');
            showMessage(`Collection "${name}" deleted.`);
        } catch (e) { showMessage('Delete failed.', 'error'); }
    };

    const addSymbol = async () => {
        if (!newSymbol) return;
        try {
            const data = await api.addToWatchlist(activeCollection, newSymbol);
            setSymbols(prev => [...new Set([...prev, ...data.added])]);
            setNewSymbol('');
            // Make sure collection appears in the names list now (it's persisted in DB)
            await fetchCollections();
            refreshLiveFeed(activeCollection);
        } catch (e) { showMessage('Add failed.', 'error'); }
    };

    const removeSymbol = async (sym) => {
        try {
            await api.removeFromWatchlist(activeCollection, sym);
            setSymbols(prev => prev.filter(s => s !== sym));
            refreshLiveFeed(activeCollection);
        } catch (e) { showMessage('Remove failed.', 'error'); }
    };

    const handleBulkUpload = async () => {
        if (!bulkText) return;
        setLoading(true);
        try {
            await api.bulkUpload(activeCollection, bulkText);
            await fetchSymbols(activeCollection);
            await fetchCollections();
            setBulkText('');
            showMessage(`Bulk sync complete for "${activeCollection}".`);
            refreshLiveFeed(activeCollection);
        } catch (e) { showMessage('Bulk upload failed.', 'error'); }
        finally { setLoading(false); }
    };

    return (
        <div className={clsx('flex-1 p-6 flex flex-col min-h-0', theme === 'dark' ? 'bg-[#0a0a0a]' : 'bg-gray-50')}>
            {/* Header */}
            <div className="mb-6 flex justify-between items-end shrink-0">
                <div>
                    <h1 className={clsx('text-2xl font-black mb-1 tracking-tight uppercase italic', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                        Platform <span className="text-indigo-500">Configuration</span>
                    </h1>
                    <p className="text-gray-500 text-[11px] font-bold uppercase tracking-widest">Broker Auth & Watchlist Collections</p>
                </div>
                <div className="flex items-center space-x-3">
                    <div className="flex bg-white/20 p-1 rounded-xl shadow-inner border border-white/5">
                        {['ZERODHA', 'FYERS'].map(broker => (
                            <button key={broker} onClick={() => setSelectedBroker(broker)}
                                className={clsx('px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-widest transition-all',
                                    selectedBroker === broker ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5')}>
                                {broker}
                            </button>
                        ))}
                    </div>
                    <button onClick={startLoginFlow} className="group flex items-center space-x-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-md active:scale-95">
                        <Power size={14} className="group-hover:animate-pulse" />
                        <span>Auth {selectedBroker}</span>
                    </button>
                    {streamConnected && (
                        <div className="flex items-center space-x-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-[10px] font-black uppercase tracking-widest">
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(52,211,153,0.8)]"></div>
                            <span>{selectedBroker} Active</span>
                        </div>
                    )}
                </div>
            </div>

            {message.text && (
                <div className={clsx('mb-4 text-[10px] font-bold uppercase tracking-widest px-4 py-2.5 rounded-xl w-full flex items-center justify-center shrink-0 border',
                    message.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500' : 'bg-rose-500/10 border-rose-500/20 text-rose-500')}>
                    {message.text}
                </div>
            )}

            {/* Main Content: Two-column layout */}
            <div className="flex-1 flex gap-6 min-h-0">
                
                {/* Left: Collection List */}
                <div className={clsx('w-64 shrink-0 flex flex-col rounded-2xl border p-4', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                    <div className="flex items-center space-x-2 mb-4">
                        <Layers size={14} className="text-indigo-400" />
                        <h3 className={clsx('text-[10px] font-black uppercase tracking-widest', theme === 'dark' ? 'text-gray-400' : 'text-gray-600')}>Collections</h3>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-1 custom-scrollbar">
                        {collections.map(name => (
                            <div key={name}
                                onClick={() => setActiveCollection(name)}
                                className={clsx('group flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all',
                                    activeCollection === name
                                        ? 'bg-indigo-600 text-white'
                                        : theme === 'dark' ? 'hover:bg-white/5 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
                                )}
                            >
                                <div className="flex items-center space-x-2 overflow-hidden">
                                    <ChevronRight size={12} className={activeCollection === name ? 'text-white' : 'text-gray-600'} />
                                    <span className="text-[11px] font-black uppercase tracking-wider truncate">{name}</span>
                                </div>
                                {name !== 'Default' && (
                                    <button
                                        onClick={(e) => { e.stopPropagation(); deleteCollection(name); }}
                                        className={clsx('opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:text-rose-500',
                                            activeCollection === name ? 'text-white/60' : 'text-gray-500')}
                                    >
                                        <Trash2 size={11} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>

                    {/* New Collection Input */}
                    <div className={clsx('mt-4 pt-3 border-t', theme === 'dark' ? 'border-white/5' : 'border-gray-200')}>
                        <p className="text-[9px] uppercase font-black text-gray-500 tracking-widest mb-2">New Collection</p>
                        <div className="flex space-x-2">
                            <input
                                value={newCollectionName}
                                onChange={e => setNewCollectionName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && createCollection()}
                                placeholder="e.g. Nifty 50"
                                className={clsx('flex-1 text-[10px] p-2 rounded-lg border outline-none font-mono',
                                    theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-gray-50 border-gray-200 text-gray-900')}
                            />
                            <button
                                onClick={createCollection}
                                className="p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all active:scale-90 shadow-sm"
                            >
                                <FolderPlus size={13} />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Right: Symbols Editor */}
                <div className={clsx('flex-1 flex flex-col rounded-2xl border p-6', theme === 'dark' ? 'bg-zinc-950/50 border-white/5' : 'bg-white border-gray-200')}>
                    {/* Collection Header */}
                    <div className="flex items-center justify-between mb-5 shrink-0">
                        <div>
                            <h2 className={clsx('text-lg font-black uppercase tracking-wider', theme === 'dark' ? 'text-white' : 'text-gray-900')}>{activeCollection}</h2>
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mt-0.5">{symbols.length} symbols</p>
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                value={newSymbol}
                                onChange={e => setNewSymbol(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addSymbol()}
                                placeholder="NSE:ITC or NFO:RELIANCE26MARFUT"
                                className={clsx('w-56 text-[10px] p-2.5 rounded-xl border outline-none font-mono focus:ring-1 focus:ring-indigo-500',
                                    theme === 'dark' ? 'bg-black/40 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900')}
                            />
                            <button onClick={addSymbol} className="flex items-center space-x-1.5 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md">
                                <Plus size={13} />
                                <span>Add</span>
                            </button>
                        </div>
                    </div>

                    {/* Symbol Chips */}
                    <div className={clsx('flex-1 overflow-y-auto flex flex-wrap gap-2 content-start p-4 rounded-xl border border-dashed custom-scrollbar',
                        theme === 'dark' ? 'bg-black/20 border-white/5' : 'bg-gray-50 border-gray-200')}>
                        {symbols.length === 0 ? (
                            <div className="w-full h-full flex flex-col items-center justify-center text-center space-y-2 opacity-40">
                                <Layers size={32} className="text-gray-600" />
                                <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">No symbols yet. Add one above or bulk upload below.</p>
                            </div>
                        ) : symbols.map(sym => (
                            <div key={sym} className={clsx('flex items-center space-x-2 pl-2.5 pr-1.5 py-1.5 rounded-lg border group transition-all shrink-0 shadow-sm',
                                theme === 'dark' ? 'bg-zinc-900 border-white/10 text-white hover:border-indigo-500/50' : 'bg-white border-gray-200 hover:border-indigo-400')}>
                                <div className="flex flex-col">
                                    <span className="text-[7px] text-indigo-400 font-black uppercase leading-none mb-0.5">{sym.includes(':') ? sym.split(':')[0] : 'NSE'}</span>
                                    <span className="text-[11px] font-black font-mono tracking-tight">{sym.includes(':') ? sym.split(':')[1] : sym}</span>
                                </div>
                                <button onClick={() => removeSymbol(sym)} className="text-gray-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 p-0.5">
                                    <X size={11} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Bulk Upload Footer */}
                    <div className={clsx('mt-4 pt-4 border-t shrink-0', theme === 'dark' ? 'border-white/5' : 'border-gray-100')}>
                        <p className="text-[9px] uppercase font-black text-gray-500 tracking-widest mb-2">Bulk Upload (comma or newline separated)</p>
                        <div className="flex space-x-3">
                            <textarea
                                value={bulkText}
                                onChange={e => setBulkText(e.target.value)}
                                placeholder="NSE:ITC, NSE:OFSS, NSE:TCS, NFO:RELIANCE26MARFUT..."
                                className={clsx('flex-1 h-12 p-3 rounded-xl border text-[10px] font-mono focus:ring-1 focus:ring-indigo-500 outline-none transition-all resize-none',
                                    theme === 'dark' ? 'bg-black/40 border-white/10 text-indigo-100' : 'bg-white border-gray-200 text-gray-900')}
                            />
                            <button
                                onClick={handleBulkUpload}
                                disabled={!bulkText || loading}
                                className="flex items-center space-x-2 px-5 bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                            >
                                <Upload size={13} />
                                <span>{loading ? 'Syncing...' : 'Sync'}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SettingsView;
