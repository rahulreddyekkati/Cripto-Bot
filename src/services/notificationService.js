const axios = require('axios');

class NotificationService {
    constructor() {
        this.webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    }

    /**
     * Send a trade alert to Discord
     * @param {Object} trade - { symbol, side, price, qty, balance }
     */
    async sendTradeAlert(trade) {
        if (!this.webhookUrl) return;

        try {
            const isBuy = trade.side.toLowerCase() === 'buy';
            const color = isBuy ? 5763719 : 15548997; // Green (Buy) or Red (Sell)
            const title = isBuy ? `🚀 BOUGHT ${trade.symbol}` : `💰 SOLD ${trade.symbol}`;
            const emoji = isBuy ? '📈' : '📉';

            // Format Balance
            const balanceStr = trade.balance ? `$${parseFloat(trade.balance).toFixed(2)}` : 'N/A';

            const embed = {
                title: `${emoji} ${title}`,
                color: color,
                fields: [
                    { name: 'Price', value: `$${trade.price}`, inline: true },
                    { name: 'Quantity', value: `${trade.qty}`, inline: true },
                    { name: '💰 Cash Left', value: balanceStr, inline: false }
                ],
                footer: { text: 'Alpaca Auto-Trader 🤖' },
                timestamp: new Date().toISOString()
            };

            await axios.post(this.webhookUrl, {
                embeds: [embed]
            });

            console.log('🔔 Notification sent to Discord');
        } catch (error) {
            console.error('Failed to send notification:', error.message);
        }
    }

    /**
     * Send a generic message
     */
    async sendMessage(message) {
        if (!this.webhookUrl) return;
        try {
            await axios.post(this.webhookUrl, { content: `🤖 **Bot Update**: ${message}` });
        } catch (error) {
            console.error('Failed to send message:', error.message);
        }
    }
}

module.exports = new NotificationService();
