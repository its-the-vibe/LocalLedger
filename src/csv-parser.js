/**
 * CSV parsing and column-mapping logic.
 * Uses Papa Parse (bundled locally) for robust CSV handling.
 * Supports quoted fields, varying headers, multiple date formats, etc.
 */

import Papa from 'papaparse';

// ---------------------------------------------------------------------------
// Column auto-detection heuristics
// ---------------------------------------------------------------------------

const PATTERNS = {
  date: [
    /^date$/i,
    /^transaction[\s_-]?date$/i,
    /^posted[\s_-]?date$/i,
    /^trans[\s_-]?date$/i,
    /^value[\s_-]?date$/i,
    /^datum$/i,
    /^fecha$/i,
    /^dat[ae]$/i,
  ],
  description: [
    /^description$/i,
    /^desc$/i,
    /^payee$/i,
    /^merchant$/i,
    /^memo$/i,
    /^narrative$/i,
    /^detail[s]?$/i,
    /^name$/i,
    /^particulars$/i,
    /^reference$/i,
    /^transaction[\s_-]?detail[s]?$/i,
  ],
  amount: [
    /^amount$/i,
    /^total$/i,
    /^debit$/i,
    /^credit$/i,
    /^charge[s]?$/i,
    /^spend$/i,
    /^transaction[\s_-]?amount$/i,
    /^value$/i,
    /^sum$/i,
    /^price$/i,
    /^gbp$/i,
    /^usd$/i,
    /^eur$/i,
  ],
  category: [
    /^categ[o]?r[yi][e]?[s]?$/i,
    /^cat$/i,
    /^type$/i,
    /^transaction[\s_-]?type$/i,
    /^class$/i,
    /^group$/i,
    /^tag[s]?$/i,
    /^label[s]?$/i,
  ],
};

/** Try to find the best matching header for a given field */
function detectField(headers, field) {
  const patterns = PATTERNS[field];
  for (const pat of patterns) {
    const match = headers.find((h) => pat.test(h.trim()));
    if (match) return match;
  }
  return null;
}

/** Auto-detect column mapping from CSV headers */
export function autoDetectMapping(headers) {
  return {
    date: detectField(headers, 'date'),
    description: detectField(headers, 'description'),
    amount: detectField(headers, 'amount'),
    category: detectField(headers, 'category'),
    dateFormat: 'auto',   // 'auto' | 'dmy' | 'mdy' | 'ymd'
    amountSign: 'auto',   // 'auto' | 'positive' | 'negative'
  };
}

/** Return true when all required fields (date, description, amount) are mapped */
export function isMappingComplete(mapping) {
  return !!(mapping.date && mapping.description && mapping.amount);
}

// ---------------------------------------------------------------------------
// Date parsing
// ---------------------------------------------------------------------------

/** Parse a date string using the given format hint */
export function parseDate(str, formatHint = 'auto') {
  if (!str || typeof str !== 'string') return null;
  const s = str.trim().replace(/['"]/g, '');
  if (!s) return null;

  // ISO 8601 (YYYY-MM-DD) is unambiguous
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [y, m, d] = s.slice(0, 10).split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return isValidDate(dt) ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  }

  // DD/MM/YYYY, MM/DD/YYYY, DD-MM-YYYY etc.
  const slash = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (slash) {
    const [, a, b, yearRaw] = slash;
    const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
    const A = Number(a);
    const B = Number(b);
    let day, month;
    if (formatHint === 'mdy') {
      month = A; day = B;
    } else if (formatHint === 'dmy') {
      day = A; month = B;
    } else {
      // auto: if first part > 12 it must be the day; otherwise default to
      // DD/MM (common in UK/EU exports). For US (MM/DD) exports, set
      // formatHint='mdy' in the column mapping dialog.
      if (A > 12) { day = A; month = B; }
      else if (B > 12) { day = B; month = A; }
      else { day = A; month = B; } // default: DD/MM
    }
    const dt = new Date(year, month - 1, day);
    return isValidDate(dt)
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null;
  }

  // Attempt native parsing as last resort
  const native = new Date(s);
  if (isValidDate(native)) {
    const y = native.getFullYear();
    const m = native.getMonth() + 1;
    const d = native.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  return null;
}

function isValidDate(d) {
  return d instanceof Date && !isNaN(d.getTime());
}

// ---------------------------------------------------------------------------
// Amount parsing
// ---------------------------------------------------------------------------

/** Parse an amount string into a float (positive = expense) */
export function parseAmount(str, signConvention = 'auto') {
  if (str == null) return null;
  const s = String(str).trim().replace(/['"]/g, '');
  if (!s) return null;

  // Remove currency symbols, commas used as thousand separators, spaces
  const cleaned = s.replace(/[£$€¥₹,\s]/g, '').replace(/\((.+)\)/, '-$1'); // (1.50) -> -1.50
  const num = parseFloat(cleaned);
  if (isNaN(num)) return null;

  // signConvention:
  //  'positive' – positive numbers are expenses
  //  'negative' – negative numbers are expenses (debit transactions)
  //  'auto'     – we normalise so that expenses are positive
  if (signConvention === 'negative') {
    return -num; // flip so expenses become positive
  }
  // 'positive' or 'auto': keep as-is (positive = expense)
  return num;
}

// ---------------------------------------------------------------------------
// Main parse pipeline
// ---------------------------------------------------------------------------

/**
 * Parse a CSV File object into raw rows + headers.
 * Returns a Promise<{ headers: string[], rows: object[] }>.
 */
export function parseCSVFile(file) {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false, // keep everything as strings so we control parsing
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        if (results.errors.length > 0 && results.data.length === 0) {
          reject(new Error(results.errors.map((e) => e.message).join('; ')));
          return;
        }
        resolve({
          headers: results.meta.fields || [],
          rows: results.data,
        });
      },
      error: (err) => reject(new Error(err.message)),
    });
  });
}

/**
 * Normalise raw CSV rows into transaction objects using the provided mapping.
 * Returns { transactions, skipped } where skipped is the count of unparseable rows.
 */
export function normaliseTransactions(rows, mapping) {
  const transactions = [];
  let skipped = 0;
  let idCounter = 1;

  for (const row of rows) {
    const rawDate = mapping.date ? row[mapping.date] : null;
    const rawAmount = mapping.amount ? row[mapping.amount] : null;
    const rawDesc = mapping.description ? row[mapping.description] : null;
    const rawCategory = mapping.category ? row[mapping.category] : null;

    const date = parseDate(rawDate, mapping.dateFormat || 'auto');
    const amount = parseAmount(rawAmount, mapping.amountSign || 'auto');

    if (!date || amount === null) {
      skipped++;
      continue;
    }

    transactions.push({
      id: idCounter++,
      date,
      description: (rawDesc || '').trim(),
      amount,
      category: (rawCategory || 'Uncategorised').trim() || 'Uncategorised',
      raw: row,
    });
  }

  return { transactions, skipped };
}
