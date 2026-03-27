/** Escape HTML special characters to prevent XSS when rendering user-provided content */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Format a number as a currency string (e.g. £1,234.56) */
export function formatCurrency(amount, symbol = '£') {
  if (amount == null || isNaN(amount)) return '-';
  return symbol + Math.abs(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Format an ISO date string (YYYY-MM-DD) as a locale date string */
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Truncate a string to maxLen characters, adding ellipsis if needed */
export function truncate(str, maxLen = 40) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/** Get the YYYY-MM label for a given ISO date string */
export function getMonthLabel(isoDate) {
  if (!isoDate) return '';
  return isoDate.slice(0, 7); // "YYYY-MM"
}

/** Convert a YYYY-MM string to a human-readable month label (e.g. "Mar 2026") */
export function formatMonthLabel(yyyyMm) {
  const [y, m] = yyyyMm.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: 'short',
    year: 'numeric',
  });
}

/** Debounce a function call */
export function debounce(fn, ms = 250) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/** Clamp a number between min and max */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
