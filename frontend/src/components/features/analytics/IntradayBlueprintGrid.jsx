import React from 'react';
import Plot from 'react-plotly.js';

export const IntradayBlueprintGrid = ({ data, theme }) => {
    // Check if blueprint data is missing or empty
    if (!data || Object.keys(data).length === 0) {
        return <div className="text-gray-400 p-4 border rounded border-gray-700 bg-gray-800">Chart is not created due to lack of data.</div>;
    }

    const { Blueprint_Data, Probability_Stats } = data;
    if (!Blueprint_Data) {
        return <div className="text-gray-400 p-4 border rounded border-gray-700 bg-gray-800">Chart is not created due to lack of data.</div>;
    }

    // Determine the top 9 most frequent shapes
    let sortedShapes = [];
    if (Probability_Stats && Probability_Stats.Shapes) {
        sortedShapes = [...Probability_Stats.Shapes]
            .sort((a, b) => b.count - a.count)
            .map(s => s.name);
    } else {
        sortedShapes = Object.keys(Blueprint_Data);
    }

    const topShapes = sortedShapes.slice(0, 9);
    if (topShapes.length === 0) {
        return <div className="text-gray-400 p-4 border rounded border-gray-700 bg-gray-800">Chart is not created due to lack of data.</div>;
    }

    const isDark = theme === 'dark' || theme === undefined;
    const bgColor = isDark ? '#000000' : '#ffffff';
    const fontColor = isDark ? '#ffffff' : '#334155';
    const gridColor = isDark ? 'rgba(255,255,255,0.05)' : '#e2e8f0';

    const traces = [];
    const layout = {
        title: {
            text: 'Intraday Blueprint: Price vs VWAP Dynamics with Squeeze Zones',
            font: { size: 24, color: fontColor, weight: 'bold' },
            y: 0.98
        },
        paper_bgcolor: bgColor,
        plot_bgcolor: bgColor,
        font: { family: 'Inter, sans-serif', color: fontColor },
        showlegend: true,
        legend: {
            x: 0,
            y: 1.05,
            orientation: 'h',
            bgcolor: 'rgba(0,0,0,0)',
            font: { size: 10 }
        },
        height: 1200,
        margin: { t: 100, b: 80, l: 80, r: 80 },
        autosize: true
    };

    const rowDomains = [ [0.70, 0.98], [0.35, 0.63], [0.0, 0.28] ];
    const colDomains = [ [0.0, 0.30], [0.35, 0.65], [0.70, 1.0] ];

    topShapes.forEach((shapeName, index) => {
        const shapeData = Blueprint_Data[shapeName];
        if (!shapeData) return;

        const row = Math.floor(index / 3);
        const col = index % 3;
        
        const xaxisName = `xaxis${index === 0 ? '' : index + 1}`;
        const yaxisNamePrimary = `yaxis${index === 0 ? '' : index + 1}`;
        const yaxisNameSecIndex = index + 10;
        const yaxisNameSecondary = `yaxis${yaxisNameSecIndex}`;
        
        const xAxisRef = `x${index === 0 ? '' : index + 1}`;
        const yAxisRefPrimary = `y${index === 0 ? '' : index + 1}`;
        const yAxisRefSecondary = `y${yaxisNameSecIndex}`;

        const times = shapeData.map(d => d.Time);
        const closes = shapeData.map(d => Number(d.Close_Net_Pct));
        const vwaps = shapeData.map(d => Number(d.VWAP_Net_Pct));
        const volumes = shapeData.map(d => Number(d.Rel_Volume_Pct));

        const statData = Probability_Stats?.Shapes?.find(s => s.name === shapeName);
        const countStr = statData ? ` (N=${statData.count} days)` : '';

        if (!layout.annotations) layout.annotations = [];
        layout.annotations.push({
            text: `<b>${shapeName}${countStr}</b>`,
            x: (colDomains[col][0] + colDomains[col][1]) / 2,
            y: rowDomains[row][1] + 0.015,
            xref: 'paper',
            yref: 'paper',
            xanchor: 'center',
            yanchor: 'bottom',
            showarrow: false,
            font: { size: 14, color: fontColor }
        });

        // TRACES FOR SUBPLOT

        // 1. VWAP BASE (Invisible for Fill Reference)
        traces.push({
            x: times,
            y: vwaps,
            type: 'scatter',
            mode: 'lines',
            line: { color: 'rgba(0,0,0,0)', width: 0 },
            xaxis: xAxisRef,
            yaxis: yAxisRefPrimary,
            showlegend: false,
            hoverinfo: 'skip'
        });

        // 2. BULLISH SQUEEZE (Shade Green where Price > VWAP)
        const bullishY = closes.map((c, i) => Math.max(c, vwaps[i]));
        traces.push({
            x: times,
            y: bullishY,
            fill: 'tonexty',
            fillcolor: 'rgba(0, 230, 118, 0.15)',
            type: 'scatter',
            mode: 'none',
            xaxis: xAxisRef,
            yaxis: yAxisRefPrimary,
            name: 'Bullish Zone',
            legendgroup: 'bullish',
            showlegend: index === 0,
            hoverinfo: 'skip'
        });

        // 3. BEARISH SQUEEZE (Shade Red where Price < VWAP)
        const bearishY = closes.map((c, i) => Math.min(c, vwaps[i]));
        traces.push({
            x: times,
            y: bearishY,
            fill: 'tonexty',
            fillcolor: 'rgba(255, 82, 82, 0.15)',
            type: 'scatter',
            mode: 'none',
            xaxis: xAxisRef,
            yaxis: yAxisRefPrimary,
            name: 'Bearish Zone',
            legendgroup: 'bearish',
            showlegend: index === 0,
            hoverinfo: 'skip'
        });

        // 4. PRICE LINE (Solid Green)
        traces.push({
            x: times,
            y: closes,
            type: 'scatter',
            mode: 'lines+markers',
            marker: { color: '#00e676', size: 3.5 },
            line: { color: '#00e676', width: 2.5 },
            xaxis: xAxisRef,
            yaxis: yAxisRefPrimary,
            name: 'Avg Price',
            legendgroup: 'price',
            showlegend: index === 0
        });

        // 5. VWAP LINE (Dashed Red)
        traces.push({
            x: times,
            y: vwaps,
            type: 'scatter',
            mode: 'lines',
            line: { color: '#ff5252', width: 2, dash: 'dash' },
            xaxis: xAxisRef,
            yaxis: yAxisRefPrimary,
            name: 'Avg VWAP',
            legendgroup: 'vwap',
            showlegend: index === 0
        });

        // 6. VOLUME (Bars)
        traces.push({
            x: times,
            y: volumes,
            type: 'bar',
            marker: { color: '#8c9eff', opacity: 0.25 },
            xaxis: xAxisRef,
            yaxis: yAxisRefSecondary,
            name: 'Avg Rel Volume',
            legendgroup: 'vol',
            showlegend: index === 0
        });

        // Setup Layout Axes
        layout[xaxisName] = {
            domain: colDomains[col],
            anchor: yAxisRefPrimary,
            showticklabels: row === Math.floor((topShapes.length-1)/3),
            tickangle: -45,
            gridcolor: 'rgba(255,255,255,0.08)',
            griddash: 'dot',
            tickfont: { size: 9 },
            type: 'category'
        };

        const allPriceValues = [...closes, ...vwaps].filter(v => !isNaN(v) && v !== null);
        const globalMin = allPriceValues.length > 0 ? Math.min(...allPriceValues) - 0.2 : -1.5;
        const globalMax = allPriceValues.length > 0 ? Math.max(...allPriceValues) + 0.2 : 1.5;

        layout[yaxisNamePrimary] = {
            domain: rowDomains[row],
            anchor: xAxisRef,
            gridcolor: 'rgba(255,255,255,0.08)',
            griddash: 'dot',
            zeroline: true,
            zerolinecolor: 'rgba(255,255,255,0.6)',
            zerolinewidth: 2,
            range: [globalMin, globalMax],
            tickfont: { size: 9 },
            title: index % 3 === 0 ? { text: 'Price Change (%)', font: { size: 10 } } : null
        };

        const maxVol = Math.max(...volumes.filter(v => !isNaN(v))) || 20;
        layout[yaxisNameSecondary] = {
            domain: rowDomains[row],
            overlaying: yAxisRefPrimary,
            side: 'right',
            anchor: xAxisRef,
            showgrid: false,
            range: [0, Math.max(20, maxVol * 4)], 
            tickfont: { size: 9, color: '#8c9eff' },
            showticklabels: index % 3 === 2,
            title: index % 3 === 2 ? { text: 'Relative Volume (%)', font: { size: 10 } } : null
        };
    });

    const downloadJSON = () => {
        const jsonData = JSON.stringify(Blueprint_Data, null, 2);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `category_blueprints_export.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`p-6 rounded-xl shadow-2xl border mb-6 ${isDark ? 'bg-black border-zinc-800' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-end mb-4 relative z-10">
                <button 
                    onClick={downloadJSON}
                    className="text-[10px] px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-all uppercase font-bold tracking-widest"
                >
                    Export JSON
                </button>
            </div>
            
            <Plot
                data={traces}
                layout={layout}
                config={{
                    displayModeBar: true,
                    responsive: true,
                    toImageButtonOptions: {
                        format: 'png',
                        filename: 'category_blueprints_squeeze_zones',
                        height: 1600,
                        width: 2000,
                        scale: 1
                    }
                }}
                style={{ width: '100%', height: '1200px' }}
            />
        </div>
    );
};

