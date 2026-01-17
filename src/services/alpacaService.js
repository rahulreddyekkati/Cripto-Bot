const axios = require('axios');

/**
 * Alpaca Service
 * Handles both Data API (v1beta3) and Trading API (v2)
 */
class AlpacaService {
    constructor() {
        this.apiKey = process.env.ALPACA_API_KEY;
        this.apiSecret = process.env.ALPACA_SECRET_KEY;

        // Data API (Always Live URL for Crypto Data)
        this.dataUrl = 'https://data.alpaca.markets/v1beta3/crypto/us';

        // Trading API (Depends on Paper vs Live)
        const isPaper = process.env.ALPACA_PAPER === 'true';
        this.tradeUrl = isPaper
            ? 'https://paper-api.alpaca.markets/v2'
            : 'https://api.alpaca.markets/v2';

        if (!this.apiKey || !this.apiSecret) {
            console.warn('⚠️ Alpaca credentials missing. Service disabled.');
        } else {
            console.log(`🦙 Alpaca Service Initialized (Axios Mode) | Trade URL: ${this.tradeUrl}`);
        }
    }

    _getHeaders() {
        return {
            'APCA-API-KEY-ID': this.apiKey,
            'APCA-API-SECRET-KEY': this.apiSecret,
            'Accept': 'application/json'
        };
    }

    // ==========================================
    // DATA METHODS (Market Data)
    // ==========================================

    /**
     * Get historical bars for a list of symbols
     * Endpoint: /bars
     */
    async getBars(symbols, timeframe = '1Hour', limit = 168) {
        if (!this.apiKey) return {};
        try {
            const symbolsParam = symbols.join(',');
            let lookbackHours = limit;
            if (timeframe === '1Day') lookbackHours = limit * 24;
            lookbackHours = Math.ceil(lookbackHours * 1.25);
            const start = new Date(Date.now() - (lookbackHours * 60 * 60 * 1000)).toISOString();

            const response = await axios.get(`${this.dataUrl}/bars`, {
                headers: this._getHeaders(),
                params: { symbols: symbolsParam, timeframe, start, limit, sort: 'asc' },
                timeout: 10000
            });

            const result = {};
            const data = response.data.bars || {};
            for (const sym of symbols) {
                if (data[sym]) {
                    result[sym] = data[sym].map(b => [
                        new Date(b.t).getTime(), b.o, b.h, b.l, b.c, b.v
                    ]);
                }
            }
            return result;
        } catch (error) {
            console.error('Alpaca getBars Error:', error.response?.status, error.message);
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
            const response = await axios.get(`${this.dataUrl}/latest/trades`, {
                headers: this._getHeaders(),
                params: { symbols: symbolsParam },
                timeout: 5000
            });
            const prices = {};
            const data = response.data.trades || {};
            for (const sym of symbols) {
                if (data[sym]) prices[sym] = parseFloat(data[sym].p);
            }
            return prices;
        } catch (error) {
            console.error('Alpaca getLatestPrices Error:', error.message);
            return {};
        }
    }

    // ==========================================
    // TRADING METHODS (Execution)
    // ==========================================

    /**
     * Get Account Info (Buying Power, Cash)
     */
    async getAccount() {
        if (!this.apiKey) return null;
        try {
            const response = await axios.get(`${this.tradeUrl}/account`, {
                headers: this._getHeaders()
            });
            return response.data;
        } catch (error) {
            console.error('Alpaca getAccount Error:', error.response?.status, error.response?.data?.message);
            return null;
        }
    }

    /**
     * Get Open Crypto Positions
     */
    async getPositions() {
        if (!this.apiKey) return [];
        try {
            const response = await axios.get(`${this.tradeUrl}/positions`, {
                headers: this._getHeaders()
            });
            return response.data; // Array of positions
        } catch (error) {
            console.error('Alpaca getPositions Error:', error.response?.status, error.message);
            return [];
        }
    }

    /**
     * Create Order
     * @param {string} symbol - e.g. 'BTC/USD'
     * @param {number} qty - Quantity to buy/sell (Coins) OR notional (USD)
     * @param {string} side - 'buy' or 'sell'
     */
    async createOrder(symbol, qty, side = 'buy') {
        if (!this.apiKey) return null;
        try {
            // Alpaca V2 Order
            const body = {
                symbol: symbol,
                qty: parseFloat(qty).toFixed(4), // Ensure reasonably string format
                side: side,
                type: 'market',
                time_in_force: 'gtc'
            };

            console.log(`🦙 Sending Order: ${side.toUpperCase()} ${qty} ${symbol}`);

            const response = await axios.post(`${this.tradeUrl}/orders`, body, {
                headers: this._getHeaders()
            });
            return response.data;
        } catch (error) {
            console.error(`Alpaca createOrder Error (${symbol}):`, error.response?.data?.message || error.message);
            return null;
        }
    }

    /**
     * Close specific position (Market Sell)
     */
    async closePosition(symbol) {
        if (!this.apiKey) return null;
        try {
            console.log(`🦙 Closing Position: ${symbol}`);
            // Alpaca V2 often works better with symbol in URL
            // Ensure encoding if it contains '/'
            const encodedSym = encodeURIComponent(symbol);
            const response = await axios.delete(`${this.tradeUrl}/positions/${encodedSym}`, {
                headers: this._getHeaders()
            });
            return response.data;
        } catch (error) {
            // If 404, position likely already closed
            if (error.response?.status !== 404) {
                console.error(`Alpaca closePosition Error (${symbol}):`, error.response?.status, error.response?.data?.message);
                console.error('Full Error:', JSON.stringify(error.response?.data || error.message));
            }
            return null;
        }
    }
}

module.exports = new AlpacaService();
