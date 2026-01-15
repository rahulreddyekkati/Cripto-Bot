const axios = require('axios');
const { initDb, prepare, saveDb } = require('../db/database');

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';
const BINANCE_BASE = 'https://data-api.binance.vision/api/v3';

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Add jitter to avoid synchronized retries
function jitter(ms) {
    return ms + Math.floor(Math.random() * 5000);
}

// Exponential backoff retry wrapper for CoinGecko
async function withRetry(fn, { retries = 5, baseDelay = 10000 } = {}) {
    let attempt = 0;
    while (true) {
        try {
            return await fn();
        } catch (err) {
            const status = err?.response?.status;
            if (status !== 429 || attempt >= retries) throw err;

            const wait = Math.min(90000, baseDelay * (2 ** attempt));
            console.log(`    CoinGecko 429 → waiting ${Math.round(jitter(wait) / 1000)}s (attempt ${attempt + 1})`);
            await sleep(jitter(wait));
            attempt++;
        }
    }
}

// Bad symbols to filter out (stablecoins, pegged assets)
const BAD_SYMBOLS = new Set([
    'usdt', 'usdc', 'busd', 'dai', 'tusd', 'usdp', 'usdd', 'frax', 'gusd',
    'usde', 'fdusd', 'pyusd', 'susde', 'usdt0', 'usd1', 'bsc-usd', 'paxg',
    'weth', 'wbnb', 'wbtc', 'steth', 'wsteth', 'cbeth', 'reth'
]);

class DataCollector {
    constructor() {
        this.cache = new Map();
        this.lastCoinGeckoCall = 0;
        this.minCoinGeckoInterval = 2500;
        this.dbReady = false;
        this.binancePairs = null; // Cache of valid Binance trading pairs
    }

    async ensureDb() {
        if (!this.dbReady) {
            await initDb();
            this.dbReady = true;
        }
    }

    /**
     * Cache valid Binance USDT pairs at startup
     */
    async loadBinancePairs() {
        if (this.binancePairs) return this.binancePairs;

        try {
            console.log('Loading Binance trading pairs...');
            const response = await axios.get(`${BINANCE_BASE}/exchangeInfo`, { timeout: 10000 });

            this.binancePairs = new Set(
                response.data.symbols
                    .filter(s => s.quoteAsset === 'USDT' && s.status === 'TRADING')
                    .map(s => s.symbol)
            );

            console.log(`  Cached ${this.binancePairs.size} valid USDT pairs`);
            return this.binancePairs;
        } catch (error) {
            console.error('Failed to load Binance pairs:', error.message);
            this.binancePairs = new Set();
            return this.binancePairs;
        }
    }

    /**
     * Check if a symbol has a valid Binance USDT pair
     */
    hasBinancePair(symbol) {
        if (!this.binancePairs) return false;
        return this.binancePairs.has(`${symbol.toUpperCase()}USDT`);
    }

    /**
     * Fetch top coins by volume - Checks DB cache first!
     */
    async fetchTopCoins(limit = 100) {
        await this.ensureDb();
        await this.loadBinancePairs();

        // 1. Check DB for fresh data (less than 1 hour old)
        try {
            const cached = prepare(`
                SELECT * FROM coins 
                WHERE last_updated > datetime('now', '-1 hour')
                ORDER BY market_cap_rank ASC 
                LIMIT ?
            `).all(limit);

            if (cached.length >= limit * 0.8) { // If we have at least 80% of requested data valid
                console.log(`Using cached coin list (${cached.length} coins less than 1h old)`);
                return cached;
            }
        } catch (e) {
            console.error('Error reading coin cache:', e.message);
        }

        console.log(`Fetching top ${limit} coins from CoinGecko...`);

        const coins = [];
        const perPage = 100;
        const pages = Math.ceil(limit / perPage);

        for (let page = 1; page <= pages; page++) {
            await this._rateLimitCoinGecko();

            try {
                const response = await withRetry(() =>
                    axios.get(`${COINGECKO_BASE}/coins/markets`, {
                        params: {
                            vs_currency: 'usd',
                            order: 'volume_desc',
                            per_page: perPage,
                            page: page,
                            sparkline: true,
                            price_change_percentage: '24h,7d'
                        },
                        timeout: 15000
                    })
                );

                coins.push(...response.data);
                console.log(`  Page ${page}/${pages} fetched (${response.data.length} coins)`);
            } catch (error) {
                console.error(`Error fetching page ${page}:`, error.response?.status, error.message);
            }
        }

        // --- FALLBACK SAFETY NET (For Cloud Deployments) ---
        if (coins.length === 0) {
            console.warn("⚠️ CoinGecko blocked us (0 coins fetched). Using EMERGENCY FALLBACK list.");
            const fallbackMap = {
                'bitcoin': 'btc', 'ethereum': 'eth', 'binancecoin': 'bnb', 'solana': 'sol', 'ripple': 'xrp',
                'cardano': 'ada', 'dogecoin': 'doge', 'avalanche-2': 'avax', 'shiba-inu': 'shib', 'polkadot': 'dot',
                'chainlink': 'link', 'tron': 'trx', 'matic-network': 'pol', 'litecoin': 'ltc', 'near': 'near',
                'uniswap': 'uni', 'internet-computer': 'icp', 'stellar': 'xlm', 'monero': 'xmr', 'cosmos': 'atom',
                'pepe': 'pepe', 'aptos': 'apt', 'filecoin': 'fil', 'render-token': 'render', 'hedera-hashgraph': 'hbar'
            };

            const fallbackIds = Object.keys(fallbackMap);

            // Create fake coin objects for the fallback list
            for (let i = 0; i < fallbackIds.length; i++) {
                const id = fallbackIds[i];
                coins.push({
                    id: id,
                    symbol: fallbackMap[id], // Correct symbol (e.g. 'eth')
                    name: id,
                    market_cap_rank: i + 1,
                    current_price: 0,
                    total_volume: 100_000_000_000,
                    price_change_percentage_24h: 0
                });
            }
            console.log(`✅ Loaded ${coins.length} fallback coins.`);
        }
        // ---------------------------------------------------

        // === STRONG FILTERING ===
        const filtered = coins.filter(c => {
            const sym = (c.symbol || '').toLowerCase();
            const id = (c.id || '').toLowerCase();
            const name = (c.name || '').toLowerCase();

            // Remove stablecoins + pegged assets
            if (BAD_SYMBOLS.has(sym)) return false;
            if (name.includes('usd') && (sym.startsWith('us') || sym.includes('usd'))) return false;

            // Remove wrapped/bridged/L2 synthetic junk
            if (id.includes('wrapped') || id.includes('bridged') || id.includes('l2-') || id.includes('wormhole')) return false;
            if (name.includes('wrapped') || name.includes('bridged')) return false;
            if (sym.startsWith('w') && ['weth', 'wbnb', 'wbtc'].includes(sym)) return false;

            // Volume sanity - minimum $10M daily volume
            if ((c.total_volume || 0) < 10_000_000) return false;

            return true;
        });

        console.log(`  Filtered to ${filtered.length} tradeable coins (from ${coins.length})`);

        this._saveCoins(filtered);
        return filtered.slice(0, limit);
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

            // If latest candle is less than 60 mins old, we consider it fresh enough for restart
            const candleTime = new Date(latest.timestamp).getTime();
            const diff = Date.now() - candleTime;
            return diff < 60 * 60 * 1000;
        } catch (e) {
            return false;
        }
    }

    /**
     * Fetch OHLCV data - checks Binance pair first, then tries, then fallback
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

                // Map back to proper types (SQLite returns ISO strings for dates)
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

        const binanceSymbol = `${symbol.toUpperCase()}USDT`;

        // ... (rest of function continues below)

        // Only try Binance if we know the pair exists
        if (this.hasBinancePair(symbol)) {
            try {
                const response = await axios.get(`${BINANCE_BASE}/klines`, {
                    params: { symbol: binanceSymbol, interval, limit },
                    timeout: 10000
                });

                const candles = response.data.map(candle => ({
                    timestamp: new Date(candle[0]),
                    open: parseFloat(candle[1]),
                    high: parseFloat(candle[2]),
                    low: parseFloat(candle[3]),
                    close: parseFloat(candle[4]),
                    volume: parseFloat(candle[5])
                }));

                this._savePriceHistory(coinId, candles);
                console.log(`    ✓ Binance: ${candles.length} candles`);
                return candles;

            } catch (error) {
                console.log(`    Binance error: ${error.response?.status || ''} ${error.message}`);
            }
        } else {
            console.log(`    No Binance pair for ${symbol}, using CoinGecko...`);
        }

        // Fallback to CoinGecko
        return this.fetchOHLCVFromCoinGecko(coinId);
    }

    /**
     * Fetch from CoinGecko with proper retry wrapper
     */
    async fetchOHLCVFromCoinGecko(coinId, days = 30) {
        await this._rateLimitCoinGecko();

        try {
            const response = await withRetry(() =>
                axios.get(`${COINGECKO_BASE}/coins/${coinId}/ohlc`, {
                    params: { vs_currency: 'usd', days },
                    timeout: 15000
                })
            );

            const candles = response.data.map(([timestamp, open, high, low, close]) => ({
                timestamp: new Date(timestamp),
                open, high, low, close,
                volume: 0
            }));

            this._savePriceHistory(coinId, candles);
            console.log(`    ✓ CoinGecko: ${candles.length} candles`);
            return candles;

        } catch (error) {
            const status = error.response?.status;
            if (status === 404) {
                console.log(`    CoinGecko 404 for ${coinId}`);
            } else {
                console.log(`    CoinGecko error ${status || ''}: ${error.message}`);
            }
            return [];
        }
    }

    /**
     * Fetch BTC data for correlation and regime detection
     */
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

    /**
     * Fetch Fear & Greed Index
     */
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

    /**
     * Get all data for a list of coins
     */
    async collectAllData(coinLimit = 50) {
        console.log('Starting full data collection...');

        // 1. Fetch top coins (will also cache Binance pairs)
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

        // 5. Fetch OHLCV for each coin
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

            if ((i + 1) % 10 === 0) {
                console.log(`Progress: ${i + 1}/${maxCoins} coins processed, ${coinsWithData.length} valid`);
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

    async _rateLimitCoinGecko() {
        const now = Date.now();
        const elapsed = now - this.lastCoinGeckoCall;
        if (elapsed < this.minCoinGeckoInterval) {
            await sleep(this.minCoinGeckoInterval - elapsed);
        }
        this.lastCoinGeckoCall = Date.now();
    }

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
                    coin.id, coin.symbol, coin.name, coin.market_cap_rank, coin.market_cap,
                    coin.current_price, coin.total_volume,
                    coin.price_change_percentage_24h || 0,
                    coin.price_change_percentage_7d_in_currency || 0,
                    coin.ath, coin.atl
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
