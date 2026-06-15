import { useState } from 'react'
import { useTenant, useLocations } from '@/hooks/data'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { exportAllData, importAllData } from '@/data/repo'
import { cloudLogin, isCloudConfigured, getApiUrl, clearCloud } from '@/data/api'
import { startCloud, stopCloud, syncNow } from '@/data/cloud'
import { Sheet } from '@/components/Sheet'
import { PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDate } from '@/lib/format'
import { billingBreakdown } from '@/lib/billing'
import { uid } from '@/lib/id'
import { useSession } from '@/store/session'
import { drawerSupported, drawerLinked, connectDrawer, unlinkDrawer, openCashDrawer, drawerMessage } from '@/lib/cashDrawer'
import { scaleSupported, scaleLinked, connectScale, unlinkScale, readWeightOnce, scaleMessage } from '@/lib/scale'
import { QRCode } from '@/components/QRCode'
import { breBPayload, BREB_KEY_TYPES } from '@/lib/breB'
import type { Location, User, DianConfig, Tenant } from '@/types'

export default function Ajustes() {
  const tenantId = useSession((s) => s.tenantId)!
  const tenant = useTenant()
  const locations = useLocations()
  const employees = useLiveQuery(
    () => db.users.where('tenantId').equals(tenantId).and((u) => u.role === 'empleado').toArray(),
    [tenantId],
  )
  const [locEdit, setLocEdit] = useState<Location | null>(null)
  const [locAdd, setLocAdd] = useState(false)
  const [empEdit, setEmpEdit] = useState<User | null>(null)
  const [empAdd, setEmpAdd] = useState(false)
  const [dianOpen, setDianOpen] = useState(false)

  async function doExport() {
    const json = await exportAllData()
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ventanilla-respaldo.json'
    a.click()
    toast('success', 'Respaldo descargado')
  }
  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      try {
        await importAllData(reader.result as string)
        toast('success', 'Respaldo restaurado')
        setTimeout(() => location.reload(), 800)
      } catch {
        toast('error', 'Archivo de respaldo inválido')
      }
    }
    reader.readAsText(file)
  }

  if (!tenant) return null
  const billing = billingBreakdown(locations?.length ?? 0, tenant.monthlyFeePerLocation)
  const usedSeats = locations?.length ?? 0
  const maxSeats = tenant.maxSeats ?? usedSeats
  function addLocation() {
    if (usedSeats >= maxSeats) {
      toast('info', `Tu licencia permite ${maxSeats} punto(s). Pide a la plataforma ampliarla.`)
      return
    }
    setLocAdd(true)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" subtitle={tenant.businessName} />

      {/* Locales */}
      <Section title={`Locales / Ventanillas (${usedSeats}/${maxSeats})`} action={<AddBtn onClick={addLocation} />}>
        {locations?.map((l) => (
          <button key={l.id} onClick={() => setLocEdit(l)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left">
            <Icon name="building" className="h-5 w-5 text-brand-600" />
            <div className="flex-1">
              <p className="font-semibold text-slate-700">{l.name}</p>
              <p className="text-xs text-slate-400">{l.address}, {l.city} {l.allowBulk && '· granel'}</p>
            </div>
            <Icon name="edit" className="h-4 w-4 text-slate-300" />
          </button>
        ))}
      </Section>

      {/* Empleados */}
      <Section title="Empleados" action={<AddBtn onClick={() => setEmpAdd(true)} />}>
        {employees?.map((e) => (
          <button key={e.id} onClick={() => setEmpEdit(e)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 font-bold text-brand-700">{e.name.slice(0, 1)}</span>
            <div className="flex-1">
              <p className="font-semibold text-slate-700">{e.name}</p>
              <p className="text-xs text-slate-400">
                PIN {e.pin} · {locations?.find((l) => l.id === e.locationId)?.name ?? 'sin local'}
              </p>
            </div>
            <Icon name="edit" className="h-4 w-4 text-slate-300" />
          </button>
        ))}
      </Section>

      {/* DIAN */}
      <Section title="Facturación electrónica (DIAN)">
        <div className="rounded-xl bg-slate-50 p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm text-slate-500">Estado</span>
            <span className={`chip ${tenant.dian.enabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
              {tenant.dian.enabled ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          <p className="text-sm text-slate-600">Proveedor: <b className="capitalize">{tenant.dian.provider}</b></p>
          <p className="text-sm text-slate-600">Resolución: {tenant.dian.resolutionNumber}</p>
          <p className="text-xs text-slate-400">{tenant.dian.resolutionRange}</p>
          <button onClick={() => setDianOpen(true)} className="btn btn-secondary mt-3 w-full text-sm">
            Configurar conexión DIAN
          </button>
        </div>
        <p className="text-xs text-slate-400">
          Cada negocio conecta su propio proveedor autorizado (Alegra, Factus, software DIAN…). La plataforma no te obliga a ninguno.
        </p>
      </Section>

      {/* Plan / Suscripción */}
      <Section title="Tu plan">
        <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm text-slate-600">Mensualidad ({locations?.length} locales)</span>
            <span className="text-xl font-bold text-brand-700">{cop(billing.total)}/mes</span>
          </div>
          {billing.lines.map((l) => (
            <div key={l.index} className="flex justify-between text-xs text-slate-500">
              <span>Ventanilla {l.index} {l.factor < 1 && <span className="text-emerald-600">(-{Math.round((1 - l.factor) * 100)}%)</span>}</span>
              <span>{cop(l.price)}</span>
            </div>
          ))}
          {billing.savings > 0 && (
            <p className="mt-2 text-xs font-semibold text-emerald-600">Ahorras {cop(billing.savings)}/mes por paquete</p>
          )}
          <p className="mt-2 text-xs text-slate-400">Pagado hasta {fmtDate(tenant.paidUntil)}</p>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-lg font-bold text-slate-700">{usedSeats}/{maxSeats}</p>
            <p className="text-[11px] text-slate-400">Puntos (ventanillas)</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-center">
            <p className="text-lg font-bold text-slate-700">{tenant.maxDevices ?? '—'}</p>
            <p className="text-[11px] text-slate-400">Dispositivos permitidos</p>
          </div>
        </div>
      </Section>

      {/* Pagos Bre-B */}
      <Section title="Pagos Bre-B">
        <BreBSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Programa de puntos */}
      <Section title="Programa de puntos">
        <LoyaltySection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Cajón monedero */}
      <Section title="Cajón monedero">
        <CashDrawerSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Báscula */}
      <Section title="Báscula (granel)">
        <ScaleSection />
      </Section>

      {/* Nube / multi-dispositivo */}
      <Section title="Nube (multi-dispositivo)">
        <CloudSection />
      </Section>

      {/* Datos y respaldo */}
      <Section title="Datos y respaldo">
        <div className="space-y-2">
          <button onClick={doExport} className="btn btn-secondary w-full">
            ⬇️ Exportar respaldo (.json)
          </button>
          <label className="btn btn-secondary w-full cursor-pointer">
            ⬆️ Importar respaldo
            <input type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
          </label>
          <p className="text-xs text-slate-400">
            Guarda o restaura todos los datos del dispositivo (productos, ventas, clientes, caja…).
          </p>
        </div>
      </Section>

      {/* Sheets */}
      {(locEdit || locAdd) && (
        <LocationForm location={locEdit ?? undefined} tenantId={tenantId} city={tenant.city} onClose={() => { setLocEdit(null); setLocAdd(false) }} />
      )}
      {(empEdit || empAdd) && (
        <EmployeeForm employee={empEdit ?? undefined} tenantId={tenantId} locations={locations ?? []} onClose={() => { setEmpEdit(null); setEmpAdd(false) }} />
      )}
      {dianOpen && <DianForm tenantId={tenantId} dian={tenant.dian} onClose={() => setDianOpen(false)} />}
    </div>
  )
}

function BreBSection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const [key, setKey] = useState(tenant.breBKey ?? '')
  const [type, setType] = useState<string>(tenant.breBKeyType ?? 'celular')

  async function save() {
    await db.tenants.update(tenantId, { breBKey: key.trim() || undefined, breBKeyType: type as any })
    toast('success', key.trim() ? 'Llave Bre-B guardada ✓' : 'Llave Bre-B quitada')
  }

  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-cyan-50 px-3 py-2 text-xs text-cyan-800">
        Registra tu <b>llave Bre-B</b>. Al cobrar, la app muestra tu QR/llave y el cliente te paga desde cualquier banco o billetera (Nequi, Daviplata, Bancolombia…), sin datáfono.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Tipo de llave</label>
          <select className="input" value={type} onChange={(e) => setType(e.target.value)}>
            {BREB_KEY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Tu llave</label>
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="Ej. 3147555896" />
        </div>
      </div>
      <button onClick={save} className="btn btn-primary w-full text-sm">Guardar llave Bre-B</button>
      {key.trim() && (
        <div className="rounded-xl border border-slate-100 bg-white p-3 text-center">
          <p className="mb-2 text-xs font-semibold text-slate-500">Así lo verá el cliente al pagar:</p>
          <QRCode value={breBPayload({ breBKey: key })} size={160} />
          <p className="mt-2 text-sm font-bold text-slate-700">{key.trim()}</p>
        </div>
      )}
    </div>
  )
}

function LoyaltySection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const enabled = tenant.loyaltyEnabled ?? false
  const [per, setPer] = useState(String(tenant.loyaltyPointsPerThousand ?? 1))
  const [val, setVal] = useState(String(tenant.loyaltyRedeemValue ?? 20))

  async function toggle(v: boolean) {
    await db.tenants.update(tenantId, { loyaltyEnabled: v })
    toast('success', v ? 'Programa de puntos activado' : 'Programa de puntos desactivado')
  }
  async function saveConfig() {
    await db.tenants.update(tenantId, {
      loyaltyPointsPerThousand: Math.max(0, parseInt(per || '0', 10)) || 1,
      loyaltyRedeemValue: Math.max(1, parseInt(val || '0', 10)) || 20,
    })
    toast('success', 'Configuración de puntos guardada')
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5" />
        <span className="text-sm text-slate-600">Activar puntos de fidelización para clientes</span>
      </label>
      {enabled && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="label">Puntos por cada $1.000</label>
              <input className="input" inputMode="numeric" value={per} onChange={(e) => setPer(e.target.value)} />
            </div>
            <div>
              <label className="label">Valor de cada punto ($)</label>
              <input className="input" inputMode="numeric" value={val} onChange={(e) => setVal(e.target.value)} />
            </div>
          </div>
          <button onClick={saveConfig} className="btn btn-primary w-full text-sm">Guardar configuración</button>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Ejemplo: con {per} punto(s) por $1.000, una compra de $10.000 da {10 * (parseInt(per || '1', 10) || 1)} puntos = {cop((10 * (parseInt(per || '1', 10) || 1)) * (parseInt(val || '20', 10) || 20))} para su próxima compra.
          </p>
        </>
      )}
    </div>
  )
}

function CashDrawerSection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const [linked, setLinked] = useState(drawerLinked())
  const supported = drawerSupported()
  const auto = tenant.autoOpenDrawer ?? false

  async function link() {
    const ok = await connectDrawer()
    setLinked(ok)
    toast(ok ? 'success' : 'info', ok ? 'Impresora/cajón vinculado ✓' : 'No se pudo vincular. Conecta la impresora por USB.')
  }

  async function test() {
    const r = await openCashDrawer(true)
    setLinked(drawerLinked())
    const m = drawerMessage(r)
    toast(m.tone, m.text)
  }

  async function toggleAuto(v: boolean) {
    await db.tenants.update(tenantId, { autoOpenDrawer: v })
    toast('success', v ? 'Se abrirá solo en ventas en efectivo' : 'Apertura automática desactivada')
  }

  return (
    <div className="space-y-3">
      {!supported && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Este dispositivo no soporta cajón monedero por navegador. Úsalo en el PC de la tienda con Chrome o Edge.
        </p>
      )}
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-slate-500">Estado</span>
          <span className={`chip ${linked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {linked ? 'Vinculado' : 'Sin vincular'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          El cajón se abre con la impresora de tickets (comando ESC/POS). Vincula la impresora una vez por dispositivo.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={link} disabled={!supported} className="btn btn-secondary text-sm disabled:opacity-50">
            {linked ? 'Re-vincular' : 'Vincular impresora'}
          </button>
          <button onClick={test} disabled={!supported} className="btn btn-secondary text-sm disabled:opacity-50">
            💵 Probar apertura
          </button>
        </div>
        {linked && (
          <button onClick={() => { unlinkDrawer(); setLinked(false); toast('info', 'Cajón desvinculado') }} className="mt-2 w-full text-xs text-rose-500">
            Desvincular
          </button>
        )}
      </div>
      <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <input type="checkbox" checked={auto} onChange={(e) => toggleAuto(e.target.checked)} className="h-5 w-5" />
        <span className="text-sm text-slate-600">Abrir el cajón automáticamente en cada venta en efectivo</span>
      </label>
    </div>
  )
}

function ScaleSection() {
  const [linked, setLinked] = useState(scaleLinked())
  const supported = scaleSupported()

  async function link() {
    const ok = await connectScale()
    setLinked(ok)
    toast(ok ? 'success' : 'info', ok ? 'Báscula vinculada ✓' : 'No se pudo vincular. Conecta la báscula por USB/serial.')
  }

  async function test() {
    const r = await readWeightOnce(true)
    setLinked(scaleLinked())
    const m = scaleMessage(r)
    toast(m.tone, m.text)
  }

  return (
    <div className="space-y-3">
      {!supported && (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Este dispositivo no soporta báscula por navegador. Úsalo en el PC de la tienda con Chrome o Edge.
        </p>
      )}
      <div className="rounded-xl bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm text-slate-500">Estado</span>
          <span className={`chip ${linked ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
            {linked ? 'Vinculada' : 'Sin vincular'}
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Lee el peso automáticamente al vender a granel (botón “⚖️ Leer báscula” en el POS). Vincula la báscula una vez por dispositivo.
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button onClick={link} disabled={!supported} className="btn btn-secondary text-sm disabled:opacity-50">
            {linked ? 'Re-vincular' : 'Vincular báscula'}
          </button>
          <button onClick={test} disabled={!supported} className="btn btn-secondary text-sm disabled:opacity-50">
            ⚖️ Probar lectura
          </button>
        </div>
        {linked && (
          <button onClick={() => { unlinkScale(); setLinked(false); toast('info', 'Báscula desvinculada') }} className="mt-2 w-full text-xs text-rose-500">
            Desvincular
          </button>
        )}
      </div>
    </div>
  )
}

function CloudSection() {
  const [connected, setConnected] = useState(isCloudConfigured())
  const [url, setUrl] = useState(getApiUrl() || '')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (connected) {
    return (
      <div className="space-y-2">
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          ✅ Conectado a la nube
          <br />
          <span className="break-all text-xs text-emerald-600">{getApiUrl()}</span>
        </div>
        <button
          className="btn btn-secondary w-full text-sm"
          disabled={busy}
          onClick={async () => {
            setBusy(true)
            try { await syncNow(); toast('success', 'Sincronizado') }
            catch { toast('error', 'No se pudo sincronizar') }
            finally { setBusy(false) }
          }}
        >
          {busy ? 'Sincronizando…' : '🔄 Sincronizar ahora'}
        </button>
        <button
          className="btn btn-secondary w-full text-sm text-rose-600"
          onClick={() => { stopCloud(); clearCloud(); setConnected(false); toast('info', 'Desconectado de la nube') }}
        >
          Desconectar
        </button>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Conecta este dispositivo a tu backend para sincronizar en la nube y usar varios dispositivos.
        Sin esto, todo funciona local en el equipo.
      </p>
      <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL del API (https://…)" />
      <input className="input" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo del negocio" />
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" />
      <button
        className="btn btn-primary w-full"
        disabled={busy || !url || !email}
        onClick={async () => {
          setBusy(true)
          try {
            await cloudLogin(url.trim(), email.trim(), password)
            await startCloud()
            setConnected(true)
            toast('success', 'Conectado y sincronizando')
          } catch (e: any) {
            toast('error', e?.message || 'No se pudo conectar')
          } finally {
            setBusy(false)
          }
        }}
      >
        {busy ? 'Conectando…' : 'Conectar a la nube'}
      </button>
    </div>
  )
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-400">{title}</h2>
        {action}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  )
}

function AddBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm font-semibold text-brand-600">
      <Icon name="plus" className="h-4 w-4" /> Agregar
    </button>
  )
}

function LocationForm({ location, tenantId, city, onClose }: { location?: Location; tenantId: string; city: string; onClose: () => void }) {
  const [name, setName] = useState(location?.name ?? '')
  const [address, setAddress] = useState(location?.address ?? '')
  const [locCity, setCity] = useState(location?.city ?? city)
  const [allowBulk, setAllowBulk] = useState(location?.allowBulk ?? false)
  return (
    <Sheet
      open onClose={onClose} title={location ? 'Editar local' : 'Nuevo local'}
      footer={
        <button className="btn btn-primary btn-lg w-full" onClick={async () => {
          if (!name.trim()) return toast('error', 'Ponle nombre al local')
          await db.locations.put({
            id: location?.id ?? uid('l'), tenantId, name: name.trim(), address, city: locCity,
            allowBulk, active: location?.active ?? true, createdAt: location?.createdAt ?? new Date().toISOString(),
          })
          toast('success', 'Local guardado')
          onClose()
        }}>Guardar</button>
      }
    >
      <div className="space-y-3">
        <div><label className="label">Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tienda Centro" /></div>
        <div><label className="label">Dirección</label><input className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div><label className="label">Ciudad</label><input className="input" value={locCity} onChange={(e) => setCity(e.target.value)} /></div>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={allowBulk} onChange={(e) => setAllowBulk(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Vende a granel / por peso</span>
        </label>
      </div>
    </Sheet>
  )
}

function EmployeeForm({ employee, tenantId, locations, onClose }: { employee?: User; tenantId: string; locations: Location[]; onClose: () => void }) {
  const [name, setName] = useState(employee?.name ?? '')
  const [pin, setPin] = useState(employee?.pin ?? '')
  const [locationId, setLocationId] = useState(employee?.locationId ?? locations[0]?.id ?? '')
  const p = employee?.permissions
  const [canDiscount, setCanDiscount] = useState(p?.canDiscount !== false)
  const [canManageInventory, setCanManageInventory] = useState(p?.canManageInventory !== false)
  const [canCashMovement, setCanCashMovement] = useState(p?.canCashMovement !== false)
  const [canVoid, setCanVoid] = useState(p?.canVoid !== false)

  const perms = [
    { label: 'Aplicar descuentos y redondeo', val: canDiscount, set: setCanDiscount },
    { label: 'Crear/editar productos y stock', val: canManageInventory, set: setCanManageInventory },
    { label: 'Registrar ingresos/egresos de caja', val: canCashMovement, set: setCanCashMovement },
    { label: 'Anular ventas y devoluciones', val: canVoid, set: setCanVoid },
  ]

  return (
    <Sheet
      open onClose={onClose} title={employee ? 'Editar empleado' : 'Nuevo empleado'}
      footer={
        <button className="btn btn-primary btn-lg w-full" onClick={async () => {
          if (!name.trim()) return toast('error', 'Ponle nombre')
          if (pin.length !== 4) return toast('error', 'El PIN debe tener 4 dígitos')
          await db.users.put({
            id: employee?.id ?? uid('u'), tenantId, name: name.trim(), role: 'empleado',
            pin, locationId, active: employee?.active ?? true,
            permissions: { canDiscount, canManageInventory, canCashMovement, canVoid },
          })
          toast('success', 'Empleado guardado')
          onClose()
        }}>Guardar</button>
      }
    >
      <div className="space-y-3">
        <div><label className="label">Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">PIN (4 dígitos)</label><input className="input text-center text-xl tracking-widest" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" /></div>
        <div>
          <label className="label">Local asignado</label>
          <select className="input" value={locationId} onChange={(e) => setLocationId(e.target.value)}>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Permisos</label>
          <div className="space-y-1.5">
            {perms.map((pm) => (
              <label key={pm.label} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <input type="checkbox" checked={pm.val} onChange={(e) => pm.set(e.target.checked)} className="h-5 w-5" />
                <span className="text-sm text-slate-600">{pm.label}</span>
              </label>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function DianForm({ tenantId, dian, onClose }: { tenantId: string; dian: DianConfig; onClose: () => void }) {
  const [provider, setProvider] = useState(dian.provider)
  const [resolutionNumber, setRes] = useState(dian.resolutionNumber)
  const [resolutionRange, setRange] = useState(dian.resolutionRange)
  const [enabled, setEnabled] = useState(dian.enabled)
  return (
    <Sheet
      open onClose={onClose} title="Conexión DIAN"
      footer={
        <button className="btn btn-primary btn-lg w-full" onClick={async () => {
          await db.tenants.update(tenantId, {
            dian: { ...dian, provider, resolutionNumber, resolutionRange, enabled, testMode: true },
          })
          toast('success', 'Configuración DIAN guardada')
          onClose()
        }}>Guardar</button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Proveedor tecnológico autorizado</label>
          <select className="input" value={provider} onChange={(e) => setProvider(e.target.value as any)}>
            <option value="alegra">Alegra</option>
            <option value="factus">Factus</option>
            <option value="dian_gratuito">Software gratuito DIAN</option>
            <option value="otro">Otro</option>
            <option value="ninguno">Aún no conectado</option>
          </select>
        </div>
        <div><label className="label">Número de resolución</label><input className="input" value={resolutionNumber} onChange={(e) => setRes(e.target.value)} /></div>
        <div><label className="label">Rango de numeración</label><input className="input" value={resolutionRange} onChange={(e) => setRange(e.target.value)} placeholder="POS1 1 al 5000" /></div>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Conexión activa</span>
        </label>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          En el demo la transmisión es simulada. En producción se usan tus credenciales reales del proveedor.
        </p>
      </div>
    </Sheet>
  )
}
