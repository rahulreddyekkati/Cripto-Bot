require('dotenv').config();
const alpacaService = require('./src/services/alpacaService');

async function placeTestTrade() {
    console.log('🧪 Testing Alpaca Order Placement...');

    // 1. Check Account
    const account = await alpacaService.getAccount();
    if (!account) {
        console.error('❌ Failed to get account!');
        return;
    }
    console.log(`💰 Buying Power: $${account.buying_power}`);

    // 2. Place Order (BTC > $10)
    const symbol = 'BTC/USD';
    const qty = 0.005;

    console.log(`🚀 Buying ${qty} ${symbol}...`);
    const order = await alpacaService.createOrder(symbol, qty, 'buy');

    if (order) {
        console.log('✅ Order Placed Successfully!');
        console.log('Order ID:', order.id);
        console.log('Status:', order.status);
    } else {
        console.error('❌ Order Failed!');
    }
}

placeTestTrade();
