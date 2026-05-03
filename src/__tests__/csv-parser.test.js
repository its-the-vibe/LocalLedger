import { describe, it, expect } from 'vitest';
import {
  autoDetectMapping,
  isMappingComplete,
  parseDate,
  parseAmount,
  normaliseTransactions,
} from '../csv-parser.js';

describe('autoDetectMapping', () => {
  it('detects standard CSV headers', () => {
    const headers = ['Date', 'Description', 'Amount', 'Category'];
    const mapping = autoDetectMapping(headers);
    expect(mapping.date).toBe('Date');
    expect(mapping.description).toBe('Description');
    expect(mapping.amount).toBe('Amount');
    expect(mapping.category).toBe('Category');
  });

  it('returns null for unrecognised headers', () => {
    const mapping = autoDetectMapping(['foo', 'bar']);
    expect(mapping.date).toBeNull();
    expect(mapping.description).toBeNull();
    expect(mapping.amount).toBeNull();
  });

  it('detects alternative header names case-insensitively', () => {
    const mapping = autoDetectMapping(['transaction date', 'payee', 'debit', 'tag']);
    expect(mapping.date).toBe('transaction date');
    expect(mapping.description).toBe('payee');
    expect(mapping.amount).toBe('debit');
    expect(mapping.category).toBe('tag');
  });

  it('sets default dateFormat and amountSign', () => {
    const mapping = autoDetectMapping([]);
    expect(mapping.dateFormat).toBe('auto');
    expect(mapping.amountSign).toBe('auto');
  });
});

describe('isMappingComplete', () => {
  it('returns true when all required fields are mapped', () => {
    expect(isMappingComplete({ date: 'Date', description: 'Desc', amount: 'Amount' })).toBe(true);
  });

  it('returns false when date is missing', () => {
    expect(isMappingComplete({ date: null, description: 'Desc', amount: 'Amount' })).toBe(false);
  });

  it('returns false when description is missing', () => {
    expect(isMappingComplete({ date: 'Date', description: null, amount: 'Amount' })).toBe(false);
  });

  it('returns false when amount is missing', () => {
    expect(isMappingComplete({ date: 'Date', description: 'Desc', amount: null })).toBe(false);
  });

  it('returns false for empty mapping', () => {
    expect(isMappingComplete({})).toBe(false);
  });
});

describe('parseDate', () => {
  it('parses ISO 8601 dates', () => {
    expect(parseDate('2026-03-15')).toBe('2026-03-15');
  });

  it('pads single-digit month/day in ISO output', () => {
    expect(parseDate('2026-01-05')).toBe('2026-01-05');
  });

  it('parses DD/MM/YYYY (default auto)', () => {
    expect(parseDate('15/03/2026')).toBe('2026-03-15');
  });

  it('parses MM/DD/YYYY with mdy hint', () => {
    expect(parseDate('03/15/2026', 'mdy')).toBe('2026-03-15');
  });

  it('parses DD-MM-YYYY with dmy hint', () => {
    expect(parseDate('15-03-2026', 'dmy')).toBe('2026-03-15');
  });

  it('returns null for empty string', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
  });

  it('returns null for completely invalid date string', () => {
    expect(parseDate('not-a-date')).toBeNull();
  });

  it('strips surrounding quotes', () => {
    expect(parseDate('"2026-03-15"')).toBe('2026-03-15');
  });

  it('handles two-digit year in slash format', () => {
    const result = parseDate('15/03/26');
    expect(result).toBe('2026-03-15');
  });
});

describe('parseAmount', () => {
  it('parses simple positive numbers', () => {
    expect(parseAmount('10.50')).toBe(10.5);
  });

  it('parses numbers with currency symbols', () => {
    expect(parseAmount('£9.99')).toBe(9.99);
    expect(parseAmount('$9.99')).toBe(9.99);
    expect(parseAmount('€9.99')).toBe(9.99);
  });

  it('parses numbers with thousand separators', () => {
    expect(parseAmount('1,234.56')).toBe(1234.56);
  });

  it('handles negative sign convention (flips sign)', () => {
    expect(parseAmount('-10.00', 'negative')).toBe(10);
  });

  it('keeps positive values as-is with positive convention', () => {
    expect(parseAmount('10.00', 'positive')).toBe(10);
  });

  it('parses parenthesised amounts as negative (pre-flip)', () => {
    expect(parseAmount('(1.50)', 'positive')).toBe(-1.5);
  });

  it('returns null for null/undefined', () => {
    expect(parseAmount(null)).toBeNull();
    expect(parseAmount(undefined)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseAmount('')).toBeNull();
  });

  it('returns null for non-numeric string', () => {
    expect(parseAmount('abc')).toBeNull();
  });

  it('strips surrounding quotes', () => {
    expect(parseAmount('"5.00"')).toBe(5);
  });
});

describe('normaliseTransactions', () => {
  const mapping = {
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    category: 'Category',
    dateFormat: 'auto',
    amountSign: 'auto',
  };

  it('normalises well-formed rows', () => {
    const rows = [
      { Date: '2026-03-15', Description: 'Coffee', Amount: '3.50', Category: 'Food' },
    ];
    const { transactions, skipped } = normaliseTransactions(rows, mapping);
    expect(skipped).toBe(0);
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({
      id: 1,
      date: '2026-03-15',
      description: 'Coffee',
      amount: 3.5,
      category: 'Food',
    });
  });

  it('assigns Uncategorised when category is missing', () => {
    const rows = [
      { Date: '2026-03-15', Description: 'Coffee', Amount: '3.50', Category: '' },
    ];
    const { transactions } = normaliseTransactions(rows, { ...mapping, category: 'Category' });
    expect(transactions[0].category).toBe('Uncategorised');
  });

  it('skips rows with unparseable dates', () => {
    const rows = [
      { Date: 'bad-date', Description: 'Coffee', Amount: '3.50' },
    ];
    const { transactions, skipped } = normaliseTransactions(rows, mapping);
    expect(transactions).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('skips rows with unparseable amounts', () => {
    const rows = [
      { Date: '2026-03-15', Description: 'Coffee', Amount: 'N/A' },
    ];
    const { transactions, skipped } = normaliseTransactions(rows, mapping);
    expect(transactions).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it('assigns sequential IDs starting from 1', () => {
    const rows = [
      { Date: '2026-03-15', Description: 'A', Amount: '1.00' },
      { Date: '2026-03-16', Description: 'B', Amount: '2.00' },
    ];
    const { transactions } = normaliseTransactions(rows, mapping);
    expect(transactions[0].id).toBe(1);
    expect(transactions[1].id).toBe(2);
  });

  it('preserves the raw row object', () => {
    const row = { Date: '2026-03-15', Description: 'Coffee', Amount: '3.50' };
    const { transactions } = normaliseTransactions([row], mapping);
    expect(transactions[0].raw).toBe(row);
  });

  it('handles empty rows array', () => {
    const { transactions, skipped } = normaliseTransactions([], mapping);
    expect(transactions).toHaveLength(0);
    expect(skipped).toBe(0);
  });
});
