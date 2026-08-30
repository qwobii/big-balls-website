const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const path = require('node:path');
const db = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const INCOME_CATS = [
  { name: 'Lane Rentals', keys: ['lane', 'bowling fee', 'game fee', 'frame'] },
  { name: 'Bar & Concessions', keys: ['bar', 'drink', 'beer', 'concession', 'food', 'snack', 'kitchen', 'pos transaction', 'pos '] },
  { name: 'Arcade / Tokens', keys: ['arcade', 'token', 'claw', 'ddr', 'skee'] },
  { name: 'Pro Shop / Merch', keys: ['merch', 'shirt', 'pro shop', 'apparel', 'shoe rental', 'shoes'] },
  { name: 'Parties & Events', keys: ['party', 'event', 'birthday', 'league fee', 'tournament'] },
];
const EXPENSE_CATS = [
  { name: 'Payroll', keys: ['payroll', 'wage', 'salary', 'staff', 'paycheck'] },
  { name: 'Rent', keys: ['rent', 'lease'] },
  { name: 'Utilities', keys: ['utility', 'electric', 'water bill', 'gas bill', 'internet'] },
  { name: 'Maintenance', keys: ['maintenance', 'repair', 'lane oil', 'pinsetter', 'pin setter'] },
  { name: 'Supplies & Inventory', keys: ['supply', 'supplies', 'inventory', 'stock', 'restock'] },
  { name: 'Marketing', keys: ['marketing', 'ad ', 'advert', 'promo'] },
  { name: 'Insurance', keys: ['insurance'] },
];

function findCategory(desc, list) {
  const d = (desc || '').toLowerCase();
  for (const c of list) {
    if (c.keys.some(k => d.includes(k))) return c.name;
  }
  return null;
}

function findHeader(headers, candidates) {
  return headers.find(h => candidates.some(c => h.toLowerCase().trim().includes(c)));
}

function parseAmount(raw) {
  if (raw === undefined || raw === null) return NaN;
  const cleaned = String(raw).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return parseFloat(cleaned);
}

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file was uploaded.' });

  const csvText = req.file.buffer.toString('utf-8');
  const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });

  if (parsed.errors && parsed.errors.length && !parsed.data.length) {
    return res.status(400).json({ error: 'Could not parse that CSV file.' });
  }
  const headers = parsed.meta.fields || [];
  const rows = parsed.data;
  if (!rows.length) return res.status(400).json({ error: 'The file has no transaction rows.' });

  const amountHeader = findHeader(headers, ['amount', 'value', 'total']);
  const typeHeader = findHeader(headers, ['type', 'direction', 'action']);
  const categoryHeader = findHeader(headers, ['category']);
  const descHeader = findHeader(headers, ['description', 'memo', 'desc', 'name', 'details']);
  const dateHeader = findHeader(headers, ['date', 'doneat', 'timestamp']);
  const fromHeader = findHeader(headers, ['fromaccount', 'from']);
  const toHeader = findHeader(headers, ['toaccount', 'to']);
  const byHeader = findHeader(headers, ['doneby', 'by', 'user']);

  if (!amountHeader) {
    return res.status(400).json({ error: 'No column found for transaction amount. Include a column like "Amount".' });
  }

  let added = 0, skipped = 0, unreadable = 0;

  for (const row of rows) {
    const rawAmount = row[amountHeader];
    if (rawAmount === undefined || rawAmount === '') continue;
    const amount = parseAmount(rawAmount);
    if (isNaN(amount)) { unreadable++; continue; }

    const desc = descHeader ? (row[descHeader] || '') : '';
    const dateVal = dateHeader ? (row[dateHeader] || '') : '';
    const fromVal = fromHeader ? (row[fromHeader] || '') : '';
    const toVal = toHeader ? (row[toHeader] || '') : '';
    const byVal = byHeader ? (row[byHeader] || '') : '';
    const explicitType = typeHeader ? (row[typeHeader] || '').toLowerCase().trim() : '';

    const fingerprint = [explicitType, amount, desc, dateVal, fromVal, toVal, byVal].join('|');

    let isIncome;
    if (/(^|[^a-z])(in|income|credit|deposit)([^a-z]|$)/.test(explicitType) || explicitType.includes('transferin')) {
      isIncome = true;
    } else if (/(^|[^a-z])(out|expense|debit|withdrawal)([^a-z]|$)/.test(explicitType) || explicitType.includes('transferout')) {
      isIncome = false;
    } else {
      isIncome = amount >= 0;
    }

    const magnitude = Math.abs(amount);
    let category = categoryHeader ? (row[categoryHeader] || '').trim() : '';
    if (!category) {
      category = findCategory(desc, isIncome ? INCOME_CATS : EXPENSE_CATS)
        || (desc && desc.trim() ? desc.trim().slice(0, 40) : 'Uncategorized');
    }

    const wasNew = db.insertTransaction({
      fingerprint, date: dateVal || '—', description: desc || '—', isIncome, category, amount: magnitude
    });
    if (wasNew) added++; else skipped++;
  }

  res.json({ added, skipped, unreadable, totalSaved: db.getCount() });
});

app.get('/api/report', (req, res) => {
  const rows = db.getAllTransactions();
  res.json({
    count: rows.length,
    transactions: rows.map(r => ({
      date: r.date, description: r.description, isIncome: !!r.is_income,
      category: r.category, amount: r.amount
    }))
  });
});

app.post('/api/clear', (req, res) => {
  db.clearAll();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Big Balls server running on port ${PORT}`));
