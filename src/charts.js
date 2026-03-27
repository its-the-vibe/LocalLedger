/**
 * Chart rendering using Chart.js.
 * Creates/updates three charts:
 *  1. Category donut chart
 *  2. Monthly bar chart
 *  3. Top-merchants horizontal bar chart
 */

import {
  Chart,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  BarController,
} from 'chart.js';

Chart.register(
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  DoughnutController,
  BarController,
);

const PALETTE = [
  '#2563eb', '#16a34a', '#d97706', '#dc2626', '#7c3aed',
  '#0891b2', '#db2777', '#65a30d', '#ea580c', '#0284c7',
  '#9333ea', '#b45309', '#16a34a', '#6366f1', '#e11d48',
];

function getColor(index) {
  return PALETTE[index % PALETTE.length];
}

let categoryChart = null;
let monthlyChart = null;

/** Destroy existing charts (call before re-rendering) */
export function destroyCharts() {
  if (categoryChart) { categoryChart.destroy(); categoryChart = null; }
  if (monthlyChart) { monthlyChart.destroy(); monthlyChart = null; }
}

/**
 * Render or update all charts with the given transactions.
 * @param {Array} transactions – normalised transaction objects
 * @param {string} currencySymbol
 */
export function renderCharts(transactions, currencySymbol = '£') {
  const spend = transactions.filter((t) => t.amount > 0);

  renderCategoryChart(spend, currencySymbol);
  renderMonthlyChart(spend, currencySymbol);
}

// ---------------------------------------------------------------------------
// Category donut chart
// ---------------------------------------------------------------------------

function renderCategoryChart(transactions, currencySymbol) {
  const canvas = document.getElementById('category-chart');
  if (!canvas) return;

  // Aggregate by top-level category (before the first "-")
  const totals = {};
  for (const t of transactions) {
    const topCat = t.category.split('-')[0].trim() || 'Uncategorised';
    totals[topCat] = (totals[topCat] || 0) + t.amount;
  }

  // Sort descending, limit to 12 slices
  const sorted = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const labels = sorted.map(([k]) => k);
  const data = sorted.map(([, v]) => +v.toFixed(2));
  const colors = labels.map((_, i) => getColor(i));

  const cfg = {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { boxWidth: 12, padding: 10, font: { size: 12 } },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              const val = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct = total ? ((val / total) * 100).toFixed(1) : '0.0';
              return ` ${currencySymbol}${val.toFixed(2)} (${pct}%)`;
            },
          },
        },
      },
    },
  };

  if (categoryChart) {
    categoryChart.data = cfg.data;
    categoryChart.update();
  } else {
    categoryChart = new Chart(canvas, cfg);
  }
}

// ---------------------------------------------------------------------------
// Monthly bar chart
// ---------------------------------------------------------------------------

function renderMonthlyChart(transactions, currencySymbol) {
  const canvas = document.getElementById('monthly-chart');
  if (!canvas) return;

  // Aggregate by YYYY-MM
  const totals = {};
  for (const t of transactions) {
    const month = t.date.slice(0, 7);
    totals[month] = (totals[month] || 0) + t.amount;
  }

  const sorted = Object.keys(totals).sort();
  const labels = sorted.map((m) => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  });
  const data = sorted.map((m) => +totals[m].toFixed(2));

  const cfg = {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: `Spend (${currencySymbol})`,
        data,
        backgroundColor: '#2563eb',
        borderRadius: 4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${currencySymbol}${ctx.parsed.y.toFixed(2)}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          grid: { color: '#f1f5f9' },
          ticks: {
            callback: (v) => `${currencySymbol}${v}`,
          },
        },
      },
    },
  };

  if (monthlyChart) {
    monthlyChart.data = cfg.data;
    monthlyChart.update();
  } else {
    monthlyChart = new Chart(canvas, cfg);
  }
}
