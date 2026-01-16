require('dotenv').config();
const { initDb } = require('./src/db/database');
const alpacaTrader = require('./src/services/alpacaTrader');

async function verify() {
    console.log("--- Starting Local Verification ---");
    await initDb();

    // We expect this to find YFI or BTC in the local DB (from previous debug_db run)
    // and attempt to execute a trade.
    // It will log "EXECUTING BUY" if successful.

    try {
        const result = await alpacaTrader.executeDailyTrade();
        console.log("\n--- Execution Result ---");
        console.log(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error("Verification Failed:", error);
    }
}

verify();
