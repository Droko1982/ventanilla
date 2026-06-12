import { useState } from 'react'
import { useTenant, useLocations } from '@/hooks/data'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { Sheet } from '@/components/Sheet'
import { PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDate } from '@/lib/format'
import { billingBreakdown } from '@/lib/billing'
import { uid } from '@/lib/id'
import { useSession } from '@/store/session'
import type { Location, User, DianConfig } from '@/types'

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

  if (!tenant) return null
  const billing = billingBreakdown(locations?.length ?? 0, tenant.monthlyFeePerLocation)

  return (
    <div className="space-y-6">
      <PageHeader title="Ajustes" subtitle={tenant.businessName} />

      {/* Locales */}
      <Section title="Locales / Ventanillas" action={<AddBtn onClick={() => setLocAdd(true)} />}>
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
