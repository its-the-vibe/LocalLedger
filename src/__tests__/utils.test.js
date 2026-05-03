import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  truncate,
  getMonthLabel,
  debounce,
  clamp,
} from '../utils.js';

describe('escapeHtml', () => {
  it('returns empty string for null/undefined', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });

  it('escapes ampersands', () => {
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('"hello"')).toBe('&quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('Hello World')).toBe('Hello World');
  });

  it('converts numbers to strings', () => {
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('formatCurrency', () => {
  it('returns dash for null/undefined', () => {
    expect(formatCurrency(null)).toBe('-');
    expect(formatCurrency(undefined)).toBe('-');
  });

  it('returns dash for NaN', () => {
    expect(formatCurrency(NaN)).toBe('-');
  });

  it('formats positive amounts with default symbol', () => {
    expect(formatCurrency(1234.56)).toBe('£1,234.56');
  });

  it('formats with custom currency symbol', () => {
    expect(formatCurrency(9.99, '$')).toBe('$9.99');
  });

  it('uses absolute value (negative amounts shown as positive)', () => {
    expect(formatCurrency(-50, '£')).toBe('£50.00');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('£0.00');
  });
});

describe('formatDate', () => {
  it('returns empty string for falsy input', () => {
    expect(formatDate('')).toBe('');
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
  });

  it('returns a non-empty string for a valid ISO date', () => {
    const result = formatDate('2026-03-15');
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('truncate', () => {
  it('returns empty string for falsy input', () => {
    expect(truncate('')).toBe('');
    expect(truncate(null)).toBe('');
  });

  it('returns string unchanged when under maxLen', () => {
    expect(truncate('Hello', 10)).toBe('Hello');
  });

  it('truncates long strings and adds ellipsis', () => {
    const result = truncate('Hello World', 8);
    expect(result).toBe('Hello W…');
    expect(result.length).toBe(8);
  });

  it('uses default maxLen of 40', () => {
    const long = 'a'.repeat(45);
    const result = truncate(long);
    expect(result.length).toBe(40);
    expect(result.endsWith('…')).toBe(true);
  });

  it('does not truncate string of exactly maxLen', () => {
    const str = 'a'.repeat(40);
    expect(truncate(str, 40)).toBe(str);
  });
});

describe('getMonthLabel', () => {
  it('returns empty string for falsy input', () => {
    expect(getMonthLabel('')).toBe('');
    expect(getMonthLabel(null)).toBe('');
  });

  it('extracts YYYY-MM from ISO date string', () => {
    expect(getMonthLabel('2026-03-15')).toBe('2026-03');
    expect(getMonthLabel('2025-12-01')).toBe('2025-12');
  });
});

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('delays function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('only calls function once when invoked multiple times rapidly', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 200);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).toHaveBeenCalledOnce();
  });

  it('passes arguments to the wrapped function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 50);
    debounced('a', 1);
    vi.advanceTimersByTime(50);
    expect(fn).toHaveBeenCalledWith('a', 1);
  });
});

describe('clamp', () => {
  it('returns the value when within range', () => {
    expect(clamp(5, 0, 10)).toBe(5);
  });

  it('clamps to minimum', () => {
    expect(clamp(-5, 0, 10)).toBe(0);
  });

  it('clamps to maximum', () => {
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('handles value equal to min', () => {
    expect(clamp(0, 0, 10)).toBe(0);
  });

  it('handles value equal to max', () => {
    expect(clamp(10, 0, 10)).toBe(10);
  });
});
