const { prepare, initDb } = require('../db/database');

class PerformanceTracker {
    async ensureDb() {
        await initDb();
    }

    async savePrediction(prediction) {
        await this.ensureDb();
        const stmt = prepare(`
      INSERT INTO predictions (
        coin_id, prediction_window_hours, ml_probability, confidence_tier,
        signal_count, signals, entry_price, stop_loss, take_profit,
        expected_return_p25, expected_return_p50, expected_return_p75,
        market_cap_tier, volatility_tier
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

        const result = stmt.run(
            prediction.coinId,
            prediction.windowHours || 24,
            prediction.mlProbability,
            prediction.confidenceTier,
            prediction.signalCount,
            JSON.stringify(prediction.signals),
            prediction.entryPrice,
            prediction.stopLoss,
            prediction.takeProfit,
            prediction.expectedReturnP25,
            prediction.expectedReturnP50,
            prediction.expectedReturnP75,
            prediction.marketCapTier,
            prediction.volatilityTier
        );

        return result.lastInsertRowid;
    }

    async recordPerformance(predictionId, actualData) {
        await this.ensureDb();
        prepare(`
      INSERT INTO performance (
        prediction_id, coin_id, actual_return,
        hit_take_profit, hit_stop_loss, max_drawdown, max_gain,
        time_to_tp_hours, time_to_sl_hours
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
            predictionId,
            actualData.coinId,
            actualData.actualReturn,
            actualData.hitTakeProfit ? 1 : 0,
            actualData.hitStopLoss ? 1 : 0,
            actualData.maxDrawdown,
            actualData.maxGain,
            actualData.timeToTpHours,
            actualData.timeToSlHours
        );
    }

    async getPerformanceStats() {
        await this.ensureDb();

        const overall = prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN actual_return > 1 THEN 1 ELSE 0 END) as wins,
        AVG(actual_return) as avg_return,
        MIN(actual_return) as worst_return,
        MAX(actual_return) as best_return
      FROM performance
    `).get() || { total: 0, wins: 0, avg_return: 0, worst_return: 0, best_return: 0 };

        const byTier = prepare(`
      SELECT 
        p.confidence_tier,
        COUNT(*) as total,
        SUM(CASE WHEN perf.actual_return > 1 THEN 1 ELSE 0 END) as wins,
        AVG(perf.actual_return) as avg_return
      FROM predictions p
      JOIN performance perf ON p.id = perf.prediction_id
      GROUP BY p.confidence_tier
    `).all();

        const byMarketCap = prepare(`
      SELECT 
        p.market_cap_tier,
        COUNT(*) as total,
        SUM(CASE WHEN perf.actual_return > 1 THEN 1 ELSE 0 END) as wins,
        AVG(perf.actual_return) as avg_return
      FROM predictions p
      JOIN performance perf ON p.id = perf.prediction_id
      GROUP BY p.market_cap_tier
    `).all();

        const recent = prepare(`
      SELECT 
        DATE(verified_at) as date,
        COUNT(*) as total,
        SUM(CASE WHEN actual_return > 1 THEN 1 ELSE 0 END) as wins,
        AVG(actual_return) as avg_return
      FROM performance
      WHERE verified_at >= datetime('now', '-7 days')
      GROUP BY DATE(verified_at)
      ORDER BY date DESC
    `).all();

        const exitStats = prepare(`
      SELECT 
        SUM(hit_take_profit) as tp_hits,
        SUM(hit_stop_loss) as sl_hits,
        COUNT(*) as total
      FROM performance
    `).get() || { tp_hits: 0, sl_hits: 0, total: 0 };

        return {
            overall: {
                total: overall.total || 0,
                wins: overall.wins || 0,
                winRate: overall.total ? ((overall.wins || 0) / overall.total * 100).toFixed(1) : '0',
                avgReturn: (overall.avg_return || 0).toFixed(2),
                worstReturn: (overall.worst_return || 0).toFixed(2),
                bestReturn: (overall.best_return || 0).toFixed(2)
            },
            byConfidenceTier: byTier.map(t => ({
                tier: t.confidence_tier,
                total: t.total,
                winRate: ((t.wins || 0) / t.total * 100).toFixed(1),
                avgReturn: (t.avg_return || 0).toFixed(2)
            })),
            byMarketCap: byMarketCap.map(m => ({
                tier: m.market_cap_tier,
                total: m.total,
                winRate: ((m.wins || 0) / m.total * 100).toFixed(1),
                avgReturn: (m.avg_return || 0).toFixed(2)
            })),
            recentDaily: recent,
            exitStats: {
                tpHitRate: exitStats.total ? ((exitStats.tp_hits || 0) / exitStats.total * 100).toFixed(1) : '0',
                slHitRate: exitStats.total ? ((exitStats.sl_hits || 0) / exitStats.total * 100).toFixed(1) : '0'
            }
        };
    }

    async getReliabilityData() {
        await this.ensureDb();
        return prepare(`
      SELECT 
        ROUND(p.ml_probability, 1) as prob_bucket,
        COUNT(*) as total,
        AVG(CASE WHEN perf.actual_return > 1 THEN 1.0 ELSE 0.0 END) as actual_win_rate
      FROM predictions p
      JOIN performance perf ON p.id = perf.prediction_id
      GROUP BY ROUND(p.ml_probability, 1)
      ORDER BY prob_bucket
    `).all().map(b => ({
            predictedProb: b.prob_bucket,
            actualWinRate: b.actual_win_rate,
            sampleSize: b.total
        }));
    }
}

module.exports = new PerformanceTracker();
