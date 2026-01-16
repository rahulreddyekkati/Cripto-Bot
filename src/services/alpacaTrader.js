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
            WHERE signal = 'STRONG_BUY' 
            AND timestamp > datetime('now', '-24 hours')
            ORDER BY confidence DESC
            LIMIT 3
        `).all();

        if (topPicks.length === 0) {
            console.log('No STRONG_BUY signals today.');
            return { status: 'no_signals' };
        }

        const executed = [];

        // 4. Execute Trades
        for (const pick of topPicks) {
            // Check if we already own it
            // Alpaca symbols are usually 'BTC/USD' or 'BTCUSD'
            const hasPosition = positions.find(p => p.symbol.includes(pick.coin_id.toUpperCase()));
            if (hasPosition) {
                console.log(`Skipping ${pick.coin_id}, already owned.`);
                continue;
            }

            // Calculate Order Size
            // Use 5% of Buying Power
            const tradeAmountUSD = buyingPower * this.allocationPerTrade;
            // Floor set to $10 minimum, Cap at $1000 for safety
            const safeAmount = Math.max(10, Math.min(tradeAmountUSD, 1000));

            // Calculate Qty approx
            const price = pick.current_price;
            if (!price || price <= 0) continue;

            const qty = safeAmount / price;

            // Symbol formatting: 'BTC/USD'
            const symbol = `${pick.coin_id.toUpperCase()}/USD`;

            console.log(`🚀 Buying ${qty.toFixed(4)} ${symbol} ($${safeAmount.toFixed(2)})...`);

            const order = await alpacaService.createOrder(symbol, qty, 'buy');
            if (order) {
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

        // console.log(`🔍 Monitoring ${positions.length} open positions...`);

        for (const pos of positions) {
            const plPct = parseFloat(pos.unrealized_plpc) * 100; // e.g. 0.05 -> 5%
            const symbol = pos.symbol;
            const currentPrice = parseFloat(pos.current_price);
            const qty = parseFloat(pos.qty);

            let reason = null;

            // Strategy: TP at +5%, SL at -2%
            if (plPct >= 5.0) {
                console.log(`🎯 Take Profit triggered for ${symbol} (+${plPct.toFixed(2)}%)`);
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
