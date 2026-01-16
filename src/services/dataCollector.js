const axios = require('axios');
const { initDb, prepare, saveDb } = require('../db/database');
const alpacaService = require('./alpacaService');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Bad symbols to filter out (stablecoins, pegged assets)
const BAD_SYMBOLS = new Set([
    'usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'usdd', 'frax', 'gusd',
    'usde', 'fdusd', 'pyusd', 'susde', 'usdt0', 'usd1', 'bsc-usd', 'paxg',
    'weth', 'wbnb', 'wbtc', 'steth', 'wsteth', 'cbeth', 'reth'
]);

class DataCollector {
    constructor() {
        this.cache = new Map();
        this.dbReady = false;

        // All Alpaca-supported USD pairs (expanded)
        this.targetPairs = [
            // Major Coins
            'BTC/USD', 'ETH/USD', 'SOL/USD', 'XRP/USD', 'DOGE/USD',
            // Mid Caps
            'AVAX/USD', 'LINK/USD', 'DOT/USD', 'LTC/USD', 'UNI/USD',
            'BCH/USD', 'SHIB/USD', 'AAVE/USD', 'ATOM/USD',
            // Trending / Meme Coins
            'PEPE/USD', 'TRUMP/USD',
            // DeFi & Others
            'CRV/USD', 'GRT/USD', 'SUSHI/USD', 'BAT/USD', 'XTZ/USD', 'YFI/USD', 'MKR/USD',
            'CHZ/USD'
        ];
    }

    async ensureDb() {
        if (!this.dbReady) {
            await initDb();
            this.dbReady = true;
        }
    }

    /**
     * Fetch top coins - NOW USING ALPACA (Fast & Reliable)
     */
    async fetchTopCoins(limit = 100) {
        await this.ensureDb();
        console.log(`🦙 Fetching data for ${this.targetPairs.length} pairs via Alpaca...`);

        // 1. Get Latest Prices for our target list
        const latestPrices = await alpacaService.getLatestPrices(this.targetPairs);

        const coins = [];
        let rank = 1;

        for (const pair of this.targetPairs) {
            const price = latestPrices[pair];
            if (price) {
                const symbol = pair.split('/')[0].toLowerCase(); // 'BTC/USD' -> 'btc'
                coins.push({
                    id: symbol, // simplified ID
                    symbol: symbol,
                    name: pair,
                    market_cap_rank: rank++,
                    current_price: price,
                    total_volume: 100_000_000_000,
                    price_change_percentage_24h: 0,
                    price_change_percentage_7d_in_currency: 0,
                    ath: 0,
                    atl: 0
                });
            } else {
                console.warn(`⚠️ No price found for ${pair} (Skipping)`);
            }
        }

        console.log(`✅ Loaded ${coins.length} coins from Alpaca.`);

        // Save to DB
        this._saveCoins(coins);
        return coins.slice(0, limit);
    }

    /**
     * Fetch OHLCV using Alpaca
     */
    async fetchOHLCV(symbol, coinId, interval = '1h', limit = 168) {
        // Optimize: Check DB first!
        if (this._hasFreshCandles(coinId)) {
            try {
                const candles = prepare(`
                     SELECT timestamp, open, high, low, close, volume 
                     FROM price_history 
                     WHERE coin_id = ? 
                     ORDER BY timestamp ASC 
                     LIMIT ?
                 `).all(coinId, limit);

                const parsed = candles.map(c => ({
                    ...c,
                    timestamp: new Date(c.timestamp)
                }));

                console.log(`    ✓ DB Cache: ${parsed.length} candles (Fresh)`);
                return parsed;
            } catch (e) {
                console.error('Error reading candle cache:', e.message);
            }
        }

        // --- ALPACA FETCH ---
        try {
            // Alpaca Symbols: 'BTC/USD'
            const alpacaSymbol = `${symbol.toUpperCase()}/USD`;
            const alpacaTimeframe = interval === '1h' ? '1Hour' : '1Day';

            const barsDict = await alpacaService.getBars([alpacaSymbol], alpacaTimeframe, limit);
            const bars = barsDict[alpacaSymbol];

            if (bars && bars.length > 0) {
                const candles = bars.map(b => ({
                    timestamp: new Date(b[0]),
                    open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5]
                }));

                this._savePriceHistory(coinId, candles);
                console.log(`    ✓ Alpaca: ${candles.length} candles for ${symbol}`);
                return candles;
            } else {
                console.warn(`    ⚠️ Alpaca returned no data for ${alpacaSymbol}`);
            }
        } catch (error) {
            console.error(`    Alpaca error for ${symbol}:`, error.message);
        }

        return [];
    }

    /**
     * Check if fresh candles exist in DB
     */
    _hasFreshCandles(coinId) {
        try {
            const latest = prepare(`
                SELECT timestamp FROM price_history 
                WHERE coin_id = ? 
                ORDER BY timestamp DESC 
                LIMIT 1
            `).get(coinId);

            if (!latest) return false;
            const candleTime = new Date(latest.timestamp).getTime();
            return (Date.now() - candleTime) < 60 * 60 * 1000;
        } catch (e) {
            return false;
        }
    }

    async fetchBTCData() {
        const btc = await this.fetchOHLCV('BTC', 'bitcoin', '1h', 168);
        if (btc.length >= 24) {
            const current = btc[btc.length - 1].close;
            const past24h = btc[btc.length - 25].close;
            const change24h = ((current - past24h) / past24h) * 100;
            return { candles: btc, change24h, currentPrice: current };
        }
        return { candles: btc, change24h: 0, currentPrice: 0 };
    }

    async fetchFearGreedIndex() {
        try {
            const response = await axios.get('https://api.alternative.me/fng/', { timeout: 5000 });
            const data = response.data.data[0];
            return {
                value: parseInt(data.value),
                classification: data.value_classification,
                timestamp: new Date(data.timestamp * 1000)
            };
        } catch (error) {
            console.error('Error fetching Fear & Greed:', error.message);
            return { value: 50, classification: 'Neutral', timestamp: new Date() };
        }
    }

    async collectAllData(coinLimit = 50) {
        console.log('Starting full data collection (Alpaca Powered)...');

        // 1. Fetch top coins
        const coins = await this.fetchTopCoins(coinLimit);
        console.log(`Got ${coins.length} tradeable coins`);

        // 2. Fetch BTC for regime
        console.log('Fetching BTC data...');
        const btcData = await this.fetchBTCData();
        console.log(`BTC 24h change: ${btcData.change24h.toFixed(2)}%`);

        // 3. Fetch Fear & Greed
        const fearGreed = await this.fetchFearGreedIndex();
        console.log(`Fear & Greed: ${fearGreed.value} (${fearGreed.classification})`);

        // 4. Save market regime
        this._saveMarketRegime(btcData.change24h, fearGreed.value);

        // 5. Fetch OHLCV
        const coinsWithData = [];
        const maxCoins = Math.min(coins.length, 30);

        for (let i = 0; i < maxCoins; i++) {
            const coin = coins[i];
            console.log(`[${i + 1}/${maxCoins}] ${coin.symbol.toUpperCase()} (${coin.id})...`);

            const ohlcv = await this.fetchOHLCV(coin.symbol, coin.id);

            if (ohlcv.length >= 30) {
                coinsWithData.push({ ...coin, ohlcv });
            } else {
                console.log(`    ⚠ Skipped (only ${ohlcv.length} candles)`);
            }
        }

        console.log(`\nCollected data for ${coinsWithData.length} tradeable coins`);

        return {
            coins: coinsWithData,
            btc: btcData,
            fearGreed,
            timestamp: new Date()
        };
    }

    // === Private helpers ===

    _saveCoins(coins) {
        const stmt = prepare(`
      INSERT OR REPLACE INTO coins 
      (id, symbol, name, market_cap_rank, market_cap, current_price, total_volume, 
       price_change_24h, price_change_7d, ath, atl, last_updated)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);

        for (const coin of coins) {
            try {
                stmt.run(
                    coin.id, coin.symbol, coin.name, coin.market_cap_rank, coin.market_cap || 0,
                    coin.current_price, coin.total_volume,
                    coin.price_change_percentage_24h || 0,
                    coin.price_change_percentage_7d_in_currency || 0,
                    coin.ath || 0, coin.atl || 0
                );
            } catch (e) { /* ignore */ }
        }
    }

    _savePriceHistory(coinId, candles) {
        const stmt = prepare(`
      INSERT OR REPLACE INTO price_history 
      (coin_id, timestamp, open, high, low, close, volume)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

        for (const candle of candles) {
            try {
                stmt.run(
                    coinId, candle.timestamp.toISOString(),
                    candle.open, candle.high, candle.low, candle.close, candle.volume
                );
            } catch (e) { /* ignore */ }
        }
    }

    _saveMarketRegime(btcChange, fearGreedValue) {
        let regime = 'neutral';
        let multiplier = 1.0;

        if (btcChange < -5 || fearGreedValue < 25) {
            regime = 'risk_off';
            multiplier = 1.25;
        } else if (btcChange > 5 || fearGreedValue > 75) {
            regime = 'risk_on';
            multiplier = 0.85;
        }

        prepare(`
      INSERT INTO market_regime (btc_24h_change, fear_greed_index, regime, threshold_multiplier)
      VALUES (?, ?, ?, ?)
    `).run(btcChange, fearGreedValue, regime, multiplier);
    }
}

module.exports = new DataCollector();
