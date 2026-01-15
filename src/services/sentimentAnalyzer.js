/**
 * Sentiment Analyzer Service
 * Analyzes news headlines and text for bullish/bearish sentiment
 */
class SentimentAnalyzer {
    constructor() {
        // Bullish keywords and their weights
        this.bullishKeywords = {
            // Strong bullish
            'moon': 3, 'surge': 3, 'soar': 3, 'skyrocket': 3, 'breakout': 3,
            'ath': 3, 'all-time high': 3, 'rally': 2.5, 'pump': 2.5,

            // Partnership & adoption
            'partnership': 2.5, 'adoption': 2.5, 'institutional': 2.5,
            'approve': 2.5, 'approved': 2.5, 'etf': 2.5, 'launch': 2,

            // Positive sentiment
            'bullish': 2, 'gain': 2, 'growth': 2, 'rise': 1.5, 'rising': 1.5,
            'up': 1, 'higher': 1.5, 'breakthrough': 2, 'milestone': 2,

            // Investment
            'buy': 1.5, 'accumulate': 2, 'invest': 1.5, 'upgrade': 2,
            'outperform': 2, 'undervalued': 2, 'opportunity': 1.5,

            // Technical
            'support': 1, 'breakout': 2, 'golden cross': 2.5, 'reversal': 1.5
        };

        // Bearish keywords and their weights
        this.bearishKeywords = {
            // Strong bearish
            'crash': -3, 'plunge': -3, 'collapse': -3, 'scam': -3,
            'hack': -3, 'hacked': -3, 'exploit': -3, 'rug pull': -3,

            // Regulatory
            'ban': -2.5, 'banned': -2.5, 'lawsuit': -2.5, 'sec': -1.5,
            'investigation': -2, 'regulation': -1, 'crackdown': -2.5,

            // Negative sentiment
            'bearish': -2, 'dump': -2.5, 'sell': -1.5, 'selling': -1.5,
            'fall': -1.5, 'falling': -1.5, 'decline': -2, 'drop': -1.5,
            'down': -1, 'lower': -1.5, 'fear': -1.5, 'panic': -2,

            // Technical
            'resistance': -1, 'death cross': -2.5, 'breakdown': -2,
            'support broken': -2.5, 'bearish divergence': -2,

            // Risk
            'risk': -1, 'warning': -1.5, 'concern': -1.5, 'uncertain': -1,
            'volatile': -0.5, 'bubble': -2, 'overvalued': -2
        };

        // Intensity modifiers
        this.intensifiers = {
            'very': 1.5, 'extremely': 2, 'massive': 1.8, 'huge': 1.7,
            'significant': 1.4, 'major': 1.5, 'breaking': 1.6
        };
    }

    /**
     * Analyze sentiment of a single text
     * Returns score from -1 (very bearish) to +1 (very bullish)
     */
    analyze(text) {
        if (!text) return { score: 0, label: 'neutral', confidence: 0 };

        const textLower = text.toLowerCase();
        let score = 0;
        let matchCount = 0;
        const matches = { bullish: [], bearish: [] };

        // Check for intensifiers
        let intensityMultiplier = 1;
        for (const [word, multiplier] of Object.entries(this.intensifiers)) {
            if (textLower.includes(word)) {
                intensityMultiplier = Math.max(intensityMultiplier, multiplier);
            }
        }

        // Check bullish keywords
        for (const [keyword, weight] of Object.entries(this.bullishKeywords)) {
            if (textLower.includes(keyword)) {
                score += weight * intensityMultiplier;
                matchCount++;
                matches.bullish.push(keyword);
            }
        }

        // Check bearish keywords
        for (const [keyword, weight] of Object.entries(this.bearishKeywords)) {
            if (textLower.includes(keyword)) {
                score += weight * intensityMultiplier; // weight is already negative
                matchCount++;
                matches.bearish.push(keyword);
            }
        }

        // Normalize score to -1 to +1 range
        const normalizedScore = Math.max(-1, Math.min(1, score / 10));

        // Calculate confidence based on match count
        const confidence = Math.min(1, matchCount / 5);

        return {
            score: parseFloat(normalizedScore.toFixed(3)),
            label: this._getLabel(normalizedScore),
            confidence: parseFloat(confidence.toFixed(2)),
            matches,
            rawScore: score
        };
    }

    /**
     * Analyze multiple news articles and aggregate sentiment
     */
    analyzeArticles(articles) {
        if (!articles || articles.length === 0) {
            return {
                aggregateScore: 0,
                label: 'neutral',
                confidence: 0,
                articleCount: 0,
                breakdown: { bullish: 0, bearish: 0, neutral: 0 }
            };
        }

        const results = articles.map(article => {
            const text = `${article.title} ${article.body || ''}`;
            const sentiment = this.analyze(text);

            // Weight by recency (newer articles matter more)
            const hoursOld = (Date.now() - new Date(article.publishedAt).getTime()) / (1000 * 60 * 60);
            const recencyWeight = Math.max(0.3, 1 - (hoursOld / 48)); // Decay over 48 hours

            return {
                ...sentiment,
                title: article.title,
                recencyWeight,
                weightedScore: sentiment.score * recencyWeight
            };
        });

        // Calculate weighted average
        const totalWeight = results.reduce((sum, r) => sum + r.recencyWeight, 0);
        const weightedSum = results.reduce((sum, r) => sum + r.weightedScore, 0);
        const aggregateScore = totalWeight > 0 ? weightedSum / totalWeight : 0;

        // Count breakdown
        const breakdown = {
            bullish: results.filter(r => r.score > 0.1).length,
            bearish: results.filter(r => r.score < -0.1).length,
            neutral: results.filter(r => r.score >= -0.1 && r.score <= 0.1).length
        };

        // Average confidence
        const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;

        return {
            aggregateScore: parseFloat(aggregateScore.toFixed(3)),
            label: this._getLabel(aggregateScore),
            confidence: parseFloat(avgConfidence.toFixed(2)),
            articleCount: articles.length,
            breakdown,
            topBullish: results.filter(r => r.score > 0.3).slice(0, 3),
            topBearish: results.filter(r => r.score < -0.3).slice(0, 3)
        };
    }

    /**
     * Get sentiment label from score
     */
    _getLabel(score) {
        if (score >= 0.5) return 'very_bullish';
        if (score >= 0.2) return 'bullish';
        if (score >= 0.05) return 'slightly_bullish';
        if (score <= -0.5) return 'very_bearish';
        if (score <= -0.2) return 'bearish';
        if (score <= -0.05) return 'slightly_bearish';
        return 'neutral';
    }

    /**
     * Get emoji for sentiment
     */
    getEmoji(label) {
        const emojis = {
            'very_bullish': '🚀',
            'bullish': '🟢',
            'slightly_bullish': '📈',
            'neutral': '⚪',
            'slightly_bearish': '📉',
            'bearish': '🔴',
            'very_bearish': '💀'
        };
        return emojis[label] || '⚪';
    }
}

module.exports = new SentimentAnalyzer();
