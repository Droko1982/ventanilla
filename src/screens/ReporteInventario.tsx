import { useMemo, useState } from 'react'
import {
  useActiveLocationId, useProducts, useCategories, useStockForLocation, useLocations,
} from '@/hooks/data'
import { StatCard, Money, EmptyState, PageHeader, Segmented } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, kg } from '@/lib/money'
import { downloadCSV } from '@/lib/csv'
import type { Product, Stock } from '@/types'

// Reporte de Inventario General (como el de SEITEM): costo promedio, utilidad %,
// stock sugerido, inv. final, sección… con filtros y exportación.
export default function ReporteInventario() {
  const locationId = useActiveLocationId()
  const products = useProducts()
  const categories = useCategories()
  const stock = useStockForLocation(locationId)
  const locations = useLocations()
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')
  const [view, setView] = useState<'todos' | 'bajo'>('todos')

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const stockMap = useMemo(() => {
    const m = new Map<string, Stock>()
    for (const s of stock ?? []) m.set(s.productId, s)
    return m
  }, [stock])
  const activeLoc = locations?.find((l) => l.id === locationId)

  const rows = useMemo(() => {
    let list = (products ?? []).filter((p) => p.active)
    if (cat !== 'all') list = list.filter((p) => p.categoryId === cat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(search) || p.section?.toLowerCase().includes(q))
    }
    const out = list
      .map((p) => ({ p, st: stockMap.get(p.id) }))
      .filter((r): r is { p: Product; st: Stock } => !!r.st)
    if (view === 'bajo') return out.filter((r) => r.st.quantity <= r.st.reorderThreshold)
    return out
  }, [products, stockMap, search, cat, view])

  const totals = useMemo(() => {
    let valueCost = 0
    let low = 0
    for (const r of rows) {
      valueCost += (r.p.avgCost ?? r.p.cost) * r.st.quantity
      if (r.st.quantity <= r.st.reorderThreshold) low++
    }
    return { valueCost: Math.round(valueCost), count: rows.length, low }
  }, [rows])

  function util(p: Product): number {
    const c = p.avgCost ?? p.cost
    return p.price > 0 ? Math.round((1 - c / p.price) * 100) : 0
  }

  function exportCSV() {
    const data: (string | number)[][] = [['producto', 'codigo', 'barras', 'categoria', 'seccion', 'inv_final', 'costo_promedio', 'precio_venta', 'utilidad_%', 'stock_sugerido']]
    for (const r of rows) {
      const cat = catMap.get(r.p.categoryId)?.name ?? ''
      data.push([r.p.name, r.p.internalCode ?? '', r.p.barcode ?? '', cat, r.p.section ?? '', r.st.quantity, r.p.avgCost ?? r.p.cost, r.p.price, util(r.p), r.st.reorderTarget])
    }
    downloadCSV(data, `inventario-general-${activeLoc?.name ?? ''}.csv`)
    toast('success', 'Inventario exportado (CSV)')
  }

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader help="reportes"
        title="Inventario General"
        subtitle={activeLoc?.name}
        right={
          <button onClick={exportCSV} className="btn btn-secondary px-3 py-2 text-sm">
            <Icon name="doc" className="h-5 w-5" /> Exportar
          </button>
        }
      />

      <div className="mb-3 grid grid-cols-3 gap-2">
        <StatCard label="Productos" value={totals.count} />
        <StatCard label="Valor (al costo)" value={<Money value={totals.valueCost} />} accent="text-brand-700" />
        <StatCard label="Stock bajo" value={totals.low} accent="text-amber-600" />
      </div>

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto o sección…" />
        </div>
        <select className="input w-36" value={cat} onChange={(e) => setCat(e.target.value)}>
          <option value="all">Toda categoría</option>
          {categories?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      <div className="mb-3">
        <Segmented value={view} onChange={setView} options={[{ value: 'todos', label: 'Todos' }, { value: 'bajo', label: 'Stock bajo' }]} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-2 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-left">Sección</th>
              <th className="px-2 py-2 text-right">Inv.</th>
              <th className="px-2 py-2 text-right">Costo prom.</th>
              <th className="px-2 py-2 text-right">P. Venta</th>
              <th className="px-2 py-2 text-right">Util.</th>
              <th className="px-2 py-2 text-right">Sug.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const low = r.st.quantity <= r.st.reorderThreshold
              return (
                <tr key={r.p.id} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">
                    <p className="line-clamp-1 font-medium text-slate-700">{r.p.name}</p>
                    <p className="text-[10px] text-slate-400">{r.p.barcode || r.p.internalCode} · {catMap.get(r.p.categoryId)?.name}</p>
                  </td>
                  <td className="px-2 py-1.5 text-slate-500">{r.p.section ?? '—'}</td>
                  <td className={`px-2 py-1.5 text-right font-semibold ${low ? 'text-amber-600' : 'text-slate-700'}`}>{r.p.unit === 'peso' ? kg(r.st.quantity) : r.st.quantity}</td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{cop(r.p.avgCost ?? r.p.cost)}</td>
                  <td className="px-2 py-1.5 text-right text-slate-700">{cop(r.p.price)}</td>
                  <td className={`px-2 py-1.5 text-right ${util(r.p) < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{util(r.p)}%</td>
                  <td className="px-2 py-1.5 text-right text-slate-400">{r.st.reorderTarget}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <EmptyState emoji="📦" title="Sin productos" hint="Cambia los filtros." />}
    </div>
  )
}
