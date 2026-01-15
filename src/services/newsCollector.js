const axios = require('axios');

/**
 * News Collector Service
 * Fetches crypto news from multiple sources for sentiment analysis
 */
class NewsCollector {
    constructor() {
        // Free crypto news APIs
        this.sources = {
            cryptoCompare: 'https://min-api.cryptocompare.com/data/v2/news/',
            coinGecko: 'https://api.coingecko.com/api/v3'
        };
        this.cache = new Map();
        this.cacheExpiry = 15 * 60 * 1000; // 15 minutes
    }

    /**
     * Get news for a specific coin
     */
    async getNewsForCoin(symbol) {
        const cacheKey = `news_${symbol}`;
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const news = await this._fetchFromCryptoCompare(symbol);
            const result = {
                symbol,
                articles: news,
                fetchedAt: new Date().toISOString(),
                articleCount: news.length
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            console.error(`Error fetching news for ${symbol}:`, error.message);
            return { symbol, articles: [], fetchedAt: new Date().toISOString(), articleCount: 0 };
        }
    }

    /**
     * Fetch news from CryptoCompare API
     */
    async _fetchFromCryptoCompare(symbol) {
        try {
            const response = await axios.get(this.sources.cryptoCompare, {
                params: {
                    categories: symbol.toUpperCase(),
                    excludeCategories: 'Sponsored',
                    lang: 'EN'
                },
                timeout: 10000
            });

            if (response.data && response.data.Data) {
                return response.data.Data.slice(0, 20).map(article => ({
                    id: article.id,
                    title: article.title,
                    body: article.body?.substring(0, 500) || '',
                    source: article.source_info?.name || 'Unknown',
                    url: article.url,
                    publishedAt: new Date(article.published_on * 1000).toISOString(),
                    categories: article.categories?.split('|') || [],
                    imageUrl: article.imageurl
                }));
            }
            return [];
        } catch (error) {
            console.error('CryptoCompare API error:', error.message);
            return [];
        }
    }

    /**
     * Get trending news across all crypto
     */
    async getTrendingNews() {
        const cacheKey = 'trending_news';
        const cached = this.cache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.data;
        }

        try {
            const response = await axios.get(this.sources.cryptoCompare, {
                params: {
                    sortOrder: 'popular',
                    excludeCategories: 'Sponsored',
                    lang: 'EN'
                },
                timeout: 10000
            });

            const articles = response.data?.Data?.slice(0, 30).map(article => ({
                id: article.id,
                title: article.title,
                body: article.body?.substring(0, 500) || '',
                source: article.source_info?.name || 'Unknown',
                url: article.url,
                publishedAt: new Date(article.published_on * 1000).toISOString(),
                categories: article.categories?.split('|') || [],
                coins: this._extractCoinsFromText(article.title + ' ' + (article.body || ''))
            })) || [];

            const result = {
                articles,
                fetchedAt: new Date().toISOString(),
                totalCount: articles.length
            };

            this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        } catch (error) {
            console.error('Error fetching trending news:', error.message);
            return { articles: [], fetchedAt: new Date().toISOString(), totalCount: 0 };
        }
    }

    /**
     * Get news volume (buzz) for a coin - how much it's being talked about
     */
    async getNewsBuzz(symbol) {
        const news = await this.getNewsForCoin(symbol);
        const now = Date.now();
        const oneDayAgo = now - 24 * 60 * 60 * 1000;

        const recentArticles = news.articles.filter(a =>
            new Date(a.publishedAt).getTime() > oneDayAgo
        );

        return {
            symbol,
            totalArticles24h: recentArticles.length,
            buzzLevel: this._calculateBuzzLevel(recentArticles.length),
            sources: [...new Set(recentArticles.map(a => a.source))],
            latestHeadline: recentArticles[0]?.title || null
        };
    }

    /**
     * Calculate buzz level based on article count
     */
    _calculateBuzzLevel(count) {
        if (count >= 10) return 'very_high';
        if (count >= 5) return 'high';
        if (count >= 3) return 'medium';
        if (count >= 1) return 'low';
        return 'none';
    }

    /**
     * Extract coin mentions from text
     */
    _extractCoinsFromText(text) {
        const coinPatterns = [
            { symbol: 'BTC', names: ['bitcoin', 'btc'] },
            { symbol: 'ETH', names: ['ethereum', 'eth', 'ether'] },
            { symbol: 'SOL', names: ['solana', 'sol'] },
            { symbol: 'XRP', names: ['ripple', 'xrp'] },
            { symbol: 'ADA', names: ['cardano', 'ada'] },
            { symbol: 'AVAX', names: ['avalanche', 'avax'] },
            { symbol: 'DOT', names: ['polkadot', 'dot'] },
            { symbol: 'MATIC', names: ['polygon', 'matic'] },
            { symbol: 'LINK', names: ['chainlink', 'link'] },
            { symbol: 'DOGE', names: ['dogecoin', 'doge'] },
            { symbol: 'SHIB', names: ['shiba', 'shib'] },
            { symbol: 'LTC', names: ['litecoin', 'ltc'] }
        ];

        const textLower = text.toLowerCase();
        const mentioned = [];

        for (const coin of coinPatterns) {
            if (coin.names.some(name => textLower.includes(name))) {
                mentioned.push(coin.symbol);
            }
        }

        return mentioned;
    }

    /**
     * Get news for multiple coins at once
     */
    async getBatchNews(symbols) {
        const results = await Promise.all(
            symbols.map(symbol => this.getNewsForCoin(symbol))
        );

        return results.reduce((acc, result) => {
            acc[result.symbol] = result;
            return acc;
        }, {});
    }
}

module.exports = new NewsCollector();
