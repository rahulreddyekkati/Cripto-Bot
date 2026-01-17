require('dotenv').config();
const trader = require('./src/services/alpacaTrader');
const { initDb } = require('./src/db/database');

async function run() {
    console.log('--- Starting Debug Run: Check Positions ---');
    await initDb();
    try {
        const closed = await trader.checkPositions();
        console.log('--- Run Complete ---');
        console.log('Closed Positions:', closed);
    } catch (error) {
        console.error('Fatal Error:', error);
    }
}

run();
