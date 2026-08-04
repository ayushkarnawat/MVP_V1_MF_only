import { api } from '../api';

export function renderUpload(container: HTMLElement) {
  container.innerHTML = `
    <div class="card" style="max-width: 600px; margin: 0 auto;">
      <h2 class="card-title">Upload CAS Statement</h2>
      <p style="color: var(--text-muted); margin-bottom: 1.5rem;">
        Upload your CAMS/KFintech Consolidated Account Statement (CAS) PDF to import your mutual fund portfolio.
      </p>

      <div id="upload-error" style="display: none;" class="error-message"></div>

      <form id="upload-form">
        <div class="upload-zone" id="drop-zone">
          <div class="upload-icon">📄</div>
          <p>Drag and drop your CAS PDF here, or click to browse</p>
          <input type="file" id="cas-file" accept=".pdf" style="display: none;" required />
          <div id="file-name-display" class="file-name"></div>
        </div>

        <div class="form-group">
          <label for="cas-password" class="form-label">CAS Password</label>
          <input type="password" id="cas-password" class="form-input" placeholder="Enter PDF password" required />
          <small style="color: var(--text-muted); display: block; margin-top: 0.5rem;">
            Usually your PAN in uppercase (e.g., ABCDE1234F). We do not store your password.
          </small>
        </div>

        <button type="submit" class="btn" id="upload-btn" style="width: 100%;">
          <span id="upload-text">Parse CAS File</span>
        </button>
      </form>
    </div>
  `;

  const form = document.getElementById('upload-form') as HTMLFormElement;
  const fileInput = document.getElementById('cas-file') as HTMLInputElement;
  const dropZone = document.getElementById('drop-zone');
  const fileNameDisplay = document.getElementById('file-name-display');
  const errorDiv = document.getElementById('upload-error');
  const btn = document.getElementById('upload-btn') as HTMLButtonElement;

  // Handle Drag & Drop
  dropZone?.addEventListener('click', () => fileInput.click());
  
  dropZone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });

  dropZone?.addEventListener('dragleave', () => {
    dropZone.classList.remove('dragover');
  });

  dropZone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer?.files.length) {
      fileInput.files = e.dataTransfer.files;
      updateFileName();
    }
  });

  fileInput.addEventListener('change', updateFileName);

  function updateFileName() {
    if (fileInput.files && fileInput.files.length > 0) {
      if (fileNameDisplay) {
        fileNameDisplay.textContent = fileInput.files[0].name;
      }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files || fileInput.files.length === 0) {
      showError('Please select a PDF file.');
      return;
    }

    const passwordInput = document.getElementById('cas-password') as HTMLInputElement;
    const file = fileInput.files[0];
    const password = passwordInput.value;

    setLoading(true);
    if (errorDiv) errorDiv.style.display = 'none';

    try {
      const response = await api.uploadCas(file, password);
      // Store preview in session storage to pass to review page
      sessionStorage.setItem('casPreview', JSON.stringify(response));
      window.location.hash = '#review';
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  });

  function showError(msg: string) {
    if (errorDiv) {
      errorDiv.textContent = msg;
      errorDiv.style.display = 'block';
    }
  }

  function setLoading(isLoading: boolean) {
    if (btn) {
      btn.disabled = isLoading;
      btn.innerHTML = isLoading 
        ? '<div class="loader"></div> Parsing...'
        : '<span id="upload-text">Parse CAS File</span>';
    }
  }
}
