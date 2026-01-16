const { initDb, prepare } = require('./src/db/database');

async function check() {
    await initDb();

    // Check latest 10 predictions
    const latest = prepare(`
        SELECT coin_id, confidence_tier, created_at, signals 
        FROM predictions 
        ORDER BY created_at DESC 
        LIMIT 10
    `).all();

    console.log("--- Latest Predictions ---");
    console.table(latest);

    // Check what the bot SEES as "Buyable"
    const valid = prepare(`
        SELECT coin_id, confidence_tier, created_at 
        FROM predictions 
        WHERE confidence_tier IN ('high', 'medium') 
        AND created_at > datetime('now', '-24 hours')
        ORDER BY ml_probability DESC
    `).all();

    console.log("\n--- Valid Buy Candidates (<24h, High/Med) ---");
    console.table(valid);
}

check();
