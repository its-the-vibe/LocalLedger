/**
 * Main application controller.
 * Manages state, rendering, and event handling.
 * No data ever leaves this browser tab.
 */

import {
  saveTransactions,
  loadTransactions,
  clearTransactions,
  saveSetting,
  loadSetting,
  clearSettings,
} from './storage.js';
import {
  parseCSVFile,
  autoDetectMapping,
  normaliseTransactions,
} from './csv-parser.js';
import { renderCharts, destroyCharts } from './charts.js';
import {
  escapeHtml,
  formatCurrency,
  formatDate,
  truncate,
  debounce,
  clamp,
} from './utils.js';

// ---------------------------------------------------------------------------
// Application state
// ---------------------------------------------------------------------------

const state = {
  transactions: [],          // All normalised transactions
  activeTab: 'overview',
  filters: { dateFrom: '', dateTo: '', category: '', search: '' },
  sort: { field: 'date', dir: 'desc' },
  page: 0,
  pageSize: 50,
  currencySymbol: '£',
  isLoaded: false,
  pendingHeaders: [],
  pendingRows: [],
  pendingMapping: null,
};

// ---------------------------------------------------------------------------
// Bootstrap
// ---------------------------------------------------------------------------

export async function initApp() {
  state.currencySymbol = loadSetting('currencySymbol', '£');
  state.pageSize = loadSetting('pageSize', 50);

  // Try to restore transactions from IndexedDB
  try {
    const stored = await loadTransactions();
    if (stored && stored.length > 0) {
      state.transactions = stored;
      state.isLoaded = true;
    }
  } catch {
    // IndexedDB unavailable – proceed without persistence
  }

  render();
  registerServiceWorker();
}

// ---------------------------------------------------------------------------
// Render dispatcher
// ---------------------------------------------------------------------------

function render() {
  const app = document.getElementById('app');
  if (!app) return;

  if (!state.isLoaded) {
    app.innerHTML = renderUploadScreen();
    attachUploadEvents();
    return;
  }

  app.innerHTML = renderMainApp();
  attachMainEvents();
  attachFilterEvents();
  requestAnimationFrame(() => renderActiveTab());
}

// ---------------------------------------------------------------------------
// Upload screen
// ---------------------------------------------------------------------------

function renderUploadScreen() {
  return /* html */ `
    <div class="upload-screen">
      <header class="app-header">
        <div class="header-brand">
          <svg class="header-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M16 17l2-2-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="header-title">LocalLedger</span>
        </div>
      </header>

      <main class="upload-main">
        <div class="upload-card">
          <div class="upload-icon-wrap" aria-hidden="true">
            <svg viewBox="0 0 48 48" fill="none" class="upload-icon">
              <rect x="4" y="4" width="40" height="40" rx="8" fill="#eff6ff"/>
              <path d="M24 32V18M24 18l-6 6M24 18l6 6" stroke="#2563eb" stroke-width="2.5"
                stroke-linecap="round" stroke-linejoin="round"/>
              <path d="M14 36h20" stroke="#2563eb" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>
          <h1 class="upload-heading">Import your transactions</h1>
          <p class="upload-sub">
            Drag &amp; drop your CSV file here, or click to browse.
            <br/>Your data <strong>never</strong> leaves your browser.
          </p>

          <div class="drop-zone" id="drop-zone" role="button" tabindex="0"
               aria-label="Drop CSV file here or click to browse">
            <input type="file" id="file-input" accept=".csv,text/csv" class="sr-only"
                   aria-label="Choose CSV file" />
            <p class="drop-zone-text">
              <span class="drop-zone-icon" aria-hidden="true">📂</span>
              Drag &amp; drop or <span class="drop-zone-link">click to browse</span>
            </p>
          </div>

          <div id="upload-error" class="alert alert-danger" role="alert" style="display:none"></div>

          <div class="upload-info">
            <h2 class="upload-info-heading">Supported formats</h2>
            <ul class="upload-info-list">
              <li>Standard bank/card CSV exports with headers</li>
              <li>Quoted fields, commas in values handled automatically</li>
              <li>Common column names auto-detected (Date, Amount, Description, Category…)</li>
              <li>Column mapping is configurable if auto-detection fails</li>
              <li>Ambiguous dates (e.g. 03/03/2026) default to DD/MM/YYYY — change in the mapping dialog if your file uses MM/DD/YYYY</li>
            </ul>
          </div>
        </div>
      </main>
    </div>
  `;
}

function attachUploadEvents() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-input');

  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drop-zone--active');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drop-zone--active'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drop-zone--active');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) handleFile(fileInput.files[0]);
  });
}

async function handleFile(file) {
  clearUploadError();
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
    showUploadError('Please upload a CSV file (.csv).');
    return;
  }

  try {
    const { headers, rows } = await parseCSVFile(file);
    if (headers.length === 0 || rows.length === 0) {
      showUploadError('The file appears to be empty or has no recognisable headers.');
      return;
    }

    const mapping = autoDetectMapping(headers);
    state.pendingHeaders = headers;
    state.pendingRows = rows;
    state.pendingMapping = mapping;

    // If mapping is complete, offer a preview; always let user confirm/adjust
    showMappingDialog(headers, mapping);
  } catch (err) {
    showUploadError(`Could not parse CSV: ${err.message}`);
  }
}

function showUploadError(msg) {
  const el = document.getElementById('upload-error');
  if (el) { el.textContent = msg; el.style.display = ''; }
}
function clearUploadError() {
  const el = document.getElementById('upload-error');
  if (el) { el.textContent = ''; el.style.display = 'none'; }
}

// ---------------------------------------------------------------------------
// Column-mapping dialog
// ---------------------------------------------------------------------------

function showMappingDialog(headers, mapping) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'mapping-modal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'mapping-title');

  const headerOptions = headers.map((h) => `<option value="${escapeHtml(h)}">${escapeHtml(h)}</option>`).join('');
  const selectFor = (field, label, required = false) => {
    const current = mapping[field] || '';
    return /* html */ `
      <div class="form-row">
        <label class="form-label" for="map-${field}">
          ${label}${required ? ' <span class="required">*</span>' : ''}
        </label>
        <select id="map-${field}" class="form-select" name="${field}">
          ${required ? '' : '<option value="">(none / skip)</option>'}
          ${headers.map((h) => `<option value="${escapeHtml(h)}"${h === current ? ' selected' : ''}>${escapeHtml(h)}</option>`).join('')}
        </select>
      </div>`;
  };

  overlay.innerHTML = /* html */ `
    <div class="modal">
      <div class="modal-header">
        <h2 id="mapping-title" class="modal-title">Map CSV columns</h2>
        <p class="modal-subtitle">
          Tell LocalLedger which column in your CSV corresponds to each field.
          Required fields are marked <span class="required">*</span>.
        </p>
      </div>
      <div class="modal-body">
        <div id="mapping-error" class="alert alert-danger" role="alert" style="display:none"></div>
        ${selectFor('date', 'Date', true)}
        ${selectFor('description', 'Description / Payee', true)}
        ${selectFor('amount', 'Amount', true)}
        ${selectFor('category', 'Category')}

        <div class="form-row">
          <label class="form-label" for="map-dateFormat">Date format</label>
          <select id="map-dateFormat" class="form-select">
            <option value="auto" ${mapping.dateFormat === 'auto' ? 'selected' : ''}>Auto-detect</option>
            <option value="dmy" ${mapping.dateFormat === 'dmy' ? 'selected' : ''}>DD/MM/YYYY (UK)</option>
            <option value="mdy" ${mapping.dateFormat === 'mdy' ? 'selected' : ''}>MM/DD/YYYY (US)</option>
            <option value="ymd" ${mapping.dateFormat === 'ymd' ? 'selected' : ''}>YYYY-MM-DD (ISO)</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label" for="map-amountSign">Amount sign convention</label>
          <select id="map-amountSign" class="form-select">
            <option value="auto" ${mapping.amountSign === 'auto' ? 'selected' : ''}>Auto-detect</option>
            <option value="positive" ${mapping.amountSign === 'positive' ? 'selected' : ''}>Positive = expense (most exports)</option>
            <option value="negative" ${mapping.amountSign === 'negative' ? 'selected' : ''}>Negative = expense (debit-style)</option>
          </select>
        </div>

        <div class="form-row">
          <label class="form-label" for="map-currency">Currency symbol</label>
          <select id="map-currency" class="form-select">
            ${['£','$','€','¥','₹','CHF','A$','C$'].map(
              (s) => `<option value="${escapeHtml(s)}"${s === state.currencySymbol ? ' selected' : ''}>${escapeHtml(s)}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <div class="modal-footer">
        <button id="mapping-cancel" class="btn btn-secondary">Cancel</button>
        <button id="mapping-confirm" class="btn btn-primary">Import transactions</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  document.getElementById('mapping-cancel').addEventListener('click', () => {
    overlay.remove();
  });

  document.getElementById('mapping-confirm').addEventListener('click', async () => {
    const finalMapping = {
      date: document.getElementById('map-date').value,
      description: document.getElementById('map-description').value,
      amount: document.getElementById('map-amount').value,
      category: document.getElementById('map-category').value || null,
      dateFormat: document.getElementById('map-dateFormat').value,
      amountSign: document.getElementById('map-amountSign').value,
    };
    state.currencySymbol = document.getElementById('map-currency').value;

    if (!finalMapping.date || !finalMapping.description || !finalMapping.amount) {
      const errEl = document.getElementById('mapping-error');
      if (errEl) { errEl.textContent = 'Please map the required fields (Date, Description, Amount).'; errEl.style.display = ''; }
      return;
    }

    const { transactions, skipped } = normaliseTransactions(state.pendingRows, finalMapping);
    if (transactions.length === 0) {
      const errEl = document.getElementById('mapping-error');
      if (errEl) { errEl.textContent = `No valid transactions could be parsed (${skipped} rows skipped). Check column mapping and date format.`; errEl.style.display = ''; }
      return;
    }

    overlay.remove();

    // Persist mapping and currency preference
    saveSetting('columnMapping', finalMapping);
    saveSetting('currencySymbol', state.currencySymbol);

    // Store transactions
    state.transactions = transactions;
    state.isLoaded = true;
    state.filters = { dateFrom: '', dateTo: '', category: '', search: '' };
    state.page = 0;

    try {
      await saveTransactions(transactions);
    } catch {
      // IndexedDB might be unavailable – continue anyway
    }

    if (skipped > 0) {
      // Show a brief non-blocking notice
      showToast(`Imported ${transactions.length} transactions (${skipped} rows skipped).`);
    }

    render();
  });
}

// ---------------------------------------------------------------------------
// Main app shell
// ---------------------------------------------------------------------------

function renderMainApp() {
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'transactions', label: 'Transactions' },
    { id: 'settings', label: 'Settings' },
  ];

  return /* html */ `
    <div class="app-shell">
      <header class="app-header">
        <div class="header-brand">
          <svg class="header-logo" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <rect x="2" y="3" width="20" height="18" rx="2" stroke="currentColor" stroke-width="2"/>
            <path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            <path d="M16 17l2-2-2-2" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="header-title">LocalLedger</span>
        </div>
        <div class="header-actions">
          <button class="btn btn-secondary btn-sm" id="btn-new-file">
            Upload new file
          </button>
          <button class="btn btn-danger btn-sm" id="btn-clear">
            Clear data
          </button>
        </div>
      </header>

      <nav class="tab-bar" role="tablist" aria-label="Main navigation">
        ${tabs.map((t) => /* html */ `
          <button
            class="tab-btn${t.id === state.activeTab ? ' tab-btn--active' : ''}"
            role="tab"
            aria-selected="${t.id === state.activeTab}"
            data-tab="${t.id}"
          >${t.label}</button>
        `).join('')}
      </nav>

      <main class="tab-content" id="tab-content"></main>
    </div>
    <div id="toast-container" aria-live="polite" aria-atomic="true"></div>
  `;
}

function attachMainEvents() {
  // Tab switching
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;
      if (tab === state.activeTab) return;
      state.activeTab = tab;
      document.querySelectorAll('.tab-btn').forEach((b) => {
        b.classList.toggle('tab-btn--active', b.dataset.tab === tab);
        b.setAttribute('aria-selected', String(b.dataset.tab === tab));
      });
      renderActiveTab();
    });
  });

  // New file button – go back to upload screen (keep data in DB)
  document.getElementById('btn-new-file').addEventListener('click', () => {
    state.isLoaded = false;
    state.transactions = [];
    render();
  });

  // Clear data
  document.getElementById('btn-clear').addEventListener('click', async () => {
    if (!confirm('Delete all transaction data? This cannot be undone.')) return;
    try {
      await clearTransactions();
      clearSettings();
    } catch { /* ignore */ }
    state.transactions = [];
    state.isLoaded = false;
    state.filters = { dateFrom: '', dateTo: '', category: '', search: '' };
    state.page = 0;
    render();
  });
}

function renderActiveTab() {
  const content = document.getElementById('tab-content');
  if (!content) return;

  destroyCharts();

  if (state.activeTab === 'overview') {
    content.innerHTML = renderOverview();
    requestAnimationFrame(() => {
      renderCharts(state.transactions, state.currencySymbol);
      renderTopMerchants();
    });
  } else if (state.activeTab === 'transactions') {
    content.innerHTML = renderTransactions();
    attachFilterEvents();
    attachTableEvents();
  } else if (state.activeTab === 'settings') {
    content.innerHTML = renderSettings();
    attachSettingsEvents();
  }
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function renderOverview() {
  const spend = state.transactions.filter((t) => t.amount > 0);
  const totalSpend = spend.reduce((s, t) => s + t.amount, 0);
  const months = new Set(spend.map((t) => t.date.slice(0, 7)));
  const monthCount = months.size || 1;
  const avgMonthly = totalSpend / monthCount;

  // Top category
  const catTotals = {};
  for (const t of spend) {
    const cat = t.category.split('-')[0].trim() || 'Uncategorised';
    catTotals[cat] = (catTotals[cat] || 0) + t.amount;
  }
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

  const cs = state.currencySymbol;

  return /* html */ `
    <div class="overview">
      <section class="summary-grid" aria-label="Summary statistics">
        ${summaryCard('Total spend', formatCurrency(totalSpend, cs), 'blue')}
        ${summaryCard('Monthly average', formatCurrency(avgMonthly, cs), 'green')}
        ${summaryCard('Top category', topCat ? escapeHtml(topCat[0]) : '—', 'purple')}
        ${summaryCard('Transactions', spend.length.toLocaleString(), 'orange')}
      </section>

      <div class="charts-grid">
        <section class="chart-card" aria-label="Spend by category">
          <h2 class="chart-title">Spend by category</h2>
          <div class="chart-wrap chart-wrap--donut">
            <canvas id="category-chart"></canvas>
          </div>
        </section>

        <section class="chart-card" aria-label="Spend by month">
          <h2 class="chart-title">Spend by month</h2>
          <div class="chart-wrap chart-wrap--bar">
            <canvas id="monthly-chart"></canvas>
          </div>
        </section>
      </div>

      <section class="chart-card top-merchants-card" aria-label="Top merchants">
        <h2 class="chart-title">Top merchants / payees</h2>
        <div id="top-merchants-list"></div>
      </section>
    </div>
  `;
}

function summaryCard(label, value, color) {
  return /* html */ `
    <div class="summary-card summary-card--${color}">
      <span class="summary-value">${value}</span>
      <span class="summary-label">${escapeHtml(label)}</span>
    </div>`;
}

function renderTopMerchants() {
  const el = document.getElementById('top-merchants-list');
  if (!el) return;

  const spend = state.transactions.filter((t) => t.amount > 0);
  const totals = {};
  const counts = {};
  for (const t of spend) {
    const key = t.description || 'Unknown';
    totals[key] = (totals[key] || 0) + t.amount;
    counts[key] = (counts[key] || 0) + 1;
  }

  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (sorted.length === 0) {
    el.innerHTML = '<p class="text-muted">No data.</p>';
    return;
  }

  const maxVal = sorted[0][1];
  const cs = state.currencySymbol;

  el.innerHTML = sorted.map(([name, total], i) => {
    const pct = maxVal > 0 ? (total / maxVal) * 100 : 0;
    return /* html */ `
      <div class="merchant-row">
        <span class="merchant-rank">${i + 1}</span>
        <span class="merchant-name">${escapeHtml(truncate(name, 36))}</span>
        <div class="merchant-bar-wrap">
          <div class="merchant-bar" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="merchant-amount">${formatCurrency(total, cs)}</span>
        <span class="merchant-count">${counts[name]}×</span>
      </div>`;
  }).join('');
}

// ---------------------------------------------------------------------------
// Transactions tab
// ---------------------------------------------------------------------------

function getFilteredSorted() {
  let rows = [...state.transactions];

  const { dateFrom, dateTo, category, search } = state.filters;
  if (dateFrom) rows = rows.filter((t) => t.date >= dateFrom);
  if (dateTo) rows = rows.filter((t) => t.date <= dateTo);
  if (category) {
    const catLower = category.toLowerCase();
    rows = rows.filter((t) => t.category.toLowerCase().includes(catLower));
  }
  if (search) {
    const q = search.toLowerCase();
    rows = rows.filter((t) =>
      t.description.toLowerCase().includes(q) ||
      t.category.toLowerCase().includes(q)
    );
  }

  // Sort
  const { field, dir } = state.sort;
  rows.sort((a, b) => {
    let av = a[field], bv = b[field];
    if (field === 'amount') { av = Number(av); bv = Number(bv); }
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });

  return rows;
}

function renderTransactions() {
  const allRows = getFilteredSorted();
  const totalPages = Math.ceil(allRows.length / state.pageSize) || 1;
  state.page = clamp(state.page, 0, totalPages - 1);
  const pageRows = allRows.slice(state.page * state.pageSize, (state.page + 1) * state.pageSize);

  // Get unique top-level categories for filter dropdown
  const categories = [...new Set(
    state.transactions.map((t) => t.category.split('-')[0].trim())
  )].sort();

  const cs = state.currencySymbol;
  const sortIndicator = (f) => state.sort.field === f ? (state.sort.dir === 'asc' ? ' ↑' : ' ↓') : '';

  return /* html */ `
    <div class="transactions-view">
      <div class="filter-bar" role="search" aria-label="Filter transactions">
        <div class="filter-row">
          <label class="filter-label" for="f-dateFrom">From</label>
          <input id="f-dateFrom" type="date" class="filter-input" value="${escapeHtml(state.filters.dateFrom)}" />

          <label class="filter-label" for="f-dateTo">To</label>
          <input id="f-dateTo" type="date" class="filter-input" value="${escapeHtml(state.filters.dateTo)}" />

          <label class="filter-label" for="f-category">Category</label>
          <select id="f-category" class="filter-input filter-select">
            <option value="">All categories</option>
            ${categories.map((c) => `<option value="${escapeHtml(c)}"${c === state.filters.category ? ' selected' : ''}>${escapeHtml(c)}</option>`).join('')}
          </select>

          <label class="filter-label sr-only" for="f-search">Search</label>
          <input id="f-search" type="search" class="filter-input filter-search"
            placeholder="Search description…" value="${escapeHtml(state.filters.search)}" />

          <button id="btn-clear-filters" class="btn btn-secondary btn-sm">Reset</button>
        </div>
        <p class="filter-summary">
          Showing <strong>${allRows.length.toLocaleString()}</strong> of
          <strong>${state.transactions.length.toLocaleString()}</strong> transactions
          &nbsp;·&nbsp; Page ${state.page + 1} of ${totalPages}
        </p>
      </div>

      <div class="table-wrap" role="region" aria-label="Transactions table" tabindex="0">
        <table class="tx-table">
          <thead>
            <tr>
              <th><button class="sort-btn" data-sort="date">Date${sortIndicator('date')}</button></th>
              <th><button class="sort-btn" data-sort="description">Description${sortIndicator('description')}</button></th>
              <th><button class="sort-btn" data-sort="amount">Amount${sortIndicator('amount')}</button></th>
              <th><button class="sort-btn" data-sort="category">Category${sortIndicator('category')}</button></th>
            </tr>
          </thead>
          <tbody>
            ${pageRows.length === 0
              ? `<tr><td colspan="4" class="empty-row">No transactions match your filters.</td></tr>`
              : pageRows.map((t) => /* html */ `
                <tr>
                  <td class="tx-date">${escapeHtml(formatDate(t.date))}</td>
                  <td class="tx-desc" title="${escapeHtml(t.description)}">${escapeHtml(truncate(t.description, 48))}</td>
                  <td class="tx-amount ${t.amount < 0 ? 'tx-amount--income' : ''}">${formatCurrency(t.amount, cs)}</td>
                  <td class="tx-cat">${escapeHtml(t.category)}</td>
                </tr>`).join('')}
          </tbody>
        </table>
      </div>

      ${totalPages > 1 ? /* html */ `
        <div class="pagination" aria-label="Pagination">
          <button class="btn btn-secondary btn-sm" id="btn-prev" ${state.page === 0 ? 'disabled' : ''}>← Prev</button>
          <span class="pagination-info">Page ${state.page + 1} / ${totalPages}</span>
          <button class="btn btn-secondary btn-sm" id="btn-next" ${state.page >= totalPages - 1 ? 'disabled' : ''}>Next →</button>
        </div>` : ''}
    </div>
  `;
}

function attachFilterEvents() {
  const debouncedRefresh = debounce(() => refreshTransactionsView(), 200);

  const bind = (id, key, immediate = false) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', () => {
      state.filters[key] = el.value;
      state.page = 0;
      if (immediate) refreshTransactionsView(); else debouncedRefresh();
    });
  };

  bind('f-dateFrom', 'dateFrom', true);
  bind('f-dateTo', 'dateTo', true);
  bind('f-category', 'category', true);
  bind('f-search', 'search');

  document.getElementById('btn-clear-filters')?.addEventListener('click', () => {
    state.filters = { dateFrom: '', dateTo: '', category: '', search: '' };
    state.page = 0;
    refreshTransactionsView();
  });
}

function refreshTransactionsView() {
  const content = document.getElementById('tab-content');
  if (!content) return;
  content.innerHTML = renderTransactions();
  attachFilterEvents();
  attachTableEvents();
}

function attachTableEvents() {
  // Sort buttons
  document.querySelectorAll('.sort-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.sort;
      if (state.sort.field === field) {
        state.sort.dir = state.sort.dir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sort.field = field;
        state.sort.dir = field === 'amount' ? 'desc' : 'asc';
      }
      state.page = 0;
      refreshTransactionsView();
    });
  });

  // Pagination
  document.getElementById('btn-prev')?.addEventListener('click', () => {
    state.page = Math.max(0, state.page - 1);
    refreshTransactionsView();
  });
  document.getElementById('btn-next')?.addEventListener('click', () => {
    const total = Math.ceil(getFilteredSorted().length / state.pageSize);
    state.page = Math.min(total - 1, state.page + 1);
    refreshTransactionsView();
  });
}

// ---------------------------------------------------------------------------
// Settings tab
// ---------------------------------------------------------------------------

function renderSettings() {
  const mapping = loadSetting('columnMapping', {});
  return /* html */ `
    <div class="settings-view">
      <section class="settings-card">
        <h2 class="settings-heading">Data &amp; Privacy</h2>
        <p class="settings-desc">
          All transaction data is stored <strong>only</strong> in your browser's IndexedDB.
          No data is ever sent to any server. Clearing site data in your browser will erase everything.
        </p>
        <div class="settings-row">
          <div>
            <strong>${state.transactions.length.toLocaleString()} transactions</strong> currently stored.
          </div>
          <button class="btn btn-danger btn-sm" id="settings-clear-btn">Delete all data</button>
        </div>
      </section>

      <section class="settings-card">
        <h2 class="settings-heading">Display preferences</h2>
        <div class="form-row">
          <label class="form-label" for="pref-currency">Currency symbol</label>
          <select id="pref-currency" class="form-select form-select--sm">
            ${['£','$','€','¥','₹','CHF','A$','C$'].map(
              (s) => `<option value="${escapeHtml(s)}"${s === state.currencySymbol ? ' selected' : ''}>${escapeHtml(s)}</option>`
            ).join('')}
          </select>
        </div>
        <div class="form-row">
          <label class="form-label" for="pref-pagesize">Rows per page</label>
          <select id="pref-pagesize" class="form-select form-select--sm">
            ${[25, 50, 100, 200].map(
              (n) => `<option value="${n}"${n === state.pageSize ? ' selected' : ''}>${n}</option>`
            ).join('')}
          </select>
        </div>
        <button class="btn btn-primary btn-sm" id="settings-save-prefs">Save preferences</button>
      </section>

      <section class="settings-card">
        <h2 class="settings-heading">Column mapping</h2>
        <p class="settings-desc">Last used column mapping:</p>
        ${Object.keys(mapping).length
          ? /* html */ `<dl class="mapping-dl">
              ${Object.entries(mapping).map(([k, v]) =>
                v ? `<div class="mapping-row"><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(String(v))}</dd></div>` : ''
              ).join('')}
            </dl>`
          : '<p class="text-muted">No mapping saved yet.</p>'}
        <p class="settings-desc" style="margin-top:0.75rem">
          To change the column mapping, upload a new CSV file.
        </p>
      </section>
    </div>`;
}

function attachSettingsEvents() {
  document.getElementById('settings-clear-btn')?.addEventListener('click', async () => {
    if (!confirm('Delete all transaction data? This cannot be undone.')) return;
    try { await clearTransactions(); clearSettings(); } catch { /* ignore */ }
    state.transactions = [];
    state.isLoaded = false;
    render();
  });

  document.getElementById('settings-save-prefs')?.addEventListener('click', () => {
    const cs = document.getElementById('pref-currency').value;
    const ps = Number(document.getElementById('pref-pagesize').value);
    state.currencySymbol = cs;
    state.pageSize = ps;
    saveSetting('currencySymbol', cs);
    saveSetting('pageSize', ps);
    showToast('Preferences saved.');
  });
}

// ---------------------------------------------------------------------------
// Toast notifications
// ---------------------------------------------------------------------------

function showToast(message, durationMs = 3500) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast--visible'));
  setTimeout(() => {
    toast.classList.remove('toast--visible');
    setTimeout(() => toast.remove(), 300);
  }, durationMs);
}

// ---------------------------------------------------------------------------
// Service-worker registration
// ---------------------------------------------------------------------------

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // PWA offline support unavailable – continue normally
    });
  }
}
