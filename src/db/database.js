const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'crypto.db');

let db = null;

// Initialize database
async function initDb() {
    if (db) return db;

    const SQL = await initSqlJs();

    // Load existing database or create new
    try {
        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    } catch (e) {
        db = new SQL.Database();
    }

    // Initialize schema
    db.run(`
    -- Coins master table
    CREATE TABLE IF NOT EXISTS coins (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      market_cap_rank INTEGER,
      market_cap REAL,
      current_price REAL,
      total_volume REAL,
      price_change_24h REAL,
      price_change_7d REAL,
      ath REAL,
      atl REAL,
      last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Price history for technical analysis
    CREATE TABLE IF NOT EXISTS price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_id TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      open REAL,
      high REAL,
      low REAL,
      close REAL,
      volume REAL,
      UNIQUE(coin_id, timestamp)
    );

    -- Technical indicators cache
    CREATE TABLE IF NOT EXISTS indicators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_id TEXT NOT NULL,
      timestamp DATETIME NOT NULL,
      rsi REAL,
      macd REAL,
      macd_signal REAL,
      ema_20 REAL,
      ema_50 REAL,
      atr REAL,
      bb_upper REAL,
      bb_middle REAL,
      bb_lower REAL,
      volume_sma REAL,
      UNIQUE(coin_id, timestamp)
    );

    -- Predictions (what we predicted)
    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      coin_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      prediction_window_hours INTEGER DEFAULT 24,
      ml_probability REAL,
      confidence_tier TEXT,
      signal_count INTEGER,
      signals TEXT,
      entry_price REAL,
      stop_loss REAL,
      take_profit REAL,
      expected_return_p25 REAL,
      expected_return_p50 REAL,
      expected_return_p75 REAL,
      market_cap_tier TEXT,
      volatility_tier TEXT
    );

    -- Performance tracking (actual results after 24h)
    CREATE TABLE IF NOT EXISTS performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id INTEGER NOT NULL,
      coin_id TEXT NOT NULL,
      actual_return REAL,
      hit_take_profit INTEGER,
      hit_stop_loss INTEGER,
      max_drawdown REAL,
      max_gain REAL,
      time_to_tp_hours REAL,
      time_to_sl_hours REAL,
      verified_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Market regime tracking
    CREATE TABLE IF NOT EXISTS market_regime (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
      btc_24h_change REAL,
      fear_greed_index INTEGER,
      regime TEXT,
      threshold_multiplier REAL DEFAULT 1.0
    );

    -- Trade history for auto-trader
    CREATE TABLE IF NOT EXISTS trade_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      action TEXT NOT NULL,
      amount REAL,
      probability REAL,
      sentiment TEXT,
      signal TEXT,
      success INTEGER,
      entry_price REAL,
      exit_price REAL,
      profit_loss REAL,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Portfolio positions
    CREATE TABLE IF NOT EXISTS positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      amount REAL,
      entry_price REAL,
      current_value REAL,
      opened_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      closed_at DATETIME,
      status TEXT DEFAULT 'open'
    );
  `);

    // Create indexes
    db.run(`CREATE INDEX IF NOT EXISTS idx_price_history_coin_time ON price_history(coin_id, timestamp)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_predictions_created ON predictions(created_at)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_performance_prediction ON performance(prediction_id)`);

    // Save to file
    saveDb();

    return db;
}

// Save database to file
function saveDb() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Helper to create a prepare-like interface
function prepare(sql) {
    return {
        run: (...params) => {
            db.run(sql, params);
            saveDb();
            return { lastInsertRowid: db.exec("SELECT last_insert_rowid()")[0]?.values[0][0] };
        },
        get: (...params) => {
            const result = db.exec(sql, params);
            if (result.length === 0 || result[0].values.length === 0) return null;
            const columns = result[0].columns;
            const row = result[0].values[0];
            return columns.reduce((obj, col, i) => { obj[col] = row[i]; return obj; }, {});
        },
        all: (...params) => {
            const result = db.exec(sql, params);
            if (result.length === 0) return [];
            const columns = result[0].columns;
            return result[0].values.map(row =>
                columns.reduce((obj, col, i) => { obj[col] = row[i]; return obj; }, {})
            );
        }
    };
}

module.exports = {
    initDb,
    saveDb,
    prepare,
    getDb: () => db
};
