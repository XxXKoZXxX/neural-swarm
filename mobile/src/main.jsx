import './lib/platform.js' // must load before anything calls crypto.randomUUID()
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>
)

// Installable app: register the shell worker in production only, so the dev
// server never serves a stale build while editing. Resolved against the Vite
// base so the app installs correctly from a subpath as well as a root domain.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    const scope = import.meta.env.BASE_URL || '/'
    navigator.serviceWorker.register(`${scope}sw.js`, { scope }).catch(() => undefined)
  })
}

document.getElementById('boot')?.remove()
