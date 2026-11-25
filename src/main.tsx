import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { SettingsProvider } from './contexts/SettingsContext'
import { ToastProvider } from './contexts/ToastContext'
import './index.css'
import './lib/install' // starts listening for the browser's "install app" event before the page finishes loading
import { syncThemeColor } from './lib/theme'
import { ErrorBoundary, reloadOnce } from './components/ErrorBoundary'

window.addEventListener('vite:preloadError', (e) => { if (reloadOnce()) e.preventDefault() }) // a stale tab after a deploy: reload once to get the new files
if ('serviceWorker' in navigator && import.meta.env.PROD) window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined) }) // offline page for the installed app
syncThemeColor() // the inline script in index.html already set the dark class; make the phone's browser bar match it too

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
    </ErrorBoundary>
  </StrictMode>,
)
