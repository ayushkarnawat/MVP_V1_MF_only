import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintAnalyticsView } from './features/analytics/print/PrintAnalyticsView.tsx'
import { LegalPage, legalTypeForPath } from './features/legal/LegalPage.tsx'

const isPrintRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/print/analytics")
// Public Terms / Privacy pages, opened in a new tab from the sign-up line.
const legalType = typeof window !== "undefined" ? legalTypeForPath(window.location.pathname) : null

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintRoute ? <PrintAnalyticsView /> : legalType ? <LegalPage type={legalType} /> : <App />}
  </StrictMode>,
)
