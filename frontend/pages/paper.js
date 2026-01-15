import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function PaperTrading() {
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);
    const [executing, setExecuting] = useState(false);
    const [tradeLog, setTradeLog] = useState('');

    useEffect(() => {
        fetchStatus();
        // Refresh positions every 30 seconds for live tracking
        const interval = setInterval(fetchStatus, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const [statusRes, logRes] = await Promise.all([
                fetch('/api/paper/status'),
                fetch('/api/paper/log')
            ]);

            const statusData = await statusRes.json();
            const logText = await logRes.text();

            if (statusData.success) setStatus(statusData);
            setTradeLog(logText);
        } catch (error) {
            console.error('Error fetching status:', error);
        } finally {
            setLoading(false);
        }
    };

    const executeTrade = async () => {
        setExecuting(true);
        try {
            await fetch('/api/paper/trade', { method: 'POST' });
            await fetchStatus();
        } catch (error) {
            console.error('Error executing trade:', error);
        } finally {
            setExecuting(false);
        }
    };

    const checkPositions = async () => {
        try {
            await fetch('/api/paper/check', { method: 'POST' });
            await fetchStatus();
        } catch (error) {
            console.error('Error checking positions:', error);
        }
    };

    const endDay = async () => {
        try {
            await fetch('/api/paper/endday', { method: 'POST' });
            await fetchStatus();
        } catch (error) {
            console.error('Error ending day:', error);
        }
    };

    const resetTrial = async () => {
        if (confirm('Reset 7-day trial? This will clear all trades and start over with $100.')) {
            await fetch('/api/paper/reset', { method: 'POST' });
            await fetchStatus();
        }
    };

    const downloadCSV = () => {
        const blob = new Blob([tradeLog], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `paper_trades_day${status?.dayNumber || 1}.csv`;
        a.click();
    };

    const parseCSV = (csv) => {
        const lines = csv.trim().split('\n');
        if (lines.length <= 1) return [];
        const headers = lines[0].split(',');
        return lines.slice(1).map(line => {
            const values = line.split(',');
            return headers.reduce((obj, header, i) => {
                obj[header] = values[i];
                return obj;
            }, {});
        });
    };

    const trades = parseCSV(tradeLog);
    const profitLoss = status?.profitLoss || 0;
    const profitColor = profitLoss >= 0 ? '#00d888' : '#ff4444';

    return (
        <div>
            <header className="header">
                <div className="container header-content">
                    <div className="logo">
                        <span className="logo-icon">📝</span>
                        Paper Trading Trial
                    </div>
                    <nav className="nav">
                        <Link href="/" className="nav-link">Predictions</Link>
                        <Link href="/trader" className="nav-link">Auto Trader</Link>
                        <Link href="/paper" className="nav-link active">7-Day Trial</Link>
                    </nav>
                </div>
            </header>

            <main className="main">
                <div className="container">
                    <h1 className="page-title">📊 7-Day Paper Trading Trial</h1>
                    <p className="page-subtitle">
                        Virtual $100 • Prove the AI system works before live trading
                    </p>

                    {loading ? (
                        <div className="loading">
                            <div className="spinner"></div>
                            <p>Loading trial status...</p>
                        </div>
                    ) : (
                        <>
                            {/* Summary Cards */}
                            <div className="stats-grid" style={{ marginBottom: '30px' }}>
                                <div className="stat-card">
                                    <div className="stat-label">Day</div>
                                    <div className="stat-value">{status?.dayNumber || 1} / 7</div>
                                    <div className="stat-sublabel">{status?.daysRemaining} days remaining</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Starting Balance</div>
                                    <div className="stat-value">$100.00</div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Current Value</div>
                                    <div className="stat-value" style={{ color: profitColor }}>
                                        ${status?.currentValue?.toFixed(2) || '100.00'}
                                    </div>
                                </div>
                                <div className="stat-card">
                                    <div className="stat-label">Profit/Loss</div>
                                    <div className="stat-value" style={{ color: profitColor }}>
                                        {profitLoss >= 0 ? '+' : ''}${profitLoss.toFixed(2)}
                                        <span style={{ fontSize: '0.8rem', marginLeft: '5px' }}>
                                            ({status?.profitLossPercent?.toFixed(2) || 0}%)
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div style={{
                                display: 'flex',
                                gap: '15px',
                                marginBottom: '30px',
                                flexWrap: 'wrap',
                                justifyContent: 'center'
                            }}>
                                <button
                                    onClick={executeTrade}
                                    disabled={executing}
                                    style={{
                                        background: executing ? '#333' : 'linear-gradient(135deg, #00d888, #00b377)',
                                        border: 'none',
                                        color: '#fff',
                                        padding: '15px 30px',
                                        borderRadius: '12px',
                                        cursor: executing ? 'not-allowed' : 'pointer',
                                        fontWeight: '700',
                                        fontSize: '1rem'
                                    }}
                                >
                                    {executing ? '⏳ Analyzing...' : '🚀 Execute Day\'s Trade'}
                                </button>
                                <button
                                    onClick={checkPositions}
                                    style={{
                                        background: '#333',
                                        border: '1px solid #00d888',
                                        color: '#00d888',
                                        padding: '15px 30px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    🔄 Check Live Prices
                                </button>
                                <button
                                    onClick={endDay}
                                    style={{
                                        background: '#333',
                                        border: '1px solid #888',
                                        color: '#888',
                                        padding: '15px 30px',
                                        borderRadius: '12px',
                                        cursor: 'pointer',
                                        fontWeight: '600'
                                    }}
                                >
                                    📅 End Day {status?.dayNumber}
                                </button>
                            </div>

                            {/* Open Positions - LIVE TRACKING */}
                            <h2 style={{ marginBottom: '15px' }}>📈 Open Positions (Live)</h2>
                            {status?.openPositions?.length > 0 ? (
                                <div className="card" style={{ padding: '0', overflow: 'hidden', marginBottom: '30px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,216,136,0.1)' }}>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Symbol</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>Entry Price</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>Amount</th>
                                                <th style={{ padding: '12px', textAlign: 'left' }}>Signal</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>Stop Loss</th>
                                                <th style={{ padding: '12px', textAlign: 'right' }}>Take Profit</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {status.openPositions.map((pos, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                                                    <td style={{ padding: '12px', fontWeight: 'bold' }}>
                                                        {pos.symbol}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                                        ${pos.entryPrice?.toFixed(4)}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right' }}>
                                                        ${pos.amount?.toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '12px' }}>
                                                        <span style={{
                                                            color: pos.signal === 'STRONG_BUY' ? '#00ff88' : '#00d888',
                                                            fontWeight: 'bold'
                                                        }}>
                                                            {pos.signal}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#ff4444' }}>
                                                        ${pos.stopLoss?.toFixed(4)}
                                                    </td>
                                                    <td style={{ padding: '12px', textAlign: 'right', color: '#00d888' }}>
                                                        ${pos.takeProfit?.toFixed(4)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="card" style={{ padding: '20px', marginBottom: '30px', textAlign: 'center' }}>
                                    <p style={{ color: '#888' }}>No open positions. Click "Execute Day's Trade" to start.</p>
                                </div>
                            )}

                            {/* Trade History */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                                <h2>📜 Trade Log (CSV)</h2>
                                <button
                                    onClick={downloadCSV}
                                    style={{
                                        background: '#333',
                                        border: '1px solid #00d888',
                                        color: '#00d888',
                                        padding: '8px 16px',
                                        borderRadius: '8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    📥 Download CSV
                                </button>
                            </div>

                            {trades.length > 0 ? (
                                <div className="card" style={{ padding: '0', overflow: 'auto', marginBottom: '30px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                        <thead>
                                            <tr style={{ background: 'rgba(0,216,136,0.1)' }}>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Day</th>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Date</th>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Action</th>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Symbol</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>Entry</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>SL</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>TP</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>Amount</th>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Signal</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>Exit</th>
                                                <th style={{ padding: '10px', textAlign: 'right' }}>P/L</th>
                                                <th style={{ padding: '10px', textAlign: 'left' }}>Status</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {trades.slice().reverse().map((trade, i) => (
                                                <tr key={i} style={{ borderBottom: '1px solid #222' }}>
                                                    <td style={{ padding: '10px' }}>{trade.Day}</td>
                                                    <td style={{ padding: '10px' }}>{trade.Date}</td>
                                                    <td style={{ padding: '10px' }}>
                                                        <span style={{
                                                            color: trade.Action === 'BUY' ? '#00d888' :
                                                                trade.Action === 'SELL' ? '#ff8800' : '#888'
                                                        }}>
                                                            {trade.Action}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{trade.Symbol}</td>
                                                    <td style={{ padding: '10px', textAlign: 'right' }}>{trade['Entry Price']}</td>
                                                    <td style={{ padding: '10px', textAlign: 'right', color: '#ff4444' }}>
                                                        {trade['Stop Loss'] ? `$${parseFloat(trade['Stop Loss']).toFixed(4)}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '10px', textAlign: 'right', color: '#00d888' }}>
                                                        {trade['Take Profit'] ? `$${parseFloat(trade['Take Profit']).toFixed(4)}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '10px', textAlign: 'right' }}>${trade['Amount ($)']}</td>
                                                    <td style={{ padding: '10px' }}>{trade.Signal}</td>
                                                    <td style={{ padding: '10px', textAlign: 'right' }}>{trade['Exit Price'] || '-'}</td>
                                                    <td style={{
                                                        padding: '10px',
                                                        textAlign: 'right',
                                                        color: trade['Profit/Loss ($)']?.startsWith('-') ? '#ff4444' : '#00d888'
                                                    }}>
                                                        {trade['Profit/Loss ($)'] ? `$${trade['Profit/Loss ($)']}` : '-'}
                                                    </td>
                                                    <td style={{ padding: '10px' }}>{trade.Status}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <div className="card" style={{ padding: '20px', marginBottom: '30px', textAlign: 'center' }}>
                                    <p style={{ color: '#888' }}>No trades yet. Start Day 1 by clicking "Execute Day's Trade".</p>
                                </div>
                            )}

                            {/* Cash Available */}
                            <div className="card" style={{ padding: '20px', marginBottom: '30px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <span>💵 Cash Available:</span>
                                    <strong>${status?.cashAvailable?.toFixed(2) || '100.00'}</strong>
                                </div>
                            </div>

                            {/* Reset */}
                            <div style={{ textAlign: 'center' }}>
                                <button
                                    onClick={resetTrial}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #ff4444',
                                        color: '#ff4444',
                                        padding: '10px 20px',
                                        borderRadius: '8px',
                                        cursor: 'pointer'
                                    }}
                                >
                                    🔄 Reset 7-Day Trial
                                </button>
                            </div>

                            {/* Info */}
                            <div className="disclaimer" style={{ marginTop: '30px' }}>
                                <strong>How it works:</strong><br />
                                1. Click "Execute Day's Trade" to make AI-driven paper trades ($3/day limit)<br />
                                2. Click "Check Live Prices" to see if positions hit TP/SL<br />
                                3. Click "End Day" to close the day and move to next<br />
                                4. After 7 days, review profit/loss to decide on real trading
                            </div>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}
