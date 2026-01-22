const fs = require('fs');
const path = require('path');

/**
 * Position Tracker
 * Tracks peak prices and initial TP for trailing stop logic
 */
class PositionTracker {
    constructor() {
        this.dataFile = path.join(__dirname, '../../data/position_peaks.json');
        this.positions = this.loadPositions();
    }

    loadPositions() {
        try {
            if (fs.existsSync(this.dataFile)) {
                const data = fs.readFileSync(this.dataFile, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading position peaks:', error.message);
        }
        return {};
    }

    savePositions() {
        try {
            const dir = path.dirname(this.dataFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataFile, JSON.stringify(this.positions, null, 2));
        } catch (error) {
            console.error('Error saving position peaks:', error.message);
        }
    }

    /**
     * Initialize position tracking when first opened
     */
    initPosition(symbol, entryPrice, initialTP) {
        if (!this.positions[symbol]) {
            this.positions[symbol] = {
                entryPrice: entryPrice,
                initialTP: initialTP,
                peakPrice: entryPrice,
                lastUpdate: new Date().toISOString()
            };
            this.savePositions();
            console.log(`📍 Initialized tracking for ${symbol}: Entry $${entryPrice}, Initial TP $${initialTP}`);
        }
    }

    /**
     * Update peak price if current price is higher
     */
    updatePeak(symbol, currentPrice) {
        if (this.positions[symbol]) {
            if (currentPrice > this.positions[symbol].peakPrice) {
                this.positions[symbol].peakPrice = currentPrice;
                this.positions[symbol].lastUpdate = new Date().toISOString();
                this.savePositions();
                return true; // Peak updated
            }
        }
        return false; // No update
    }

    /**
     * Get position data
     */
    getPosition(symbol) {
        return this.positions[symbol] || null;
    }

    /**
     * Remove position when closed
     */
    removePosition(symbol) {
        if (this.positions[symbol]) {
            delete this.positions[symbol];
            this.savePositions();
            console.log(`🗑️ Removed tracking for ${symbol}`);
        }
    }

    /**
     * Clear all positions (useful for debugging)
     */
    clearAll() {
        this.positions = {};
        this.savePositions();
    }
}

module.exports = new PositionTracker();
