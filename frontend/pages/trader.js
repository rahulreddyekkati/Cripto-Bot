import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function Trader() {
    const [predictions, setPredictions] = useState([]);
    const [traderStatus, setTraderStatus] = useState(null);
    const [tradeHistory, setTradeHistory] = useState([]);
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState(false);
    const [apiKey, setApiKey] = useState('');
    const [apiSecret, setApiSecret] = useState('');
    const [configuring, setConfiguring] = useState(false);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [predRes, statusRes, historyRes] = await Promise.all([
                fetch('/api/predictions/enhanced'),
                fetch('/api/trader/status'),
                fetch('/api/trader/history')
            ]);

            const predData = await predRes.json();
            const statusData = await statusRes.json();
            const historyData = await historyRes.json();

            if (predData.success) setPredictions(predData.predictions);
            if (statusData.success) setTraderStatus(statusData);
            if (historyData.success) setTradeHistory(historyData.trades || []);
        } catch (error) {
            console.error('Error fetching data:', error);
        } finally {
            setLoading(false);
        }
    };

    const executeTrade = async () => {
        setExecuting(true);
        try {
            const res = await fetch('/api/trader/execute', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                await fetchData();
            }
        } catch (error) {
            console.error('Error executing trade:', error);
        } finally {
            setExecuting(false);
        }
    };

    const enableTrading = async () => {
        if (!apiKey || !apiSecret) {
            alert('Please enter API key and secret');
            return;
        }
        setConfiguring(true);
        try {
            const res = await fetch('/api/trader/enable', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey, apiSecret })
            });
            const data = await res.json();
            if (data.success) {
                await fetchData();
                setApiKey('');
                setApiSecret('');
            }
        } catch (error) {
            console.error('Error enabling trading:', error);
        } finally {
            setConfiguring(false);
        }
    };

    const disableTrading = async () => {
        await fetch('/api/trader/disable', { method: 'POST' });
        await fetchData();
    };

    const formatPrice = (price) => {
        if (!price) return '-';
        if (price >= 1) return `$${price.toFixed(2)}`;
        return `$${price.toFixed(6)}`;
    };

    const getSignalColor = (signal) => {
        const colors = {
            'STRONG_BUY': '#00ff88',
            'BUY': '#00d888',
            'HOLD': '#888',
            'AVOID': '#ff4444'
        };
        return colors[signal] || '#888';
    };

    return (
        <div>
            {/* Header */}
            <header className="header">
                <div className="container header-content">
                    <div className="logo">
                        <span className="logo-icon">🤖</span>
                        AutoTrader
                    </div>
                    <nav className="nav">
                        <Link href="/" className="nav-link">Predictions</Link>
                        <Link href="/performance" className="nav-link">Performance</Link>
                        <Link href="/trader" className="nav-link active">Auto Trader</Link>
                    </nav>
                </div>
            </header>

            <main className="main">
                <div className="container">
                    <h1 className="page-title">AI Auto Trader</h1>
                    <p className="page-subtitle">
                        Automated trading with news sentiment analysis • $3/day strategy
                    </p>

                    {loading ? (
                        <div className="loading">
                            <div className="spinner"></div>
                            <p>Loading trader data...</p>
                        </div>
                    ) : (
                        <>
                            {/* Status Cards */}
                            <div className="stats-grid" style={{ marginBottom: '30px' }}>
                                <div className="stat-card">
                                    <div className="stat-label">Today's Investment</div>
                                    <div className="stat-value">
                                        ${traderStatus?.today?.invested?.toFixed(2) || '0.00'}
                                    </div>
                                    <div className="stat-sublabel">
                                        of ${traderStatus?.config?.maxDailyInvestment || 3} daily limit
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Trades Today</div>
                                    <div className="stat-value">
                                        {traderStatus?.today?.trades || 0}
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Total Invested</div>
                                    <div className="stat-value">
                                        ${traderStatus?.total?.invested?.toFixed(2) || '0.00'}
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Trading Status</div>
                                    <div className="stat-value" style={{
                                        color: traderStatus?.tradingEnabled ? '#00d888' : '#ff4444'
                                    }}>
                                        {traderStatus?.tradingEnabled ? '🟢 LIVE' : '🔴 SIMULATION'}
                                    </div>
                                </div>
                            </div>

                            {/* Coinbase Configuration */}
                            <div className="card" style={{ marginBottom: '30px', padding: '20px' }}>
                                <h3 style={{ marginBottom: '15px' }}>⚙️ Coinbase API Configuration</h3>
                                {traderStatus?.tradingEnabled ? (
                                    <div>
                                        <p style={{ color: '#00d888', marginBottom: '10px' }}>
                                            ✅ Trading is ENABLED with Coinbase
                                        </p>
                                        <button
                                            onClick={disableTrading}
                                            style={{
                                                background: '#ff4444',
                                                border: 'none',
                                                color: '#fff',
                                                padding: '10px 20px',
                                                borderRadius: '8px',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            Disable Trading
                                        </button>
                                    </div>
                                ) : (
                                    <div>
                                        <p style={{ color: '#888', marginBottom: '15px' }}>
                                            Currently in SIMULATION mode. Enter Coinbase API keys to enable live trading.
                                        </p>
                                        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                            <input
                                                type="password"
                                                placeholder="API Key"
                                                value={apiKey}
                                                onChange={(e) => setApiKey(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    minWidth: '200px',
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #333',
                                                    background: '#1a1a2e',
                                                    color: '#fff'
                                                }}
                                            />
                                            <input
                                                type="password"
                                                placeholder="API Secret"
                                                value={apiSecret}
                                                onChange={(e) => setApiSecret(e.target.value)}
                                                style={{
                                                    flex: 1,
                                                    minWidth: '200px',
                                                    padding: '10px',
                                                    borderRadius: '8px',
                                                    border: '1px solid #333',
                                                    background: '#1a1a2e',
                                                    color: '#fff'
                                                }}
                                            />
                                            <button
                                                onClick={enableTrading}
                                                disabled={configuring}
                                                style={{
                                                    background: '#00d888',
                                                    border: 'none',
                                                    color: '#000',
                                                    padding: '10px 20px',
                                                    borderRadius: '8px',
                                                    cursor: 'pointer',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {configuring ? 'Connecting...' : 'Enable Trading'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Execute Trade Button */}
                            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                                <button
                                    onClick={executeTrade}
                                    disabled={executing}
                                    style={{
                                        background: executing ? '#333' : 'linear-gradient(135deg, #00d888, #00b377)',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '15px 40px',
                                        borderRadius: '12px',
                                        cursor: executing ? 'not-allowed' : 'pointer',
                                        fontWeight: '700',
                                        fontSize: '1.1rem'
                                    }}
                                >
                                    {executing ? '⏳ Analyzing & Trading...' : '🚀 Execute Daily Strategy'}
                                </button>
                            </div>

                            {/* Top Opportunities */}
                            <h2 style={{ marginBottom: '20px' }}>📊 Top AI-Analyzed Opportunities</h2>
                            <div className="predictions-grid">
                                {predictions.slice(0, 6).map((pred) => (
                                    <div key={pred.coinId} className="prediction-card">
                                        <div className="card-header">
                                            <div className="coin-info">
                                                <div className="coin-icon">{pred.symbol.slice(0, 2)}</div>
                                                <div>
                                                    <div className="coin-symbol">{pred.symbol}</div>
                                                    <div className="coin-name">{pred.name}</div>
                                                </div>
                                            </div>
                                            <span style={{
                                                background: getSignalColor(pred.tradingSignal),
                                                color: '#000',
                                                padding: '4px 10px',
                                                borderRadius: '12px',
                                                fontSize: '0.75rem',
                                                fontWeight: 'bold'
                                            }}>
                                                {pred.tradingSignal}
                                            </span>
                                        </div>

                                        {/* Sentiment */}
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            marginBottom: '10px',
                                            padding: '10px',
                                            background: 'rgba(0,216,136,0.1)',
                                            borderRadius: '8px'
                                        }}>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#888' }}>Sentiment</div>
                                                <div style={{ fontSize: '1.2rem' }}>
                                                    {pred.sentiment?.emoji || '⚪'} {pred.sentiment?.label || 'N/A'}
                                                </div>
                                            </div>
                                            <div>
                                                <div style={{ fontSize: '0.75rem', color: '#888' }}>Buzz</div>
                                                <div style={{ fontSize: '0.9rem' }}>
                                                    🔥 {pred.buzz?.level || 'none'}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Scores */}
                                        <div className="probability-section">
                                            <div className="probability-label">
                                                <span>Combined Score</span>
                                                <span className="probability-value">
                                                    {((pred.combinedScore || 0) * 100).toFixed(0)}%
                                                </span>
                                            </div>
                                            <div className="probability-bar">
                                                <div
                                                    className="probability-fill"
                                                    style={{ width: `${(pred.combinedScore || 0) * 100}%` }}
                                                ></div>
                                            </div>
                                        </div>

                                        {/* Latest Headline */}
                                        {pred.buzz?.latestHeadline && (
                                            <div style={{
                                                fontSize: '0.75rem',
                                                color: '#888',
                                                marginTop: '10px',
                                                fontStyle: 'italic'
                                            }}>
                                                📰 {pred.buzz.latestHeadline.substring(0, 80)}...
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>

                            {/* Trade History */}
                            <h2 style={{ marginTop: '40px', marginBottom: '20px' }}>📜 Recent Trades</h2>
                            {tradeHistory.length === 0 ? (
                                <div className="card" style={{ padding: '30px', textAlign: 'center' }}>
                                    <p style={{ color: '#888' }}>No trades yet. Click "Execute Daily Strategy" to start!</p>
                                </div>
                            ) : (
                                <div className="card" style={{ padding: '0', overflow: 'hidden' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,216,136,0.1)' }}>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Time</th>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Symbol</th>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Action</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Signal</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {tradeHistory.slice(0, 20).map((trade, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                                                    <td style={{ padding: '12px' }}>
                                                        {new Date(trade.timestamp).toLocaleString()}
                                                    </td>
                                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                                                        {trade.symbol}
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{
                                                            color: trade.action?.includes('BUY') ? '#00d888' : '#888'
                                                        }}>
                                                            {trade.action}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                                        ${trade.amount?.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        {trade.signal}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}

                            {/* Disclaimer */}
                            <div className="disclaimer" style={{ marginTop: '30px' }}>
                                ⚠️ <strong>Risk Warning:</strong> Automated trading involves significant risk.
                                Past performance does not guarantee future results. Only trade with money you can afford to lose.
                                The AI system is experimental and may make incorrect decisions.
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
