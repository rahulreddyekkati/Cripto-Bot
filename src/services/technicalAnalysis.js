const { RSI, MACD, EMA, ATR, BollingerBands, SMA } = require('technicalindicators');
const { prepare, initDb } = require('../db/database');

class TechnicalAnalysis {
    /**
     * Calculate all technical indicators for a coin
     * @param {Array} candles - OHLCV data [{open, high, low, close, volume, timestamp}]
     * @returns {Object} All calculated indicators
     */
    calculate(candles) {
        if (!candles || candles.length < 30) {
            console.warn('Not enough candles for reliable indicators (need 30+)');
            return null;
        }

        const closes = candles.map(c => c.close);
        const highs = candles.map(c => c.high);
        const lows = candles.map(c => c.low);
        const volumes = candles.map(c => c.volume);

        // Calculate all indicators
        const rsiValues = this._calculateRSI(closes);
        const macdData = this._calculateMACD(closes);
        const ema20 = this._calculateEMA(closes, 20);
        const ema50 = this._calculateEMA(closes, 50);
        const atrValues = this._calculateATR(highs, lows, closes);
        const bbData = this._calculateBollingerBands(closes);
        const volumeSMA = this._calculateSMA(volumes, 20);

        // Get latest values
        const latest = {
            price: closes[closes.length - 1],
            rsi: rsiValues[rsiValues.length - 1] || 50,
            macd: macdData?.[macdData.length - 1]?.MACD || 0,
            macdSignal: macdData?.[macdData.length - 1]?.signal || 0,
            macdHistogram: macdData?.[macdData.length - 1]?.histogram || 0,
            ema20: ema20[ema20.length - 1] || closes[closes.length - 1],
            ema50: ema50[ema50.length - 1] || closes[closes.length - 1],
            atr: atrValues[atrValues.length - 1] || (closes[closes.length - 1] * 0.02),
            bbUpper: bbData?.[bbData.length - 1]?.upper || 0,
            bbMiddle: bbData?.[bbData.length - 1]?.middle || 0,
            bbLower: bbData?.[bbData.length - 1]?.lower || 0,
            volumeSMA: volumeSMA[volumeSMA.length - 1] || volumes[volumes.length - 1] || 1,
            currentVolume: volumes[volumes.length - 1] || 1
        };

        // Calculate derived metrics
        latest.volumeRatio = latest.currentVolume / (latest.volumeSMA || 1);
        latest.priceVsEma20 = ((latest.price - latest.ema20) / latest.ema20) * 100;
        latest.priceVsEma50 = ((latest.price - latest.ema50) / latest.ema50) * 100;
        latest.bbPosition = this._calculateBBPosition(latest.price, latest.bbLower, latest.bbUpper);
        latest.atrPercent = (latest.atr / latest.price) * 100;

        // Trend detection
        latest.ema20Trend = this._detectTrend(ema20.slice(-5));
        latest.ema50Trend = this._detectTrend(ema50.slice(-5));
        latest.priceAboveEma20 = latest.price > latest.ema20;
        latest.priceAboveEma50 = latest.price > latest.ema50;
        latest.ema20AboveEma50 = latest.ema20 > latest.ema50;

        // Momentum
        latest.momentum24h = this._calculateMomentum(closes, 24);
        latest.momentum7d = this._calculateMomentum(closes, 168);

        // RSI divergence check
        latest.rsiDivergence = this._checkRSIDivergence(closes.slice(-14), rsiValues.slice(-14));

        return latest;
    }

    /**
     * Save indicators to database
     */
    async saveIndicators(coinId, indicators) {
        await initDb();
        const stmt = prepare(`
      INSERT OR REPLACE INTO indicators 
      (coin_id, timestamp, rsi, macd, macd_signal, ema_20, ema_50, atr, bb_upper, bb_middle, bb_lower, volume_sma)
      VALUES (?, datetime('now'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        stmt.run(
            coinId,
            indicators.rsi,
            indicators.macd,
            indicators.macdSignal,
            indicators.ema20,
            indicators.ema50,
            indicators.atr,
            indicators.bbUpper,
            indicators.bbMiddle,
            indicators.bbLower,
            indicators.volumeSMA
        );
    }

    // === Private calculation methods ===

    _calculateRSI(closes, period = 14) {
        return RSI.calculate({ values: closes, period });
    }

    _calculateMACD(closes) {
        return MACD.calculate({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
    }

    _calculateEMA(closes, period) {
        return EMA.calculate({ values: closes, period });
    }

    _calculateSMA(values, period) {
        return SMA.calculate({ values, period });
    }

    _calculateATR(highs, lows, closes, period = 14) {
        return ATR.calculate({ high: highs, low: lows, close: closes, period });
    }

    _calculateBollingerBands(closes, period = 20, stdDev = 2) {
        return BollingerBands.calculate({ values: closes, period, stdDev });
    }

    _calculateBBPosition(price, lower, upper) {
        if (upper === lower) return 0.5;
        return (price - lower) / (upper - lower);
    }

    _detectTrend(values) {
        if (!values || values.length < 2) return 'neutral';
        const first = values[0];
        const last = values[values.length - 1];
        const change = ((last - first) / first) * 100;

        if (change > 0.5) return 'up';
        if (change < -0.5) return 'down';
        return 'neutral';
    }

    _calculateMomentum(closes, periods) {
        if (closes.length < periods) return 0;
        const current = closes[closes.length - 1];
        const past = closes[closes.length - periods - 1];
        if (!past) return 0;
        return ((current - past) / past) * 100;
    }

    _checkRSIDivergence(prices, rsiValues) {
        if (prices.length < 10 || rsiValues.length < 10) return 'none';

        const priceSlope = (prices[prices.length - 1] - prices[0]) / prices[0];
        const rsiSlope = rsiValues[rsiValues.length - 1] - rsiValues[0];

        // Bullish divergence: price down, RSI up
        if (priceSlope < -0.02 && rsiSlope > 5) return 'bullish';
        // Bearish divergence: price up, RSI down
        if (priceSlope > 0.02 && rsiSlope < -5) return 'bearish';

        return 'none';
    }
}

module.exports = new TechnicalAnalysis();
