import { useRegisterSW } from 'virtual:pwa-register/react'

// Aviso de actualización: cuando hay una versión nueva de la app, muestra un
// botón "Actualizar". El cliente decide cuándo (no interrumpe una venta), y la
// app sigue funcionando offline mientras tanto.
export function UpdateBanner() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, r) {
      // Revisa si hay actualización cada hora (además de al abrir la app).
      if (r) setInterval(() => r.update().catch(() => {}), 60 * 60 * 1000)
    },
  })

  if (!needRefresh) return null
  return (
    <div className="fixed inset-x-0 bottom-20 z-[200] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-brand-200 bg-white px-4 py-3 shadow-2xl sm:bottom-6">
      <span className="text-xl">⬆️</span>
      <div className="flex-1 text-sm">
        <p className="font-semibold text-slate-700">Hay una versión nueva</p>
        <p className="text-xs text-slate-500">Actualiza cuando quieras; no pierdes lo que estás haciendo.</p>
      </div>
      <button onClick={() => updateServiceWorker(true)} className="btn btn-primary px-4 py-2 text-sm">
        Actualizar
      </button>
      <button onClick={() => setNeedRefresh(false)} className="text-slate-400" aria-label="Cerrar">✕</button>
    </div>
  )
}
