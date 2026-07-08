import { useEffect, useRef, useState } from 'react'
import { cop, parseCop } from '@/lib/money'

// Editor enlazado: costo ↔ precio ↔ rentabilidad %. Editar cualquiera ajusta los
// otros. La rentabilidad es la utilidad sobre el precio: precio = costo / (1 − %).
export function PriceMarginEditor({
  cost, price, setCost, setPrice, priceLabel = 'Precio venta', showCost = true,
  iva, setIva, unit = 'unidad',
}: {
  cost: string
  price: string
  setCost: (v: string) => void
  setPrice: (v: string) => void
  priceLabel?: string
  /** Si es false, oculta costo, rentabilidad y utilidad (privacidad del margen para el cajero). */
  showCost?: boolean
  /** Si se pasa, muestra el desglose de IVA (costo con/sin IVA, precio sin IVA) y el precio sugerido. */
  iva?: number
  setIva?: (n: number) => void
  unit?: 'unidad' | 'peso'
}) {
  const c0 = parseCop(cost), p0 = parseCop(price)
  const [margin, setMargin] = useState<string>(p0 > 0 && c0 >= 0 ? String(Math.round((1 - c0 / p0) * 100)) : '')
  const num = (s: string) => s.replace(/[^\d]/g, '')
  const fromMargin = useRef(false)

  // Resincroniza la rentabilidad cuando el costo o el precio cambian (también si
  // el producto se cambió desde afuera), salvo cuando el cambio lo originó el
  // propio campo de rentabilidad (para no pelear con lo que el usuario escribe).
  useEffect(() => {
    if (fromMargin.current) { fromMargin.current = false; return }
    const c = parseCop(cost), p = parseCop(price)
    setMargin(c >= 0 && p > 0 ? String(Math.round((1 - c / p) * 100)) : '')
  }, [cost, price])

  function onCost(v: string) { setCost(num(v)) } // el efecto recalcula la rentabilidad
  function onPrice(v: string) { setPrice(num(v)) }
  function onMargin(v: string) {
    const nv = num(v); setMargin(nv)
    let m = parseInt(nv, 10)
    const c = parseCop(cost)
    if (m >= 100) m = 99 // rentabilidad ≥100% sería precio infinito: se topa
    if (m >= 0 && c > 0) { fromMargin.current = true; setPrice(String(Math.round(c / (1 - m / 100)))) }
  }

  const c = parseCop(cost), p = parseCop(price)
  // Sin acceso al costo (cajero): solo el precio, sin costo ni rentabilidad/utilidad.
  if (!showCost) {
    return (
      <div>
        <label className="label">{priceLabel}</label>
        <input className="input" inputMode="numeric" value={price} onChange={(e) => onPrice(e.target.value)} placeholder="$" />
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {/* Orden secuencial: costo → rentabilidad que quiero → precio que resulta. */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Costo</label>
          <input className="input" inputMode="numeric" value={cost} onChange={(e) => onCost(e.target.value)} placeholder="$" />
        </div>
        <div>
          <label className="label">Rentab. %</label>
          <input className="input" inputMode="numeric" value={margin} onChange={(e) => onMargin(e.target.value)} placeholder="%" />
        </div>
        <div>
          <label className="label">{priceLabel}</label>
          <input className="input" inputMode="numeric" value={price} onChange={(e) => onPrice(e.target.value)} placeholder="$" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {p > 0 && c > 0
          ? `Utilidad: ${cop(p - c)} por unidad · ${Math.round((1 - c / p) * 100)}%`
          : 'Edita costo, precio o rentabilidad — los tres se ajustan entre sí.'}
      </p>

      {/* Desglose de IVA + precio sugerido (ventana de precio "bien especificada"). */}
      {iva !== undefined && (() => {
        const rate = iva / 100
        const costoSinIva = c > 0 ? Math.round(c / (1 + rate)) : 0 // el costo capturado es CON IVA
        const precioSinIva = p > 0 ? Math.round(p / (1 + rate)) : 0 // base gravable de la venta
        const sugerido = c > 0 ? Math.round(c / (1 - 0.3)) : 0 // sugerido a 30% de rentabilidad
        return (
          <div className="space-y-2 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="label">% IVA</label>
                {setIva ? (
                  <select className="input" value={iva} onChange={(e) => setIva(Number(e.target.value))}>
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={19}>19%</option>
                  </select>
                ) : (
                  <div className="input flex items-center">{iva}%</div>
                )}
              </div>
              <div>
                <label className="label">Costo sin IVA</label>
                <div className="input flex items-center bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300">{cop(costoSinIva)}</div>
              </div>
              <div>
                <label className="label">{unit === 'peso' ? 'Precio/kg sin IVA' : 'Precio unidad sin IVA'}</label>
                <div className="input flex items-center bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-300">{cop(precioSinIva)}</div>
              </div>
            </div>
            {sugerido > 0 && (
              <button
                type="button"
                onClick={() => setPrice(String(sugerido))}
                className="w-full rounded-lg border border-dashed border-brand-300 px-2 py-1.5 text-xs font-semibold text-brand-700 dark:border-brand-700 dark:text-brand-300"
              >
                Precio sugerido (30% de rentabilidad): {cop(sugerido)} · tocar para aplicar
              </button>
            )}
          </div>
        )
      })()}
    </div>
  )
}
