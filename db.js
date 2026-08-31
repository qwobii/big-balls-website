const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
const db = new DatabaseSync(dbPath);
db.exec(`PRAGMA foreign_keys = ON`);

db.exec(`
  CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income','expense')),
    UNIQUE(name, type)
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS rules (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
    keyword TEXT UNIQUE NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fingerprint TEXT UNIQUE NOT NULL,
    date TEXT,
    description TEXT,
    is_income INTEGER NOT NULL,
    category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    amount REAL NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  )
`);

// ---------- seed sensible defaults on first run only ----------
const DEFAULTS = {
  income: {
    'Lane Rentals': ['lane', 'bowling fee', 'game fee', 'frame'],
    'Bar & Concessions': ['bar', 'drink', 'beer', 'concession', 'food', 'snack', 'kitchen', 'pos transaction'],
    'Arcade / Tokens': ['arcade', 'token', 'claw', 'ddr', 'skee'],
    'Pro Shop / Merch': ['merch', 'shirt', 'pro shop', 'apparel', 'shoe rental'],
    'Bowling Tournaments': ['bowling', 'tourney', 'trny', 'comp fee', 'tournament', 'league fee'],
    'Investments': ['investment', 'invested', 'equity', 'stake', 'shareholder'],
    'Sponsorships': ['sponsorship', 'sponsor'],
    'Owner Repayment': [],
  },
  expense: {
    'Payroll': ['payroll', 'wage', 'salary', 'staff', 'paycheck'],
    'Rent': ['rent', 'lease'],
    'Mortgage': ['mortgage'],
    'Utilities': ['utility', 'electric', 'water bill', 'gas bill', 'internet'],
    'Maintenance': ['maintenance', 'repair', 'lane oil', 'pinsetter'],
    'Supplies & Inventory': ['supply', 'supplies', 'inventory', 'stock', 'restock', 'ingredient', 'coffee beans', 'water bottles'],
    'Whiskey Production': ['whiskey', 'mash', 'grain'],
    'Prizes & Giveaways': ['raffle', 'giveaway', 'prize'],
    'Equipment': ['projector', 'equipment'],
    'Marketing': ['marketing', 'advertising', 'promo'],
    'Insurance': ['insurance'],
    'Owner Draw': [],
  }
};

function seedDefaultsIfEmpty() {
  const { count } = db.prepare(`SELECT COUNT(*) as count FROM categories`).get();
  if (count > 0) return;
  const insertCat = db.prepare(`INSERT INTO categories (name, type) VALUES (?, ?)`);
  const insertRule = db.prepare(`INSERT OR IGNORE INTO rules (category_id, keyword) VALUES (?, ?)`);
  for (const type of ['income', 'expense']) {
    for (const [name, keywords] of Object.entries(DEFAULTS[type])) {
      const result = insertCat.run(name, type);
      const categoryId = Number(result.lastInsertRowid);
      keywords.forEach(k => insertRule.run(categoryId, k.toLowerCase()));
    }
  }
}
seedDefaultsIfEmpty();

// ---------- categories ----------
function getCategories() {
  const cats = db.prepare(`SELECT * FROM categories ORDER BY type, name`).all();
  const rules = db.prepare(`SELECT * FROM rules`).all();
  return cats.map(c => ({
    id: c.id,
    name: c.name,
    type: c.type,
    keywords: rules.filter(r => r.category_id === c.id).map(r => r.keyword)
  }));
}

function createCategory(name, type) {
  const result = db.prepare(`INSERT INTO categories (name, type) VALUES (?, ?)`).run(name.trim(), type);
  return Number(result.lastInsertRowid);
}

function deleteCategory(id) {
  db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
}

function addKeyword(categoryId, keyword) {
  db.prepare(`INSERT OR REPLACE INTO rules (category_id, keyword) VALUES (?, ?)`)
    .run(categoryId, keyword.trim().toLowerCase());
}

function removeKeyword(keyword) {
  db.prepare(`DELETE FROM rules WHERE keyword = ?`).run(keyword.trim().toLowerCase());
}

// returns a category_id if any keyword rule matches the description, else null
function matchCategoryId(description) {
  const d = (description || '').toLowerCase();
  const rules = db.prepare(`SELECT * FROM rules`).all();
  for (const r of rules) {
    if (d.includes(r.keyword)) return r.category_id;
  }
  return null;
}

function findCategoryByName(name, type) {
  return db.prepare(`SELECT * FROM categories WHERE name = ? AND type = ?`).get(name, type);
}

function findOrCreateCategory(name, type) {
  const existing = findCategoryByName(name, type);
  if (existing) return existing.id;
  return createCategory(name, type);
}

// ---------- transactions ----------
const insertStmt = db.prepare(`
  INSERT OR IGNORE INTO transactions (fingerprint, date, description, is_income, category_id, amount)
  VALUES (?, ?, ?, ?, ?, ?)
`);

function insertTransaction(tx) {
  const result = insertStmt.run(
    tx.fingerprint,
    tx.date,
    tx.description,
    tx.isIncome ? 1 : 0,
    tx.categoryId ?? null,
    tx.amount
  );
  return result.changes === 1; // true if newly inserted, false if duplicate
}

function getAllTransactions() {
  return db.prepare(`
    SELECT t.id, t.date, t.description, t.is_income, t.amount,
           c.id as category_id, c.name as category_name
    FROM transactions t
    LEFT JOIN categories c ON c.id = t.category_id
    ORDER BY t.date DESC, t.id DESC
  `).all();
}

function updateTransactionCategory(id, categoryId) {
  db.prepare(`UPDATE transactions SET category_id = ? WHERE id = ?`).run(categoryId, id);
}

function getTransactionById(id) {
  return db.prepare(`SELECT * FROM transactions WHERE id = ?`).get(id);
}

function getCount() {
  const row = db.prepare(`SELECT COUNT(*) as count FROM transactions`).get();
  return row.count;
}

function clearAll() {
  db.exec(`DELETE FROM transactions`);
}

module.exports = {
  insertTransaction, getAllTransactions, getCount, clearAll, getTransactionById,
  getCategories, createCategory, deleteCategory, addKeyword, removeKeyword,
  matchCategoryId, findOrCreateCategory, updateTransactionCategory
};
