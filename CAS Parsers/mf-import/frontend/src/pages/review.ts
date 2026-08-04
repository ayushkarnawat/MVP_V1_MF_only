import { api } from '../api';

export function renderReview(container: HTMLElement) {
  const previewDataStr = sessionStorage.getItem('casPreview');
  if (!previewDataStr) {
    window.location.hash = '#upload';
    return;
  }

  const preview = JSON.parse(previewDataStr);
  const schemesHtml = preview.schemes.map((s: any) => {
    const isExact = s.match_status === 'exact';
    const badgeClass = isExact ? 'badge-success' : (s.match_status === 'partial' ? 'badge-warning' : 'badge-danger');
    return `
      <tr>
        <td>
          <div style="font-weight: 500">${s.name}</div>
          <div style="font-size: 0.8rem; color: var(--text-muted)">Folio: ${s.folio} | AMC: ${s.amc}</div>
        </td>
        <td class="text-center">
          <span class="badge ${badgeClass}">${s.match_status}</span>
          <div style="font-size: 0.8rem; margin-top: 4px;">${s.match_confidence}%</div>
        </td>
        <td>
          ${s.suggested_name ? `<div style="font-size: 0.85rem; color: var(--success)">Matches: ${s.suggested_name}</div>` : ''}
          <div style="font-size: 0.85rem; color: var(--text-muted)">AMFI: ${s.suggested_amfi_code || 'N/A'}</div>
        </td>
        <td class="text-right">${s.transaction_count}</td>
      </tr>
    `;
  }).join('');

  const warningsHtml = preview.parse_warnings?.length > 0 
    ? `<div class="card" style="margin-bottom: 1.5rem; border-color: var(--warning);">
         <h3 style="color: var(--warning); margin-bottom: 0.5rem;">Warnings</h3>
         <ul style="padding-left: 1.5rem; color: #fcd34d;">
           ${preview.parse_warnings.map((w: string) => `<li>${w}</li>`).join('')}
         </ul>
       </div>`
    : '';

  container.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
      <h2>Review CAS Import</h2>
      <div>
        <button id="cancel-btn" class="btn btn-secondary" style="margin-right: 0.5rem;">Cancel</button>
        <button id="confirm-btn" class="btn">Confirm Import</button>
      </div>
    </div>
    
    <div id="review-error" style="display: none;" class="error-message"></div>

    <div class="dashboard-grid">
      <div class="card summary-card">
        <div class="summary-label">Investor Name</div>
        <div class="summary-value" style="font-size: 1.2rem;">${preview.investor_name || 'N/A'}</div>
      </div>
      <div class="card summary-card">
        <div class="summary-label">Schemes Found</div>
        <div class="summary-value">${preview.schemes.length}</div>
      </div>
      <div class="card summary-card">
        <div class="summary-label">Total Transactions</div>
        <div class="summary-value">${preview.transaction_count}</div>
      </div>
    </div>

    ${warningsHtml}

    <div class="card">
      <h3 class="card-title">Parsed Schemes</h3>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Scheme from PDF</th>
              <th class="text-center">Match Status</th>
              <th>Matched DB Scheme</th>
              <th class="text-right">Txns</th>
            </tr>
          </thead>
          <tbody>
            ${schemesHtml || '<tr><td colspan="4" class="text-center">No schemes found.</td></tr>'}
          </tbody>
        </table>
      </div>
    </div>
  `;

  document.getElementById('cancel-btn')?.addEventListener('click', () => {
    sessionStorage.removeItem('casPreview');
    window.location.hash = '#upload';
  });

  const confirmBtn = document.getElementById('confirm-btn') as HTMLButtonElement;
  const errorDiv = document.getElementById('review-error');

  confirmBtn?.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<div class="loader"></div> Confirming...';
    if (errorDiv) errorDiv.style.display = 'none';

    try {
      // Build confirm request body. Matches that have an AMFI code suggested.
      const matches = preview.schemes
        .filter((s: any) => s.suggested_amfi_code)
        .map((s: any) => ({
          temp_id: s.temp_id,
          amfi_code: s.suggested_amfi_code
        }));

      await api.confirmImport(preview.session_id, matches);
      sessionStorage.removeItem('casPreview');
      window.location.hash = '#dashboard';
    } catch (err: any) {
      if (errorDiv) {
        errorDiv.textContent = err.message;
        errorDiv.style.display = 'block';
      }
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = 'Confirm Import';
    }
  });
}
