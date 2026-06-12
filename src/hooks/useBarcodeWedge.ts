import { useEffect } from 'react'

// Captura lectores físicos de código de barras / QR (USB o Bluetooth).
// Estos lectores "escriben" muy rápido y terminan con Enter, igual que un
// teclado. Detectamos esa ráfaga y entregamos el código completo.
export function useBarcodeWedge(onScan: (code: string) => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    let buffer = ''
    let last = 0

    const handler = (e: KeyboardEvent) => {
      // Ignorar si el foco está en un campo de texto (escritura humana)
      const el = e.target as HTMLElement
      const typing =
        el &&
        (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

      const now = Date.now()
      if (now - last > 80) buffer = '' // pausa larga => nueva lectura
      last = now

      if (e.key === 'Enter') {
        if (buffer.length >= 3 && !typing) {
          onScan(buffer)
          e.preventDefault()
        }
        buffer = ''
        return
      }
      if (e.key.length === 1) buffer += e.key
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onScan, enabled])
}
