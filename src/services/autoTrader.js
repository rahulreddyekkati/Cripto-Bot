const newsCollector = require('./newsCollector');
const sentimentAnalyzer = require('./sentimentAnalyzer');
const predictionEngine = require('./predictionEngine');
const coinbaseTrader = require('./coinbaseTrader');
const { prepare, initDb } = require('../db/database');

/**
 * Auto Trader Service
 * Combines predictions + sentiment to make automated trading decisions
 */
class AutoTrader {
    constructor() {
        this.config = {
            maxDailyInvestment: 3,           // $3 per day
            maxPerTrade: 1.50,               // $1.50 per trade
            minProbability: 0.60,            // 60% minimum confidence
            minSentimentScore: 0,            // Neutral or positive sentiment
            maxOpenPositions: 5,             // Max coins held at once
            takeProfitPercent: 0.08,         // 8% take profit
            stopLossPercent: -0.05,          // 5% stop loss
            tradingEnabled: false            // Must be explicitly enabled
        };
        this.dailyTradesTotal = 0;
        this.lastTradeDate = null;
    }

    /**
     * Configure auto trader settings
     */
    configure(settings) {
        this.config = { ...this.config, ...settings };
        console.log('⚙️ AutoTrader configured:', this.config);
    }

    /**
     * Enable trading with Coinbase API
     */
    enableTrading(apiKey, apiSecret) {
        coinbaseTrader.configure(apiKey, apiSecret);
        this.config.tradingEnabled = true;
        console.log('🟢 AutoTrader ENABLED for live trading');
    }

    /**
     * Disable trading
     */
    disableTrading() {
        this.config.tradingEnabled = false;
        console.log('🔴 AutoTrader DISABLED');
    }

    /**
     * Get enhanced predictions with sentiment
     */
    async getEnhancedPredictions() {
        console.log('\n📊 Generating enhanced predictions with sentiment...');

        // Get base predictions
        const predictions = await predictionEngine.getPredictions();

        // Enhance with sentiment
        const enhanced = [];
        for (const pred of predictions.slice(0, 20)) {
            try {
                // Get news and analyze sentiment
                const news = await newsCollector.getNewsForCoin(pred.symbol);
                const sentiment = sentimentAnalyzer.analyzeArticles(news.articles);
                const buzz = await newsCollector.getNewsBuzz(pred.symbol);

                // Calculate combined score
                const technicalWeight = 0.5;
                const sentimentWeight = 0.3;
                const buzzWeight = 0.2;

                const buzzScore = this._buzzToScore(buzz.buzzLevel);
                const combinedScore =
                    (pred.mlProbability * technicalWeight) +
                    ((sentiment.aggregateScore + 1) / 2 * sentimentWeight) + // Normalize to 0-1
                    (buzzScore * buzzWeight);

                enhanced.push({
                    ...pred,
                    sentiment: {
                        score: sentiment.aggregateScore,
                        label: sentiment.label,
                        emoji: sentimentAnalyzer.getEmoji(sentiment.label),
                        confidence: sentiment.confidence,
                        articleCount: sentiment.articleCount,
                        breakdown: sentiment.breakdown
                    },
                    buzz: {
                        level: buzz.buzzLevel,
                        articles24h: buzz.totalArticles24h,
                        latestHeadline: buzz.latestHeadline
                    },
                    combinedScore,
                    tradingSignal: this._generateTradingSignal(pred, sentiment, buzz)
                });
            } catch (error) {
                console.error(`Error enhancing ${pred.symbol}:`, error.message);
                enhanced.push({
                    ...pred,
                    sentiment: null,
                    buzz: null,
                    combinedScore: pred.mlProbability * 0.5,
                    tradingSignal: 'HOLD'
                });
            }
        }

        // Sort by combined score
        enhanced.sort((a, b) => b.combinedScore - a.combinedScore);

        return enhanced;
    }

    /**
     * Generate trading signal based on all factors
     */
    _generateTradingSignal(prediction, sentiment, buzz) {
        const score = prediction.mlProbability;
        const sentScore = sentiment.aggregateScore;

        // Strong buy: High probability + Positive sentiment
        if (score >= 0.70 && sentScore >= 0.2) return 'STRONG_BUY';

        // Buy: Good probability + Neutral/positive sentiment
        if (score >= 0.60 && sentScore >= 0) return 'BUY';

        // Hold: Mixed signals
        if (score >= 0.50 && sentScore >= -0.2) return 'HOLD';

        // Avoid: Negative sentiment
        if (sentScore <= -0.3) return 'AVOID';

        return 'HOLD';
    }

    /**
     * Convert buzz level to score
     */
    _buzzToScore(level) {
        const scores = {
            'very_high': 1.0,
            'high': 0.75,
            'medium': 0.5,
            'low': 0.25,
            'none': 0
        };
        return scores[level] || 0;
    }

    /**
     * Execute daily trading strategy
     */
    async executeDailyStrategy() {
        console.log('\n🤖 AutoTrader: Executing daily strategy...');

        // Reset daily tracking
        const today = new Date().toDateString();
        if (this.lastTradeDate !== today) {
            this.dailyTradesTotal = 0;
            this.lastTradeDate = today;
        }

        // Check if we've hit daily limit
        if (this.dailyTradesTotal >= this.config.maxDailyInvestment) {
            console.log(`Daily investment limit reached ($${this.config.maxDailyInvestment})`);
            return { executed: false, reason: 'Daily limit reached' };
        }

        // Get enhanced predictions
        const predictions = await this.getEnhancedPredictions();

        // Find best opportunities
        const candidates = predictions.filter(p =>
            p.tradingSignal === 'STRONG_BUY' || p.tradingSignal === 'BUY'
        );

        if (candidates.length === 0) {
            console.log('No strong buy signals today');
            return { executed: false, reason: 'No opportunities' };
        }

        const trades = [];
        const remainingBudget = this.config.maxDailyInvestment - this.dailyTradesTotal;

        // Execute trades on top candidates
        for (const candidate of candidates.slice(0, 2)) {
            if (this.dailyTradesTotal >= this.config.maxDailyInvestment) break;

            const tradeAmount = Math.min(
                this.config.maxPerTrade,
                remainingBudget
            );

            if (tradeAmount < 1) break; // Minimum trade $1

            if (this.config.tradingEnabled) {
                const result = await coinbaseTrader.executeTrade(
                    { ...candidate, sentimentScore: candidate.sentiment?.score || 0 },
                    tradeAmount
                );
                trades.push(result);
            } else {
                // Simulation mode
                trades.push({
                    success: true,
                    action: 'SIMULATED_BUY',
                    symbol: candidate.symbol,
                    amount: tradeAmount,
                    probability: candidate.mlProbability,
                    sentiment: candidate.sentiment?.label,
                    signal: candidate.tradingSignal
                });
            }

            this.dailyTradesTotal += tradeAmount;
        }

        // Save to database
        await this._saveTrades(trades);

        console.log(`✅ AutoTrader executed ${trades.length} trades`);
        return { executed: true, trades };
    }

    /**
     * Save trades to database
     */
    async _saveTrades(trades) {
        await initDb();

        for (const trade of trades) {
            prepare(`
                INSERT INTO trade_history (
                    symbol, action, amount, probability, sentiment,
                    signal, success, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
                trade.symbol || trade.productId?.split('-')[0],
                trade.action,
                trade.amount,
                trade.probability || 0,
                trade.sentiment || 'unknown',
                trade.signal || 'unknown',
                trade.success ? 1 : 0,
                new Date().toISOString()
            );
        }
    }

    /**
     * Get trading summary
     */
    async getTradingSummary() {
        await initDb();

        const today = prepare(`
            SELECT COUNT(*) as trades, SUM(amount) as invested
            FROM trade_history
            WHERE DATE(timestamp) = DATE('now')
        `).get() || { trades: 0, invested: 0 };

        const total = prepare(`
            SELECT COUNT(*) as trades, SUM(amount) as invested
            FROM trade_history
        `).get() || { trades: 0, invested: 0 };

        return {
            today: {
                trades: today.trades || 0,
                invested: today.invested || 0,
                remaining: this.config.maxDailyInvestment - (today.invested || 0)
            },
            total: {
                trades: total.trades || 0,
                invested: total.invested || 0
            },
            tradingEnabled: this.config.tradingEnabled,
            config: this.config
        };
    }
}

module.exports = new AutoTrader();
