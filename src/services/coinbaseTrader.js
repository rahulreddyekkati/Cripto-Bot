const crypto = require('crypto');
const axios = require('axios');
const priceService = require('./priceService');

/**
 * Coinbase API Trading Service
 * Handles authentication and trading operations with Coinbase
 */
class CoinbaseTrader {
    constructor() {
        this.apiKey = process.env.COINBASE_API_KEY || '';
        this.apiSecret = process.env.COINBASE_API_SECRET || '';
        this.baseUrl = 'https://api.coinbase.com/api/v3/brokerage';
        this.isConfigured = false;
    }

    /**
     * Initialize with API credentials
     */
    configure(apiKey, apiSecret) {
        this.apiKey = apiKey;
        this.apiSecret = apiSecret;
        this.isConfigured = true;
        console.log('✅ Coinbase API configured');
    }

    /**
     * Generate signature for Coinbase API requests
     */
    _generateSignature(timestamp, method, path, body = '') {
        const message = timestamp + method + path + body;
        return crypto
            .createHmac('sha256', this.apiSecret)
            .update(message)
            .digest('hex');
    }

    /**
     * Make authenticated request to Coinbase
     */
    async _request(method, path, body = null) {
        if (!this.isConfigured) {
            throw new Error('Coinbase API not configured. Call configure() first.');
        }

        const timestamp = Math.floor(Date.now() / 1000).toString();
        const bodyStr = body ? JSON.stringify(body) : '';
        const signature = this._generateSignature(timestamp, method, path, bodyStr);

        try {
            const response = await axios({
                method,
                url: `${this.baseUrl}${path}`,
                headers: {
                    'CB-ACCESS-KEY': this.apiKey,
                    'CB-ACCESS-SIGN': signature,
                    'CB-ACCESS-TIMESTAMP': timestamp,
                    'Content-Type': 'application/json'
                },
                data: body,
                timeout: 30000
            });

            return response.data;
        } catch (error) {
            console.error('Coinbase API error:', error.response?.data || error.message);
            throw error;
        }
    }

    /**
     * Get all accounts and balances
     */
    async getAccounts() {
        const response = await this._request('GET', '/accounts');
        return response.accounts || [];
    }

    /**
     * Get USD balance
     */
    async getUSDBalance() {
        const accounts = await this.getAccounts();
        const usdAccount = accounts.find(a => a.currency === 'USD');
        return usdAccount ? parseFloat(usdAccount.available_balance.value) : 0;
    }

    /**
     * Get current price for a trading pair
     * Delegates to PriceService for reliability and caching
     */
    async getPrice(productId) {
        try {
            // productId is usually 'BTC-USD'
            // We want to pass 'BTC' as symbol to PriceService
            // If productId is just 'bitcoin' (CoinGecko ID), we handle that too

            let symbol = null;
            let id = productId;

            if (productId.includes('-')) {
                const parts = productId.split('-');
                symbol = parts[0]; // 'BTC'
                id = null; // We don't know the CoinGecko ID for sure, but PriceService can try Binance with Symbol
            } else {
                // Assume it's a CoinGecko ID logic might have passed (e.g. 'bitcoin')
                // But checks above suggest 'chiliz' was passed.
                // We'll pass it as ID.
                id = productId;
            }

            // Use PriceService (Binance -> CoinGecko Fallback)
            const price = await priceService.getPrice(id, symbol);

            if (!price) {
                // If PriceService failed (maybe because ID was null and Binance failed),
                // we could try one last raw Coinbase call? 
                // No, better to trust the robust service.
                console.warn(`PriceService returned null for ${productId}`);
                return null;
            }

            return price;
        } catch (error) {
            console.error(`Error getting price for ${productId}:`, error.message);
            return null;
        }
    }

    /**
     * Place a market buy order
     */
    async marketBuy(productId, usdAmount) {
        const order = {
            client_order_id: `buy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            product_id: productId, // e.g., 'BTC-USD'
            side: 'BUY',
            order_configuration: {
                market_market_ioc: {
                    quote_size: usdAmount.toFixed(2)
                }
            }
        };

        console.log(`📈 Placing market BUY order: $${usdAmount} of ${productId}`);
        const result = await this._request('POST', '/orders', order);

        return {
            success: result.success,
            orderId: result.order_id,
            productId,
            side: 'BUY',
            amount: usdAmount,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Place a market sell order
     */
    async marketSell(productId, coinAmount) {
        const order = {
            client_order_id: `sell_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            product_id: productId,
            side: 'SELL',
            order_configuration: {
                market_market_ioc: {
                    base_size: coinAmount.toString()
                }
            }
        };

        console.log(`📉 Placing market SELL order: ${coinAmount} of ${productId}`);
        const result = await this._request('POST', '/orders', order);

        return {
            success: result.success,
            orderId: result.order_id,
            productId,
            side: 'SELL',
            amount: coinAmount,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Get order history
     */
    async getOrders(limit = 50) {
        const response = await this._request('GET', `/orders/historical/batch?limit=${limit}`);
        return response.orders || [];
    }

    /**
     * Get portfolio value
     */
    async getPortfolioValue() {
        const accounts = await this.getAccounts();
        let totalUSD = 0;

        for (const account of accounts) {
            const balance = parseFloat(account.available_balance.value);
            if (balance > 0) {
                if (account.currency === 'USD') {
                    totalUSD += balance;
                } else {
                    const price = await this.getPrice(`${account.currency}-USD`);
                    if (price) {
                        totalUSD += balance * price;
                    }
                }
            }
        }

        return totalUSD;
    }

    /**
     * Execute a trade based on prediction
     */
    async executeTrade(prediction, maxInvestment) {
        if (!this.isConfigured) {
            return { success: false, error: 'Coinbase not configured' };
        }

        const productId = `${prediction.symbol}-USD`;
        const currentBalance = await this.getUSDBalance();

        if (currentBalance < maxInvestment) {
            return {
                success: false,
                error: `Insufficient balance. Have: $${currentBalance}, Need: $${maxInvestment}`
            };
        }

        try {
            // Only buy if prediction confidence is high enough
            if (prediction.mlProbability >= 0.6 && prediction.sentimentScore > 0) {
                const result = await this.marketBuy(productId, maxInvestment);
                return {
                    success: true,
                    action: 'BUY',
                    ...result,
                    reason: `High probability (${(prediction.mlProbability * 100).toFixed(0)}%) + Positive sentiment`
                };
            }

            return {
                success: false,
                action: 'HOLD',
                reason: 'Conditions not met for trade'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
}

module.exports = new CoinbaseTrader();
