import './style.css';
import { renderUpload } from './pages/upload';
import { renderDashboard } from './pages/dashboard';
import { renderHistory } from './pages/history';
import { renderReview } from './pages/review';

function updateActiveNav(hash: string) {
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === hash) {
      link.classList.add('active');
    }
  });
}

function router() {
  const contentDiv = document.getElementById('app-content');
  if (!contentDiv) return;
  contentDiv.innerHTML = ''; // Clear current content
  
  const hash = window.location.hash || '#upload';
  updateActiveNav(hash);

  try {
    if (hash === '#upload') {
      renderUpload(contentDiv);
    } else if (hash === '#dashboard') {
      renderDashboard(contentDiv);
    } else if (hash === '#history') {
      renderHistory(contentDiv);
    } else if (hash === '#review') {
      renderReview(contentDiv);
    } else {
      contentDiv.innerHTML = '<h2>404 Not Found</h2>';
    }
  } catch (err: any) {
    contentDiv.innerHTML = `<div class="error-card">Error loading page: ${err.message || 'Unknown error'}</div>`;
  }
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', router);
