const alpacaService = require('./alpacaService');
const notificationService = require('./notificationService');
const { prepare } = require('../db/database');

/**
 * Alpaca Trader
 * High-level execution engine for Auto-Trading
 */
class AlpacaTrader {
    constructor() {
        this.allocationPerTrade = 0.05; // Allocate 5% of Buying Power per trade
        this.maxOpenPositions = 5;
    }

    /**
     * Execute Daily Trades based on Predictions
     */
    async executeDailyTrade() {
        console.log('🤖 AlpacaTrader: Starting execution cycle...');

        // 1. Check Account
        const account = await alpacaService.getAccount();
        if (!account || account.trading_blocked) {
            console.error('❌ Alpaca Account Blocked or Unreachable');
            return { error: 'Account blocked' };
        }

        const buyingPower = parseFloat(account.buying_power);
        console.log(`💰 Buying Power: $${buyingPower.toFixed(2)}`);

        if (buyingPower < 100) {
            console.warn('⚠️ Low Funds. Skipping trade.');
            return { status: 'low_funds' };
        }

        // 2. Check Open Positions
        const positions = await alpacaService.getPositions();
        if (positions.length >= this.maxOpenPositions) {
            console.log(`full_slots: ${positions.length}/${this.maxOpenPositions}`);
            return { status: 'max_positions_reached' };
        }

        // 3. Get Top Predictions (Strong Buy)
        const topPicks = prepare(`
            SELECT * FROM predictions 
            WHERE confidence_tier IN ('high', 'medium') 
            AND created_at > datetime('now', '-24 hours')
            ORDER BY ml_probability DESC
            LIMIT 3
        `).all();

        if (topPicks.length === 0) {
            console.log('No STRONG_BUY signals today.');
            return { status: 'no_signals' };
        }

        // Large Cap Diversification Rule
        const LARGE_CAPS = ['BTC', 'ETH', 'XRP'];
        const MAX_LARGE_CAP_POSITIONS = 2;
        const LARGE_CAP_OVERRIDE_CONFIDENCE = 85;

        // Count existing large cap positions
        const largeCapsOwned = positions.filter(p =>
            LARGE_CAPS.some(lc => p.symbol.toUpperCase().includes(lc))
        ).length;

        const executed = [];

        // 4. Execute Trades
        // 4. Execute Trades
        for (const pick of topPicks) {
            // Derive Symbol (e.g. 'btc' -> 'BTC')
            // Using ID from DB
            const symbolRaw = pick.coin_id.toUpperCase();
            // Alpaca format usually 'BTC/USD'
            const symbol = `${symbolRaw}/USD`;

            // Check if we already own it
            const hasPosition = positions.find(p => p.symbol.includes(symbolRaw));
            if (hasPosition) {
                console.log(`⚠️ Skipping ${symbolRaw} (Already in portfolio)`);
                continue;
            }

            // Check Large Cap Limit
            const isLargeCap = LARGE_CAPS.includes(symbolRaw);
            const confidenceScore = pick.ml_probability ? (pick.ml_probability * 100) : 0;

            if (isLargeCap && largeCapsOwned >= MAX_LARGE_CAP_POSITIONS) {
                // Only allow if confidence is VERY high
                if (confidenceScore < LARGE_CAP_OVERRIDE_CONFIDENCE) {
                    console.log(`⚡ Skipping ${symbolRaw} (Large Cap limit: ${largeCapsOwned}/${MAX_LARGE_CAP_POSITIONS}, Confidence: ${confidenceScore.toFixed(0)}% < ${LARGE_CAP_OVERRIDE_CONFIDENCE}%)`);
                    continue;
                }
                console.log(`🔥 Override: Buying ${symbolRaw} despite Large Cap limit (Confidence: ${confidenceScore.toFixed(0)}% >= ${LARGE_CAP_OVERRIDE_CONFIDENCE}%)`);
            }

            // Calculate Order Size
            // Use 5% of Buying Power
            const tradeAmountUSD = buyingPower * this.allocationPerTrade;
            // Floor set to $10 minimum, Cap at $1000 for safety
            const safeAmount = Math.max(10, Math.min(tradeAmountUSD, 1000));

            // Calculate Qty approx
            // DB has 'entry_price', NOT 'current_price'
            const price = pick.entry_price;
            if (!price || price <= 0) {
                console.log(`⚠️ Skipping ${symbolRaw}: Price invalid (${price})`);
                continue;
            }

            const qty = safeAmount / price;

            // Simple log
            console.log(`🚀 EXECUTING BUY: ${symbol} | Qty: ${qty.toFixed(4)} | Est: $${price.toFixed(2)}`);

            // Execute Order
            const order = await alpacaService.createOrder(symbol, qty, 'buy');

            if (order && order.id) {
                executed.push({ symbol, qty, price: safeAmount });
                console.log(`✅ Order Filled: ${order.id}`);

                // Get updated balance for notification
                const newAccount = await alpacaService.getAccount();
                await notificationService.sendTradeAlert({
                    symbol,
                    side: 'buy',
                    qty: qty.toFixed(4),
                    price: price.toFixed(2),
                    balance: newAccount ? newAccount.buying_power : '?'
                });
            }
        }

        return { status: 'complete', executed };
    }

    /**
     * Check Positions for TP/SL
     */
    async checkPositions() {
        const positions = await alpacaService.getPositions();
        const closed = [];

        console.log(`🔍 Monitoring ${positions.length} open positions...`);

        for (const pos of positions) {
            const plPct = parseFloat(pos.unrealized_plpc) * 100; // e.g. 0.05 -> 5%
            const symbol = pos.symbol;
            const currentPrice = parseFloat(pos.current_price);
            const qty = parseFloat(pos.qty);

            let reason = null;

            // 1. Get Coin ID (e.g., BTC/USD -> btc)
            const coinId = symbol.split('/')[0].toLowerCase();

            // 2. Fetch latest confidence tier AND market cap tier
            const pred = prepare(`
                SELECT confidence_tier, market_cap_tier FROM predictions 
                WHERE coin_id = ? 
                ORDER BY created_at DESC 
                LIMIT 1
            `).get(coinId);

            // 3. Set Dynamic Rules
            let tpThreshold = 5.0; // Default (High Confidence, High Volatility)

            // RULE: "Giants Move Slow" -> Quick Scalp for BTC/ETH
            if (['btc', 'eth'].includes(coinId)) {
                tpThreshold = 1.25; // 1.25% Target for Mega Caps
            }
            // RULE: Medium Confidence -> Lower Target
            else if (pred && pred.confidence_tier === 'medium') {
                tpThreshold = 3.0;
            }

            // Check triggers
            if (plPct >= tpThreshold) {
                console.log(`🎯 Take Profit triggered for ${symbol} (+${plPct.toFixed(2)}%) [Target: ${tpThreshold}%]`);
                reason = 'TP';
            } else if (plPct <= -2.0) {
                console.log(`🛑 Stop Loss triggered for ${symbol} (${plPct.toFixed(2)}%)`);
                reason = 'SL';
            }

            if (reason) {
                await alpacaService.closePosition(symbol);
                closed.push({ symbol, reason, pl: plPct });

                // Notification
                const newAccount = await alpacaService.getAccount();
                await notificationService.sendTradeAlert({
                    symbol,
                    side: 'sell',
                    qty: qty.toFixed(4),
                    price: currentPrice.toFixed(2),
                    balance: newAccount ? newAccount.buying_power : '?'
                });
            }
        }

        return closed;
    }
}

module.exports = new AlpacaTrader();
