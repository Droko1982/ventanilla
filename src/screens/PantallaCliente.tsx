import { useEffect, useState } from 'react'
import { cop } from '@/lib/money'
import { subscribeCartView, type CartView } from '@/lib/customerScreen'

// Pantalla del cliente (2º monitor, estilo supermercado/autoservicio): muestra
// en vivo los productos que el cajero va agregando y el total a pagar. Se abre
// en otra ventana desde el POS y se sincroniza con BroadcastChannel.
export default function PantallaCliente() {
  const [view, setView] = useState<CartView | null>(null)

  useEffect(() => subscribeCartView(setView), [])

  const lines = view?.lines ?? []
  const total = view?.total ?? 0

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between bg-slate-950/60 px-8 py-5">
        <span className="text-2xl font-extrabold">🛒 {view?.businessName ?? 'Tu compra'}</span>
        <span className="text-sm text-white/40">{lines.length} producto(s)</span>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-4">
        {lines.length === 0 ? (
          <p className="mt-28 text-center text-4xl text-white/30">Esperando productos…</p>
        ) : (
          <div className="space-y-3">
            {lines.map((l, i) => (
              <div key={i} className="flex items-center justify-between border-b border-white/10 pb-3 text-2xl">
                <span>
                  <span className="mr-2">{l.emoji}</span>{l.name}
                  <span className="ml-2 text-white/40">{l.unit === 'peso' ? `${l.qty} kg` : `x${l.qty}`}</span>
                </span>
                <span className="font-bold tabular-nums">{cop(l.lineTotal)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-brand-600 px-8 py-7 text-center">
        <p className="text-base uppercase tracking-[0.3em] text-brand-100">Total a pagar</p>
        <p className="text-7xl font-extrabold tabular-nums">{cop(total)}</p>
        <p className="mt-2 text-sm text-brand-100">¡Gracias por su compra! 🛍️</p>
      </div>
    </div>
  )
}
