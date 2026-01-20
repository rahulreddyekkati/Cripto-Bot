const { prepare, initDb } = require('../db/database');
const technicalAnalysis = require('./technicalAnalysis');

class SignalGenerator {
    constructor() {
        // Signal thresholds
        this.thresholds = {
            rsiOversold: 30,
            rsiBullish: [50, 70],
            rsiOverbought: 80,
            volumeSpike: 1.5,
            strongVolumeSpike: 2.0,
            emaRising: 0.5,
            atrHighVolatility: 5
        };
    }

    /**
     * Generate signals for a coin based on technical indicators
     */
    generate(indicators, coinInfo, marketRegime) {
        const signals = [];
        let bullScore = 0;
        let bearScore = 0;

        // === BULLISH SIGNALS ===
        if (indicators.priceAboveEma20 && indicators.ema20Trend === 'up') {
            signals.push({ type: 'bullish', name: 'EMA20 uptrend', weight: 1.5 });
            bullScore += 1.5;
        }

        if (indicators.rsi >= this.thresholds.rsiBullish[0] &&
            indicators.rsi <= this.thresholds.rsiBullish[1]) {
            signals.push({ type: 'bullish', name: 'RSI bullish momentum', weight: 1.0 });
            bullScore += 1.0;
        }

        if (indicators.volumeRatio >= this.thresholds.strongVolumeSpike) {
            signals.push({ type: 'bullish', name: 'Strong volume spike', weight: 1.5 });
            bullScore += 1.5;
        } else if (indicators.volumeRatio >= this.thresholds.volumeSpike) {
            signals.push({ type: 'bullish', name: 'Volume spike', weight: 1.0 });
            bullScore += 1.0;
        }

        if (indicators.macdHistogram > 0 && indicators.macd > indicators.macdSignal) {
            signals.push({ type: 'bullish', name: 'MACD bullish', weight: 1.0 });
            bullScore += 1.0;
        }

        if (indicators.momentum24h > 2) {
            signals.push({ type: 'bullish', name: '24h momentum positive', weight: 0.75 });
            bullScore += 0.75;
        }

        if (indicators.ema20AboveEma50 && indicators.priceAboveEma20) {
            signals.push({ type: 'bullish', name: 'Golden cross setup', weight: 1.0 });
            bullScore += 1.0;
        }

        if (indicators.rsiDivergence === 'bullish') {
            signals.push({ type: 'bullish', name: 'Bullish divergence', weight: 1.5 });
            bullScore += 1.5;
        }

        if (indicators.bbPosition > 0.5 && indicators.bbPosition < 0.8) {
            signals.push({ type: 'bullish', name: 'Above BB midline', weight: 0.5 });
            bullScore += 0.5;
        }

        // === BEARISH SIGNALS ===
        if (indicators.rsi >= this.thresholds.rsiOverbought) {
            signals.push({ type: 'bearish', name: 'RSI overbought', weight: -1.5 });
            bearScore += 1.5;
        }

        if (!indicators.priceAboveEma20) {
            signals.push({ type: 'bearish', name: 'Below EMA20', weight: -1.0 });
            bearScore += 1.0;
        }

        if (indicators.rsiDivergence === 'bearish') {
            signals.push({ type: 'bearish', name: 'Bearish divergence', weight: -1.5 });
            bearScore += 1.5;
        }

        if (indicators.bbPosition > 0.95) {
            signals.push({ type: 'bearish', name: 'At BB resistance', weight: -1.0 });
            bearScore += 1.0;
        }

        if (indicators.macdHistogram < 0) {
            signals.push({ type: 'bearish', name: 'MACD bearish', weight: -0.75 });
            bearScore += 0.75;
        }

        // Apply market regime adjustment
        const regimeMultiplier = marketRegime?.threshold_multiplier || 1.0;
        const adjustedBullScore = bullScore / regimeMultiplier;
        const netScore = adjustedBullScore - bearScore;

        // Determine confidence tier using WEIGHTED SCORES (not just count)
        const bullishSignals = signals.filter(s => s.type === 'bullish');
        let confidenceTier = 'low';

        // Use bullScore (weighted total) instead of signal count
        // Max possible bullScore: 8.75 (all 8 indicators)
        // HIGH: Requires strong confluence (5.5+ weighted score AND net profit of 4+)
        // MEDIUM: Moderate confluence (4.0+ weighted score AND net profit of 2+)

        if (adjustedBullScore >= 5.5 && netScore >= 4) {
            confidenceTier = 'high';
        } else if (adjustedBullScore >= 4.0 && netScore >= 2) {
            confidenceTier = 'medium';
        }
        // Anything below 4.0 weighted score = low confidence (filtered out)

        const marketCapTier = this._getMarketCapTier(coinInfo?.market_cap);
        const volatilityTier = this._getVolatilityTier(indicators.atrPercent);

        return {
            signals,
            bullScore,
            bearScore,
            netScore,
            confidenceTier,
            marketCapTier,
            volatilityTier,
            bullishCount: bullishSignals.length,
            bearishCount: signals.length - bullishSignals.length,
            regimeAdjusted: regimeMultiplier !== 1.0
        };
    }

    calculateEntryExit(indicators, currentPrice) {
        const atr = indicators.atr || currentPrice * 0.02;

        return {
            entryPrice: currentPrice,
            optimalEntry: Math.min(currentPrice, indicators.ema20),
            stopLoss: currentPrice - (1.5 * atr),
            stopLossPercent: -((1.5 * atr) / currentPrice) * 100,
            takeProfit: currentPrice + (2 * atr),
            takeProfitPercent: ((2 * atr) / currentPrice) * 100,
            trailingStop: indicators.ema20,
            trailingStopPercent: -((currentPrice - indicators.ema20) / currentPrice) * 100,
            riskRewardRatio: 2 / 1.5,
            maxHoldHours: 24
        };
    }

    getExpectedReturnRange(confidenceTier, volatilityTier) {
        const ranges = {
            high: {
                low: { p25: 0.8, p50: 1.5, p75: 3.2 },
                moderate: { p25: 1.0, p50: 2.2, p75: 4.5 },
                high: { p25: 1.5, p50: 3.5, p75: 7.0 }
            },
            medium: {
                low: { p25: 0.3, p50: 0.8, p75: 1.8 },
                moderate: { p25: 0.5, p50: 1.2, p75: 2.8 },
                high: { p25: 0.8, p50: 2.0, p75: 4.5 }
            },
            low: {
                low: { p25: -0.5, p50: 0.3, p75: 1.0 },
                moderate: { p25: -1.0, p50: 0.5, p75: 1.8 },
                high: { p25: -2.0, p50: 0.8, p75: 3.0 }
            }
        };
        return ranges[confidenceTier]?.[volatilityTier] || ranges.low.moderate;
    }

    async getMarketRegime() {
        await initDb();
        const result = prepare(`
      SELECT * FROM market_regime 
      ORDER BY timestamp DESC 
      LIMIT 1
    `).get();
        return result || { regime: 'neutral', threshold_multiplier: 1.0 };
    }

    _getMarketCapTier(marketCap) {
        if (!marketCap) return 'unknown';
        if (marketCap >= 1e9) return 'large';
        if (marketCap >= 1e8) return 'mid';
        return 'small';
    }

    _getVolatilityTier(atrPercent) {
        if (atrPercent < 3) return 'low';
        if (atrPercent < 6) return 'moderate';
        return 'high';
    }
}

module.exports = new SignalGenerator();
