import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, Cell,
} from 'recharts'
import {
  useScopeSales, useScopeStock, useProducts, useLocations, useCurrentUser, useTenant,
} from '@/hooks/data'
import { summarize, topProducts, filterByRange } from '@/lib/analytics'
import { makePeriod, salesInPeriod, periodSeries, type Granularity } from '@/lib/period'
import { buildInsights } from '@/lib/insights'
import { maybeRecalcThresholds } from '@/data/repo'
import { daysUntil } from '@/lib/format'
import { cop, parseCop } from '@/lib/money'
import { db } from '@/data/db'
import { Sheet } from '@/components/Sheet'
import { toast } from '@/components/Toast'
import { StatCard, Segmented, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { useSession } from '@/store/session'

const methodColors: Record<string, string> = {
  efectivo: '#10b981', nequi: '#8b5cf6', tarjeta: '#3b82f6', transferencia: '#f59e0b', fiado: '#ef4444',
}
const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta', transferencia: 'Transferencia', fiado: 'Fiado',
}

export default function Dashboard() {
  const sales = useScopeSales()
  const stock = useScopeStock()
  const products = useProducts()
  const locations = useLocations()
  const user = useCurrentUser()
  const tenant = useTenant()
  const filter = useSession((s) => s.locationFilter)
  const navigate = useNavigate()
  const [gran, setGran] = useState<Granularity>('semana')
  const [offset, setOffset] = useState(0)
  const [goalOpen, setGoalOpen] = useState(false)
  const [goalInput, setGoalInput] = useState('')

  const period = useMemo(() => makePeriod(gran, offset), [gran, offset])
  const rangedSales = useMemo(() => salesInPeriod(sales ?? [], period), [sales, period])
  const summary = useMemo(() => summarize(rangedSales), [rangedSales])
  const series = useMemo(() => periodSeries(sales ?? [], period), [sales, period])
  const top = useMemo(() => topProducts(rangedSales, 5), [rangedSales])

  // Comparativo vs el período anterior
  const prevSummary = useMemo(() => summarize(salesInPeriod(sales ?? [], makePeriod(gran, offset + 1))), [sales, gran, offset])
  const delta = prevSummary.revenue > 0 ? Math.round(((summary.revenue - prevSummary.revenue) / prevSummary.revenue) * 100) : null

  // Meta del mes (independiente del período seleccionado)
  const monthRevenue = useMemo(() => summarize(salesInPeriod(sales ?? [], makePeriod('mes', 0))).revenue, [sales])
  const goal = tenant?.monthlyGoal ?? 0
  const goalPct = goal > 0 ? Math.min(100, Math.round((monthRevenue / goal) * 100)) : 0

  const byLocation = useMemo(() => {
    if (!locations) return []
    const map = new Map<string, number>()
    for (const s of rangedSales) map.set(s.locationId, (map.get(s.locationId) ?? 0) + s.total)
    return locations
      .map((l) => ({ name: l.name.replace('La Esquina · ', ''), revenue: map.get(l.id) ?? 0 }))
      .sort((a, b) => b.revenue - a.revenue)
  }, [rangedSales, locations])

  const lowStock = (stock ?? []).filter((s) => s.quantity <= s.reorderThreshold).length
  const expiring = (stock ?? []).filter((s) => s.nearestExpiry && daysUntil(s.nearestExpiry) <= 30).length
  const dianPending = (sales ?? []).filter((s) => s.dianStatus === 'pendiente' && s.status === 'completada').length
  const deadStock = useMemo(() => {
    if (!products || !sales) return 0
    const soldIds = new Set(filterByRange(sales, 30).flatMap((s) => s.items.map((i) => i.productId)))
    return (stock ?? []).filter((s) => s.quantity > 0 && !soldIds.has(s.productId)).length
  }, [products, sales, stock])

  const hello = user?.name.split(' ')[0] ?? ''
  const chartType = gran === 'anio' || gran === 'semana' ? 'bar' : 'area'

  const insights = useMemo(
    () => buildInsights({ sales: sales ?? [], topName: top[0]?.name, delta, lowStock, expiring, deadStock }),
    [sales, top, delta, lowStock, expiring, deadStock],
  )

  // Mantén al día los umbrales de reorden por velocidad (auto, 1×/día por local)
  useEffect(() => {
    if (!tenant || !locations) return
    for (const l of locations) maybeRecalcThresholds(tenant.id, l.id)
  }, [tenant, locations])

  return (
    <div>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-slate-800">Hola, {hello} 👋</h1>
        <p className="text-sm text-slate-500">
          {filter === 'all' ? 'Resumen de todos tus locales' : 'Resumen del local'}
        </p>
      </div>

      {(locations?.length ?? 0) > 1 && (
        <button onClick={() => navigate('/ventanillas')} className="card mb-4 flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700"><Icon name="building" className="h-6 w-6" /></span>
          <div className="flex-1">
            <p className="font-semibold text-slate-700">Mis ventanillas</p>
            <p className="text-xs text-slate-400">Administra tus {locations?.length} locales de un vistazo</p>
          </div>
          <Icon name="arrow-left" className="h-5 w-5 rotate-180 text-slate-300" />
        </button>
      )}

      {/* Asistente de insights */}
      <div className="mb-4 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
        <p className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-600">
          <span>🤖</span> Asistente · consejos para tu tienda
        </p>
        <div className="space-y-1.5">
          {insights.slice(0, 4).map((it, i) => (
            <button
              key={i}
              onClick={() => it.to && navigate(it.to)}
              disabled={!it.to}
              className={`flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                it.tone === 'good' ? 'bg-emerald-50 text-emerald-800'
                : it.tone === 'warn' ? 'bg-amber-50 text-amber-800'
                : 'bg-slate-50 text-slate-600'
              } ${it.to ? 'active:scale-[0.99]' : ''}`}
            >
              <span className="text-base leading-tight">{it.icon}</span>
              <span className="flex-1">{it.text}</span>
              {it.to && <Icon name="arrow-left" className="mt-0.5 h-4 w-4 rotate-180 opacity-40" />}
            </button>
          ))}
        </div>
      </div>

      {/* Selector de granularidad */}
      <div className="mb-3">
        <Segmented
          value={gran}
          onChange={(g) => { setGran(g); setOffset(0) }}
          options={[
            { value: 'dia', label: 'Día' },
            { value: 'semana', label: 'Semana' },
            { value: 'mes', label: 'Mes' },
            { value: 'anio', label: 'Año' },
          ]}
        />
      </div>

      {/* Navegador de período */}
      <div className="mb-4 flex items-center justify-between rounded-xl border border-slate-200 bg-white px-2 py-1.5">
        <button onClick={() => setOffset(offset + 1)} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100" aria-label="Anterior">
          <Icon name="arrow-left" className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-slate-700">{period.label}</span>
        <button
          onClick={() => setOffset(Math.max(0, offset - 1))}
          disabled={offset === 0}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
          aria-label="Siguiente"
        >
          <Icon name="arrow-left" className="h-5 w-5 rotate-180" />
        </button>
      </div>

      {/* Meta del mes */}
      <div className="card mb-4 p-4">
        <div className="mb-1 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-600">🎯 Meta del mes</p>
          <button onClick={() => { setGoalInput(goal ? String(goal) : ''); setGoalOpen(true) }} className="text-xs font-medium text-brand-600">
            {goal ? 'Editar' : 'Definir'}
          </button>
        </div>
        {goal > 0 ? (
          <>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-lg font-bold text-brand-700">{cop(monthRevenue)}</span>
              <span className="text-xs text-slate-400">de {cop(goal)} · {goalPct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${goalPct}%` }} />
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-400">Define una meta para ver tu progreso del mes.</p>
        )}
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <StatCard label="Ventas" value={<Money value={summary.revenue} />} sub={`${summary.count} ventas${delta !== null ? ` · ${delta >= 0 ? '↑' : '↓'}${Math.abs(delta)}% vs anterior` : ''}`} accent="text-brand-700" icon={<Icon name="cash" className="h-5 w-5" />} />
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

      {/* Gráfica del período */}
      <div className="card mb-4 p-4">
        <p className="mb-2 text-sm font-semibold text-slate-600">
          Ventas {gran === 'dia' ? 'por hora' : gran === 'semana' ? 'por día' : gran === 'mes' ? 'por día del mes' : 'por mes'}
        </p>
        <ResponsiveContainer width="100%" height={180}>
          {chartType === 'bar' ? (
            <BarChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
              <Tooltip formatter={(v: number) => cop(v)} labelStyle={{ fontSize: 12 }} />
              <Bar dataKey="revenue" radius={[5, 5, 0, 0]} fill="#0d9488" name="Ventas" />
            </BarChart>
          ) : (
            <AreaChart data={series} margin={{ left: -18, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d9488" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#0d9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
              <Tooltip formatter={(v: number) => cop(v)} labelStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="revenue" stroke="#0d9488" strokeWidth={2} fill="url(#g)" name="Ventas" />
            </AreaChart>
          )}
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
              <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : `${v}`)} />
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
          {top.length === 0 && <p className="py-4 text-center text-sm text-slate-400">Sin ventas en este período.</p>}
        </div>
      </div>

      <Sheet
        open={goalOpen}
        onClose={() => setGoalOpen(false)}
        title="Meta de ventas del mes"
        footer={
          <button
            className="btn btn-primary btn-lg w-full"
            onClick={async () => {
              if (tenant) await db.tenants.update(tenant.id, { monthlyGoal: parseCop(goalInput) })
              toast('success', 'Meta actualizada')
              setGoalOpen(false)
            }}
          >
            Guardar meta
          </button>
        }
      >
        <label className="label">¿Cuánto quieres vender este mes?</label>
        <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={goalInput} onChange={(e) => setGoalInput(e.target.value)} placeholder="$ 0" />
      </Sheet>
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
