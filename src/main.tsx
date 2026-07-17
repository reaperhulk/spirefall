import { createRoot } from 'react-dom/client'
import App from './ui/App'
import './ui/styles.css'

createRoot(document.getElementById('root')!).render(<App />)

// Offline support: production builds register the service worker (dev skips
// it so Vite HMR and the worker never fight over requests).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Offline play is a bonus, never a blocker.
    })
  })
}
