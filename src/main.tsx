import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { seedIfEmpty } from './data/seed'
import { startCloud } from './data/cloud'
import { initTheme } from './lib/theme'

// Carga los datos de demo la primera vez y arranca la app.
// Usamos HashRouter para que el refresco de página funcione en GitHub Pages.
async function boot() {
  initTheme() // aplica modo claro/oscuro antes de pintar
  await seedIfEmpty()
  // Si hay nube configurada, sincroniza en segundo plano (no bloquea la app).
  startCloud().catch(() => {})
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}

boot()
