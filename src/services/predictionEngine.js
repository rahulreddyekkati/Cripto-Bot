const dataCollector = require('./dataCollector');
const technicalAnalysis = require('./technicalAnalysis');
const signalGenerator = require('./signalGenerator');
const performanceTracker = require('./performanceTracker');
const axios = require('axios');

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || 'http://localhost:8000';

class PredictionEngine {
    constructor() {
        this.lastPredictions = null;
        this.lastUpdateTime = null;
    }

    async generatePredictions(topN = 40) {
        if (this.isGenerating) {
            console.log('⚠️ Prediction generation already in progress - skipping duplicate run');
            return this.lastPredictions || [];
        }

        this.isGenerating = true;
        console.log('\n=== Starting Prediction Pipeline ===');
        const startTime = Date.now();

        try {
            // 1. Collect data
            console.log('Step 1: Collecting market data...');
            const marketData = await dataCollector.collectAllData(100);
            console.log(`  Collected ${marketData.coins.length} coins`);

            // 2. Get market regime
            const regime = await signalGenerator.getMarketRegime();
            console.log(`  Market regime: ${regime.regime} (multiplier: ${regime.threshold_multiplier})`);

            // 3. Calculating indicators
            console.log('Step 2: Calculating indicators and signals...');
            const predictions = [];

            for (const coin of marketData.coins) {
                try {
                    const indicators = technicalAnalysis.calculate(coin.ohlcv);
                    if (!indicators) continue;

                    const signalData = signalGenerator.generate(
                        indicators,
                        { market_cap: coin.market_cap },
                        regime
                    );

                    const entryExit = signalGenerator.calculateEntryExit(indicators, coin.current_price);
                    const expectedReturn = signalGenerator.getExpectedReturnRange(
                        signalData.confidenceTier,
                        signalData.volatilityTier
                    );

                    let mlProbability = this._estimateProbability(signalData);

                    predictions.push({
                        coinId: coin.id,
                        symbol: coin.symbol.toUpperCase(),
                        name: coin.name,
                        currentPrice: coin.current_price,
                        priceChange24h: coin.price_change_percentage_24h,
                        marketCap: coin.market_cap,
                        volume: coin.total_volume,
                        mlProbability,
                        signals: signalData.signals.filter(s => s.type === 'bullish').map(s => s.name),
                        signalCount: signalData.bullishCount,
                        confidenceTier: signalData.confidenceTier,
                        netScore: signalData.netScore,
                        marketCapTier: signalData.marketCapTier,
                        volatilityTier: signalData.volatilityTier,
                        entryPrice: entryExit.entryPrice,
                        optimalEntry: entryExit.optimalEntry,
                        stopLoss: entryExit.stopLoss,
                        stopLossPercent: entryExit.stopLossPercent,
                        takeProfit: entryExit.takeProfit,
                        takeProfitPercent: entryExit.takeProfitPercent,
                        expectedReturnP25: expectedReturn.p25,
                        expectedReturnP50: expectedReturn.p50,
                        expectedReturnP75: expectedReturn.p75,
                        indicators: {
                            rsi: Math.round(indicators.rsi),
                            macdHistogram: indicators.macdHistogram.toFixed(4),
                            volumeRatio: indicators.volumeRatio.toFixed(2),
                            atrPercent: indicators.atrPercent.toFixed(2)
                        }
                    });
                } catch (error) {
                    console.error(`Error processing ${coin.symbol}:`, error.message);
                }
            }

            // 4. Filter and rank
            console.log('Step 3: Ranking predictions...');
            const filtered = predictions.filter(p =>
                p.confidenceTier !== 'low' && p.signalCount >= 4
            );

            filtered.sort((a, b) => {
                if (b.mlProbability !== a.mlProbability) {
                    return b.mlProbability - a.mlProbability;
                }
                return b.netScore - a.netScore;
            });

            const topPredictions = filtered.slice(0, topN);

            // 5. Save predictions
            console.log('Step 4: Saving predictions...');
            for (const pred of topPredictions) {
                await performanceTracker.savePrediction({
                    coinId: pred.coinId,
                    windowHours: 24,
                    mlProbability: pred.mlProbability,
                    confidenceTier: pred.confidenceTier,
                    signalCount: pred.signalCount,
                    signals: pred.signals,
                    entryPrice: pred.entryPrice,
                    stopLoss: pred.stopLoss,
                    takeProfit: pred.takeProfit,
                    expectedReturnP25: pred.expectedReturnP25,
                    expectedReturnP50: pred.expectedReturnP50,
                    expectedReturnP75: pred.expectedReturnP75,
                    marketCapTier: pred.marketCapTier,
                    volatilityTier: pred.volatilityTier
                });
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            console.log(`\n✅ Generated ${topPredictions.length} predictions in ${elapsed}s`);

            this.lastPredictions = topPredictions;
            this.lastUpdateTime = new Date();

            return topPredictions;

        } catch (error) {
            console.error('Prediction Generation Failed:', error);
            throw error;
        } finally {
            this.isGenerating = false;
        }
    }

    async getPredictions(forceRefresh = false) {
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);
        if (forceRefresh || !this.lastPredictions || this.lastUpdateTime < sixHoursAgo) {
            return this.generatePredictions();
        }
        return this.lastPredictions;
    }

    _estimateProbability(signalData) {
        let prob = 0.5;
        prob += signalData.netScore * 0.05;
        if (signalData.confidenceTier === 'high') prob += 0.1;
        if (signalData.confidenceTier === 'medium') prob += 0.05;
        return Math.max(0.2, Math.min(0.85, prob));
    }
}

module.exports = new PredictionEngine();
