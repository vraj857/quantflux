import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Download } from 'lucide-react';
import { clsx } from 'clsx';

const MicrostructureChart = ({ data, theme }) => {
    if (!data || !data.Timeframe_Data || data.Timeframe_Data.length === 0) return null;

    const detectedShape = data.Detected_Shape || "Undefined";
    const chartData = data.Timeframe_Data;

    const downloadJSON = () => {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const sym = data.symbol?.replace(/[^a-zA-Z0-9]/g, '_') || "SYMBOL";
        const sd = data.start_date || "START";
        const ed = data.end_date || "END";
        const shapeStr = detectedShape.replace(/\s+/g, '_').toLowerCase();
        link.download = `microstructure_${shapeStr}_${sym}_${sd}_to_${ed}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const isDark = theme === 'dark';
    
    // Plotly Traces (Memoized to prevent flickering from object reallocation)
    const plotData = useMemo(() => {
        const times = chartData.map(d => d.Time);
        const volumes = chartData.map(d => d.Avg_Rel_Volume_Pct);
        // Fallbacks for standard price move if VWAP isn't yet in the backend payload dict due to caching
        const prices = chartData.map(d => d.Avg_Close_Net_Pct ?? d.Avg_Price_Move_Pct ?? 0);
        const vwaps = chartData.map(d => d.Avg_VWAP_Net_Pct ?? 0);
        const phases = chartData.map(d => d.Phase);

        const bullY = prices.map((p, i) => Math.max(p, vwaps[i]));
        const bearY = prices.map((p, i) => Math.min(p, vwaps[i]));

        return [
            {
                // Trace 0: Invisible Base VWAP
                x: times, y: vwaps, type: 'scatter', mode: 'lines',
                line: { width: 0 }, showlegend: false, hoverinfo: 'skip'
            },
            {
                // Trace 1: Bullish Fill
                x: times, y: bullY, type: 'scatter', mode: 'lines',
                fill: 'tonexty', fillcolor: isDark ? 'rgba(16, 185, 129, 0.15)' : 'rgba(16, 185, 129, 0.2)',
                line: { width: 0 }, name: 'Price > VWAP (Bullish Zone)',
                hoverinfo: 'skip'
            },
            {
                // Trace 2: Invisible Base VWAP again
                x: times, y: vwaps, type: 'scatter', mode: 'lines',
                line: { width: 0 }, showlegend: false, hoverinfo: 'skip'
            },
            {
                // Trace 3: Bearish Fill
                x: times, y: bearY, type: 'scatter', mode: 'lines',
                fill: 'tonexty', fillcolor: isDark ? 'rgba(244, 63, 94, 0.15)' : 'rgba(244, 63, 94, 0.2)',
                line: { width: 0 }, name: 'Price < VWAP (Bearish Zone)',
                hoverinfo: 'skip'
            },
            {
                // Trace 4: Actual VWAP Line
                x: times, y: vwaps, type: 'scatter', mode: 'lines',
                name: 'Average VWAP Line',
                line: { color: isDark ? '#ef4444' : '#ef4444', width: 2, dash: 'dash' },
                hovertemplate: 'VWAP: %{y:.2f}%<extra></extra>'
            },
            {
                // Trace 5: Average Price Line
                x: times, y: prices, type: 'scatter', mode: 'lines+markers',
                name: 'Average Price Line',
                line: { color: isDark ? '#94a3b8' : '#334155', width: 2 },
                marker: { size: 5, color: isDark ? '#94a3b8' : '#334155' },
                hovertemplate: 'Price: %{y:.2f}%<extra></extra>'
            },
            {
                // Trace 6: Volume Bar Chart (Subplot)
                x: times, y: volumes, type: 'bar',
                name: 'Normalized Vol %', yaxis: 'y2', text: phases,
                marker: { color: isDark ? '#a855f7' : '#a855f7', opacity: 0.8 },
                hovertemplate: '<b>%{x}</b><br>Phase: %{text}<br>Rel Volume: %{y:.2f}%<extra></extra>'
            }
        ];
    }, [chartData, isDark]);

    const plotLayout = useMemo(() => {
        // Dynamic Execution Zone Highlights and Annotations
        const shapes = [];
        const annotations = [];

        const getPhaseTimes = (phaseName) => {
            const phaseData = chartData.filter(d => d.Phase === phaseName);
            if (phaseData.length === 0) return null;
            return {
                start: phaseData[0].Time,
                end: phaseData[phaseData.length - 1].Time,
                data: phaseData
            };
        };

        const addHighlight = (start, end, color = isDark ? 'rgba(234, 179, 8, 0.12)' : 'rgba(250, 204, 21, 0.2)') => {
            shapes.push({
                type: 'rect',
                xref: 'x',
                yref: 'paper',
                x0: start,
                x1: end,
                y0: 0,
                y1: 1,
                fillcolor: color,
                line: { width: 0 },
                layer: 'below'
            });
        };

        const addAnnotation = (x, y, yRef, text, ax, ay, color) => {
            annotations.push({
                x: x,
                y: y,
                xref: 'x',
                yref: yRef,
                text: text,
                showarrow: true,
                arrowhead: 2,
                arrowsize: 1,
                arrowwidth: 1.5,
                arrowcolor: color || (isDark ? '#fbbf24' : '#d97706'),
                ax: ax,
                ay: ay,
                font: { size: 9, color: isDark ? '#fff' : '#000', family: 'Inter, sans-serif' },
                bgcolor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)',
                bordercolor: color || (isDark ? '#4b5563' : '#d1d5db'),
                borderwidth: 1,
                borderpad: 4
            });
        };

        if (detectedShape.includes('J-Shape')) {
            const closing = getPhaseTimes('4. Closing Session');
            if (closing) {
                addHighlight(closing.start, closing.end);
                if (closing.data.length >= 1) {
                    addAnnotation(closing.data[0].Time, closing.data[0].Avg_Rel_Volume_Pct, 'y2', '<b>1. THE START</b><br>Volume wakes up', -50, -40);
                }
                if (closing.data.length >= 2) {
                    addAnnotation(closing.data[1].Time, closing.data[1].Avg_Rel_Volume_Pct, 'y2', '<b>2. ALGO TRIGGER</b><br>Crosses threshold', -60, -60, isDark ? '#10b981' : '#059669');
                }
                if (closing.data.length >= 3) {
                    const lastData = closing.data[closing.data.length - 1];
                    addAnnotation(lastData.Time, lastData.Avg_Rel_Volume_Pct, 'y2', '<b>3. THE CLIMAX</b><br>Squeeze peaks', -60, 20, isDark ? '#f43f5e' : '#e11d48');
                }
            }
        } else if (detectedShape.includes('L-Shape')) {
            const morning = getPhaseTimes('1. Morning Phase');
            if (morning) {
                addHighlight(morning.start, morning.end, isDark ? 'rgba(244, 63, 94, 0.1)' : 'rgba(225, 29, 72, 0.15)');
                if (morning.data.length >= 1) {
                    addAnnotation(morning.data[0].Time, morning.data[0].Avg_Rel_Volume_Pct, 'y2', '<b>INITIAL DUMP</b><br>Heavy selling', 50, -40, isDark ? '#f43f5e' : '#e11d48');
                }
                if (morning.data.length >= 3) {
                    addAnnotation(morning.data[morning.data.length-1].Time, morning.data[morning.data.length-1].Avg_Rel_Volume_Pct, 'y2', '<b>THE DEADZONE</b><br>Volume flatlines', 50, -30);
                }
            }
        } else if (detectedShape.includes('U-Shape') && !detectedShape.includes('Micro')) {
            const morning = getPhaseTimes('1. Morning Phase');
            const closing = getPhaseTimes('4. Closing Session');
            const color = isDark ? 'rgba(56, 189, 248, 0.1)' : 'rgba(14, 165, 233, 0.15)'; // Sky Blue
            
            if (morning) {
                addHighlight(morning.start, morning.end, color);
                if (morning.data.length > 0) addAnnotation(morning.data[0].Time, morning.data[0].Avg_Rel_Volume_Pct, 'y2', '<b>MORNING HIGH</b>', 40, -30, isDark ? '#38bdf8' : '#0ea5e9');
            }
            if (closing) {
                addHighlight(closing.start, closing.end, color);
                if (closing.data.length > 0) {
                    const last = closing.data[closing.data.length-1];
                    addAnnotation(last.Time, last.Avg_Rel_Volume_Pct, 'y2', '<b>CLOSING REVERSAL</b>', -60, -30, isDark ? '#38bdf8' : '#0ea5e9');
                }
            }
        } else if (detectedShape.includes('W-Shape')) {
            const trend = getPhaseTimes('3. Trend Formation');
            if (trend) {
                addHighlight(trend.start, trend.end, isDark ? 'rgba(167, 139, 250, 0.1)' : 'rgba(139, 92, 246, 0.15)'); // Purple
                if (trend.data.length >= 2) {
                    const py = trend.data[1].Avg_Close_Net_Pct ?? trend.data[1].Avg_Price_Move_Pct ?? 0;
                    addAnnotation(trend.data[1].Time, py, 'y', '<b>TREND WHIPSAW</b><br>Volatile swings', 0, -50, isDark ? '#a78bfa' : '#8b5cf6');
                }
            }
        }

        return {
            autosize: true,
            margin: { t: 30, b: 40, l: 50, r: 20 },
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            showlegend: true,
            shapes: shapes,
            annotations: annotations,
            legend: { 
                orientation: "v", 
                yanchor: "bottom", 
                y: 0.35, 
                xanchor: "left", 
                x: 0.02,
                font: { color: isDark ? '#888' : '#666', size: 9, family: 'Inter, sans-serif' },
                bgcolor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.8)',
                bordercolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                borderwidth: 1
            },
            xaxis: {
                tickfont: { color: isDark ? '#888' : '#666', size: 9, family: 'Inter, sans-serif' },
                showgrid: true,
                gridcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                griddash: 'dash',
                zeroline: false
            },
            yaxis: {
                title: { text: "Net % Move from Daily Open", font: {size: 9, color: isDark ? '#888' : '#666' } },
                domain: [0.35, 1],
                tickfont: { color: isDark ? '#888' : '#666', size: 9, family: 'Inter, sans-serif' },
                gridcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                griddash: 'dash',
                showgrid: true
            },
            yaxis2: {
                title: { text: "Normalized Vol %", font: {size: 9, color: isDark ? '#a855f7' : '#a855f7' } },
                domain: [0, 0.3],
                tickfont: { color: isDark ? '#888' : '#666', size: 9, family: 'Inter, sans-serif' },
                gridcolor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)',
                griddash: 'dash',
                showgrid: true,
                ticksuffix: '%'
            },
            hovermode: 'x unified',
            hoverlabel: {
                bgcolor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.9)',
                bordercolor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                font: { family: 'Inter, sans-serif', color: isDark ? '#fff' : '#000', size: 11 }
            }
        };
    }, [isDark]);

    return (
        <div className={clsx(
            "rounded-xl border p-4 shadow-sm flex flex-col overflow-hidden",
            isDark ? "bg-black/40 border-white/5" : "bg-white border-gray-100"
        )}>
            <div className="flex items-center justify-between mb-2">
                <h3 className={clsx(
                    "text-[11px] font-black uppercase tracking-widest",
                    isDark ? "text-indigo-400" : "text-indigo-600"
                )}>
                    Normalized Microstructure: {detectedShape} Detected
                </h3>
                <button 
                    onClick={downloadJSON}
                    className="flex items-center space-x-2 bg-indigo-600/20 hover:bg-indigo-600/40 text-indigo-400 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all"
                >
                    <Download size={12} />
                    <span>Export JSON</span>
                </button>
            </div>
            
            <div className="w-full h-[550px] mt-2 relative">
                <Plot
                    data={plotData}
                    layout={plotLayout}
                    config={{ displayModeBar: false, responsive: true }}
                    useResizeHandler={true}
                    style={{ width: '100%', height: '100%' }}
                />
            </div>
        </div>
    );
};

export default MicrostructureChart;

