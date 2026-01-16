require('dotenv').config();
const axios = require('axios');

async function checkAssets() {
    const key = process.env.ALPACA_API_KEY;
    const secret = process.env.ALPACA_SECRET_KEY;
    const isPaper = process.env.ALPACA_PAPER === 'true';
    const baseUrl = isPaper ? 'https://paper-api.alpaca.markets/v2' : 'https://api.alpaca.markets/v2';

    if (!key || !secret) {
        console.error('Missing API Keys');
        return;
    }

    try {
        console.log('Fetching assets from Alpaca...');
        const response = await axios.get(`${baseUrl}/assets`, {
            headers: {
                'APCA-API-KEY-ID': key,
                'APCA-API-SECRET-KEY': secret
            },
            params: {
                status: 'active',
                asset_class: 'crypto'
            }
        });

        const assets = response.data;
        console.log(`Total Crypto Assets: ${assets.length}`);

        console.log('\n--- All Available Assets ---');
        assets.forEach(a => {
            console.log(`${a.symbol} (${a.name})`);
        });

    } catch (error) {
        console.error('Error:', error.message);
    }
}

checkAssets();
