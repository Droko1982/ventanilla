import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'node:path'

// Hoy en GitHub Pages: https://droko1982.github.io/ventanilla/ (base /ventanilla/).
// Con DOMINIO PROPIO la app va en la raíz → construir con VITE_BASE=/ :
//   PowerShell:  $env:VITE_BASE='/'; npm run deploy
//   bash:        VITE_BASE=/ npm run deploy
// En desarrollo siempre bajo /.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? (process.env.VITE_BASE || '/ventanilla/') : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        id: '/',
        name: 'Ventanilla — Ventas e Inventario',
        short_name: 'Ventanilla',
        description:
          'Plataforma de ventas e inventario para ventanillas y tiendas en Colombia. Funciona sin internet.',
        lang: 'es-CO',
        theme_color: '#0d9488',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
}))
