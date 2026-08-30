# Big Balls Bowling — Website + Budget Tracker

A small full-stack website: a home page for the bowling alley, and an Admin
page with a budget tracker that reads transaction CSVs, saves them to a real
database, and skips anything it's already seen so overlapping exports never
get double-counted.

## What's inside

- `server.js` — Express server and API routes
- `db.js` — SQLite database (using Node's built-in `node:sqlite`, no native
  build step required)
- `public/index.html` — home page
- `public/admin.html` — budget tracker page
- `public/styles.css` — shared neon theme
- `data.db` — created automatically the first time the server runs; this is
  where all your transactions live

## Running it locally

You'll need **Node.js 22.5 or newer** (this uses Node's built-in SQLite
support, so there's nothing extra to install or compile).

```bash
npm install
npm start
```

Then open **http://localhost:3000** for the home page, or
**http://localhost:3000/admin.html** for the budget tracker.

The database file `data.db` is created next to `server.js` automatically.
Back it up like any other file if you want a copy of your records — it's
just a single SQLite file.

## How the CSV import works

Every transaction is fingerprinted from its type, amount, description, date,
and account fields. When you upload a file, each row is checked against
everything already in the database — rows that match something already
saved are skipped, and only new rows are added. That means you can export
"everything up to today" every single day and just keep dropping it in; it
will never double-count.

The importer looks for columns named things like `amount`, `action`/`type`,
`description`, `date`, `fromAccount`/`toAccount` — it's flexible about exact
naming. If it can't find an amount column, it'll tell you.

## Deploying it online

This is a normal Node.js app, so it deploys the same way to most hosts.
A few good free/cheap options:

**Render.com** (simplest for this app)
1. Push this folder to a GitHub repo.
2. On Render, create a new **Web Service** from that repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Make sure the Node version is set to 22.5+ (Render lets you set this via
   an `.nvmrc` file — add one containing `22` to the project root, or set
   `NODE_VERSION` in the environment settings).
6. **Important:** Render's filesystem is ephemeral on the free tier — the
   `data.db` file will reset on redeploys. If you want your data to survive
   redeploys, add a paid **persistent disk** and mount it at the project
   folder, or point `db.js` at a path inside that disk.

**Railway.app** — same idea: connect the repo, it detects `npm start`
automatically, and offers a persistent volume you can attach for `data.db`.

**A basic VPS (e.g. DigitalOcean, a home server, etc.)** — clone the repo,
run `npm install && npm start`, and put it behind something like `pm2` or a
`systemd` service so it restarts if it crashes, plus nginx if you want a
custom domain and HTTPS.

Whichever host you pick, the one thing to watch for is **persistent
storage** for `data.db` — anything described as "ephemeral" or
"stateless" filesystem will wipe your saved transactions on every restart
or redeploy, so look for a host/plan that offers a persistent disk or
volume.

## Customizing

- Colors, fonts, and layout all live in `public/styles.css`.
- The income/expense category keyword lists are near the top of
  `server.js` (`INCOME_CATS` / `EXPENSE_CATS`) — add or edit keywords there
  to change how transactions get auto-categorized.
