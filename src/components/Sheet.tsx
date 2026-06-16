import { type ReactNode, useEffect } from 'react'

// Hoja inferior (bottom sheet) — patrón móvil para formularios y acciones.
// Se desliza desde abajo, ocupa el ancho en celular y se centra en escritorio.
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  footer?: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-slate-900/50 animate-fade-in" onClick={onClose} />
      {/* El contenedor desplaza si el contenido es más alto que la pantalla, así
          el encabezado (✕) nunca queda tapado en ventanas bajas. */}
      <div className="relative flex min-h-full items-end justify-center sm:items-center sm:py-6">
        <div className="animate-slide-up relative flex w-full max-w-lg flex-col rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl">
          {/* Encabezado pegajoso: el ✕ siempre visible al desplazar */}
          <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-3xl border-b border-slate-100 bg-white px-5 py-4">
            <h3 className="text-lg font-bold text-slate-800">{title}</h3>
            <button
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-full text-xl text-slate-400 hover:bg-slate-100"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
          <div className="px-5 py-4">{children}</div>
          {footer && <div className="sticky bottom-0 border-t border-slate-100 bg-white px-5 py-4">{footer}</div>}
        </div>
      </div>
    </div>
  )
}
