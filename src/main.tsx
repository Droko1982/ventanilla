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
import { requestPersistentStorage } from './lib/backup'

// Carga los datos de demo la primera vez y arranca la app.
// Usamos HashRouter para que el refresco de página funcione en GitHub Pages.
async function boot() {
  initTheme() // aplica modo claro/oscuro antes de pintar
  // Pide al navegador que NO borre los datos locales (los datos viven en este
  // dispositivo). Sin backend, es la mejor protección contra pérdida por purga
  // del navegador. No bloquea el arranque.
  requestPersistentStorage().catch(() => {})
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

// Si el arranque falla (p. ej. IndexedDB bloqueado en modo incógnito o
// almacenamiento restringido), mostramos un aviso legible en vez de una
// pantalla en blanco.
boot().catch((e) => {
  console.error('Fallo al arrancar:', e)
  const root = document.getElementById('root')
  if (root) {
    root.innerHTML =
      '<div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:24px;text-align:center;font-family:system-ui,sans-serif;color:#334155">' +
      '<div style="font-size:44px">📦</div>' +
      '<h1 style="font-size:18px;font-weight:700;margin:0">No se pudo abrir Ventanilla</h1>' +
      '<p style="font-size:14px;max-width:22rem;color:#64748b">Tu navegador podría estar bloqueando el almacenamiento local (modo incógnito o permisos). Actívalo o usa una ventana normal, y recarga.</p>' +
      '<button onclick="location.reload()" style="background:#0d9488;color:#fff;border:0;border-radius:10px;padding:10px 18px;font-weight:600">Recargar</button>' +
      '</div>'
  }
})
