const fs = require('fs');
const path = require('path');
const autoTrader = require('./autoTrader');
const priceService = require('./priceService');

/**
 * Paper Trading Service
 * Simulates trading with virtual money and logs all decisions to CSV
 */
class PaperTrader {
    constructor() {
        this.dataDir = path.join(__dirname, '../../data');
        this.csvPath = path.join(this.dataDir, 'paper_trades.csv');
        this.summaryPath = path.join(this.dataDir, 'trading_summary.json');

        // Initialize with $100 virtual balance
        this.portfolio = this._loadPortfolio() || {
            startingBalance: 100,
            currentCash: 100,
            positions: [],
            totalValue: 100,
            startDate: new Date().toISOString().split('T')[0],
            dayNumber: 1
        };

        this._ensureCSVExists();
    }

    /**
     * Ensure CSV file exists with headers
     */
    _ensureCSVExists() {
        if (!fs.existsSync(this.dataDir)) {
            fs.mkdirSync(this.dataDir, { recursive: true });
        }

        if (!fs.existsSync(this.csvPath)) {
            const headers = [
                'Day', 'Date', 'Time', 'Action', 'Symbol', 'Entry Price',
                'Stop Loss', 'Take Profit', 'Amount ($)', 'Coins Bought',
                'Signal', 'Sentiment', 'Probability', 'Exit Price', 'Exit Time',
                'Profit/Loss ($)', 'Profit/Loss (%)', 'Portfolio Value', 'Status'
            ].join(',');
            fs.writeFileSync(this.csvPath, headers + '\n');
        }
    }

    /**
     * Load portfolio from disk
     */
    _loadPortfolio() {
        try {
            if (fs.existsSync(this.summaryPath)) {
                return JSON.parse(fs.readFileSync(this.summaryPath, 'utf8'));
            }
        } catch (e) {
            console.error('Error loading portfolio:', e.message);
        }
        return null;
    }

    /**
     * Save portfolio to disk
     */
    _savePortfolio() {
        fs.writeFileSync(this.summaryPath, JSON.stringify(this.portfolio, null, 2));
    }

    /**
     * Log trade to CSV
     */
    _logToCSV(trade) {
        const row = [
            trade.day,
            trade.date,
            trade.time,
            trade.action,
            trade.symbol,
            trade.entryPrice,
            trade.stopLoss || '',
            trade.takeProfit || '',
            trade.amount,
            trade.coinsBought,
            trade.signal,
            trade.sentiment,
            trade.probability,
            trade.exitPrice || '',
            trade.exitTime || '',
            trade.profitLoss || '',
            trade.profitLossPercent || '',
            trade.portfolioValue,
            trade.status
        ].join(',');

        fs.appendFileSync(this.csvPath, row + '\n');
    }

    /**
     * Get current price for a coin
     */
    async _getPrice(symbol) {
        return priceService.getPrice(symbol);
    }

    /**
     * Calculate dynamic allocation based on market conditions
     * Returns how much to invest based on signals
     */
    _calculateDynamicAllocation(predictions, buySignals) {
        const portfolioValue = this.portfolio.totalValue;
        const cashAvailable = this.portfolio.currentCash;

        // Count signal strengths
        const strongBuys = buySignals.filter(s => s.tradingSignal === 'STRONG_BUY').length;
        const regularBuys = buySignals.filter(s => s.tradingSignal === 'BUY').length;

        // Average sentiment of buy signals
        const avgSentiment = buySignals.length > 0
            ? buySignals.reduce((sum, s) => sum + (s.sentiment?.aggregateScore || 0), 0) / buySignals.length
            : 0;

        // Average probability
        const avgProbability = buySignals.length > 0
            ? buySignals.reduce((sum, s) => sum + (s.mlProbability || 0.5), 0) / buySignals.length
            : 0.5;

        // Determine allocation percentage based on conditions
        let allocationPercent = 0;
        let reason = '';

        // Very strong signals: 25-30%
        if (strongBuys >= 2 && avgSentiment >= 0.3 && avgProbability >= 0.75) {
            allocationPercent = 0.30;
            reason = 'Very strong signals + bullish sentiment';
        }
        // Strong signals: 15-20%
        else if (strongBuys >= 1 && avgSentiment >= 0.1 && avgProbability >= 0.65) {
            allocationPercent = 0.20;
            reason = 'Strong signals + positive sentiment';
        }
        // Good signals: 10-15%
        else if ((strongBuys >= 1 || regularBuys >= 2) && avgSentiment >= 0 && avgProbability >= 0.55) {
            allocationPercent = 0.12;
            reason = 'Good signals + neutral/positive sentiment';
        }
        // Moderate signals: 5-8%
        else if (regularBuys >= 1 && avgSentiment >= -0.2) {
            allocationPercent = 0.06;
            reason = 'Moderate signals - cautious allocation';
        }
        // Weak or no signals: 0-3%
        else if (buySignals.length > 0) {
            allocationPercent = 0.03;
            reason = 'Weak signals - minimal allocation';
        }
        // No signals at all
        else {
            allocationPercent = 0;
            reason = 'No buy signals - staying in cash';
        }

        // Calculate amount
        let amount = portfolioValue * allocationPercent;
        amount = Math.min(amount, cashAvailable); // Can't exceed cash
        amount = Math.round(amount * 100) / 100; // Round to cents

        return {
            amount,
            percent: allocationPercent,
            reason,
            details: {
                strongBuys,
                regularBuys,
                avgSentiment: avgSentiment.toFixed(2),
                avgProbability: (avgProbability * 100).toFixed(0) + '%'
            }
        };
    }

    /**
     * Execute daily paper trade
     */
    async executeDailyTrade() {
        console.log('\n📝 Paper Trader: Executing Day', this.portfolio.dayNumber, 'trades...');

        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const timeStr = today.toTimeString().split(' ')[0];

        // Get enhanced predictions
        const predictions = await autoTrader.getEnhancedPredictions();

        // Find best buy opportunities
        const buySignals = predictions.filter(p =>
            p.tradingSignal === 'STRONG_BUY' || p.tradingSignal === 'BUY'
        ).slice(0, 3);

        const trades = [];

        // ========== SMART DYNAMIC ALLOCATION ==========
        // Decide how much to invest based on market conditions

        const dailyBudget = this._calculateDynamicAllocation(predictions, buySignals);
        console.log(`  💰 Dynamic allocation: $${dailyBudget.amount.toFixed(2)} (${dailyBudget.reason})`);

        if (buySignals.length === 0 || dailyBudget.amount < 1) {
            console.log('No strong signals or weak market - holding cash');
            this._logToCSV({
                day: this.portfolio.dayNumber,
                date: dateStr,
                time: timeStr,
                action: 'HOLD',
                symbol: '-',
                entryPrice: '-',
                amount: 0,
                coinsBought: 0,
                signal: dailyBudget.reason,
                sentiment: '-',
                probability: '-',
                portfolioValue: this.portfolio.totalValue.toFixed(2),
                status: 'Waiting for better opportunity'
            });
            return { trades: [], message: dailyBudget.reason, allocation: dailyBudget };
        }

        const perTradeAmount = dailyBudget.amount / Math.min(buySignals.length, 3);

        for (const signal of buySignals) {
            if (this.portfolio.currentCash < 1) break;

            const amount = Math.min(perTradeAmount, this.portfolio.currentCash);
            const entryPrice = signal.currentPrice;
            const coinsBought = amount / entryPrice;

            // Create position
            const position = {
                symbol: signal.symbol,
                coinId: signal.coinId,
                entryPrice,
                coinsBought,
                amount,
                entryDate: dateStr,
                entryTime: timeStr,
                signal: signal.tradingSignal,
                sentiment: signal.sentiment?.label || 'unknown',
                probability: signal.mlProbability,
                stopLoss: signal.stopLoss,
                takeProfit: signal.takeProfit
            };

            this.portfolio.positions.push(position);
            this.portfolio.currentCash -= amount;

            // Log to CSV
            this._logToCSV({
                day: this.portfolio.dayNumber,
                date: dateStr,
                time: timeStr,
                action: 'BUY',
                symbol: signal.symbol,
                entryPrice: entryPrice.toFixed(6),
                stopLoss: signal.stopLoss?.toFixed(6) || '',
                takeProfit: signal.takeProfit?.toFixed(6) || '',
                amount: amount.toFixed(2),
                coinsBought: coinsBought.toFixed(8),
                signal: signal.tradingSignal,
                sentiment: signal.sentiment?.label || 'unknown',
                probability: (signal.mlProbability * 100).toFixed(0) + '%',
                portfolioValue: this.portfolio.totalValue.toFixed(2),
                status: 'OPEN'
            });

            trades.push({
                action: 'BUY',
                symbol: signal.symbol,
                price: entryPrice,
                amount,
                signal: signal.tradingSignal
            });

            console.log(`  📈 BUY $${amount.toFixed(2)} of ${signal.symbol} @ $${entryPrice.toFixed(4)}`);
        }

        // Update portfolio value
        await this._updatePortfolioValue();
        this._savePortfolio();

        return { trades, portfolioValue: this.portfolio.totalValue };
    }

    /**
     * Check and close positions that hit TP/SL
     */
    async checkPositions() {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const timeStr = today.toTimeString().split(' ')[0];

        const closedPositions = [];

        if (this.portfolio.positions.length === 0) return [];

        // Batch fetch prices for all positions (Force Refresh for SL/TP accuracy)
        // Pass objects {id, symbol} so PriceService can try Binance
        const coinTargets = this.portfolio.positions.map(p => ({
            id: p.coinId,
            symbol: p.symbol
        }));
        // Remove duplicates based on ID
        const uniqueTargets = [...new Map(coinTargets.map(item => [item.id, item])).values()];

        const prices = await priceService.getPrices(uniqueTargets, true);

        for (let i = this.portfolio.positions.length - 1; i >= 0; i--) {
            const pos = this.portfolio.positions[i];

            // Get current price from batch
            const currentPrice = prices[pos.coinId];
            if (!currentPrice) continue;

            const currentValue = pos.coinsBought * currentPrice;
            const profitLoss = currentValue - pos.amount;
            const profitLossPercent = ((currentPrice - pos.entryPrice) / pos.entryPrice) * 100;

            // Check if hit take profit or stop loss
            let shouldClose = false;
            let closeReason = '';

            if (currentPrice >= pos.takeProfit) {
                shouldClose = true;
                closeReason = 'Take Profit Hit';
            } else if (currentPrice <= pos.stopLoss) {
                shouldClose = true;
                closeReason = 'Stop Loss Hit';
            } else if (profitLossPercent >= 8) {
                shouldClose = true;
                closeReason = '8% Profit Target';
            } else if (profitLossPercent <= -5) {
                shouldClose = true;
                closeReason = '5% Stop Loss';
            }

            if (shouldClose) {
                // Close position
                this.portfolio.currentCash += currentValue;
                this.portfolio.positions.splice(i, 1);

                // Log to CSV
                this._logToCSV({
                    day: this.portfolio.dayNumber,
                    date: dateStr,
                    time: timeStr,
                    action: 'SELL',
                    symbol: pos.symbol,
                    entryPrice: pos.entryPrice.toFixed(6),
                    stopLoss: pos.stopLoss?.toFixed(6) || '',
                    takeProfit: pos.takeProfit?.toFixed(6) || '',
                    amount: pos.amount.toFixed(2),
                    coinsBought: pos.coinsBought.toFixed(8),
                    signal: pos.signal,
                    sentiment: pos.sentiment,
                    probability: (pos.probability * 100).toFixed(0) + '%',
                    exitPrice: currentPrice.toFixed(6),
                    exitTime: timeStr,
                    profitLoss: profitLoss.toFixed(2),
                    profitLossPercent: profitLossPercent.toFixed(2) + '%',
                    portfolioValue: this.portfolio.totalValue.toFixed(2),
                    status: closeReason
                });

                closedPositions.push({
                    symbol: pos.symbol,
                    profitLoss,
                    profitLossPercent,
                    reason: closeReason
                });

                console.log(`  📉 SELL ${pos.symbol}: ${profitLoss >= 0 ? '+' : ''}$${profitLoss.toFixed(2)} (${profitLossPercent.toFixed(2)}%) - ${closeReason}`);
            }
        }

        await this._updatePortfolioValue();
        this._savePortfolio();

        return closedPositions;
    }

    /**
     * Update total portfolio value
     */
    async _updatePortfolioValue() {
        let positionsValue = 0;

        if (this.portfolio.positions.length > 0) {
            // Batch fetch prices
            const coinTargets = this.portfolio.positions.map(p => ({
                id: p.coinId,
                symbol: p.symbol
            }));
            const uniqueTargets = [...new Map(coinTargets.map(item => [item.id, item])).values()];

            const prices = await priceService.getPrices(uniqueTargets);

            for (const pos of this.portfolio.positions) {
                const price = prices[pos.coinId];
                if (price) {
                    positionsValue += pos.coinsBought * price;
                } else {
                    positionsValue += pos.amount; // Use purchase price as fallback
                }
            }
        }

        this.portfolio.totalValue = this.portfolio.currentCash + positionsValue;
    }

    /**
     * End of day summary
     */
    async endDay() {
        await this.checkPositions();
        await this._updatePortfolioValue();

        const summary = {
            day: this.portfolio.dayNumber,
            date: new Date().toISOString().split('T')[0],
            startingBalance: this.portfolio.startingBalance,
            currentValue: this.portfolio.totalValue,
            profitLoss: this.portfolio.totalValue - this.portfolio.startingBalance,
            profitLossPercent: ((this.portfolio.totalValue - this.portfolio.startingBalance) / this.portfolio.startingBalance * 100),
            openPositions: this.portfolio.positions.length,
            cashAvailable: this.portfolio.currentCash
        };

        this.portfolio.dayNumber++;
        this._savePortfolio();

        return summary;
    }

    /**
     * Get current status
     */
    async getStatus() {
        await this._updatePortfolioValue();

        // Dynamic daily limit: 3% of portfolio
        const dailyLimit = this.portfolio.totalValue * 0.03;

        return {
            dayNumber: this.portfolio.dayNumber,
            daysRemaining: 7 - this.portfolio.dayNumber + 1,
            startingBalance: this.portfolio.startingBalance,
            currentValue: this.portfolio.totalValue,
            cashAvailable: this.portfolio.currentCash,
            dailyLimit, // Dynamic limit based on portfolio value
            profitLoss: this.portfolio.totalValue - this.portfolio.startingBalance,
            profitLossPercent: ((this.portfolio.totalValue - this.portfolio.startingBalance) / this.portfolio.startingBalance * 100),
            openPositions: this.portfolio.positions,
            csvPath: this.csvPath
        };
    }

    /**
     * Reset for new 7-day trial
     */
    reset() {
        this.portfolio = {
            startingBalance: 100,
            currentCash: 100,
            positions: [],
            totalValue: 100,
            startDate: new Date().toISOString().split('T')[0],
            dayNumber: 1
        };

        // Clear CSV
        const headers = [
            'Day', 'Date', 'Time', 'Action', 'Symbol', 'Entry Price',
            'Stop Loss', 'Take Profit', 'Amount ($)', 'Coins Bought',
            'Signal', 'Sentiment', 'Probability', 'Exit Price', 'Exit Time',
            'Profit/Loss ($)', 'Profit/Loss (%)', 'Portfolio Value', 'Status'
        ].join(',');
        fs.writeFileSync(this.csvPath, headers + '\n');

        this._savePortfolio();

        return { success: true, message: 'Paper trading reset with $100' };
    }

    /**
     * Get CSV contents for viewing
     */
    getTradeLog() {
        if (fs.existsSync(this.csvPath)) {
            return fs.readFileSync(this.csvPath, 'utf8');
        }
        return '';
    }
}

module.exports = new PaperTrader();
