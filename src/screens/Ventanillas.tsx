import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useLocations } from '@/hooks/data'
import { summarize, todayRange } from '@/lib/analytics'
import { StatCard, Money, PageHeader, EmptyState } from '@/components/ui'
import { cop } from '@/lib/money'
import { useSession } from '@/store/session'

// Centro de ventanillas: el dueño administra TODAS sus tiendas de un vistazo y
// salta a cualquiera. Resalta lo que necesita atención (caja sin cerrar, stock
// bajo, DIAN pendiente).
export default function Ventanillas() {
  const navigate = useNavigate()
  const locations = useLocations()
  const setFilter = useSession((s) => s.setLocationFilter)

  const sales = useLiveQuery(() => db.sales.toArray(), [])
  const stock = useLiveQuery(() => db.stock.toArray(), [])
  const openSessions = useLiveQuery(() => db.cashSessions.filter((c) => c.status === 'abierta').toArray(), [])

  const rows = useMemo(() => {
    return (locations ?? []).map((loc) => {
      const locSales = todayRange((sales ?? []).filter((s) => s.locationId === loc.id))
      const sum = summarize(locSales)
      const session = (openSessions ?? []).find((c) => c.locationId === loc.id)
      const lowStock = (stock ?? []).filter((s) => s.locationId === loc.id && s.quantity <= s.reorderThreshold).length
      const dianPending = locSales.filter((s) => s.dianStatus === 'pendiente').length
      return { loc, revenue: sum.revenue, count: sum.count, efectivo: sum.byMethod.efectivo ?? 0, session, lowStock, dianPending }
    }).sort((a, b) => b.revenue - a.revenue)
  }, [locations, sales, openSessions, stock])

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCount = rows.reduce((s, r) => s + r.count, 0)
  const needAttention = rows.filter((r) => !r.session || r.lowStock > 0 || r.dianPending > 0).length

  function open(locId: string) {
    setFilter(locId)
    navigate('/resumen')
  }

  if (!locations) return <EmptyState emoji="🏪" title="Cargando…" />

  return (
    <div>
      <PageHeader title="Mis ventanillas" subtitle={`${rows.length} local(es) · administra todo desde aquí`} />

      {/* Consolidado del día */}
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        <StatCard label="Ventas hoy (todas)" value={<Money value={totalRevenue} />} sub={`${totalCount} ventas`} accent="text-brand-700" />
        <StatCard label="Locales" value={rows.length} sub="activos" />
        <StatCard label="Requieren atención" value={needAttention} accent={needAttention > 0 ? 'text-amber-600' : 'text-emerald-600'} />
      </div>

      <button onClick={() => { setFilter('all'); navigate('/resumen') }} className="btn btn-secondary mb-3 w-full text-sm">
        📊 Ver resumen consolidado de todos los locales
      </button>

      {/* Tarjeta por local */}
      <div className="space-y-2.5">
        {rows.map(({ loc, revenue, count, efectivo, session, lowStock, dianPending }, i) => (
          <button key={loc.id} onClick={() => open(loc.id)} className="card w-full p-4 text-left active:scale-[0.99]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {i === 0 && totalRevenue > 0 && <span title="Más vende hoy">🏆</span>}
                <span className="font-bold text-slate-700">{loc.name.replace('La Esquina · ', '')}</span>
              </div>
              <span className="text-lg font-extrabold text-brand-700">{cop(revenue)}</span>
            </div>
            <p className="mt-0.5 text-xs text-slate-400">{count} ventas · efectivo {cop(efectivo)} · {loc.city}</p>

            {/* Chips de estado / atención */}
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className={`chip ${session ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                {session ? '🟢 Caja abierta' : '🔒 Caja cerrada'}
              </span>
              {lowStock > 0 && <span className="chip bg-amber-100 text-amber-700">📦 {lowStock} por agotarse</span>}
              {dianPending > 0 && <span className="chip bg-purple-100 text-purple-700">🧾 {dianPending} DIAN pend.</span>}
              {lowStock === 0 && dianPending === 0 && session && <span className="chip bg-slate-100 text-slate-500">Todo en orden ✓</span>}
            </div>
          </button>
        ))}
        {rows.length === 0 && <EmptyState emoji="🏪" title="Sin locales" hint="Agrega tus ventanillas en Ajustes." />}
      </div>
    </div>
  )
}
