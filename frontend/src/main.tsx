import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintAnalyticsView } from './features/analytics/print/PrintAnalyticsView.tsx'
import { ReverseContactChangePage } from './features/auth/ReverseContactChangePage.tsx'
import { UndoHeadChangePage } from './features/auth/UndoHeadChangePage.tsx'
import { LegalPage, legalTypeForPath } from './features/legal/LegalPage.tsx'

const isPrintRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/print/analytics")
// Public Terms / Privacy pages, opened in a new tab from the sign-up line.
const legalType = typeof window !== "undefined" ? legalTypeForPath(window.location.pathname) : null
const isUndoHeadChangeRoute =
  typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/undo-head-change"
const isReverseContactChangeRoute =
  typeof window !== "undefined" && window.location.pathname.replace(/\/+$/, "") === "/reverse-contact-change"

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintRoute ? (
      <PrintAnalyticsView />
    ) : legalType ? (
      <LegalPage type={legalType} />
    ) : isUndoHeadChangeRoute ? (
      <UndoHeadChangePage />
    ) : isReverseContactChangeRoute ? (
      <ReverseContactChangePage />
    ) : (
      <App />
    )}
  </StrictMode>,
)
