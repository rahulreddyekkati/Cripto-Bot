const priceService = require('./src/services/priceService');
const paperTrader = require('./src/services/paperTrader');

async function testPriceService() {
    console.log('Testing PriceService batching...');

    // Test 1: Multiple individual calls should be batched
    console.log('1. Requesting BTC, ETH, SOL individually...');
    const p1 = priceService.getPrice('bitcoin');
    const p2 = priceService.getPrice('ethereum');
    const p3 = priceService.getPrice('solana');

    const [btc, eth, sol] = await Promise.all([p1, p2, p3]);
    console.log('   Result:', { btc, eth, sol });

    // Test 2: Explicit batch call
    console.log('\n2. Requesting batch [cardano, ripple]...');
    const batch = await priceService.getPrices(['cardano', 'ripple']);
    console.log('   Result:', batch);

    // Test 3: Cache hit
    console.log('\n3. Requesting BTC (should be cached)...');
    const start = Date.now();
    const btcCached = await priceService.getPrice('bitcoin');
    console.log(`   Result: ${btcCached} (${Date.now() - start}ms)`);
}

testPriceService().catch(console.error);
