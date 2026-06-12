import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useScopeSales, useScopeStock, useProducts, useLocations } from '@/hooks/data'
import { useScopeLocationIds } from '@/hooks/data'
import { summarize, topProducts, bottomProducts, productStats, filterByRange } from '@/lib/analytics'
import { StatCard, Money, Segmented, PageHeader, EmptyState } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'

export default function Reportes() {
  const sales = useScopeSales()
  const stock = useScopeStock()
  const products = useProducts()
  const locations = useLocations()
  const scopeIds = useScopeLocationIds()
  const [range, setRange] = useState<'7' | '30' | '90'>('30')

  const days = range === '7' ? 7 : range === '30' ? 30 : 90
  const ranged = useMemo(() => filterByRange(sales ?? [], days), [sales, days])
  const summary = useMemo(() => summarize(ranged), [ranged])
  const top = useMemo(() => topProducts(ranged, 8), [ranged])
  const bottom = useMemo(() => bottomProducts(ranged, 8), [ranged])

  // Gastos del periodo (utilidad neta real)
  const expenses = useLiveQuery(async () => {
    if (!scopeIds.length) return 0
    const all = await db.expenses.where('locationId').anyOf(scopeIds).toArray()
    const since = Date.now() - days * 86400000
    return all.filter((e) => new Date(e.date).getTime() >= since).reduce((s, e) => s + e.amount, 0)
  }, [scopeIds.join(','), days])

  const netProfit = summary.profit - (expenses ?? 0)

  // Stock muerto: con existencias pero sin ventas en el periodo
  const deadStock = useMemo(() => {
    if (!products || !stock) return []
    const soldIds = new Set(ranged.flatMap((s) => s.items.map((i) => i.productId)))
    const pById = new Map(products.map((p) => [p.id, p]))
    const agg = new Map<string, number>()
    for (const s of stock) {
      if (s.quantity > 0 && !soldIds.has(s.productId)) {
        agg.set(s.productId, (agg.get(s.productId) ?? 0) + s.quantity)
      }
    }
    return [...agg.entries()]
      .map(([pid, qty]) => ({ product: pById.get(pid), qty }))
      .filter((x) => x.product)
      .sort((a, b) => (b.product!.cost * b.qty) - (a.product!.cost * a.qty))
      .slice(0, 10)
  }, [products, stock, ranged])

  // Comparación entre locales
  const byLocation = useMemo(() => {
    if (!locations) return []
    const map = new Map<string, { revenue: number; profit: number }>()
    for (const s of ranged) {
      if (s.status !== 'completada') continue
      const cur = map.get(s.locationId) ?? { revenue: 0, profit: 0 }
      cur.revenue += s.total
      for (const it of s.items) cur.profit += (it.unitPrice - it.cost) * it.qty - it.lineDiscount
      map.set(s.locationId, cur)
    }
    return locations
      .filter((l) => scopeIds.includes(l.id))
      .map((l) => ({ name: l.name, ...(map.get(l.id) ?? { revenue: 0, profit: 0 }) }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [ranged, locations, scopeIds])

  function exportCSV() {
    const stats = productStats(ranged).sort((a, b) => b.revenue - a.revenue)
    const header = 'producto,unidades,ingresos,utilidad'
    const rows = stats.map((s) => `"${s.name}",${Math.round(s.qty)},${Math.round(s.revenue)},${Math.round(s.profit)}`)
    const csv = [header, ...rows].join('\n')
    const url = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    const a = document.createElement('a')
    a.href = url
    a.download = `reporte-ventanilla-${days}d.csv`
    a.click()
    toast('success', 'Reporte exportado (CSV)')
  }

  return (
    <div>
      <PageHeader
        title="Reportes"
        subtitle="Rentabilidad real de tu negocio"
        right={
          <button onClick={exportCSV} className="btn btn-secondary px-3 py-2 text-sm">
            <Icon name="doc" className="h-5 w-5" /> Exportar
          </button>
        }
      />

      <div className="mb-4">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: '7', label: '7 días' },
            { value: '30', label: '30 días' },
            { value: '90', label: '90 días' },
          ]}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <StatCard label="Ventas" value={<Money value={summary.revenue} />} accent="text-brand-700" />
        <StatCard label="Utilidad bruta" value={<Money value={summary.profit} />} sub={`Margen ${summary.revenue ? Math.round((summary.profit / summary.revenue) * 100) : 0}%`} accent="text-emerald-600" />
        <StatCard label="Gastos" value={<Money value={expenses ?? 0} />} accent="text-rose-500" />
        <StatCard label="Utilidad neta" value={<Money value={netProfit} />} sub="Ventas − costos − gastos" accent={netProfit >= 0 ? 'text-emerald-700' : 'text-rose-600'} />
      </div>

      {/* Comparación entre locales */}
      {byLocation.length > 1 && (
        <div className="card mb-4 p-4">
          <p className="mb-3 text-sm font-semibold text-slate-600">Comparación entre locales</p>
          <div className="space-y-2">
            {byLocation.map((l) => (
              <div key={l.name} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate text-slate-600">{l.name}</span>
                <span className="text-slate-400">util. {cop(l.profit)}</span>
                <span className="w-24 text-right font-semibold text-slate-700">{cop(l.revenue)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <RankCard title="Más vendidos" emoji="🔥" items={top} />
        <RankCard title="Menos vendidos" emoji="🐌" items={bottom} />
      </div>

      {/* Stock muerto */}
      <div className="card p-4">
        <p className="mb-1 text-sm font-semibold text-slate-600">Stock muerto (no rota) 🪦</p>
        <p className="mb-3 text-xs text-slate-400">Con existencias pero sin ventas en {days} días. Conviene reducir su pedido o sacarlo en promoción.</p>
        {deadStock.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400">Nada inmóvil. ¡Bien!</p>
        ) : (
          <div className="space-y-2">
            {deadStock.map(({ product, qty }) => (
              <div key={product!.id} className="flex items-center justify-between text-sm">
                <span className="flex-1 truncate text-slate-600">{product!.imageEmoji} {product!.name}</span>
                <span className="text-xs text-slate-400">{Math.round(qty)} u</span>
                <span className="w-24 text-right font-semibold text-rose-500">{cop(product!.cost * qty)} parado</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function RankCard({ title, emoji, items }: { title: string; emoji: string; items: { productId: string; name: string; qty: number; revenue: number }[] }) {
  return (
    <div className="card p-4">
      <p className="mb-3 text-sm font-semibold text-slate-600">{emoji} {title}</p>
      {items.length === 0 ? (
        <EmptyState emoji="📊" title="Sin datos" />
      ) : (
        <div className="space-y-2">
          {items.map((p, i) => (
            <div key={p.productId} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-xs text-slate-400">{i + 1}</span>
              <span className="flex-1 truncate text-slate-600">{p.name}</span>
              <span className="text-xs font-semibold text-slate-700">{Math.round(p.qty)} u</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
