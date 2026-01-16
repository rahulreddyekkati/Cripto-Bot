require('dotenv').config();
const notificationService = require('./src/services/notificationService');

async function testDiscord() {
    console.log('🧪 Testing Discord Notification...');

    await notificationService.sendTradeAlert({
        symbol: 'TEST-COIN',
        side: 'buy',
        qty: '100',
        price: '420.69',
        balance: '9999.00'
    });

    console.log('✅ If you see this logic, check your Discord channel!');
}

testDiscord();
