import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import {
  useScopeSales, useScopeStock, useProducts, useLocations, useCurrentUser, useUnreadNotifications,
} from '@/hooks/data'
import { summarize, salesByDay, topProducts, filterByRange, todayRange } from '@/lib/analytics'
import { daysUntil } from '@/lib/format'
import { cop } from '@/lib/money'
import { StatCard, Segmented, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { useSession } from '@/store/session'

const methodColors: Record<string, string> = {
  efectivo: '#10b981', nequi: '#8b5cf6', tarjeta: '#3b82f6', transferencia: '#f59e0b', fiado: '#ef4444',
}
const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta', transferencia: 'Transfer.', fiado: 'Fiado',
}

export default function Dashboard() {
  const sales = useScopeSales()
  const stock = useScopeStock()
  const products = useProducts()
  const locations = useLocations()
  const user = useCurrentUser()
  const notifs = useUnreadNotifications()
  const filter = useSession((s) => s.locationFilter)
  const navigate = useNavigate()
  const [range, setRange] = useState<'hoy' | '7' | '30'>('7')

  const rangedSales = useMemo(() => {
    if (!sales) return []
    if (range === 'hoy') return todayRange(sales)
    return filterByRange(sales, range === '7' ? 7 : 30)
  }, [sales, range])

  const summary = useMemo(() => summarize(rangedSales), [rangedSales])
  const days = useMemo(() => salesByDay(rangedSales, range === 'hoy' ? 1 : range === '7' ? 7 : 30), [rangedSales, range])
  const top = useMemo(() => topProducts(rangedSales, 5), [rangedSales])

  // Comparación entre locales (cuando se ven todos)
  const byLocation = useMemo(() => {
    if (!locations) return []
    const map = new Map<string, number>()
    for (const s of rangedSales) {
      if (s.status !== 'completada') continue
      map.set(s.locationId, (map.get(s.locationId) ?? 0) + s.total)
    }
    return locations
      .map((l) => ({ name: l.name.replace('La Esquina · ', ''), revenue: map.get(l.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [rangedSales, locations])

  // Alertas
  const lowStock = (stock ?? []).filter((s) => s.quantity <= s.reorderThreshold).length
  const expiring = (stock ?? []).filter((s) => s.nearestExpiry && daysUntil(s.nearestExpiry) <= 30).length
  const dianPending = (sales ?? []).filter((s) => s.dianStatus === 'pendiente' && s.status === 'completada').length
  const deadStock = useMemo(() => {
    if (!products || !sales) return 0
    const soldIds = new Set(filterByRange(sales, 30).flatMap((s) => s.items.map((i) => i.productId)))
    return (stock ?? []).filter((s) => s.quantity > 0 && !soldIds.has(s.productId)).length
  }, [products, sales, stock])

  const hello = user?.name.split(' ')[0] ?? ''

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Hola, {hello} 👋</h1>
        <p className="text-sm text-slate-500">
          {filter === 'all' ? 'Resumen de todos tus locales' : 'Resumen del local'}
        </p>
      </div>

      <div className="mb-4">
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { value: 'hoy', label: 'Hoy' },
            { value: '7', label: '7 días' },
            { value: '30', label: '30 días' },
          ]}
        />
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <StatCard label="Ventas" value={<Money value={summary.revenue} />} sub={`${summary.count} ventas`} accent="text-brand-700" icon={<Icon name="cash" className="h-5 w-5" />} />
        <StatCard label="Utilidad bruta" value={<Money value={summary.profit} />} sub={`Margen ${summary.revenue ? Math.round((summary.profit / summary.revenue) * 100) : 0}%`} accent="text-emerald-600" icon={<Icon name="chart" className="h-5 w-5" />} />
        <StatCard label="Ticket promedio" value={<Money value={summary.ticketAvg} />} icon={<Icon name="tag" className="h-5 w-5" />} />
        <StatCard label="Costo mercancía" value={<Money value={summary.cost} />} icon={<Icon name="box" className="h-5 w-5" />} />
      </div>

      {/* Alertas rápidas */}
      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        <AlertPill n={lowStock} label="Stock bajo" emoji="📦" tone="amber" onClick={() => navigate('/inventario')} />
        <AlertPill n={expiring} label="Por vencer" emoji="⏳" tone="rose" onClick={() => navigate('/inventario')} />
        <AlertPill n={dianPending} label="DIAN pendiente" emoji="🧾" tone="blue" onClick={() => navigate('/ventas')} />
        <AlertPill n={deadStock} label="Stock muerto" emoji="🪦" tone="slate" onClick={() => navigate('/reportes')} />
      </div>

      {/* Gráfica de ventas por día */}
      <div className="card mb-4 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-600">Ventas por día</p>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={days} margin={{ left: -18, right: 6, top: 6 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0d9488" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
            <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
            <Tooltip formatter={(v: number) => cop(v)} labelStyle={{ fontSize: 12 }} />
            <Area type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} fill="url(#g)" name="Ventas" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Por método de pago */}
      <div className="card mb-4 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-600">Por método de pago</p>
        <div className="space-y-2">
          {Object.entries(summary.byMethod).map(([m, v]) => {
            const pct = summary.revenue ? Math.round((v / summary.revenue) * 100) : 0
            return (
              <div key={m} className="flex items-center gap-2">
                <span className="w-20 text-xs text-slate-500">{methodLabels[m]}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, background: methodColors[m] }} />
                </div>
                <span className="w-20 text-right text-xs font-semibold text-slate-600">{cop(v)}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Comparación entre locales */}
      {filter === 'all' && byLocation.length > 1 && (
        <div className="card mb-4 p-4">
          <p className="mb-2 text-sm font-semibold text-slate-600">Comparación entre locales</p>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={byLocation} margin={{ left: -18, right: 6 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : `${v}`)} />
              <Tooltip formatter={(v: number) => cop(v)} />
              <Bar dataKey="revenue" radius={[6, 6, 0, 0]} name="Ventas">
                {byLocation.map((_, i) => (
                  <Cell key={i} fill={['#0d9488', '#3b82f6', '#8b5cf6'][i % 3]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Más vendidos */}
      <div className="card mb-4 p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600">Más vendidos</p>
          <button onClick={() => navigate('/reportes')} className="text-xs font-medium text-brand-600">Ver reportes</button>
        </div>
        <div className="space-y-2">
          {top.map((p, i) => (
            <div key={p.productId} className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand-700">{i + 1}</span>
              <span className="flex-1 truncate text-sm text-slate-700">{p.name}</span>
              <span className="text-xs text-slate-400">{Math.round(p.qty)} u</span>
              <span className="w-20 text-right text-sm font-semibold text-slate-600">{cop(p.revenue)}</span>
            </div>
          ))}
          {top.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Aún no hay ventas en este rango.</p>}
        </div>
      </div>
    </div>
  )
}

function AlertPill({ n, label, emoji, tone, onClick }: { n: number; label: string; emoji: string; tone: string; onClick: () => void }) {
  const tones: Record<string, string> = {
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    slate: 'bg-slate-50 text-slate-600 border-slate-200',
  }
  return (
    <button onClick={onClick} className={`flex shrink-0 items-center gap-2 rounded-xl border px-3 py-2 ${tones[tone]}`}>
      <span className="text-lg">{emoji}</span>
      <span className="text-left">
        <span className="block text-base font-bold leading-none">{n}</span>
        <span className="block text-[11px]">{label}</span>
      </span>
    </button>
  )
}
