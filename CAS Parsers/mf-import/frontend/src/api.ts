const API_BASE = 'http://localhost:8000/api';

export async function fetchJson(endpoint: string, options?: RequestInit) {
  const response = await fetch(`${API_BASE}${endpoint}`, options);
  if (!response.ok) {
    let msg = 'API Error';
    try {
      const err = await response.json();
      msg = err.detail?.message || err.detail || 'Unknown error';
    } catch {
      msg = response.statusText;
    }
    throw new Error(msg);
  }
  return response.json();
}

export const api = {
  uploadCas: (file: File, password: string) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('password', password);
    return fetchJson('/imports/parse', {
      method: 'POST',
      body: formData,
    });
  },
  confirmImport: (sessionId: string, matches: any[]) => {
    return fetchJson('/imports/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId, scheme_matches: matches }),
    });
  },
  getSummary: () => fetchJson('/portfolio/summary'),
  getHoldings: () => fetchJson('/portfolio/holdings'),
  getAllocation: () => fetchJson('/portfolio/allocation'),
  getValuationHistory: () => fetchJson('/portfolio/valuation-history'),
  getImportHistory: () => fetchJson('/imports'),
};
