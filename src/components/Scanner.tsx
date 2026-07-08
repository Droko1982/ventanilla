import { useEffect, useRef, useState } from 'react'
import type { Html5Qrcode } from 'html5-qrcode'
import { Sheet } from './Sheet'

// Escaneo con la CÁMARA del celular (código de barras o QR).
// El lector físico USB/Bluetooth se maneja aparte (useBarcodeWedge).
export function Scanner({
  open,
  onClose,
  onDetected,
}: {
  open: boolean
  onClose: () => void
  onDetected: (code: string) => void
}) {
  const regionId = 'scanner-region'
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    let cancelled = false
    setError(null)

    const start = async () => {
      try {
        // Carga la librería de cámara solo al abrir el escáner (fuera del arranque).
        const { Html5Qrcode } = await import('html5-qrcode')
        if (cancelled) return
        const scanner = new Html5Qrcode(regionId, { verbose: false })
        scannerRef.current = scanner
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 240, height: 160 } },
          (decoded) => {
            if (cancelled) return
            onDetected(decoded)
          },
          () => {},
        )
        // Si se cerró el escáner mientras arrancaba la cámara, apágala ya (evita
        // que la cámara/LED queden encendidos por una condición de carrera).
        if (cancelled) { scanner.stop().then(() => scanner.clear()).catch(() => {}) }
      } catch (e) {
        if (!cancelled) setError('No se pudo abrir la cámara. Revisa los permisos del navegador.')
      }
    }
    // Pequeño retraso para que exista el div del Sheet
    const t = setTimeout(start, 150)

    return () => {
      cancelled = true
      clearTimeout(t)
      const s = scannerRef.current
      if (s) {
        s.stop()
          .then(() => s.clear())
          .catch(() => {})
        scannerRef.current = null
      }
    }
  }, [open, onDetected])

  return (
    <Sheet open={open} onClose={onClose} title="Escanear código">
      <div className="space-y-3">
        <div
          id={regionId}
          className="mx-auto aspect-[3/2] w-full overflow-hidden rounded-2xl bg-slate-900"
        />
        {error ? (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
        ) : (
          <p className="text-center text-sm text-slate-500">
            Apunta al código de barras o QR del producto.
          </p>
        )}
        <p className="text-center text-xs text-slate-400">
          ¿Tienes lector USB/Bluetooth? Sólo escanea: la app lo detecta automáticamente.
        </p>
      </div>
    </Sheet>
  )
}
