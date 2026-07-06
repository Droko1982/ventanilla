/**
 * Ventanilla — Plataforma SaaS de ventas e inventario para tiendas en Colombia.
 * Desarrollada por el Dr. Mauricio Rodríguez Herrera.
 * © Dr. Mauricio Rodríguez Herrera. Todos los derechos reservados.
 */
import React from 'react'
import ReactDOM from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import App from './App'
import './index.css'
import { isCloudConfigured } from './data/api'
import { initTheme } from './lib/theme'

// Carga los datos de demo la primera vez y arranca la app.
// Usamos HashRouter para que el refresco de página funcione en GitHub Pages.
async function boot() {
  initTheme() // aplica modo claro/oscuro antes de pintar
  // El seed (datos de ejemplo) y la nube se cargan bajo demanda para no pesar
  // en el bundle principal (arranque más liviano en celular).
  // Solo sembramos el demo en equipos SIN nube. Una cuenta real conectada
  // nunca recibe datos de demo encima (sus datos llegan del servidor).
  if (!isCloudConfigured()) {
    const { seedIfEmpty } = await import('./data/seed')
    await seedIfEmpty()
  }
  // Si hay nube configurada, sincroniza en segundo plano (no bloquea la app).
  import('./data/cloud').then((m) => m.startCloud().catch(() => {})).catch(() => {})
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <HashRouter>
        <App />
      </HashRouter>
    </React.StrictMode>,
  )
}

boot()
