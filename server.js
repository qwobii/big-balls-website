const express = require('express');
const multer = require('multer');
const Papa = require('papaparse');
const path = require('node:path');
const db = require('./db');

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

app.use(express.static(__dirname));
app.use(express.json());

function findHeader(headers, candidates) {
  return headers.find(h => candidates.some(c => h.toLowerCase().trim().includes(c)));
}

function parseAmount(raw) {
  if (raw === undefined || raw === null) return NaN;
  const cleaned = String(raw).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1');
  return parseFloat(cleaned);
}

/* ---------- categories ---------- */
app.get('/api/categories', (req, res) => {
  res.json(db.getCategories());
});

app.post('/api/categories', (req, res) => {
  const { name, type } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Category name is required.' });
  if (type !== 'income' && type !== 'expense') return res.status(400).json({ error: 'Type must be income or expense.' });
  try {
    const id = db.createCategory(name, type);
    res.json({ id, name: name.trim(), type, keywords: [] });
  } catch (e) {
    res.status(400).json({ error: 'That category already exists.' });
  }
});

app.delete('/api/categories/:id', (req, res) => {
  db.deleteCategory(Number(req.params.id));
  res.json({ ok: true });
});

app.post('/api/categories/:id/keywords', (req, res) => {
  const { keyword } = req.body;
  if (!keyword || !keyword.trim()) return res.status(400).json({ error: 'Keyword is required.' });
  db.addKeyword(Number(req.params.id), keyword);
  res.json({ ok: true });
});

app.delete('/api/rules/:keyword', (req, res) => {
  db.removeKeyword(decodeURIComponent(req.params.keyword));
  res.json({ ok: true });
});

/* ---------- transactions ---------- */
app.patch('/api/transactions/:id', (req, res) => {
  const id = Number(req.params.id);
  const { categoryId, saveRule } = req.body;
  db.updateTransactionCategory(id, categoryId ?? null);

  if (saveRule && categoryId) {
    const tx = db.getTransactionById(id);
    if (tx && tx.description && tx.description !== '—') {
      db.addKeyword(categoryId, tx.description);
    }
  }
  res.json({ ok: true });
});

/* ---------- upload ---------- */
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

  let added = 0, skipped = 0, unreadable = 0, uncategorized = 0;

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

    let categoryId = null;
    const explicitCategory = categoryHeader ? (row[categoryHeader] || '').trim() : '';
    if (explicitCategory) {
      categoryId = db.findOrCreateCategory(explicitCategory, isIncome ? 'income' : 'expense');
    } else {
      categoryId = db.matchCategoryId(desc);
    }
    if (!categoryId) uncategorized++;

    const wasNew = db.insertTransaction({
      fingerprint, date: dateVal || '—', description: desc || '—', isIncome, categoryId, amount: magnitude
    });
    if (wasNew) added++; else skipped++;
  }

  res.json({ added, skipped, unreadable, uncategorized, totalSaved: db.getCount() });
});

app.get('/api/report', (req, res) => {
  const rows = db.getAllTransactions();
  res.json({
    count: rows.length,
    transactions: rows.map(r => ({
      id: r.id, date: r.date, description: r.description, isIncome: !!r.is_income,
      categoryId: r.category_id, category: r.category_name || 'Uncategorized', amount: r.amount
    }))
  });
});

app.post('/api/clear', (req, res) => {
  db.clearAll();
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Big Balls server running on port ${PORT}`));
