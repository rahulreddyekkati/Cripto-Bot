const axios = require('axios');

/**
 * PriceService
 * centralized service for fetching crypto prices with caching and batching
 * to avoid API rate limits (429 errors).
 */
class PriceService {
    constructor() {
        this.cache = new Map();
        this.cacheTTL = 15 * 1000; // 15 seconds cache (better for trading)
        this.requestQueue = [];
        this.pendingRequests = new Map(); // Single-flight de-duplication
        this.batchDelay = 200; // Wait 200ms to gather requests

        // Metrics
        this.metrics = {
            requestsTotal: 0,
            requestsBatched: 0,
            cacheHits: 0,
            cacheMisses: 0,
            errors429: 0,
            apiCalls: 0
        };
    }

    /**
     * Get price for a single symbol
     * @param {string} id - CoinGecko ID (e.g. 'bitcoin')
     * @param {string} symbol - Ticker symbol (e.g. 'BTC') - OPTIONAL but recommended for Binance
     * @param {boolean} forceRefresh - Bypass cache
     */
    async getPrice(id, symbol = null, forceRefresh = false) {
        // If ID is missing but symbol is provided, use symbol as ID (for cache/tracking)
        if (!id && symbol) {
            id = `SYM:${symbol}`; // Namespace it to avoid collisions
        }

        if (!id) return null;
        this.metrics.requestsTotal++;

        // Check pending requests (single-flight) using ID
        if (this.pendingRequests.has(id)) {
            return this.pendingRequests.get(id);
        }

        // Check cache
        const cached = this.cache.get(id);
        if (!forceRefresh && cached && Date.now() - cached.timestamp < this.cacheTTL) {
            this.metrics.cacheHits++;
            return cached.price;
        }

        this.metrics.cacheMisses++;

        // Create promise for this fetch
        const promise = new Promise(async (resolve) => {
            let price = null;

            // 1. TRY BINANCE FIRST (If symbol provided)
            if (symbol) {
                try {
                    // Try to fetch from Binance (Real-time, cheap)
                    // Use data-api.binance.vision for better global access (avoids US geo-block)
                    const binanceSymbol = `${symbol.toUpperCase()}USDT`;
                    const response = await axios.get(
                        `https://data-api.binance.vision/api/v3/ticker/price?symbol=${binanceSymbol}`,
                        { timeout: 2000 }
                    );

                    if (response.data && response.data.price) {
                        price = parseFloat(response.data.price);
                        // Save to cache
                        this.cache.set(id, { price, timestamp: Date.now() });
                        resolve(price);
                        return;
                    }
                } catch (e) {
                    // Ignore Binance errors (404 if pair doesn't exist)
                    // console.log(`Binance check failed: ${e.message}`);
                }
            }

            // 2. FALLBACK TO COINGECKO BATCH (If Binance failed or no symbol)
            this.requestQueue.push({ symbol: id, resolve });
            this._schedule(this._processQueue.bind(this));
        });

        // Store pending promise
        this.pendingRequests.set(id, promise);

        // Cleanup
        promise.finally(() => {
            if (this.pendingRequests.get(id) === promise) {
                this.pendingRequests.delete(id);
            }
        });

        return promise;
    }

    /**
     * Get prices for multiple symbols
     * @param {Array<{id: string, symbol: string}> | string[]} items - List of coins
     * @param {boolean} forceRefresh
     */
    async getPrices(items, forceRefresh = false) {
        const result = {};
        const promises = [];

        // Normalize input to array of objects if strings passed
        const targets = items.map(i =>
            typeof i === 'string' ? { id: i, symbol: null } : i
        );

        for (const target of targets) {
            // We use getPrice() for each because it handles:
            // 1. Caching
            // 2. Single-flighting
            // 3. Binance priority
            // 4. Batch queueing for fallbacks
            // Since getPrice detects single-flight, calling it in a loop is efficient.

            promises.push(
                this.getPrice(target.id, target.symbol, forceRefresh)
                    .then(price => {
                        result[target.id] = price;
                    })
            );
        }

        await Promise.all(promises);
        return result;
    }

    /**
     * Schedule a batch process run
     */
    _schedule(fn) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this._processQueue(), this.batchDelay + Math.random() * 100); // Add jitter
    }

    /**
     * Process the queued requests in fewer API calls
     */
    async _processQueue() {
        if (this.requestQueue.length === 0) return;

        const queue = [...this.requestQueue];
        this.requestQueue = []; // Clear main queue

        const symbols = [...new Set(queue.map(i => i.symbol))]; // Unique IDs to fetch from CG

        try {
            const prices = await this._fetchBatchWithBackoff(symbols);
            this.metrics.requestsBatched += symbols.length;

            // Resolve all promises
            queue.forEach(req => {
                req.resolve(prices[req.symbol] || null);
            });
        } catch (error) {
            console.error('Batch price fetch failed:', error.message);
            // Resolve with null on error
            queue.forEach(req => req.resolve(null));
        }
    }

    /**
     * Fetch batch with exponential backoff for 429s (CoinGecko)
     */
    async _fetchBatchWithBackoff(symbols, attempt = 0) {
        if (symbols.length === 0) return {};

        try {
            this.metrics.apiCalls++;
            // Console minimal log every 10 calls to reduce noise
            if (this.metrics.apiCalls % 10 === 0) {
                console.log(`[PriceService] Stats: ${JSON.stringify(this.metrics)}`);
            }

            const ids = symbols.join(',');
            const response = await axios.get(
                `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`,
                { timeout: 10000 }
            );

            const data = response.data;
            const result = {};

            symbols.forEach(sym => {
                const price = data[sym]?.usd;
                if (price) {
                    this.cache.set(sym, {
                        price,
                        timestamp: Date.now()
                    });
                    result[sym] = price;
                }
            });

            return result;

        } catch (error) {
            if (error.response?.status === 429) {
                this.metrics.errors429++;

                if (attempt >= 2) {
                    console.warn(`⚠️ API Rate Limit (429) - Max retries reached for batch`);
                    // return empty result, don't crash
                    return {};
                }

                // Respect Retry-After if present, else exponential backoff
                const retryAfter = parseInt(error.response.headers['retry-after'] || 0) * 1000;
                const backoff = retryAfter || Math.min(1000 * Math.pow(2, attempt), 5000);
                const jitter = Math.random() * 500;

                console.warn(`⚠️ API 429 - Backing off for ${backoff + jitter}ms (Attempt ${attempt + 1})`);

                await new Promise(r => setTimeout(r, backoff + jitter));
                return this._fetchBatchWithBackoff(symbols, attempt + 1);
            }

            console.error('Error fetching batch:', error.message);
            return {};
        }
    }
}

module.exports = new PriceService();
