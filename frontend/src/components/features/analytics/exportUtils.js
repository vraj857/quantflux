export const exportWatchlistToCSV = (phaseStats, regimeData, watchlistName) => {
    if (!regimeData) return;

    const symbols = Object.keys(regimeData).filter(s => s !== 'Aggregate');

    // Mappings
    const pStatsMap = {};
    if (Array.isArray(phaseStats)) {
        phaseStats.forEach(p => { pStatsMap[p.symbol] = p.stats; });
    }

    // --- SECTION 1: WATCHLIST SUMMARY ---
    const summaryRows = [];
    for (const symbol of symbols) {
        const data = regimeData[symbol]?.microstructure;
        if (!data) continue;

        const shapeStr = data.Detected_Shape || 'Undefined';
        const tfData = data.Timeframe_Data || [];
        const probs = data.Probability_Stats || { Total_Days_Analyzed: 0, Shapes: [] };
        const bp = data.Blueprint_Data || {};

        let maxVol = 0; let peakVolPhase = '-'; let maxPrice = 0;
        
        tfData.forEach(d => {
            if (d.Avg_Rel_Volume_Pct > maxVol) {
                maxVol = d.Avg_Rel_Volume_Pct;
                peakVolPhase = d.Phase || d.Time;
            }
            if (Math.abs(d.Avg_Close_Net_Pct) > Math.abs(maxPrice)) maxPrice = d.Avg_Close_Net_Pct;
        });

        const symStats = pStatsMap[symbol] || {};
        const effs = [];
        Object.values(symStats).forEach(ph => { if (ph.efficiency !== undefined) effs.push(ph.efficiency); });
        const avgEff = effs.length > 0 ? (effs.reduce((a, b) => a + b, 0) / effs.length).toFixed(2) : 'N/A';
        const commonDailyShape = probs.Shapes.length > 0 ? probs.Shapes[0].name : 'N/A';

        summaryRows.push({
            Symbol: symbol,
            'Overall Efficiency': avgEff,
            'Detected Intraday Shape': shapeStr,
            'Most Common Daily Shape': commonDailyShape,
            'Days Analyzed': probs.Total_Days_Analyzed,
            'Peak Vol Phase': peakVolPhase,
            'Max Rel Vol Spike (%)': maxVol > 0 ? maxVol.toFixed(2) : 'N/A',
            'Max Price Move (%)': maxPrice !== 0 ? maxPrice.toFixed(2) : 'N/A',
            'Available Blueprint Shapes': Object.keys(bp).length
        });
    }

    // --- SECTION 2: NORMALIZED MICROSTRUCTURE ---
    const microstructureRows = [];
    for (const symbol of symbols) {
        const tfData = regimeData[symbol]?.microstructure?.Timeframe_Data || [];
        tfData.forEach(d => {
            microstructureRows.push({
                Symbol: symbol,
                Time: d.Time,
                Phase: d.Phase,
                'Avg Rel Volume %': d.Avg_Rel_Volume_Pct,
                'Avg Close Net %': d.Avg_Close_Net_Pct,
                'Avg VWAP Net %': d.Avg_VWAP_Net_Pct
            });
        });
    }

    // --- SECTION 3: SHAPE PROBABILITIES ---
    const probRows = [];
    for (const symbol of symbols) {
        const probs = regimeData[symbol]?.microstructure?.Probability_Stats;
        if (probs && probs.Shapes) {
            probs.Shapes.forEach(s => {
                probRows.push({
                    Symbol: symbol,
                    Shape: s.name,
                    Count: s.count,
                    'Probability %': s.prob,
                    'Total Days Analyzed': probs.Total_Days_Analyzed
                });
            });
        }
    }

    // --- SECTION 4: INTRADAY BLUEPRINTS ---
    const blueprintRows = [];
    for (const symbol of symbols) {
        const bp = regimeData[symbol]?.microstructure?.Blueprint_Data || {};
        for (const [shapeName, timeslots] of Object.entries(bp)) {
            timeslots.forEach(t => {
                blueprintRows.push({
                    Symbol: symbol,
                    Shape: shapeName,
                    Time: t.Time,
                    'Rel Vol %': t.Rel_Volume_Pct,
                    'Close Net %': t.Close_Net_Pct,
                    'VWAP Net %': t.VWAP_Net_Pct
                });
            });
        }
    }

    // --- ASSEMBLY ---
    const assembleSection = (title, rows) => {
        if (rows.length === 0) return '';
        const headers = Object.keys(rows[0]);
        const data = rows.map(r => headers.map(h => `"${r[h]}"`).join(',')).join('\n');
        return `"${title}"\n${headers.join(',')}\n${data}\n\n`;
    };

    let csvContent = "";
    csvContent += assembleSection("--- 1. WATCHLIST DASHBOARD SUMMARY ---", summaryRows);
    csvContent += assembleSection("--- 2. TIMEFRAME MICROSTRUCTURE ---", microstructureRows);
    csvContent += assembleSection("--- 3. SHAPE PROBABILITIES ---", probRows);
    csvContent += assembleSection("--- 4. INTRADAY BLUEPRINTS ---", blueprintRows);

    if (!csvContent.trim()) return;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${watchlistName || 'Watchlist'}_Analytics_Master_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
