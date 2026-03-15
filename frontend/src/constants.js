import {
    LayoutDashboard,
    History,
    Monitor,
    Settings
} from 'lucide-react';

export const TIME_SLOTS_25 = [
    "09:15", "09:40", "10:05",
    "10:30", "10:55", "11:20", "11:45", "12:10",
    "12:35", "13:00", "13:25", "13:50",
    "14:15", "14:40", "15:05"
];

export const PHASES_25 = (theme) => [
    {
        name: "Morning Phase (9:15 – 10:30)",
        colSpan: 3,
        bg: theme === 'dark' ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600"
    },
    {
        name: "Midday Chop (10:30 – 12:35)",
        colSpan: 5,
        bg: theme === 'dark' ? "bg-blue-500/10 text-blue-500" : "bg-blue-50 text-blue-600"
    },
    {
        name: "Trend Formation (12:35 – 2:15)",
        colSpan: 4,
        bg: theme === 'dark' ? "bg-indigo-500/10 text-indigo-500" : "bg-indigo-50 text-indigo-600"
    },
    {
        name: "Closing Session (2:15 – 3:30)",
        colSpan: 3,
        bg: theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500"
    }
];

export const METRIC_CONFIG = [
    { label: "Price", key: "price" },
    { label: "PC %", key: "percent_change" },
    { label: "Vol", key: "volume" },
    { label: "VS %", key: "volume_strength" }
];

export const MENU_ITEMS = [
    { id: 'live', label: 'Live Feed', icon: Monitor },
    { id: 'backtest', label: 'Backtesting', icon: History },
    { id: 'analytics', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'settings', label: 'Configuration', icon: Settings },
];

export const CHART_COLORS = {
    increasing: '#10b981',
    decreasing: '#f43f5e',
    grid: '#1f1f1f',
    text: '#888'
};
