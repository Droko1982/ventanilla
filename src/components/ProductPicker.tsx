import { useMemo, useState } from 'react'
import { Icon } from './icons'
import { ProductThumb } from './ui'
import { cop, kg } from '@/lib/money'
import type { Product, SaleItem } from '@/types'

// Selector de productos con buscador: arma una lista de ítems (para facturas
// y remisiones). Busca por nombre, código, marca o descripción.
export function ProductPicker({
  products,
  items,
  onChange,
}: {
  products: Product[]
  items: SaleItem[]
  onChange: (items: SaleItem[]) => void
}) {
  const [search, setSearch] = useState('')

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return products
      .filter((p) => p.active)
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode?.includes(search) ||
          p.brand?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      )
      .slice(0, 6)
  }, [products, search])

  function add(p: Product) {
    const existing = items.find((i) => i.productId === p.id)
    if (existing) {
      onChange(items.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + 1 } : i)))
    } else {
      onChange([
        ...items,
        {
          productId: p.id,
          name: p.name,
          unit: p.unit,
          qty: p.unit === 'peso' ? 1 : 1,
          unitPrice: p.price,
          lineDiscount: 0,
          ivaRate: p.ivaRate,
          cost: p.cost,
        },
      ])
    }
    setSearch('')
  }

  function setQty(productId: string, qty: number) {
    if (qty <= 0) return onChange(items.filter((i) => i.productId !== productId))
    onChange(items.map((i) => (i.productId === productId ? { ...i, qty } : i)))
  }

  const pById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products])

  return (
    <div className="space-y-3">
      <div className="relative">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input
          className="input pl-10"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar producto para agregar…"
        />
      </div>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          {results.map((p) => (
            <button
              key={p.id}
              onClick={() => add(p)}
              className="flex w-full items-center gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-slate-50"
            >
              <ProductThumb photo={p.photo} emoji={p.imageEmoji} size={32} />
              <span className="flex-1 truncate text-sm text-slate-700">{p.name}</span>
              <span className="text-sm font-semibold text-brand-700">{cop(p.price)}</span>
              <Icon name="plus" className="h-5 w-5 text-brand-600" />
            </button>
          ))}
        </div>
      )}

      {items.length === 0 ? (
        <p className="rounded-xl bg-slate-50 px-3 py-4 text-center text-sm text-slate-400">
          Aún no has agregado productos.
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map((it) => {
            const p = pById.get(it.productId)
            return (
              <div key={it.productId} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2">
                <ProductThumb photo={p?.photo} emoji={p?.imageEmoji} size={32} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-700">{it.name}</p>
                  <p className="text-xs text-slate-400">
                    {cop(it.unitPrice)}{it.unit === 'peso' ? '/kg' : ' c/u'}
                  </p>
                </div>
                {it.unit === 'peso' ? (
                  <input
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                    inputMode="decimal"
                    value={it.qty}
                    onChange={(e) => setQty(it.productId, parseFloat(e.target.value) || 0)}
                  />
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => setQty(it.productId, it.qty - 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-100">
                      <Icon name="minus" className="h-4 w-4" />
                    </button>
                    <span className="w-6 text-center font-bold">{it.qty}</span>
                    <button onClick={() => setQty(it.productId, it.qty + 1)} className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                      <Icon name="plus" className="h-4 w-4" />
                    </button>
                  </div>
                )}
                <span className="w-16 text-right text-sm font-semibold text-slate-700">
                  {cop(it.unitPrice * it.qty - it.lineDiscount)}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function itemsTotal(items: SaleItem[]): number {
  return items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0)
}

export function fmtQty(it: SaleItem): string {
  return it.unit === 'peso' ? kg(it.qty) : `${it.qty}`
}
