import React from 'react';
import {
    TrendingUp,
    ChevronLeft,
    ChevronRight,
    Sun,
    Moon,
    Power,
    Wifi,
    WifiOff,
    LogOut
} from 'lucide-react';
import { clsx } from 'clsx';
import { MENU_ITEMS } from '../../constants';

const Sidebar = ({
    activeView,
    setActiveView,
    isCollapsed,
    toggleSidebar,
    theme,
    toggleTheme,
    session,
    wsStatus,
    onLogout
}) => {

    return (
        <div className={clsx(
            "h-screen transition-all duration-300 flex flex-col border-r relative",
            isCollapsed ? "w-20 p-4" : "w-64 p-6",
            theme === 'dark' ? "bg-[#0a0a0a] border-white/5" : "bg-white border-gray-200"
        )}>
            {/* Collapse Toggle Button */}
            <button
                onClick={toggleSidebar}
                className={clsx(
                    "absolute -right-3 top-10 size-6 rounded-full border flex items-center justify-center transition-colors z-50",
                    theme === 'dark' ? "bg-zinc-900 border-white/10 text-gray-400 hover:text-white" : "bg-white border-gray-200 text-gray-600 hover:text-black"
                )}
            >
                {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
            </button>

            {/* Logo Section */}
            <div className={clsx("flex items-center mb-12", isCollapsed ? "justify-center" : "space-x-3")}>
                <div className="size-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(79,70,229,0.4)] shrink-0">
                    <TrendingUp className="text-white" size={24} />
                </div>
                {!isCollapsed && (
                    <h2 className={clsx("text-xl font-black tracking-tighter uppercase italic", theme === 'dark' ? "text-white" : "text-gray-900")}>
                        Quant<span className="text-indigo-500">Flux</span>
                    </h2>
                )}
            </div>

            {/* Navigation */}
            <nav className="flex-1 space-y-2">
                {!isCollapsed && (
                    <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest pl-2 mb-4">Core Platform</p>
                )}
                {MENU_ITEMS.map(item => (
                    <button
                        key={item.id}
                        onClick={() => setActiveView(item.id)}
                        className={clsx(
                            "w-full flex items-center rounded-xl transition-all duration-300 group relative",
                            isCollapsed ? "justify-center p-3" : "px-4 py-3 space-x-3",
                            activeView === item.id
                                ? 'bg-indigo-600/10 text-indigo-400 border-l-4 border-indigo-600'
                                : theme === 'dark' ? 'text-gray-400 hover:bg-white/5 hover:text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-black'
                        )}
                    >
                        <item.icon size={20} className={activeView === item.id ? 'text-indigo-400' : 'text-gray-500 group-hover:text-blue-400 transition-colors'} />
                        {!isCollapsed && <span className="font-semibold text-sm tracking-wide">{item.label}</span>}

                        {/* Tooltip for collapsed mode */}
                        {isCollapsed && (
                            <div className="absolute left-full ml-4 px-2 py-1 bg-black text-white text-[10px] rounded opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50">
                                {item.label}
                            </div>
                        )}
                    </button>
                ))}
            </nav>

            {/* Bottom Section: Session Info + Theme */}
            <div className="mt-auto space-y-3">

                {/* Session Block */}
                {!isCollapsed && session && (
                    <div className={clsx(
                        "rounded-xl border p-3 space-y-3",
                        theme === 'dark' ? "bg-zinc-900/50 border-white/5" : "bg-gray-50 border-gray-200"
                    )}>
                        {/* Broker badge + WS status */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                                <div className={clsx(
                                    "size-2 rounded-full",
                                    wsStatus === 'online' ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)] animate-pulse" : "bg-rose-500"
                                )} />
                                <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">
                                    {session.broker}
                                </span>
                            </div>
                            <span className={clsx(
                                "text-[9px] font-bold uppercase tracking-widest",
                                wsStatus === 'online' ? "text-emerald-400" : "text-rose-500"
                            )}>
                                {wsStatus === 'online' ? 'Live' : 'Offline'}
                            </span>
                        </div>

                        {/* Disconnect */}
                        <button
                            onClick={onLogout}
                            className={clsx(
                                "w-full flex items-center justify-center space-x-2 rounded-lg py-2 text-[9px] font-black uppercase tracking-widest border transition-all",
                                theme === 'dark'
                                    ? "border-rose-500/20 text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/40"
                                    : "border-rose-300 text-rose-500 hover:bg-rose-50"
                            )}
                        >
                            <LogOut size={11} />
                            <span>Disconnect</span>
                        </button>
                    </div>
                )}

                {/* Collapsed: just show ws dot + logout */}
                {isCollapsed && session && (
                    <div className="flex flex-col items-center space-y-2">
                        <div className={clsx(
                            "size-2 rounded-full",
                            wsStatus === 'online' ? "bg-emerald-400 animate-pulse" : "bg-rose-500"
                        )} />
                        <button onClick={onLogout} className="text-rose-400 hover:text-rose-300 p-1.5 rounded-lg hover:bg-rose-500/10 transition-all">
                            <LogOut size={15} />
                        </button>
                    </div>
                )}

                {/* Theme Toggle */}
                <button
                    onClick={toggleTheme}
                    className={clsx(
                        "w-full flex items-center rounded-xl p-3 transition-all",
                        isCollapsed ? "justify-center" : "space-x-3",
                        theme === 'dark' ? "bg-zinc-900/40 text-gray-400 hover:text-white border border-white/5" : "bg-gray-100 text-gray-600 hover:text-black border border-gray-200"
                    )}
                >
                    {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
                    {!isCollapsed && <span className="text-xs font-bold uppercase tracking-tight">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>}
                </button>
            </div>
        </div>
    );
};

export default Sidebar;
