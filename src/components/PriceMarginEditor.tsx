import { useState } from 'react'
import { cop, parseCop } from '@/lib/money'

// Editor enlazado: costo ↔ precio ↔ rentabilidad %. Editar cualquiera ajusta los
// otros. La rentabilidad es la utilidad sobre el precio: precio = costo / (1 − %).
export function PriceMarginEditor({
  cost, price, setCost, setPrice, priceLabel = 'Precio venta',
}: {
  cost: string
  price: string
  setCost: (v: string) => void
  setPrice: (v: string) => void
  priceLabel?: string
}) {
  const c0 = parseCop(cost), p0 = parseCop(price)
  const [margin, setMargin] = useState<string>(p0 > 0 && c0 >= 0 ? String(Math.round((1 - c0 / p0) * 100)) : '')
  const num = (s: string) => s.replace(/[^\d]/g, '')

  function onCost(v: string) {
    const nv = num(v); setCost(nv)
    const c = parseCop(nv), p = parseCop(price)
    if (c >= 0 && p > 0) setMargin(String(Math.round((1 - c / p) * 100)))
  }
  function onPrice(v: string) {
    const nv = num(v); setPrice(nv)
    const c = parseCop(cost), p = parseCop(nv)
    if (c >= 0 && p > 0) setMargin(String(Math.round((1 - c / p) * 100)))
  }
  function onMargin(v: string) {
    const nv = num(v); setMargin(nv)
    const m = parseInt(nv, 10), c = parseCop(cost)
    if (m >= 0 && m < 100 && c > 0) setPrice(String(Math.round(c / (1 - m / 100))))
  }

  const c = parseCop(cost), p = parseCop(price)
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-3 gap-2">
        <div>
          <label className="label">Costo</label>
          <input className="input" inputMode="numeric" value={cost} onChange={(e) => onCost(e.target.value)} placeholder="$" />
        </div>
        <div>
          <label className="label">{priceLabel}</label>
          <input className="input" inputMode="numeric" value={price} onChange={(e) => onPrice(e.target.value)} placeholder="$" />
        </div>
        <div>
          <label className="label">Rentab. %</label>
          <input className="input" inputMode="numeric" value={margin} onChange={(e) => onMargin(e.target.value)} placeholder="%" />
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {p > 0 && c > 0
          ? `Utilidad: ${cop(p - c)} por unidad · ${Math.round((1 - c / p) * 100)}%`
          : 'Edita costo, precio o rentabilidad — los tres se ajustan entre sí.'}
      </p>
    </div>
  )
}
