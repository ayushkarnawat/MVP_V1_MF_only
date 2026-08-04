import { api } from '../api';

export async function renderHistory(container: HTMLElement) {
  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h2>Import History</h2>
    </div>
    
    <div id="history-error" style="display: none;" class="error-message"></div>
    <div id="history-loading" style="text-align: center; padding: 3rem;">
      <div class="loader" style="width: 48px; height: 48px; border-width: 4px;"></div>
      <div style="margin-top: 1rem; color: var(--text-muted);">Loading import history...</div>
    </div>

    <div id="history-content" style="display: none;">
      <div class="card">
        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Date</th>
                <th>Filename</th>
                <th class="text-right">Schemes Found</th>
                <th class="text-right">Txns Added</th>
                <th class="text-right">Txns Skipped</th>
                <th class="text-center">Status</th>
              </tr>
            </thead>
            <tbody id="history-body"></tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const history = await api.getImportHistory();
    document.getElementById('history-loading')!.style.display = 'none';
    document.getElementById('history-content')!.style.display = 'block';

    const tbody = document.getElementById('history-body')!;
    if (history.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center">No import history found.</td></tr>';
      return;
    }

    tbody.innerHTML = history.sort((a: any, b: any) => b.id - a.id).map((item: any) => {
      const dateStr = item.imported_at ? new Date(item.imported_at).toLocaleString() : 'Unknown';
      const statusClass = item.status === 'completed' ? 'badge-success' : 'badge-warning';
      
      return `
        <tr>
          <td>#${item.id}</td>
          <td>${dateStr}</td>
          <td>${item.filename}</td>
          <td class="text-right">${item.schemes_found}</td>
          <td class="text-right text-success">+${item.txns_added}</td>
          <td class="text-right text-muted">${item.txns_skipped}</td>
          <td class="text-center"><span class="badge ${statusClass}">${item.status}</span></td>
        </tr>
      `;
    }).join('');
  } catch (err: any) {
    document.getElementById('history-loading')!.style.display = 'none';
    const errDiv = document.getElementById('history-error')!;
    errDiv.textContent = err.message || 'Failed to load import history.';
    errDiv.style.display = 'block';
  }
}
