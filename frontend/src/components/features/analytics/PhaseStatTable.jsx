import React from 'react';
import { clsx } from 'clsx';

import { PHASE_NAMES, PHASE_COLORS, PHASE_BOUNDS_TEXT } from '../../../constants';

const PhaseStatTable = ({ stats, theme }) => {
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
                        const phaseIndex = PHASE_NAMES.indexOf(pha);
                        
                        return (
                            <tr key={pha} className={clsx(
                                'border-b transition-colors group',
                                theme === 'dark' ? 'border-white/5 hover:bg-white/[0.03]' : 'border-gray-100/50 hover:bg-indigo-50/20'
                            )}>
                                <td className='py-4 px-4'>
                                    <div className='flex items-center gap-3'>
                                        <div className='size-2 rounded-full' style={{ background: PHASE_COLORS[phaseIndex] }} />
                                        <span className={clsx('text-xs font-black uppercase tracking-tight', theme === 'dark' ? 'text-white' : 'text-gray-900')}>
                                            {pha}
                                        </span>
                                    </div>
                                </td>
                                <td className='py-4 px-4 text-[10px] font-bold text-gray-500 font-mono'>
                                    {PHASE_BOUNDS_TEXT[phaseIndex]}
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

export default PhaseStatTable;
