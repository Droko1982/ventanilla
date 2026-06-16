import { useEffect, useMemo, useState } from 'react'
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
import {
  getApiUrl, getRole, superAdminLogin, adminListTenants, adminSetStatus, adminPay, adminSetLicense,
  adminListDevices, adminReleaseDevice, adminDeleteTenant, clearCloud, type CloudTenant, type CloudDevice,
} from '@/data/api'
import type { Tenant, AccountStatus } from '@/types'

// URL del backend en producción (Render). El dueño solo escribe correo y clave.
const PROD_API = 'https://ventanilla-api-vvzh.onrender.com'

// Fila de cliente que entiende tanto el modo local (demo) como el modo nube.
type Row = {
  id: string
  businessName: string
  ownerName: string
  email: string
  city: string
  status: AccountStatus
  paidUntil: string
  monthlyFeePerLocation: number
  locationCount?: number
  maxSeats?: number
  maxDevices?: number
  deviceCount?: number
  phone?: string
  nit?: string
}

// Consola del dueño de la plataforma (nosotros): ve todos los clientes,
// activa/suspende cuentas, gestiona el cobro y mira métricas globales.
// En modo DEMO usa datos locales; conectado a la nube controla a los clientes reales.
export default function SuperAdmin() {
  const logout = useSession((s) => s.logout)
  const localTenants = useLiveQuery(() => db.tenants.toArray(), [])
  const [cloud, setCloud] = useState<CloudTenant[] | null>(null) // null = modo local
  const [filter, setFilter] = useState<'todos' | 'activo' | 'suspendido' | 'mora'>('todos')
  const [detailId, setDetailId] = useState<string | null>(null)

  async function refreshCloud() {
    setCloud(await adminListTenants())
  }

  // Si este dispositivo ya tiene una sesión Super-Admin guardada, reconecta solo.
  // Solo si el rol guardado es super-admin (no sondea con token de dueño).
  useEffect(() => {
    if (getRole() !== 'superadmin' || !getApiUrl()) return
    adminListTenants().then(setCloud).catch(() => {})
  }, [])

  const rows: Row[] = cloud
    ? cloud.map((t) => ({ ...t, status: t.status as AccountStatus }))
    : (localTenants ?? [])

  const detail = detailId ? rows.find((r) => r.id === detailId) ?? null : null

  const metrics = useMemo(() => {
    const active = rows.filter((t) => t.status === 'activo')
    const mrr = active.reduce((s, t) => s + monthlyTotal(t.locationCount ?? 1, t.monthlyFeePerLocation), 0)
    const overdue = rows.filter((t) => daysUntil(t.paidUntil) < 0).length
    return { total: rows.length, active: active.length, mrr, overdue }
  }, [rows])

  const list = useMemo(() => {
    let l = rows
    if (filter === 'mora') l = l.filter((t) => daysUntil(t.paidUntil) < 0)
    else if (filter !== 'todos') l = l.filter((t) => t.status === filter)
    return [...l].sort((a, b) => daysUntil(a.paidUntil) - daysUntil(b.paidUntil))
  }, [rows, filter])

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="sticky top-0 z-30 bg-slate-900 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600">🛡️</span>
          <div className="flex-1">
            <p className="font-bold leading-tight">Consola Super-Admin</p>
            <p className="text-xs text-slate-400">{cloud ? 'Conectado a la nube' : 'Plataforma Ventanilla'}</p>
          </div>
          <button onClick={logout} className="flex h-9 w-9 items-center justify-center rounded-full text-slate-300 hover:bg-white/10">
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        <CloudPanel connected={!!cloud} count={cloud?.length ?? 0} onConnect={refreshCloud} onDisconnect={() => { clearCloud(); setCloud(null) }} onRefresh={refreshCloud} />

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
              <button key={t.id} onClick={() => setDetailId(t.id)} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-xl">🏪</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-slate-700">{t.businessName}</p>
                  <p className="truncate text-xs text-slate-400">
                    {t.ownerName} · {t.city} · {t.locationCount ?? 1} local(es)
                    {cloud && <span> · {t.deviceCount ?? 0} disp.</span>}
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
          {list.length === 0 && <EmptyState emoji="🗂️" title={cloud ? 'Aún no hay clientes en la nube' : 'Sin clientes en este filtro'} />}
        </div>
      </main>

      {detail && (
        <TenantDetail
          tenant={detail}
          cloud={!!cloud}
          onChanged={refreshCloud}
          onClose={() => setDetailId(null)}
        />
      )}
    </div>
  )
}

// Panel para conectar la consola al backend real y controlar clientes en la nube.
function CloudPanel({ connected, count, onConnect, onDisconnect, onRefresh }: {
  connected: boolean
  count: number
  onConnect: () => Promise<void>
  onDisconnect: () => void
  onRefresh: () => Promise<void>
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState(getApiUrl() || PROD_API)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (connected) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
        <span className="text-lg">☁️</span>
        <div className="flex-1 text-sm">
          <p className="font-semibold text-emerald-800">Conectado a la plataforma</p>
          <p className="text-xs text-emerald-600">{count} cliente(s) reales · los cambios afectan sus cuentas</p>
        </div>
        <button onClick={onRefresh} className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-lg text-emerald-700" title="Actualizar">↻</button>
        <button onClick={onDisconnect} className="text-xs text-emerald-700 underline">Salir</button>
      </div>
    )
  }

  async function connect() {
    if (!url || !email || !password) return toast('error', 'Completa URL, correo y clave')
    setBusy(true)
    try {
      await superAdminLogin(url, email, password)
      await onConnect()
      setOpen(false)
      setPassword('')
      toast('success', 'Conectado a la nube')
    } catch (e) {
      toast('error', (e as Error).message || 'No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3">
      {!open ? (
        <button onClick={() => setOpen(true)} className="flex w-full items-center gap-3 text-left">
          <span className="text-lg">☁️</span>
          <div className="flex-1 text-sm">
            <p className="font-semibold text-slate-700">Conectar a la plataforma (nube)</p>
            <p className="text-xs text-slate-400">Estás viendo el demo local. Conéctate para ver y controlar a tus clientes reales.</p>
          </div>
          <span className="text-xl text-slate-300">›</span>
        </button>
      ) : (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Acceso Super-Admin de la plataforma</p>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL del servidor" className="input w-full text-sm" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo Super-Admin" autoComplete="username" className="input w-full text-sm" />
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Clave" autoComplete="current-password" className="input w-full text-sm" onKeyDown={(e) => e.key === 'Enter' && connect()} />
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="btn btn-ghost flex-1">Cancelar</button>
            <button onClick={connect} disabled={busy} className="btn btn-primary flex-1">{busy ? 'Conectando…' : 'Conectar'}</button>
          </div>
        </div>
      )}
    </div>
  )
}

function StatusChip({ status }: { status: Tenant['status'] }) {
  const map: Record<string, string> = {
    activo: 'bg-emerald-100 text-emerald-700',
    suspendido: 'bg-rose-100 text-rose-700',
    prueba: 'bg-blue-100 text-blue-700',
  }
  const label: Record<string, string> = { activo: 'Activo', suspendido: 'Suspendido', prueba: 'Prueba' }
  return <span className={`chip ${map[status] ?? 'bg-slate-100 text-slate-600'}`}>{label[status] ?? status}</span>
}

function TenantDetail({ tenant, cloud, onChanged, onClose }: {
  tenant: Row
  cloud: boolean
  onChanged: () => Promise<void>
  onClose: () => void
}) {
  const billing = billingBreakdown(tenant.locationCount ?? 1, tenant.monthlyFeePerLocation)
  const overdue = daysUntil(tenant.paidUntil) < 0
  // En local la lista de dispositivos viene de Dexie; en la nube se trae del API.
  const localDevices = useLiveQuery(() => db.devices.where('tenantId').equals(tenant.id).toArray(), [tenant.id]) ?? []
  const [cloudDevices, setCloudDevices] = useState<CloudDevice[]>([])
  useEffect(() => {
    if (cloud) adminListDevices(tenant.id).then(setCloudDevices).catch(() => {})
  }, [cloud, tenant.id])
  const deviceList: { id: string; name: string; blocked?: boolean }[] = cloud ? cloudDevices : localDevices
  const seatsUsed = tenant.locationCount ?? 1
  const maxSeats = tenant.maxSeats ?? seatsUsed
  const maxDevices = tenant.maxDevices ?? 0
  const devicesActive = deviceList.filter((d) => !d.blocked).length

  async function setStatus(status: AccountStatus) {
    if (cloud) { await adminSetStatus(tenant.id, status); await onChanged() }
    else await db.tenants.update(tenant.id, { status })
    toast('success', status === 'activo' ? 'Cuenta activada' : 'Cuenta suspendida')
    onClose()
  }

  async function setSeats(n: number) {
    const v = Math.max(1, n)
    if (cloud) { await adminSetLicense(tenant.id, { maxSeats: v }); await onChanged() }
    else await db.tenants.update(tenant.id, { maxSeats: v })
    toast('success', `Licencia: ${v} punto(s)`)
  }
  async function setDevices(n: number) {
    const v = Math.max(1, n)
    if (cloud) { await adminSetLicense(tenant.id, { maxDevices: v }); await onChanged() }
    else await db.tenants.update(tenant.id, { maxDevices: v })
    toast('success', `Licencia: ${v} dispositivo(s)`)
  }
  async function releaseDevice(id: string) {
    if (cloud) {
      await adminReleaseDevice(tenant.id, id)
      setCloudDevices(await adminListDevices(tenant.id).catch(() => cloudDevices))
      await onChanged()
    } else {
      await db.devices.delete(id)
    }
    toast('success', 'Dispositivo liberado')
  }

  async function markPaid() {
    if (cloud) {
      await adminPay(tenant.id)
      await onChanged()
    } else {
      const base = Math.max(Date.now(), new Date(tenant.paidUntil).getTime())
      const next = new Date(base + 30 * 86400000).toISOString()
      await db.tenants.update(tenant.id, { paidUntil: next, status: 'activo' })
    }
    toast('success', 'Pago registrado · +30 días')
    onClose()
  }

  async function removeTenant() {
    if (!confirm(`¿Eliminar definitivamente a "${tenant.businessName}"? Se borran su cuenta, datos y pagos. Esto no se puede deshacer.`)) return
    if (cloud) { await adminDeleteTenant(tenant.id); await onChanged() }
    else await db.tenants.delete(tenant.id)
    toast('success', 'Cliente eliminado')
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={tenant.businessName}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            <p>{tenant.ownerName}</p>
            <p>{tenant.email}{tenant.phone ? ` · ${tenant.phone}` : ''}</p>
            <p>{tenant.nit ? `NIT ${tenant.nit} · ` : ''}{tenant.city}</p>
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
          {deviceList.length > 0 && (
            <div className="mt-2 space-y-1">
              {deviceList.map((d) => (
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
          {cloud ? 'Los cambios se aplican en la cuenta real del cliente.' : 'Estás en el demo local. Conéctate a la nube para gestionar clientes reales.'}
        </p>

        <button onClick={removeTenant} className="w-full text-center text-xs text-rose-400 hover:text-rose-600">
          Eliminar cliente definitivamente
        </button>
      </div>
    </Sheet>
  )
}
