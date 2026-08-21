import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { PrintAnalyticsView } from './features/analytics/print/PrintAnalyticsView.tsx'

const isPrintRoute =
  typeof window !== "undefined" && window.location.pathname.startsWith("/print/analytics")

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isPrintRoute ? <PrintAnalyticsView /> : <App />}
  </StrictMode>,
)
