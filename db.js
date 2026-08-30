const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const db = new DatabaseSync(path.join(__dirname, 'data.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    date TEXT,
    description TEXT,
    is_income INTEGER NOT NULL,
    category TEXT,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO transactions (fingerprint, date, description, is_income, category, amount)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function insertTransaction(tx) {
  const result = insertStmt.run(
    tx.fingerprint,
    tx.date,
    tx.description,
    tx.isIncome ? 1 : 0,
    tx.category,
    tx.amount
  );
  return result.changes === 1; // true if newly inserted, false if duplicate
}

function getAllTransactions() {
  return db.prepare(`SELECT * FROM transactions ORDER BY date DESC, id DESC`).all();
}

function getCount() {
  const row = db.prepare(`SELECT COUNT(*) as count FROM transactions`).get();
  return row.count;
}

function clearAll() {
  db.exec(`DELETE FROM transactions`);
}

module.exports = { insertTransaction, getAllTransactions, getCount, clearAll };
