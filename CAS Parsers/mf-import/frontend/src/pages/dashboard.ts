import { api } from '../api';

// Format helpers
const formatCurrency = (val: string | number) => {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(num);
};

const formatPct = (val: string | number | null) => {
  if (val === null || val === undefined) return 'N/A';
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return new Intl.NumberFormat('en-IN', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num / 100);
};

export async function renderDashboard(container: HTMLElement) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h2>Portfolio Dashboard</h2>
    </div>
    
    <div id="dashboard-error" style="display: none;" class="error-message"></div>
    <div id="dashboard-loading" style="text-align: center; padding: 3rem;">
      <div class="loader" style="width: 48px; height: 48px; border-width: 4px;"></div>
      <div style="margin-top: 1rem; color: var(--text-muted);">Loading portfolio data...</div>
    </div>

    <div id="dashboard-content" style="display: none;">
      <!-- Summary Cards -->
      <div class="dashboard-grid" id="summary-cards"></div>

      <!-- Charts -->
      <div class="charts-grid">
        <div class="card">
          <h3 class="card-title">Asset Allocation</h3>
          <div class="chart-container">
            <canvas id="allocation-chart"></canvas>
          </div>
        </div>
        <div class="card">
          <h3 class="card-title">Portfolio Valuation History</h3>
          <div class="chart-container">
            <canvas id="valuation-chart"></canvas>
          </div>
        </div>
      </div>

      <!-- Holdings Table -->
      <div class="card">
        <h3 class="card-title">Current Holdings</h3>
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th data-sort="scheme_name">Scheme Name ↕</th>
                <th data-sort="category">Category ↕</th>
                <th class="text-right" data-sort="units">Units ↕</th>
                <th class="text-right" data-sort="avg_cost">Avg Cost ↕</th>
                <th class="text-right" data-sort="current_nav">NAV ↕</th>
                <th class="text-right" data-sort="current_value">Value ↕</th>
                <th class="text-right" data-sort="gain">Gain ↕</th>
                <th class="text-right" data-sort="xirr">XIRR ↕</th>
              </tr>
            </thead>
            <tbody id="holdings-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const [summary, allocation, valuation, holdings] = await Promise.all([
      api.getSummary(),
      api.getAllocation(),
      api.getValuationHistory(),
      api.getHoldings()
    ]);

    document.getElementById('dashboard-loading')!.style.display = 'none';
    document.getElementById('dashboard-content')!.style.display = 'block';

    renderSummary(summary);
    renderAllocationChart(allocation);
    renderValuationChart(valuation);
    renderHoldings(holdings);
  } catch (err: any) {
    document.getElementById('dashboard-loading')!.style.display = 'none';
    const errDiv = document.getElementById('dashboard-error')!;
    errDiv.textContent = err.message || 'Failed to load dashboard data.';
    errDiv.style.display = 'block';
  }
}

function renderSummary(summary: any) {
  const isPositiveGain = parseFloat(summary.absolute_gain) >= 0;
  const gainClass = isPositiveGain ? 'text-success' : 'text-danger';
  const xirrClass = (summary.xirr && parseFloat(summary.xirr) >= 0) ? 'text-success' : 'text-danger';

  const cardsHtml = `
    <div class="card summary-card">
      <div class="summary-label">Current Value</div>
      <div class="summary-value" style="color: var(--primary)">${formatCurrency(summary.current_value)}</div>
    </div>
    <div class="card summary-card">
      <div class="summary-label">Invested Amount</div>
      <div class="summary-value">${formatCurrency(summary.invested)}</div>
    </div>
    <div class="card summary-card">
      <div class="summary-label">Absolute Gain</div>
      <div class="summary-value ${gainClass}">${isPositiveGain ? '+' : ''}${formatCurrency(summary.absolute_gain)}</div>
    </div>
    <div class="card summary-card">
      <div class="summary-label">XIRR</div>
      <div class="summary-value ${xirrClass}">${summary.xirr ? formatPct(summary.xirr) : 'N/A'}</div>
    </div>
  `;
  document.getElementById('summary-cards')!.innerHTML = cardsHtml;
}

function renderAllocationChart(allocation: any[]) {
  const ctx = document.getElementById('allocation-chart') as HTMLCanvasElement;
  const labels = allocation.map((a: any) => a.category);
  const data = allocation.map((a: any) => parseFloat(a.weight));
  
  // Custom colors for different categories
  const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4'];

  // @ts-ignore
  new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors.slice(0, data.length),
        borderWidth: 0,
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#94a3b8' }
        },
        tooltip: {
          callbacks: {
            label: (context: any) => ` ${context.label}: ${context.parsed.toFixed(2)}%`
          }
        }
      },
      cutout: '70%'
    }
  });
}

function renderValuationChart(valuation: any[]) {
  const ctx = document.getElementById('valuation-chart') as HTMLCanvasElement;
  // Sort by date just in case
  const sorted = [...valuation].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  
  const labels = sorted.map(v => v.date);
  const data = sorted.map(v => parseFloat(v.value));

  // @ts-ignore
  new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Portfolio Value (₹)',
        data,
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59, 130, 246, 0.1)',
        borderWidth: 2,
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        pointHitRadius: 10,
        pointHoverRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (context: any) => ` ₹${context.parsed.y.toLocaleString('en-IN')}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: '#334155', drawBorder: false },
          ticks: { color: '#94a3b8', maxTicksLimit: 6 }
        },
        y: {
          grid: { color: '#334155', drawBorder: false },
          ticks: {
            color: '#94a3b8',
            callback: (val: any) => '₹' + (val / 100000 >= 1 ? (val / 100000).toFixed(1) + 'L' : val.toLocaleString('en-IN'))
          }
        }
      }
    }
  });
}

function renderHoldings(holdings: any[]) {
  let currentSort = { column: 'current_value', desc: true };
  let currentHoldings = [...holdings];

  const tbody = document.getElementById('holdings-body')!;
  const headers = document.querySelectorAll('th[data-sort]');

  const drawTable = () => {
    tbody.innerHTML = currentHoldings.length === 0 
      ? '<tr><td colspan="8" class="text-center">No holdings found.</td></tr>'
      : currentHoldings.map(h => {
          const gainVal = parseFloat(h.gain);
          const gainClass = gainVal >= 0 ? 'text-success' : 'text-danger';
          const xirrClass = h.xirr && parseFloat(h.xirr) >= 0 ? 'text-success' : (h.xirr ? 'text-danger' : '');
          
          return `
            <tr>
              <td>
                <div style="font-weight: 500">${h.scheme_name}</div>
                <div style="font-size: 0.8rem; color: var(--text-muted)">Folio: ${h.folio}</div>
              </td>
              <td><span class="badge" style="background: rgba(59,130,246,0.1); color: var(--primary);">${h.category || 'Unknown'}</span></td>
              <td class="text-right">${parseFloat(h.units).toFixed(3)}</td>
              <td class="text-right">${formatCurrency(h.avg_cost)}</td>
              <td class="text-right">${parseFloat(h.current_nav).toFixed(2)}</td>
              <td class="text-right" style="font-weight: 600">${formatCurrency(h.current_value)}</td>
              <td class="text-right ${gainClass}">${gainVal >= 0 ? '+' : ''}${formatCurrency(h.gain)}</td>
              <td class="text-right ${xirrClass}">${h.xirr ? formatPct(h.xirr) : 'N/A'}</td>
            </tr>
          `;
        }).join('');
  };

  const sortHoldings = () => {
    currentHoldings.sort((a: any, b: any) => {
      let valA = a[currentSort.column];
      let valB = b[currentSort.column];
      
      // Parse numbers for numeric columns
      if (['units', 'avg_cost', 'current_nav', 'current_value', 'gain', 'xirr'].includes(currentSort.column)) {
        valA = parseFloat(valA) || 0;
        valB = parseFloat(valB) || 0;
      }
      
      if (valA < valB) return currentSort.desc ? 1 : -1;
      if (valA > valB) return currentSort.desc ? -1 : 1;
      return 0;
    });
    drawTable();
  };

  headers.forEach(th => {
    th.addEventListener('click', () => {
      const col = th.getAttribute('data-sort');
      if (col) {
        if (currentSort.column === col) {
          currentSort.desc = !currentSort.desc;
        } else {
          currentSort.column = col;
          currentSort.desc = true;
        }
        sortHoldings();
      }
    });
  });

  sortHoldings();
}
