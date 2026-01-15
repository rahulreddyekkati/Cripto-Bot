const priceService = require('./src/services/priceService');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStressTest() {
    console.log('🚀 Starting PriceService Stress Test...');

    const coins = ['bitcoin', 'ethereum', 'solana', 'cardano', 'ripple', 'dogecoin', 'polkadot', 'chainlink'];
    const iterations = 50;

    console.log(`Simulating ${iterations} concurrent requests for ${coins.length} coins...`);

    const promises = [];

    // 1. Hammer the service with requests
    for (let i = 0; i < iterations; i++) {
        // Mix of single calls and batch calls
        if (i % 2 === 0) {
            promises.push(priceService.getPrice(coins[i % coins.length]));
        } else {
            const subset = coins.slice(0, 3);
            promises.push(priceService.getPrices(subset));
        }

        // Add tiny random delay to simulate real traffic
        await sleep(Math.random() * 10);
    }

    console.log('Waiting for all requests to complete...');
    await Promise.all(promises);

    console.log('\n✅ Stress Test Complete.');
    console.log('Final Metrics:', priceService.metrics);

    // Validation
    const m = priceService.metrics;
    console.log('\n--- Analysis ---');
    console.log(`Requests Total: ${m.requestsTotal}`);
    console.log(`API Calls: ${m.apiCalls} (Should be very low, e.g. 1-2)`);
    console.log(`Batched Requests: ${m.requestsBatched}`);
    console.log(`Cache Hits: ${m.cacheHits}`);

    if (m.apiCalls < 5 && m.requestsTotal > 50) {
        console.log('RESULT: PASS - efficient batching/caching');
    } else {
        console.log('RESULT: WARNING - high API usage');
    }
}

runStressTest().catch(console.error);
