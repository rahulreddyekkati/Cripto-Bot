import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Home() {
    const [predictions, setPredictions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [regime, setRegime] = useState(null);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [nextRefresh, setNextRefresh] = useState(240); // 4 minutes countdown

    // Filters
    const [confidenceFilter, setConfidenceFilter] = useState('all');
    const [marketCapFilter, setMarketCapFilter] = useState('all');
    const [volatilityFilter, setVolatilityFilter] = useState('all');

    useEffect(() => {
        fetchPredictions();
        fetchRegime();

        // Auto-refresh countdown timer
        const timer = setInterval(() => {
            setNextRefresh(prev => {
                if (prev <= 1) {
                    fetchPredictions();
                    return 240; // Reset to 4 minutes
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    const fetchPredictions = async () => {
        try {
            const res = await fetch('/api/predictions');
            const data = await res.json();
            if (data.success) {
                setPredictions(data.predictions);
                setLastUpdated(data.lastUpdated);
            }
        } catch (error) {
            console.error('Error fetching predictions:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const res = await fetch('/api/predictions/refresh', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchPredictions();
                setNextRefresh(240);
            }
        } catch (error) {
            console.error('Error refreshing:', error);
        } finally {
            setRefreshing(false);
        }
    };

    const fetchRegime = async () => {
        try {
            const res = await fetch('/api/regime');
            const data = await res.json();
            if (data.success) {
                setRegime(data.regime);
            }
        } catch (error) {
            console.error('Error fetching regime:', error);
        }
    };

    // Filter predictions
    const filteredPredictions = predictions.filter(p => {
        if (confidenceFilter !== 'all' && p.confidenceTier !== confidenceFilter) return false;
        if (marketCapFilter !== 'all' && p.marketCapTier !== marketCapFilter) return false;
        if (volatilityFilter !== 'all' && p.volatilityTier !== volatilityFilter) return false;
        return true;
    });

    const formatPrice = (price) => {
        if (price >= 1) return `$${price.toFixed(2)}`;
        if (price >= 0.01) return `$${price.toFixed(4)}`;
        return `$${price.toFixed(6)}`;
    };

    const formatPercent = (value) => {
        if (value === null || value === undefined) return '-';
        const prefix = value >= 0 ? '+' : '';
        return `${prefix}${value.toFixed(1)}%`;
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
                        <Link href="/" className="nav-link active">Predictions</Link>
                        <Link href="/performance" className="nav-link">Performance</Link>
                        <Link href="/trader" className="nav-link">🤖 Auto Trader</Link>
                    </nav>

                    {regime && (
                        <span className={`regime-badge regime-${regime.regime}`}>
                            {regime.regime === 'risk_on' && '🟢 Risk On'}
                            {regime.regime === 'risk_off' && '🔴 Risk Off'}
                            {regime.regime === 'neutral' && '⚪ Neutral'}
                        </span>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <main className="main">
                <div className="container">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <h1 className="page-title">Top Predictions (24h)</h1>
                        <button
                            onClick={handleRefresh}
                            disabled={refreshing}
                            style={{
                                background: refreshing ? '#333' : 'linear-gradient(135deg, #00d888, #00b377)',
                                border: 'none',
                                color: '#fff',
                                padding: '10px 20px',
                                borderRadius: '8px',
                                cursor: refreshing ? 'not-allowed' : 'pointer',
                                fontWeight: '600',
                                fontSize: '0.9rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '8px'
                            }}
                        >
                            {refreshing ? '⏳ Refreshing...' : '🔄 Refresh Now'}
                        </button>
                    </div>
                    <p className="page-subtitle">
                        ML-powered signals with calibrated probabilities •
                        {lastUpdated && ` Updated: ${new Date(lastUpdated).toLocaleTimeString()}`}
                        {' • '}
                        <span style={{ color: '#00d888' }}>
                            Next auto-refresh: {Math.floor(nextRefresh / 60)}:{String(nextRefresh % 60).padStart(2, '0')}
                        </span>
                    </p>

                    {/* Filters */}
                    <div className="filters">
                        <div className="filter-group">
                            <button
                                className={`filter-btn ${confidenceFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setConfidenceFilter('all')}
                            >
                                All
                            </button>
                            <button
                                className={`filter-btn ${confidenceFilter === 'high' ? 'active' : ''}`}
                                onClick={() => setConfidenceFilter('high')}
                            >
                                High Confidence
                            </button>
                            <button
                                className={`filter-btn ${confidenceFilter === 'medium' ? 'active' : ''}`}
                                onClick={() => setConfidenceFilter('medium')}
                            >
                                Medium
                            </button>
                        </div>

                        <div className="filter-group">
                            <button
                                className={`filter-btn ${marketCapFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setMarketCapFilter('all')}
                            >
                                All Caps
                            </button>
                            <button
                                className={`filter-btn ${marketCapFilter === 'large' ? 'active' : ''}`}
                                onClick={() => setMarketCapFilter('large')}
                            >
                                Large
                            </button>
                            <button
                                className={`filter-btn ${marketCapFilter === 'mid' ? 'active' : ''}`}
                                onClick={() => setMarketCapFilter('mid')}
                            >
                                Mid
                            </button>
                            <button
                                className={`filter-btn ${marketCapFilter === 'small' ? 'active' : ''}`}
                                onClick={() => setMarketCapFilter('small')}
                            >
                                Small
                            </button>
                        </div>

                        <div className="filter-group">
                            <button
                                className={`filter-btn ${volatilityFilter === 'all' ? 'active' : ''}`}
                                onClick={() => setVolatilityFilter('all')}
                            >
                                All Risk
                            </button>
                            <button
                                className={`filter-btn ${volatilityFilter === 'low' ? 'active' : ''}`}
                                onClick={() => setVolatilityFilter('low')}
                            >
                                Low
                            </button>
                            <button
                                className={`filter-btn ${volatilityFilter === 'moderate' ? 'active' : ''}`}
                                onClick={() => setVolatilityFilter('moderate')}
                            >
                                Moderate
                            </button>
                            <button
                                className={`filter-btn ${volatilityFilter === 'high' ? 'active' : ''}`}
                                onClick={() => setVolatilityFilter('high')}
                            >
                                High
                            </button>
                        </div>
                    </div>

                    {/* Loading */}
                    {loading && (
                        <div className="loading">
                            <div className="spinner"></div>
                            <p>Loading predictions...</p>
                        </div>
                    )}

                    {/* Predictions Grid */}
                    {!loading && (
                        <div className="predictions-grid">
                            {filteredPredictions.map((pred, index) => (
                                <div key={pred.coinId} className="prediction-card">
                                    {/* Header */}
                                    <div className="card-header">
                                        <div className="coin-info">
                                            <div className="coin-icon">
                                                {pred.symbol.slice(0, 2)}
                                            </div>
                                            <div>
                                                <div className="coin-symbol">{pred.symbol}</div>
                                                <div className="coin-name">{pred.name}</div>
                                            </div>
                                        </div>
                                        <span className={`confidence-badge confidence-${pred.confidenceTier}`}>
                                            {pred.confidenceTier}
                                        </span>
                                    </div>

                                    {/* Probability */}
                                    <div className="probability-section">
                                        <div className="probability-label">
                                            <span>Win Probability</span>
                                            <span className="probability-value">
                                                {(pred.mlProbability * 100).toFixed(0)}%
                                            </span>
                                        </div>
                                        <div className="probability-bar">
                                            <div
                                                className="probability-fill"
                                                style={{ width: `${pred.mlProbability * 100}%` }}
                                            ></div>
                                        </div>
                                    </div>

                                    {/* Expected Return */}
                                    <div className="return-range">
                                        <span className="return-label">Expected Return</span>
                                        <span className={`return-value ${pred.expectedReturnP50 >= 0 ? 'return-positive' : 'return-negative'}`}>
                                            {formatPercent(pred.expectedReturnP25)} to {formatPercent(pred.expectedReturnP75)}
                                        </span>
                                    </div>

                                    {/* Signals */}
                                    <div className="signals-section">
                                        <div className="signals-label">
                                            Signals ({pred.signalCount})
                                        </div>
                                        <div className="signals-list">
                                            {pred.signals.slice(0, 4).map((signal, i) => (
                                                <span key={i} className="signal-tag">{signal}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Entry/Exit */}
                                    <div className="entry-exit">
                                        <div className="entry-exit-item">
                                            <div className="entry-exit-label">Entry</div>
                                            <div className="entry-exit-value">
                                                {formatPrice(pred.entryPrice)}
                                            </div>
                                        </div>
                                        <div className="entry-exit-item">
                                            <div className="entry-exit-label">Stop Loss</div>
                                            <div className="entry-exit-value sl-value">
                                                {formatPrice(pred.stopLoss)}
                                                <br />
                                                <small>({formatPercent(pred.stopLossPercent)})</small>
                                            </div>
                                        </div>
                                        <div className="entry-exit-item">
                                            <div className="entry-exit-label">Take Profit</div>
                                            <div className="entry-exit-value tp-value">
                                                {formatPrice(pred.takeProfit)}
                                                <br />
                                                <small>({formatPercent(pred.takeProfitPercent)})</small>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* Empty state */}
                    {!loading && filteredPredictions.length === 0 && (
                        <div className="loading">
                            <p>No predictions match your filters</p>
                        </div>
                    )}

                    {/* Disclaimer */}
                    <div className="disclaimer">
                        ⚠️ <strong>Disclaimer:</strong> These are probability-based signals, not guaranteed returns.
                        Past performance does not guarantee future results. Always do your own research and never invest more than you can afford to lose.
                    </div>
                </div>
            </main>
        </div>
    );
}
