import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Performance() {
    const [stats, setStats] = useState(null);
    const [reliability, setReliability] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchPerformance();
    }, []);

    const fetchPerformance = async () => {
        try {
            const res = await fetch('/api/performance');
            const data = await res.json();
            if (data.success) {
                setStats(data.stats);
                setReliability(data.reliability);
            }
        } catch (error) {
            console.error('Error fetching performance:', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="container header-content">
                    <div className="logo">
                        <span className="logo-icon">📊</span>
                        CryptoPredictor
                    </div>

                    <nav className="nav">
                        <Link href="/" className="nav-link">Predictions</Link>
                        <Link href="/performance" className="nav-link active">Performance</Link>
                    </nav>
                </div>
            </header>

            {/* Main */}
            <main className="main">
                <div className="container">
                    <h1 className="page-title">Performance Tracking</h1>
                    <p className="page-subtitle">
                        Historical accuracy of predictions • Builds trust through transparency
                    </p>

                    {loading && (
                        <div className="loading">
                            <div className="spinner"></div>
                            <p>Loading performance data...</p>
                        </div>
                    )}

                    {!loading && stats && (
                        <>
                            {/* Overall Stats */}
                            <div className="stats-grid">
                                <div className="stat-card">
                                    <div className={`stat-value ${parseFloat(stats.overall.winRate) >= 50 ? 'positive' : 'negative'}`}>
                                        {stats.overall.winRate}%
                                    </div>
                                    <div className="stat-label">Overall Win Rate</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-value">{stats.overall.total}</div>
                                    <div className="stat-label">Total Predictions</div>
                                </div>

                                <div className="stat-card">
                                    <div className={`stat-value ${parseFloat(stats.overall.avgReturn) >= 0 ? 'positive' : 'negative'}`}>
                                        {stats.overall.avgReturn}%
                                    </div>
                                    <div className="stat-label">Avg Return</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-value positive">{stats.overall.bestReturn}%</div>
                                    <div className="stat-label">Best Prediction</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-value positive">{stats.exitStats.tpHitRate}%</div>
                                    <div className="stat-label">Take Profit Hit Rate</div>
                                </div>

                                <div className="stat-card">
                                    <div className="stat-value negative">{stats.exitStats.slHitRate}%</div>
                                    <div className="stat-label">Stop Loss Hit Rate</div>
                                </div>
                            </div>

                            {/* By Confidence Tier */}
                            <h2 style={{ marginBottom: '20px' }}>Performance by Confidence Tier</h2>
                            <table className="performance-table" style={{ marginBottom: '40px' }}>
                                <thead>
                                    <tr>
                                        <th>Tier</th>
                                        <th>Predictions</th>
                                        <th>Win Rate</th>
                                        <th>Avg Return</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.byConfidenceTier.map((tier) => (
                                        <tr key={tier.tier}>
                                            <td>
                                                <span className={`confidence-badge confidence-${tier.tier}`}>
                                                    {tier.tier}
                                                </span>
                                            </td>
                                            <td>{tier.total}</td>
                                            <td className={parseFloat(tier.winRate) >= 50 ? 'return-positive' : 'return-negative'}>
                                                {tier.winRate}%
                                            </td>
                                            <td className={parseFloat(tier.avgReturn) >= 0 ? 'return-positive' : 'return-negative'}>
                                                {tier.avgReturn}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* By Market Cap */}
                            <h2 style={{ marginBottom: '20px' }}>Performance by Market Cap</h2>
                            <table className="performance-table" style={{ marginBottom: '40px' }}>
                                <thead>
                                    <tr>
                                        <th>Market Cap</th>
                                        <th>Predictions</th>
                                        <th>Win Rate</th>
                                        <th>Avg Return</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {stats.byMarketCap.map((cap) => (
                                        <tr key={cap.tier}>
                                            <td style={{ textTransform: 'capitalize' }}>{cap.tier}</td>
                                            <td>{cap.total}</td>
                                            <td className={parseFloat(cap.winRate) >= 50 ? 'return-positive' : 'return-negative'}>
                                                {cap.winRate}%
                                            </td>
                                            <td className={parseFloat(cap.avgReturn) >= 0 ? 'return-positive' : 'return-negative'}>
                                                {cap.avgReturn}%
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Reliability Plot Data */}
                            {reliability.length > 0 && (
                                <>
                                    <h2 style={{ marginBottom: '20px' }}>Calibration (Reliability)</h2>
                                    <p style={{ color: 'var(--text-secondary)', marginBottom: '20px' }}>
                                        Shows if predicted probabilities match actual outcomes. Perfect calibration = diagonal line.
                                    </p>
                                    <table className="performance-table" style={{ marginBottom: '40px' }}>
                                        <thead>
                                            <tr>
                                                <th>Predicted Probability</th>
                                                <th>Actual Win Rate</th>
                                                <th>Sample Size</th>
                                                <th>Calibration</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {reliability.map((bucket) => {
                                                const diff = Math.abs(bucket.predictedProb - bucket.actualWinRate);
                                                const calibration = diff < 0.1 ? 'good' : diff < 0.2 ? 'fair' : 'poor';
                                                return (
                                                    <tr key={bucket.predictedProb}>
                                                        <td>{(bucket.predictedProb * 100).toFixed(0)}%</td>
                                                        <td>{(bucket.actualWinRate * 100).toFixed(0)}%</td>
                                                        <td>{bucket.sampleSize}</td>
                                                        <td>
                                                            <span style={{
                                                                color: calibration === 'good' ? 'var(--accent-green)' :
                                                                    calibration === 'fair' ? 'var(--accent-gold)' : 'var(--accent-red)'
                                                            }}>
                                                                {calibration === 'good' ? '✓' : calibration === 'fair' ? '~' : '✗'}
                                                                {' '}{calibration}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </>
                            )}

                            {/* Recent Daily Performance */}
                            {stats.recentDaily.length > 0 && (
                                <>
                                    <h2 style={{ marginBottom: '20px' }}>Last 7 Days</h2>
                                    <table className="performance-table">
                                        <thead>
                                            <tr>
                                                <th>Date</th>
                                                <th>Predictions</th>
                                                <th>Wins</th>
                                                <th>Avg Return</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {stats.recentDaily.map((day) => (
                                                <tr key={day.date}>
                                                    <td>{new Date(day.date).toLocaleDateString()}</td>
                                                    <td>{day.total}</td>
                                                    <td>{day.wins}</td>
                                                    <td className={day.avg_return >= 0 ? 'return-positive' : 'return-negative'}>
                                                        {day.avg_return?.toFixed(2)}%
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </>
                            )}
                        </>
                    )}

                    {/* Empty state */}
                    {!loading && (!stats || stats.overall.total === 0) && (
                        <div className="loading">
                            <p>No performance data yet. Predictions are tracked after 24 hours.</p>
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="disclaimer">
                        ⚠️ <strong>Disclaimer:</strong> Past performance does not guarantee future results.
                        These statistics are based on historical predictions and actual market outcomes.
                    </div>
                </div>
            </main>
        </div>
    );
}
