import {
    LayoutDashboard,
    History,
    Monitor,
    Settings,
    Play,
    Target
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

export const getDynamicPhases = (unifiedTimes, theme) => {
    const phaseDefs = [
        { name: "Morning Phase (9:15 – 10:30)", start: 9*60 + 15, end: 10*60 + 30, bg: theme === 'dark' ? "bg-emerald-500/10 text-emerald-500" : "bg-emerald-50 text-emerald-600" },
        { name: "Midday Chop (10:30 – 12:35)", start: 10*60 + 30, end: 12*60 + 35, bg: theme === 'dark' ? "bg-blue-500/10 text-blue-500" : "bg-blue-50 text-blue-600" },
        { name: "Trend Formation (12:35 – 2:15)", start: 12*60 + 35, end: 14*60 + 15, bg: theme === 'dark' ? "bg-indigo-500/10 text-indigo-500" : "bg-indigo-50 text-indigo-600" },
        { name: "Closing Session (2:15 – 3:30)", start: 14*60 + 15, end: 15*60 + 30, bg: theme === 'dark' ? "bg-slate-500/10 text-slate-400" : "bg-slate-50 text-slate-500" }
    ];

    const phases = phaseDefs.map(p => ({ ...p, colSpan: 0 }));

    unifiedTimes.forEach(timeKey => {
        const [hStr, mStr] = timeKey.split(':');
        const mins = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);

        for (let i = 0; i < phaseDefs.length; i++) {
            const p = phaseDefs[i];
            const isClosing = i === 3;
            if (isClosing) {
                if (mins >= p.start && mins <= p.end) {
                    phases[i].colSpan++;
                    break;
                }
            } else {
                if (mins >= p.start && mins < p.end) {
                    phases[i].colSpan++;
                    break;
                }
            }
        }
    });

    return phases.filter(p => p.colSpan > 0).map(p => ({
        name: p.name,
        colSpan: p.colSpan,
        bg: p.bg
    }));
};

export const METRIC_CONFIG = [
    { label: "Price", key: "price" },
    { label: "INR", key: "price_move" },
    { label: "PC %", key: "percent_change" },
    { label: "Vol", key: "volume" },
    { label: "VS %", key: "volume_strength" }
];

export const MENU_ITEMS = [
    { id: 'live', label: 'Live Feed', icon: Monitor },
    { id: 'backtest', label: 'Backtesting', icon: History },
    { id: 'simulator', label: 'Strategy Sim', icon: Play },
    { id: 'orders', label: 'Live Trades', icon: Target },
    { id: 'analytics', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'settings', label: 'Configuration', icon: Settings },
];

export const PHASE_NAMES  = ['Morning Phase', 'Midday Chop', 'Trend Formation', 'Closing Session'];
export const PHASE_COLORS = ['#10b981', '#3b82f6', '#6366f1', '#f59e0b'];
export const PHASE_LABELS = ['🌅 Morning', '☁️ Midday', '📈 Trend', '🔔 Closing'];

export const PHASE_BOUNDS_TEXT = [
    "09:15 AM – 10:30 AM",
    "10:30 AM – 12:35 PM",
    "12:35 PM – 02:15 PM",
    "02:15 PM – 03:30 PM"
];

export const CHART_COLORS = {
    increasing: '#10b981',
    decreasing: '#f43f5e',
    grid: '#1f1f1f',
    text: '#888'
};
