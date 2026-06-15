import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useSession } from '@/store/session'
import { StatCard, Money, Segmented, EmptyState } from '@/components/ui'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDate, daysUntil } from '@/lib/format'
import { monthlyTotal, billingBreakdown } from '@/lib/billing'
import type { Tenant } from '@/types'

// Consola del dueño de la plataforma (nosotros): ve todos los clientes,
// activa/suspende cuentas, gestiona el cobro y mira métricas globales.
export default function SuperAdmin() {
  const logout = useSession((s) => s.logout)
  const tenants = useLiveQuery(() => db.tenants.toArray(), [])
  const [filter, setFilter] = useState<'todos' | 'activo' | 'suspendido' | 'mora'>('todos')
  const [detail, setDetail] = useState<Tenant | null>(null)

  const metrics = useMemo(() => {
    const list = tenants ?? []
    const active = list.filter((t) => t.status === 'activo')
    const mrr = active.reduce((s, t) => s + monthlyTotal(t.locationCount ?? 1, t.monthlyFeePerLocation), 0)
    const overdue = list.filter((t) => daysUntil(t.paidUntil) < 0).length
    return { total: list.length, active: active.length, mrr, overdue }
  }, [tenants])

  const list = useMemo(() => {
    let l = tenants ?? []
    if (filter === 'mora') l = l.filter((t) => daysUntil(t.paidUntil) < 0)
    else if (filter !== 'todos') l = l.filter((t) => t.status === filter)
    return [...l].sort((a, b) => daysUntil(a.paidUntil) - daysUntil(b.paidUntil))
  }, [tenants, filter])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">🛡️</span>
          <div className="flex-1">
            <p className="font-bold leading-tight">Consola Super-Admin</p>
            <p className="text-xs text-slate-400">Plataforma Ventanilla</p>
          </div>
          <button onClick={logout} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:bg-white/10">
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <StatCard label="Clientes" value={metrics.total} sub={`${metrics.active} activos`} accent="text-brand-700" icon={<Icon name="users" className="h-5 w-5" />} />
          <StatCard label="Ingreso mensual (MRR)" value={<Money value={metrics.mrr} />} accent="text-emerald-600" icon={<Icon name="cash" className="h-5 w-5" />} />
          <StatCard label="En mora" value={metrics.overdue} sub="pagos vencidos" accent="text-rose-600" icon={<Icon name="alert" className="h-5 w-5" />} />
          <StatCard label="Ticket promedio" value={<Money value={metrics.active ? Math.round(metrics.mrr / metrics.active) : 0} />} sub="por cliente activo" />
        </div>

        <div className="mb-4">
          <Segmented
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'activo', label: 'Activos' },
              { value: 'mora', label: 'En mora' },
              { value: 'suspendido', label: 'Suspendidos' },
            ]}
          />
        </div>

        <div className="space-y-2">
          {list.map((t) => {
            const overdue = daysUntil(t.paidUntil) < 0
            const total = monthlyTotal(t.locationCount ?? 1, t.monthlyFeePerLocation)
            return (
              <button key={t.id} onClick={() => setDetail(t)} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">🏪</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-700">{t.businessName}</p>
                  <p className="truncate text-xs text-slate-400">
                    {t.ownerName} · {t.city} · {t.locationCount ?? 1} local(es)
                  </p>
                  <p className="text-xs">
                    <span className={overdue ? 'text-rose-500' : 'text-slate-400'}>
                      {overdue ? `Venció hace ${Math.abs(daysUntil(t.paidUntil))}d` : `Paga en ${daysUntil(t.paidUntil)}d`}
                    </span>
                    <span className="text-slate-400"> · {cop(total)}/mes</span>
                  </p>
                </div>
                <StatusChip status={t.status} />
              </button>
            )
          })}
          {list.length === 0 && <EmptyState emoji="🗂️" title="Sin clientes en este filtro" />}
        </div>
      </main>

      {detail && <TenantDetail tenant={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function StatusChip({ status }: { status: Tenant['status'] }) {
  const map = {
    activo: 'bg-emerald-100 text-emerald-700',
    suspendido: 'bg-rose-100 text-rose-700',
    prueba: 'bg-blue-100 text-blue-700',
  }
  const label = { activo: 'Activo', suspendido: 'Suspendido', prueba: 'Prueba' }
  return <span className={`chip ${map[status]}`}>{label[status]}</span>
}

function TenantDetail({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const billing = billingBreakdown(tenant.locationCount ?? 1, tenant.monthlyFeePerLocation)
  const overdue = daysUntil(tenant.paidUntil) < 0
  const devices = useLiveQuery(() => db.devices.where('tenantId').equals(tenant.id).toArray(), [tenant.id]) ?? []
  const seatsUsed = tenant.locationCount ?? 1
  const maxSeats = tenant.maxSeats ?? seatsUsed
  const maxDevices = tenant.maxDevices ?? 0
  const devicesActive = devices.filter((d) => !d.blocked).length

  async function setStatus(status: Tenant['status']) {
    await db.tenants.update(tenant.id, { status })
    toast('success', status === 'activo' ? 'Cuenta activada' : 'Cuenta suspendida')
    onClose()
  }

  async function setSeats(n: number) {
    await db.tenants.update(tenant.id, { maxSeats: Math.max(1, n) })
    toast('success', `Licencia: ${Math.max(1, n)} punto(s)`)
  }
  async function setDevices(n: number) {
    await db.tenants.update(tenant.id, { maxDevices: Math.max(1, n) })
    toast('success', `Licencia: ${Math.max(1, n)} dispositivo(s)`)
  }
  async function releaseDevice(id: string) {
    await db.devices.delete(id)
    toast('success', 'Dispositivo liberado')
  }

  async function markPaid() {
    const base = Math.max(Date.now(), new Date(tenant.paidUntil).getTime())
    const next = new Date(base + 30 * 86400000).toISOString()
    await db.tenants.update(tenant.id, { paidUntil: next, status: 'activo' })
    toast('success', 'Pago registrado · +30 días')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={tenant.businessName}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            <p>{tenant.ownerName}</p>
            <p>{tenant.email} · {tenant.phone}</p>
            <p>NIT {tenant.nit} · {tenant.city}</p>
          </div>
          <StatusChip status={tenant.status} />
        </div>

        <div className={`rounded-xl p-3 ${overdue ? 'bg-rose-50' : 'bg-slate-50'}`}>
          <p className="text-sm text-slate-600">
            Pagado hasta <b>{fmtDate(tenant.paidUntil)}</b>{' '}
            {overdue && <span className="text-rose-600">(vencido)</span>}
          </p>
        </div>

        {/* Licencia: puntos (ventanillas) y dispositivos permitidos */}
        <div className="rounded-xl border border-slate-200 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-600">Licencia</p>
          <div className="flex items-center justify-between py-1.5">
            <div className="text-sm">
              <p className="font-medium text-slate-700">Puntos (ventanillas)</p>
              <p className="text-xs text-slate-400">{seatsUsed} en uso · {maxSeats} licenciados</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setSeats(maxSeats - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"><Icon name="minus" className="h-4 w-4" /></button>
              <span className="w-6 text-center font-bold">{maxSeats}</span>
              <button onClick={() => setSeats(maxSeats + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Icon name="plus" className="h-4 w-4" /></button>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 py-1.5">
            <div className="text-sm">
              <p className="font-medium text-slate-700">Dispositivos</p>
              <p className="text-xs text-slate-400">{devicesActive} conectados · {maxDevices || '—'} permitidos</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setDevices(maxDevices - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"><Icon name="minus" className="h-4 w-4" /></button>
              <span className="w-6 text-center font-bold">{maxDevices || 0}</span>
              <button onClick={() => setDevices(maxDevices + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Icon name="plus" className="h-4 w-4" /></button>
            </div>
          </div>
          {devices.length > 0 && (
            <div className="mt-2 space-y-1">
              {devices.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs">
                  <span className={d.blocked ? 'text-rose-500' : 'text-slate-600'}>{d.blocked ? '🚫 ' : '📱 '}{d.name}</span>
                  <button onClick={() => releaseDevice(d.id)} className="text-rose-400">Liberar</button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Cobro con descuento por paquete */}
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <p className="mb-2 text-sm font-semibold text-slate-600">Cobro mensual (descuento por paquete)</p>
          {billing.lines.map((l) => (
            <div key={l.index} className="flex justify-between text-xs text-slate-500">
              <span>Ventanilla {l.index} {l.factor < 1 && <span className="text-emerald-600">-{Math.round((1 - l.factor) * 100)}%</span>}</span>
              <span>{cop(l.price)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-brand-100 pt-1 font-bold text-brand-700">
            <span>Total</span><span>{cop(billing.total)}/mes</span>
          </div>
          {billing.savings > 0 && <p className="mt-1 text-xs text-emerald-600">Ahorro del cliente: {cop(billing.savings)}/mes</p>}
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button onClick={markPaid} className="btn btn-success">
            <Icon name="check" className="h-5 w-5" /> Registrar pago
          </button>
          {tenant.status === 'activo' ? (
            <button onClick={() => setStatus('suspendido')} className="btn btn-danger">Suspender</button>
          ) : (
            <button onClick={() => setStatus('activo')} className="btn btn-primary">Activar</button>
          )}
        </div>
        <p className="text-center text-xs text-slate-400">
          En la v1 el cobro es manual. La estructura queda lista para integrar pasarela de pago después.
        </p>
      </div>
    </Sheet>
  )
}
