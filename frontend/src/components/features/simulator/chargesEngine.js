/**
 * chargesEngine.js
 * 
 * calculates Indian stock market charges based on latest normas (Apr 1, 2026).
 * STT rates:
 * - Equity Intraday: 0.025% on sell side
 * - F&O Futures: 0.05% on sell side (Revised Apr 2026)
 * - F&O Options: 0.15% on sell premium (Revised Apr 2026)
 */

const RATES = {
    EQ_INTRADAY: {
        brokerage: 0.0003, // 0.03%
        maxBrokeragePerOrder: 20,
        stt: 0.00025, // 0.025% on sell
        txnCharge: 0.0000297, // 0.00297% (NSE)
        sebi: 0.0000001, // ₹10 per crore
        stampDuty: 0.00003, // 0.003% on buy
        gst: 0.18 // 18% on (brokerage + txn + sebi)
    },
    FNO_FUT: {
        brokerage: 0.0003, // 0.03%
        maxBrokeragePerOrder: 20,
        stt: 0.0005, // 0.05% on sell side (New 2026 Rule)
        txnCharge: 0.0000173, // 0.00173% (NSE)
        sebi: 0.0000001, // ₹10 per crore
        stampDuty: 0.00002, // 0.002% on buy
        gst: 0.18
    },
    FNO_OPT: {
        brokerageFlat: 20, // Flat ₹20 per side
        stt: 0.0015, // 0.15% on sell premium (New 2026 Rule)
        txnCharge: 0.03503 * 0.01, // 0.03503% on premium
        sebi: 0.0000001, // ₹10 per crore
        stampDuty: 0.00003, // 0.003% on buy premium
        gst: 0.18
    }
};

/**
 * Calculates charges for a trade.
 * @param {Object} params - { buyPrice, sellPrice, qty, segment, isBTST }
 * @returns {Object} breakdown - { brokerage, stt, txnCharge, gst, sebi, stampDuty, dpCharges, totalCharges }
 */
export function calculateCharges({ buyPrice, sellPrice, qty, segment, isBTST = false }) {
    const buyValue = buyPrice * qty;
    const sellValue = sellPrice * qty;
    const turnover = buyValue + sellValue;
    const config = RATES[segment] || RATES.EQ_INTRADAY;

    let res = {
        brokerage: 0,
        stt: 0,
        txnCharge: 0,
        sebi: (turnover * config.sebi),
        stampDuty: 0,
        gst: 0,
        dpCharges: 0,
        totalCharges: 0
    };

    if (segment === 'FNO_OPT') {
        // Options: mostly on premium (which is buyPrice/sellPrice in our sim)
        res.brokerage = config.brokerageFlat * 2; // Buy + Sell
        res.stt = sellValue * config.stt;
        res.txnCharge = turnover * config.txnCharge;
        res.stampDuty = buyValue * config.stampDuty;
    } else {
        // Equity Intraday or Futures
        const buyBrokerage = Math.min(buyValue * config.brokerage, config.maxBrokeragePerOrder);
        const sellBrokerage = Math.min(sellValue * config.brokerage, config.maxBrokeragePerOrder);
        res.brokerage = buyBrokerage + sellBrokerage;
        res.stt = sellValue * config.stt;
        res.txnCharge = turnover * config.txnCharge;
        res.stampDuty = buyValue * config.stampDuty;

        // DP Charges for BTST (Equity only)
        if (segment === 'EQ_INTRADAY' && isBTST) {
            res.dpCharges = 15.34; // Fixed per scrip
        }
    }

    res.gst = (res.brokerage + res.txnCharge + res.sebi) * config.gst;
    res.totalCharges = res.brokerage + res.stt + res.txnCharge + res.sebi + res.stampDuty + res.gst + res.dpCharges;

    // Round for display
    Object.keys(res).forEach(k => {
        res[k] = parseFloat(res[k].toFixed(2));
    });

    return res;
}
