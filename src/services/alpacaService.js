const axios = require('axios');

class AlpacaService {
    constructor() {
        this.apiKey = process.env.ALPACA_API_KEY;
        this.apiSecret = process.env.ALPACA_SECRET_KEY;
        this.baseUrl = 'https://data.alpaca.markets/v1beta3/crypto/us'; // Data API is always Live, keys authorize it

        if (!this.apiKey || !this.apiSecret) {
            console.warn('⚠️ Alpaca credentials missing. Service disabled.');
        } else {
            console.log('🦙 Alpaca Service Initialized (Axios Mode)');
        }
    }

    _getHeaders() {
        return {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
            'Accept': 'application/json'
        };
    }

    /**
     * Get historical bars for a list of symbols
     * Endpoint: /bars
     */
    async getBars(symbols, timeframe = '1Hour', limit = 168) {
        if (!this.apiKey) return {};

        try {
            // Join symbols with comma
            const symbolsParam = symbols.join(',');

            // Calculate start time (Alpaca defaults to 'today' if not specified)
            // We want 'limit' candles back. 
            // 1Hour -> limit hours ago
            // 1Day -> limit days ago
            let lookbackHours = limit;
            if (timeframe === '1Day') lookbackHours = limit * 24;

            // Add a buffer of 20% to be safe
            lookbackHours = Math.ceil(lookbackHours * 1.25);

            // Calculate start time relative to NOW
            const start = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000)).toISOString();

            const response = await axios.get(`${this.baseUrl}/bars`, {
                headers: this._getHeaders(),
                params: {
                    symbols: symbolsParam,
                    timeframe: timeframe,
                    start: start,
                    limit: limit,
                    sort: 'asc'
                },
                timeout: 10000
            });

            // Struct: { bars: { "BTC/USD": [ { t, o, h, l, c, v }, ... ] } }
            const result = {};
            const data = response.data.bars || {};

            for (const sym of symbols) {
                if (data[sym]) {
                    result[sym] = data[sym].map(b => [
                        new Date(b.t).getTime(), // timestamp
                        b.o, // open
                        b.h, // high
                        b.l, // low
                        b.c, // close
                        b.v  // volume
                    ]);
                }
            }
            return result;

        } catch (error) {
            console.error('Alpaca getBars Error:', error.response?.status, error.response?.data?.message || error.message);
            return {};
        }
    }

    /**
     * Get latest trades for price check
     * Endpoint: /latest/trades
     */
    async getLatestPrices(symbols) {
        if (!this.apiKey) return {};

        try {
            const symbolsParam = symbols.join(',');

            const response = await axios.get(`${this.baseUrl}/latest/trades`, {
                headers: this._getHeaders(),
                params: {
                    symbols: symbolsParam
                },
                timeout: 5000
            });

            // Struct: { trades: { "BTC/USD": { t, p, s, ... } } }
            const prices = {};
            const data = response.data.trades || {};

            for (const sym of symbols) {
                if (data[sym]) {
                    prices[sym] = parseFloat(data[sym].p);
                }
            }
            return prices;

        } catch (error) {
            console.error('Alpaca getLatestPrices Error:', error.response?.status, error.response?.data?.message || error.message);
            return {};
        }
    }
}

module.exports = new AlpacaService();
