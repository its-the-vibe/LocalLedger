# LocalLedger

**A privacy-first, client-side PWA for importing CSV bank transactions and visualising personal spending.**

> ⚠️ Your transaction data **never** leaves your browser. No backend. No analytics. No cloud sync.

---

## Features

- **CSV upload** – drag & drop or browse for any bank/credit-card CSV export
- **Smart column mapping** – auto-detects common header names; fully configurable via a point-and-click dialog
- **Spending overview**
  - Total spend, monthly average, top category, transaction count
  - Category breakdown (donut chart)
  - Month-by-month bar chart
  - Top 10 merchants / payees
- **Transactions table** – sortable columns, date-range filter, category filter, full-text search, pagination
- **Settings** – currency symbol, rows per page, saved column mapping
- **PWA support** – installable, works offline after first load (app shell cached by service worker)
- **Local persistence** – transactions saved to IndexedDB; settings saved to localStorage

---

## How to run

### Development

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

### Production build

```bash
npm run build
npm run preview   # serves the built app locally
```

The output is in `dist/`. It is a fully static site — just serve the `dist/` directory with any HTTP server (nginx, Caddy, GitHub Pages, Netlify, etc.).

---

## Supported CSV formats

LocalLedger reads any CSV that has:
- A **header row** (first row must contain column names)
- Columns for **date**, **amount**, and a **description / payee**
- Optionally a **category** column

### Auto-detected header names

| Field        | Recognised headers (case-insensitive)                                     |
|--------------|---------------------------------------------------------------------------|
| Date         | Date, Transaction Date, Posted Date, Trans Date, Value Date, Datum …     |
| Amount       | Amount, Total, Debit, Credit, Charge, Spend, Value, Transaction Amount … |
| Description  | Description, Payee, Merchant, Memo, Narrative, Details, Particulars …    |
| Category     | Category, Type, Transaction Type, Class, Group, Tag, Label …             |

If your export uses different names, select the right column manually in the mapping dialog.

### Date formats

Auto-detect handles:
- `YYYY-MM-DD` (ISO 8601) — unambiguous, always preferred
- `DD/MM/YYYY` (UK default)
- `MM/DD/YYYY` (US)
- `DD-MM-YYYY` / `MM-DD-YYYY`
- Native JavaScript-parseable strings as a fallback

You can override the format in the column-mapping dialog.

### Amount sign conventions

- **Positive = expense** (most UK/EU bank exports) — default
- **Negative = expense** (debit-style, some US exports) — select in dialog

### Example CSV (the format from the issue)

```
Date,Description,Amount,Extended Details,Appears On Your Statement As,Address,Town/City,Postcode,Country,Reference,Category
03/03/2026,CLOUDWATER BREW CO. - 7 London,6.50,,…,Entertainment-Bars & Cafés
03/03/2026,WASABI SUSHI BENTO LIMI LONDON,6.25,,…,Entertainment-Restaurants
```

---

## Privacy

| Concern                  | What LocalLedger does                                   |
|--------------------------|---------------------------------------------------------|
| Server uploads           | **None.** The app is entirely client-side.              |
| Analytics / telemetry    | **None.** No tracking scripts included.                 |
| External CDNs            | **None.** All dependencies are bundled at build time.   |
| Transaction data storage | IndexedDB in the browser only. Cleared with browser data. |
| Service worker caching   | Caches **app shell files only** (HTML, CSS, JS). Transaction data in IndexedDB is never touched by the service worker. |

To permanently delete your data: use "Clear data" in the app header, or clear site data in your browser settings.

---

## Architecture

```
src/
  main.js        – entry point (imports CSS, calls initApp)
  style.css      – all styles (design tokens, components, responsive)
  app.js         – state management, rendering, event handling
  csv-parser.js  – Papa Parse wrapper, column auto-detection, date/amount normalisation
  storage.js     – IndexedDB (transactions) + localStorage (settings) helpers
  charts.js      – Chart.js wrappers (category donut, monthly bar)
  utils.js       – shared pure helpers (escape, format, debounce …)

public/
  manifest.json     – PWA manifest
  service-worker.js – offline caching (app shell only)
  icons/            – app icons (SVG + PNG 192 & 512)
```

### Extending categorisation rules

The `csv-parser.js` module exports `normaliseTransactions(rows, mapping)`. To add automatic re-categorisation, post-process the returned `transactions` array before saving to IndexedDB:

```js
// Example: override category based on description keywords
function recategorise(transactions) {
  return transactions.map((t) => {
    if (/amazon/i.test(t.description)) {
      return { ...t, category: 'Shopping-Online' };
    }
    return t;
  });
}
```

---

## Assumptions & limitations

- **No multi-file merge**: uploading a new file replaces existing transactions. Future work could add append mode.
- **No income tracking**: amounts < 0 are shown in the transactions table (highlighted green) but excluded from spending breakdowns.
- **No deduplication**: if you upload overlapping date ranges the same transactions will appear twice.
- **CSV only**: OFX/QIF/JSON imports are not supported.
- **Single currency**: mixing currencies in one file is not handled.

