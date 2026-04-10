import React from 'react';
import Plot from 'react-plotly.js';

export const ShapeProbabilityChart = ({ data, theme }) => {
    if (!data || !data.Shapes || data.Shapes.length === 0) {
        return <div className="text-gray-400 p-4 border rounded border-gray-700 bg-gray-800">Chart is not created due to lack of data.</div>;
    }

    const { Shapes, Total_Days_Analyzed } = data;

    // Sort shapes highest to lowest
    const sortedShapes = [...Shapes].sort((a, b) => b.prob - a.prob);

    // For horizontal bar chart, Plotly plots bottom-to-top, so we reverse for visual top-to-bottom
    const reversedShapes = [...sortedShapes].reverse();

    const shapeNames = reversedShapes.map(s => s.name);
    const shapeProbs = reversedShapes.map(s => s.prob);
    const shapeCounts = reversedShapes.map(s => s.count);

    const isDark = theme === 'dark' || theme === undefined;
    const bgColor = isDark ? '#000000' : '#ffffff'; // Pitch black like the image
    const fontColor = isDark ? '#ffffff' : '#334155';

    // Viridis colors (Yellow for low prob, Purple for high prob)
    const viridis = ['#fde725', '#b5de2b', '#6ece58', '#35b779', '#1f9e89', '#26828e', '#31688e', '#3e4989', '#482878', '#440154'];
    const barColors = reversedShapes.map((_, i) => {
        const ratio = i / (reversedShapes.length - 1 || 1);
        const idx = Math.floor(ratio * (viridis.length - 1));
        return viridis[idx];
    });

    const downloadJSON = () => {
        const jsonData = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonData], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `shape_probability_export.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className={`p-6 rounded-xl shadow-2xl border mb-6 ${isDark ? 'bg-black border-zinc-800' : 'bg-white border-gray-200'}`}>
            <div className="flex justify-between items-center mb-2">
                <h3 className={`text-xl font-bold tracking-tight text-center w-full ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Day-by-Day Microstructure Shape Probability<br />
                    <span className="text-sm font-medium opacity-80">Total Trading Days Analyzed: {Total_Days_Analyzed}</span>
                </h3>
                <button
                    onClick={downloadJSON}
                    className="absolute right-10 text-[10px] uppercase font-bold tracking-widest px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 rounded transition-all"
                >
                    JSON
                </button>
            </div>

            <Plot
                data={[
                    {
                        type: 'bar',
                        x: shapeProbs,
                        y: shapeNames,
                        orientation: 'h',
                        marker: {
                            color: barColors,
                            line: { color: bgColor, width: 1 }
                        },
                        text: shapeProbs.map(p => `${p}%`),
                        textposition: 'outside',
                        textfont: { family: 'Inter, sans-serif', size: 11, color: fontColor },
                        hoverinfo: 'text',
                        hovertext: shapeCounts.map((c, i) => `${reversedShapes[i].name}: ${c} occurrences`)
                    }
                ]}
                layout={{
                    paper_bgcolor: bgColor,
                    plot_bgcolor: bgColor,
                    font: { family: 'Inter, sans-serif', color: fontColor },
                    margin: { t: 40, b: 60, l: 260, r: 80 },
                    xaxis: {
                        title: { text: 'Probability of Occurrence (%)', font: { size: 12 } },
                        range: [0, Math.max(...shapeProbs) + 5],
                        gridcolor: 'rgba(255, 255, 255, 0.1)',
                        gridwidth: 1,
                        griddash: 'dot',
                        zeroline: false,
                        tickfont: { size: 11 }
                    },
                    yaxis: {
                        automargin: true,
                        tickfont: { size: 12, weight: 'bold' },
                        gridcolor: 'transparent'
                    },
                    height: 550,
                    bargap: 0.15
                }}
                config={{
                    displayModeBar: false, // Cleaner look like the image
                    responsive: true,
                    toImageButtonOptions: {
                        format: 'png',
                        filename: 'shape_probability_distribution',
                        height: 800,
                        width: 1200,
                        scale: 2
                    }
                }}
                style={{ width: '100%' }}
            />
        </div>
    );
};
