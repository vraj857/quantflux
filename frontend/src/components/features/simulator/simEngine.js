import { calculateCharges } from './chargesEngine';

// ─── Segment Detector ─────────────────────────────────────────────────────────
function getSegment(symbol) {
    const s = symbol.toUpperCase();
    if (s.endsWith('FUT')) return 'FNO_FUT';
    if (s.match(/\d+(CE|PE)$/)) return 'FNO_OPT';
    if (s.includes('NIFTY') || s.includes('BANKNIFTY')) {
        if (!s.includes('-EQ')) return 'FNO_FUT'; // Indices are usually F&O unless explicitly EQ trackers
    }
    return 'EQ_INTRADAY';
}

// ─── Slot generator ───────────────────────────────────────────────────────────
export function generateSlots(timeframe) {
    const slots = [];
    let mins = 9 * 60 + 15;
    const close = 15 * 60 + 30;
    while (mins < close) {
        const h = Math.floor(mins / 60), m = mins % 60;
        slots.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        mins += Number(timeframe);
    }
    return slots;
}

// ─── Streak helper ────────────────────────────────────────────────────────────
function maxStreak(trades, condition) {
    let max = 0, cur = 0;
    for (const t of trades) { cur = condition(t) ? cur + 1 : 0; if (cur > max) max = cur; }
    return max;
}

// ─── Sharpe / Sortino ─────────────────────────────────────────────────────────
function riskRatios(returns) {
    if (returns.length < 2) return { sharpe: 0, sortino: 0 };
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / returns.length;
    const std = Math.sqrt(variance);
    const downReturns = returns.filter(r => r < 0);
    const downVar = downReturns.length
        ? downReturns.reduce((a, r) => a + r ** 2, 0) / downReturns.length : 0;
    const downStd = Math.sqrt(downVar);
    const ann = Math.sqrt(252);
    return {
        sharpe:  std    > 0 ? ((mean * ann) / (std    * ann)).toFixed(2) : '0.00',
        sortino: downStd> 0 ? ((mean * ann) / (downStd* ann)).toFixed(2) : '0.00',
    };
}

// ─── Core backtest engine ─────────────────────────────────────────────────────
export function runBacktest(simData, params) {
    const { direction, entrySlot, exitSlot, requireVWAP, requireVolSpike,
            volThreshold, startingCapital, slippage,
            qtyMode = 'auto', fixedQtyVal = 1 } = params;

    const intradaySlots = generateSlots(simData.timeframe);
    const ALL = [...intradaySlots, 'NextDayOpen'];
    const ei = ALL.indexOf(entrySlot);
    const xi = ALL.indexOf(exitSlot);
    const slotsBetween = xi - ei;

    if (xi <= ei) return {
        trades: [], kpis: null, equityCurve: [], equityDates: [],
        drawdownSeries: [], error: `Exit "${exitSlot}" must come after Entry "${entrySlot}".`,
    };

    const segment = getSegment(simData.symbol);
    const lotSize = simData.lotSize || 1;
    const isBTST = exitSlot === 'NextDayOpen';

    let capital = Number(startingCapital);
    const trades = [];
    let maxEq = capital, maxDD = 0;
    const drawdownSeries = [];

    let firstEntryPrice = null;

    for (const day of simData.days) {
        const eC = day.slots[entrySlot];
        const xC = day.slots[exitSlot];
        if (!eC || !xC) continue;

        if (requireVWAP && eC.vwap != null) {
            if (direction === 'Long'  && eC.price <= eC.vwap) continue;
            if (direction === 'Short' && eC.price >= eC.vwap) continue;
        }
        if (requireVolSpike && ei > 0) {
            const prevC = day.slots[ALL[ei - 1]];
            if (!prevC?.volume || eC.volume <= Number(volThreshold) * prevC.volume) continue;
        }

        const slipPct     = Number(slippage) / 100;
        const entryPrice  = eC.price;
        const exitPrice   = xC.price;
        if (!firstEntryPrice) firstEntryPrice = entryPrice;

        // Calculate Qty
        let qty = 0;
        if (qtyMode === 'fixed') {
            // Fixed Mode: specified lots or units
            qty = (segment === 'EQ_INTRADAY') ? Number(fixedQtyVal) : Number(fixedQtyVal) * lotSize;
        } else {
            // Auto Mode: Capital-based calculation
            if (segment === 'EQ_INTRADAY') {
                qty = Math.floor(capital / entryPrice);
            } else {
                // For F&O: 20% margin requirement
                const marginRequiredPerUnit = entryPrice * 0.20; 
                const costPerLot = marginRequiredPerUnit * lotSize;
                const numLots = Math.floor(capital / costPerLot);
                qty = numLots * lotSize;
            }
        }

        if (qty <= 0) continue;

        const investedAmount = qty * entryPrice;
        const grossPnl       = direction === 'Long'
            ? qty * (exitPrice - entryPrice)
            : qty * (entryPrice - exitPrice);
        
        const slippageCost   = investedAmount * slipPct;
        
        // Calculate Charges
        const charges = calculateCharges({
            buyPrice: direction === 'Long' ? entryPrice : exitPrice,
            sellPrice: direction === 'Long' ? exitPrice : entryPrice,
            qty,
            segment,
            isBTST
        });

        const pnl = grossPnl - slippageCost - charges.totalCharges;
        const ret = (pnl / (capital || 1)) * 100;
        capital += pnl;

        if (capital > maxEq) maxEq = capital;
        const dd = maxEq > 0 ? (maxEq - capital) / maxEq * 100 : 0;
        if (dd > maxDD) maxDD = dd;
        drawdownSeries.push({ date: day.date, dd: -dd });

        trades.push({
            date: day.date, direction,
            entryTime: entrySlot, entryPrice,
            exitTime: exitSlot, exitPrice,
            qty, grossPnl, slippageCost, 
            charges: charges.totalCharges,
            chargeDetails: charges,
            pnl, ret,
            cumPnl: capital - Number(startingCapital),
            equity: capital, slots: slotsBetween,
        });
    }

    if (trades.length === 0) return {
        trades: [], kpis: null, equityCurve: [], equityDates: [],
        drawdownSeries: [], error: null,
    };

    const init      = Number(startingCapital);
    const wins      = trades.filter(t => t.pnl > 0);
    const losses    = trades.filter(t => t.pnl <= 0);
    const totalCharges = trades.reduce((s, t) => s + t.charges, 0);
    const gP        = wins.reduce((s, t) => s + t.pnl, 0);
    const gL        = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
    const rets      = trades.map(t => t.ret / 100);
    const { sharpe, sortino } = riskRatios(rets);

    const longTrades  = direction === 'Long'  ? trades : [];
    const shortTrades = direction === 'Short' ? trades : [];
    const buildSplit  = (trs) => {
        if (!trs.length) return null;
        const w = trs.filter(t => t.pnl > 0);
        const l = trs.filter(t => t.pnl <= 0);
        const gp = w.reduce((s, t) => s + t.pnl, 0);
        const gl = Math.abs(l.reduce((s, t) => s + t.pnl, 0));
        const np = trs.reduce((s, t) => s + t.pnl, 0);
        return {
            netProfit:     np.toFixed(0),
            netPct:        (np / init * 100).toFixed(2),
            grossProfit:   gp.toFixed(0),
            grossLoss:     gl.toFixed(0),
            profitFactor:  gl > 0 ? (gp / gl).toFixed(2) : gp > 0 ? '∞' : '0.00',
            totalTrades:   trs.length,
            wins:          w.length,
            losses:        l.length,
            winRate:       (w.length / trs.length * 100).toFixed(1),
            avgTrade:      (np / trs.length).toFixed(0),
            avgWin:        w.length ? (gp / w.length).toFixed(0) : '—',
            avgLoss:       l.length ? (gl / l.length).toFixed(0) : '—',
            largestWin:    w.length ? Math.max(...w.map(t => t.pnl)).toFixed(0) : '—',
            largestLoss:   l.length ? Math.min(...l.map(t => t.pnl)).toFixed(0) : '—',
            maxConWins:    maxStreak(trs, t => t.pnl > 0),
            maxConLosses:  maxStreak(trs, t => t.pnl <= 0),
            avgSlots:      Math.round(trs.reduce((s, t) => s + t.slots, 0) / trs.length),
        };
    };

    return {
        trades, drawdownSeries,
        equityCurve:  trades.map(t => t.equity),
        equityDates:  trades.map(t => t.date),
        error: null,
        kpis: {
            // Overall
            netProfit:     (capital - init).toFixed(0),
            netPct:        ((capital - init) / init * 100).toFixed(2),
            grossProfit:   gP.toFixed(0),
            grossLoss:     gL.toFixed(0),
            totalCharges:  totalCharges.toFixed(0),
            finalEquity:   Math.round(capital),
            maxDrawdown:   maxDD.toFixed(2),
            profitFactor:  gL > 0 ? (gP / gL).toFixed(2) : gP > 0 ? '∞' : '0.00',
            sharpe, sortino,
            totalTrades:   trades.length,
            wins:          wins.length,
            losses:        losses.length,
            winRate:       (wins.length / trades.length * 100).toFixed(1),
            avgTrade:      ((capital - init) / trades.length).toFixed(0),
            avgWin:        wins.length   ? (gP / wins.length).toFixed(0)   : '—',
            avgLoss:       losses.length ? (gL / losses.length).toFixed(0) : '—',
            largestWin:    wins.length   ? Math.max(...wins.map(t => t.pnl)).toFixed(0)   : '—',
            largestLoss:   losses.length ? Math.min(...losses.map(t => t.pnl)).toFixed(0) : '—',
            maxConWins:    maxStreak(trades, t => t.pnl > 0),
            maxConLosses:  maxStreak(trades, t => t.pnl <= 0),
            avgSlots:      Math.round(trades.reduce((s, t) => s + t.slots, 0) / trades.length),
            // Directional splits
            long:  buildSplit(longTrades),
            short: buildSplit(shortTrades),
        },
    };
}

// ─── CSV export ───────────────────────────────────────────────────────────────
export function exportCSV(trades, symbol) {
    const hdr = ['#','Date','Direction','Entry Time','Entry Price','Exit Time','Exit Price',
                  'Qty','Gross PnL','Slippage','Charges','Net PnL','Net PnL %','Cumulative PnL','Equity'];
    const rows = trades.map((t, i) => [
        i + 1, t.date, t.direction,
        t.entryTime, t.entryPrice.toFixed(2),
        t.exitTime,  t.exitPrice.toFixed(2),
        t.qty, t.grossPnl.toFixed(2), t.slippageCost.toFixed(2), t.charges.toFixed(2),
        t.pnl.toFixed(2), t.ret.toFixed(3),
        t.cumPnl.toFixed(2), t.equity.toFixed(2),
    ]);
    const csv = [hdr, ...rows].map(r => r.join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = Object.assign(document.createElement('a'), {
        href: url, download: `sim_${symbol}_${new Date().toISOString().split('T')[0]}.csv`,
    });
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
}

