require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cron = require('node-cron');

const { initDb, prepare } = require('./db/database');
const predictionEngine = require('./services/predictionEngine');
const performanceTracker = require('./services/performanceTracker');
const newsCollector = require('./services/newsCollector');
const sentimentAnalyzer = require('./services/sentimentAnalyzer');
const autoTrader = require('./services/autoTrader');
const coinbaseTrader = require('./services/coinbaseTrader');
const paperTrader = require('./services/paperTrader');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// === API Routes ===

app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        lastUpdate: predictionEngine.lastUpdateTime,
        predictionsCount: predictionEngine.lastPredictions?.length || 0
    });
});

app.get('/api/predictions', async (req, res) => {
    try {
        let predictions = await predictionEngine.getPredictions();

        if (req.query.confidence) {
            predictions = predictions.filter(p => p.confidenceTier === req.query.confidence);
        }
        if (req.query.marketCap) {
            predictions = predictions.filter(p => p.marketCapTier === req.query.marketCap);
        }
        if (req.query.volatility) {
            predictions = predictions.filter(p => p.volatilityTier === req.query.volatility);
        }

        const limit = parseInt(req.query.limit) || 40;
        predictions = predictions.slice(0, limit);

        res.json({
            success: true,
            count: predictions.length,
            lastUpdated: predictionEngine.lastUpdateTime,
            predictions
        });
    } catch (error) {
        console.error('Error getting predictions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/predictions/:coinId', async (req, res) => {
    try {
        const predictions = await predictionEngine.getPredictions();
        const coin = predictions.find(p => p.coinId === req.params.coinId);

        if (!coin) {
            return res.status(404).json({ success: false, error: 'Coin not in current predictions' });
        }

        res.json({
            success: true,
            prediction: coin,
            history: []
        });
    } catch (error) {
        console.error('Error getting coin prediction:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/performance', async (req, res) => {
    try {
        const stats = await performanceTracker.getPerformanceStats();
        const reliability = await performanceTracker.getReliabilityData();

        res.json({
            success: true,
            stats,
            reliability,
            disclaimer: 'Past performance does not guarantee future results.'
        });
    } catch (error) {
        console.error('Error getting performance:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/predictions/refresh', async (req, res) => {
    try {
        console.log('Manual prediction refresh triggered');
        const predictions = await predictionEngine.generatePredictions();

        // Also trigger trade execution immediately
        console.log('Manual trade execution triggered');
        const tradeResult = await alpacaTrader.executeDailyTrade();

        res.json({
            success: true,
            count: predictions.length,
            trades: tradeResult,
            lastUpdated: predictionEngine.lastUpdateTime
        });
    } catch (error) {
        console.error('Error refreshing predictions:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/regime', async (req, res) => {
    try {
        await initDb();
        const regime = prepare(`
      SELECT * FROM market_regime 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get();

        res.json({
            success: true,
            regime: regime || { regime: 'neutral', threshold_multiplier: 1.0 }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// === NEWS & SENTIMENT ENDPOINTS ===

app.get('/api/news/:symbol', async (req, res) => {
    try {
        const news = await newsCollector.getNewsForCoin(req.params.symbol);
        const sentiment = sentimentAnalyzer.analyzeArticles(news.articles);

        res.json({
            success: true,
            symbol: req.params.symbol,
            news,
            sentiment
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/news/trending', async (req, res) => {
    try {
        const trending = await newsCollector.getTrendingNews();
        res.json({ success: true, ...trending });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/sentiment/:symbol', async (req, res) => {
    try {
        const news = await newsCollector.getNewsForCoin(req.params.symbol);
        const sentiment = sentimentAnalyzer.analyzeArticles(news.articles);
        const buzz = await newsCollector.getNewsBuzz(req.params.symbol);

        res.json({
            success: true,
            symbol: req.params.symbol,
            sentiment,
            buzz,
            emoji: sentimentAnalyzer.getEmoji(sentiment.label)
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// === ENHANCED PREDICTIONS WITH SENTIMENT ===

app.get('/api/predictions/enhanced', async (req, res) => {
    try {
        const enhanced = await autoTrader.getEnhancedPredictions();
        res.json({
            success: true,
            count: enhanced.length,
            predictions: enhanced
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// === AUTO-TRADER ENDPOINTS ===

app.get('/api/trader/status', async (req, res) => {
    try {
        const summary = await autoTrader.getTradingSummary();
        res.json({ success: true, ...summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/trader/configure', async (req, res) => {
    try {
        autoTrader.configure(req.body);
        res.json({ success: true, message: 'AutoTrader configured', config: autoTrader.config });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/trader/enable', async (req, res) => {
    try {
        const { apiKey, apiSecret } = req.body;
        if (!apiKey || !apiSecret) {
            return res.status(400).json({ success: false, error: 'API key and secret required' });
        }
        autoTrader.enableTrading(apiKey, apiSecret);
        res.json({ success: true, message: 'Trading enabled' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/trader/disable', async (req, res) => {
    autoTrader.disableTrading();
    res.json({ success: true, message: 'Trading disabled' });
});

app.post('/api/trader/execute', async (req, res) => {
    try {
        const result = await autoTrader.executeDailyStrategy();
        res.json({ success: true, ...result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/trader/history', async (req, res) => {
    try {
        await initDb();
        const history = prepare(`
            SELECT * FROM trade_history 
            ORDER BY timestamp DESC 
            LIMIT 100
        `).all();
        res.json({ success: true, trades: history });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// === COINBASE ENDPOINTS ===

app.get('/api/coinbase/balance', async (req, res) => {
    try {
        if (!coinbaseTrader.isConfigured) {
            return res.json({ success: true, configured: false, balance: 0 });
        }
        const balance = await coinbaseTrader.getUSDBalance();
        const portfolio = await coinbaseTrader.getPortfolioValue();
        res.json({ success: true, configured: true, balance, portfolioValue: portfolio });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// === PAPER TRADING ENDPOINTS (7-day trial) ===

app.get('/api/paper/status', async (req, res) => {
    try {
        const status = await paperTrader.getStatus();
        res.json({ success: true, ...status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/paper/trade', async (req, res) => {
    try {
        const result = await paperTrader.executeDailyTrade();
        const status = await paperTrader.getStatus();
        res.json({ success: true, ...result, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/paper/check', async (req, res) => {
    try {
        const closed = await paperTrader.checkPositions();
        const status = await paperTrader.getStatus();
        res.json({ success: true, closedPositions: closed, status });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/paper/endday', async (req, res) => {
    try {
        const summary = await paperTrader.endDay();
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/paper/log', (req, res) => {
    try {
        const log = paperTrader.getTradeLog();
        res.set('Content-Type', 'text/csv');
        res.send(log);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/paper/reset', (req, res) => {
    const result = paperTrader.reset();
    res.json(result);
});

// ========== AUTONOMOUS TRADING CRON JOBS ==========

const alpacaTrader = require('./services/alpacaTrader');

let isProcessingPredictions = false;

// Refresh predictions AND execute trades sequentially every 1 hour
cron.schedule('0 * * * *', async () => {
    if (isProcessingPredictions) {
        console.log('[CRON] Skipping cycle - already in progress');
        return;
    }

    console.log('\n[CRON] ⏰ Hourly Cycle Starting...');
    isProcessingPredictions = true;

    try {
        // Step 1: Brain (Predict)
        console.log('[CRON] 🧠 Generating new predictions...');
        await predictionEngine.generatePredictions();
        console.log('[CRON] ✅ Predictions complete.');

        // Step 2: Hands (Trade)
        console.log('[CRON] 🤖 Executing trades based on fresh data...');
        const result = await alpacaTrader.executeDailyTrade();
        console.log('[CRON] 💰 Trade result:', result);

    } catch (error) {
        console.error('[CRON] Cycle failed:', error);
    } finally {
        isProcessingPredictions = false;
        console.log('[CRON] 🏁 Cycle finished.\n');
    }
});

// Check positions every 1 minute for TP/SL (Real-time tracking)
cron.schedule('*/1 * * * *', async () => {
    console.log('\n[CRON] 🔄 Checking positions on Alpaca...');
    try {
        const closed = await alpacaTrader.checkPositions();
        if (closed.length > 0) {
            console.log('[CRON] Closed positions:', closed);
        }
    } catch (error) {
        console.error('[CRON] Position check failed:', error);
    }
});

// === Start Server ===

async function startServer() {
    await initDb();

    app.listen(PORT, () => {
        console.log(`
╔════════════════════════════════════════════════════╗
║       Crypto Prediction System API                 ║
║                                                    ║
║   Server running at http://localhost:${PORT}         ║
║                                                    ║
║   Endpoints:                                       ║
║   GET  /api/predictions     - Top picks           ║
║   GET  /api/predictions/:id - Coin details        ║
║   GET  /api/performance     - Historical accuracy ║
║   POST /api/predictions/refresh - Force update    ║
║                                                    ║
║   📊 Predictions refresh every 6 hours            ║
╚════════════════════════════════════════════════════╝
    `);

        // Initial prediction generation
        setTimeout(async () => {
            console.log('\nGenerating initial predictions...');
            try {
                await predictionEngine.generatePredictions();
            } catch (error) {
                console.error('Initial prediction failed:', error.message);
            }
        }, 2000);
    });
}

startServer().catch(console.error);
