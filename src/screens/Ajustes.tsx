import { useState, useEffect } from 'react'
import { useTenant, useLocations } from '@/hooks/data'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { exportAllData, importAllData, requestMonthlyCheckout, resolutionStatus } from '@/data/repo'
import { cloudLogin, cloudRegister, isCloudConfigured, getApiUrl, clearCloud } from '@/data/api'
import { startCloud, stopCloud, syncNow } from '@/data/cloud'
import { clearLocalData } from '@/data/seed'
import { Sheet } from '@/components/Sheet'
import { PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDate } from '@/lib/format'
import { billingBreakdown } from '@/lib/billing'
import { uid, randomPin } from '@/lib/id'
import { markBackupDone, daysSinceBackup, isStoragePersisted } from '@/lib/backup'
import { useSession } from '@/store/session'
import { drawerSupported, drawerLinked, connectDrawer, unlinkDrawer, openCashDrawer, drawerMessage } from '@/lib/cashDrawer'
import { scaleSupported, scaleLinked, connectScale, unlinkScale, readWeightOnce, scaleMessage } from '@/lib/scale'
import { MODULES, moduleEnabled } from '@/lib/modules'
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
  const [persisted, setPersisted] = useState(false)
  const [backupInfo, setBackupInfo] = useState<{ days: number | null; persisted: boolean }>({ days: daysSinceBackup(), persisted: false })
  useEffect(() => {
    isStoragePersisted().then((p) => { setPersisted(p); setBackupInfo((b) => ({ ...b, persisted: p })) })
  }, [])

  async function doExport() {
    const json = await exportAllData()
    const url = 'data:application/json;charset=utf-8,' + encodeURIComponent(json)
    const a = document.createElement('a')
    a.href = url
    a.download = 'ventanilla-respaldo.json'
    a.click()
    markBackupDone()
    setBackupInfo({ days: daysSinceBackup(), persisted })
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
  // Solo los locales ACTIVOS ocupan un punto de la licencia y se muestran arriba.
  const activeLocs = (locations ?? []).filter((l) => l.active !== false)
  const inactiveLocs = (locations ?? []).filter((l) => l.active === false)
  const billing = billingBreakdown(activeLocs.length, tenant.monthlyFeePerLocation)
  const usedSeats = activeLocs.length
  const maxSeats = tenant.maxSeats ?? usedSeats
  function addLocation() {
    if (usedSeats >= maxSeats) {
      toast('info', `Tu licencia permite ${maxSeats} punto(s). Pide a la plataforma ampliarla.`)
      return
    }
    setLocAdd(true)
  }
  async function reactivateLocation(l: Location) {
    if (usedSeats >= maxSeats) {
      toast('info', `Tu licencia permite ${maxSeats} punto(s). Pide a la plataforma ampliarla.`)
      return
    }
    await db.locations.update(l.id, { active: true })
    toast('success', 'Local reactivado')
  }

  return (
    <div className="space-y-6">
      <PageHeader help="ajustes" title="Ajustes" subtitle={tenant.businessName} />

      {/* Locales */}
      <Section title={`Locales / Ventanillas (${usedSeats}/${maxSeats})`} action={<AddBtn onClick={addLocation} />}>
        {activeLocs.map((l) => (
          <button key={l.id} onClick={() => setLocEdit(l)} className="flex w-full items-center gap-3 rounded-xl bg-slate-50 p-3 text-left">
            <Icon name="building" className="h-5 w-5 text-brand-600" />
            <div className="flex-1">
              <p className="font-semibold text-slate-700">{l.name}</p>
              <p className="text-xs text-slate-400">{l.address}, {l.city} {l.allowBulk && '· granel'}</p>
            </div>
            <Icon name="edit" className="h-4 w-4 text-slate-300" />
          </button>
        ))}
        {inactiveLocs.length > 0 && (
          <div className="mt-2 space-y-2">
            <p className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Inactivos</p>
            {inactiveLocs.map((l) => (
              <div key={l.id} className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 opacity-70">
                <Icon name="building" className="h-5 w-5 text-slate-400" />
                <div className="flex-1">
                  <p className="font-semibold text-slate-500">{l.name}</p>
                  <p className="text-xs text-slate-400">{l.address}, {l.city} · inactivo</p>
                </div>
                <button onClick={() => reactivateLocation(l)} className="btn btn-secondary px-3 py-1.5 text-xs">Reactivar</button>
              </div>
            ))}
          </div>
        )}
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
          <p className="text-xs text-slate-500">{tenant.vatResponsible === false ? 'No responsable de IVA' : 'Responsable de IVA'}</p>
          {(() => {
            const st = resolutionStatus(tenant.dian, 'pos')
            const cls = st.vencida || st.agotado ? 'text-rose-600' : st.near ? 'text-amber-600' : 'text-slate-400'
            return (
              <p className={`text-xs ${cls}`}>
                Consecutivo POS: {st.prefix}{st.current}
                {st.remaining != null && !st.agotado && ` · quedan ${st.remaining}`}
                {st.agotado && ' · RANGO AGOTADO'}
                {st.near && !st.agotado && ' · por agotarse'}
                {st.vencida && ' · resolución vencida'}
              </p>
            )
          })()}
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
        <button
          onClick={async () => {
            const r = await requestMonthlyCheckout()
            if (r?.url) window.open(r.url, '_blank')
            else toast('info', 'Conecta la nube en Ajustes para pagar en línea con tarjeta/PSE/Nequi.')
          }}
          className="btn btn-primary mt-2 w-full"
        >
          💳 Pagar mensualidad
        </button>
      </Section>

      {/* Módulos visibles */}
      <Section title="Módulos">
        <ModulesSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Pagos Bre-B */}
      <Section title="Pagos Bre-B">
        <BreBSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Programa de puntos */}
      <Section title="Programa de puntos">
        <LoyaltySection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Recordatorios de fiado */}
      <Section title="Recordatorios de fiado">
        <FiadoReminderSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Cajón monedero */}
      <Section title="Cajón monedero">
        <CashDrawerSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Báscula */}
      <Section title="Báscula (granel)">
        <ScaleSection />
      </Section>

      {/* Etiquetas de báscula (código con peso/precio incrustado) */}
      <Section title="Etiquetas de báscula">
        <ScaleLabelSection tenant={tenant} tenantId={tenantId} />
      </Section>

      {/* Nube / multi-dispositivo */}
      <Section title="Nube (multi-dispositivo)">
        <CloudSection />
      </Section>

      {/* Datos y respaldo */}
      <Section title="Datos y respaldo">
        <div className="space-y-2">
          {/* Aviso: los datos viven solo en este dispositivo. */}
          {(() => {
            const days = backupInfo.days
            const stale = days == null || days >= 7
            return (
              <div
                className={
                  'rounded-lg px-3 py-2 text-xs ' +
                  (stale
                    ? 'bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300'
                    : 'bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-300')
                }
              >
                {days == null
                  ? '⚠️ Aún no has descargado ningún respaldo. Tus datos viven solo en este dispositivo.'
                  : days === 0
                    ? '✅ Respaldo descargado hoy.'
                    : stale
                      ? `⚠️ Tu último respaldo fue hace ${days} días. Descarga uno nuevo.`
                      : `✅ Último respaldo hace ${days} ${days === 1 ? 'día' : 'días'}.`}
                <div className="mt-1 opacity-80">
                  {backupInfo.persisted
                    ? '🔒 El navegador protege tus datos (almacenamiento persistente activo).'
                    : '🛡️ Aún así, descarga un respaldo con frecuencia: el navegador podría borrar los datos al liberar espacio.'}
                </div>
              </div>
            )
          })()}
          <button onClick={doExport} className="btn btn-secondary w-full">
            ⬇️ Exportar respaldo (.json)
          </button>
          <label className="btn btn-secondary w-full cursor-pointer">
            ⬆️ Importar respaldo
            <input type="file" accept="application/json,.json" className="hidden" onChange={doImport} />
          </label>
          <p className="text-xs text-slate-400">
            Guarda o restaura todos los datos del dispositivo (productos, ventas, clientes, caja…).
            Guarda el archivo en tu correo o en una USB para no perderlo.
          </p>
        </div>
      </Section>

      {/* Legal */}
      <Section title="Ayuda y legal">
        <a href={`${import.meta.env.BASE_URL}ayuda.html`} target="_blank" rel="noreferrer" className="btn btn-primary w-full text-sm">
          📖 Manual de ayuda (cómo usar cada sección)
        </a>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <a href={`${import.meta.env.BASE_URL}privacidad.html`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">Privacidad</a>
          <a href={`${import.meta.env.BASE_URL}terminos.html`} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">Términos</a>
        </div>
        <p className="text-xs text-slate-400">Tratamiento de datos conforme a la Ley 1581 de 2012 (Colombia).</p>
      </Section>

      <Section title="Seguridad (PIN)">
        <p className="text-sm text-slate-600">
          Para cambiar tu PIN de acceso: toca tu <b>inicial (arriba a la derecha) → 🔑 Cambiar mi PIN</b>.
          Puedes escribir uno o tocar <b>“🎲 Generar un PIN seguro”</b>.
        </p>
        <p className="text-xs text-slate-400">
          Los PIN de los cajeros se crean y editan en la sección <b>Empleados</b> (también con “Generar”).
          Evita 0000, 1111 o 1234 en producción.
        </p>
      </Section>

      <Section title="Acerca de Ventanilla">
        <div className="space-y-1 text-sm text-slate-600">
          <p className="font-semibold text-slate-800">Ventanilla — Ventas e Inventario</p>
          <p className="text-xs text-slate-400">Versión 1.0</p>
          <p>Creada y desarrollada por el <b>Dr. Mauricio Rodríguez Herrera</b>, creador y propietario de la plataforma.</p>
          <p className="text-xs text-slate-400">© {new Date().getFullYear()} Dr. Mauricio Rodríguez Herrera. Todos los derechos reservados.</p>
        </div>
      </Section>

      {/* Sheets */}
      {(locEdit || locAdd) && (
        <LocationForm location={locEdit ?? undefined} tenantId={tenantId} city={tenant.city} activeCount={activeLocs.length} onClose={() => { setLocEdit(null); setLocAdd(false) }} />
      )}
      {(empEdit || empAdd) && (
        <EmployeeForm employee={empEdit ?? undefined} tenantId={tenantId} locations={locations ?? []} onClose={() => { setEmpEdit(null); setEmpAdd(false) }} />
      )}
      {dianOpen && <DianForm tenantId={tenantId} tenant={tenant} onClose={() => setDianOpen(false)} />}
    </div>
  )
}

function ModulesSection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  async function toggle(key: string, on: boolean) {
    const modules = { ...(tenant.modules ?? {}), [key]: on }
    await db.tenants.update(tenantId, { modules })
  }
  const groups = [...new Set(MODULES.map((m) => m.group))]
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Activa solo lo que uses; lo demás se oculta del menú (no se borra nada y lo puedes reactivar cuando quieras).
      </p>
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-400">{g}</p>
          <div className="space-y-1.5">
            {MODULES.filter((m) => m.group === g).map((m) => (
              <label key={m.key} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2">
                <span className="text-sm text-slate-600">{m.label}</span>
                <input type="checkbox" checked={moduleEnabled(tenant, m.key)} onChange={(e) => toggle(m.key, e.target.checked)} className="h-5 w-5" />
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function FiadoReminderSection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const enabled = tenant.autoFiadoReminder ?? false
  const [days, setDays] = useState(String(tenant.fiadoReminderDays ?? 7))
  async function toggle(v: boolean) {
    await db.tenants.update(tenantId, { autoFiadoReminder: v })
    toast('success', v ? 'Recordatorios automáticos activados' : 'Recordatorios automáticos desactivados')
  }
  async function saveDays() {
    await db.tenants.update(tenantId, { fiadoReminderDays: Math.max(1, parseInt(days || '7', 10)) || 7 })
    toast('success', 'Guardado')
  }
  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => toggle(e.target.checked)} className="h-5 w-5" />
        <span className="text-sm text-slate-600">Enviar recordatorio de fiado por WhatsApp automáticamente</span>
      </label>
      {enabled && (
        <>
          <div className="flex items-center gap-2">
            <label className="label mb-0 flex-1">Recordar si la deuda lleva ≥</label>
            <input className="input w-20 text-center" inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} onBlur={saveDays} />
            <span className="text-sm text-slate-500">días</span>
          </div>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Requiere la nube conectada con WhatsApp. Sin nube, usa "Recordar a todos" o el botón de cada cliente en Cartera.
          </p>
        </>
      )}
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

function ScaleLabelSection({ tenant, tenantId }: { tenant: Tenant; tenantId: string }) {
  const cfg = tenant.scaleLabel ?? {}
  const enabled = cfg.enabled ?? false
  const [prefix, setPrefix] = useState(cfg.prefix ?? '2')
  const [embeds, setEmbeds] = useState<'peso' | 'precio'>(cfg.embeds ?? 'peso')
  const [itemDigits, setItemDigits] = useState(String(cfg.itemDigits ?? 6))

  async function persist(patch: Partial<{ enabled: boolean; prefix: string; embeds: 'peso' | 'precio'; itemDigits: number }>) {
    await db.tenants.update(tenantId, {
      scaleLabel: { enabled, prefix: prefix.trim() || '2', embeds, itemDigits: Math.max(1, parseInt(itemDigits || '6', 10)) || 6, ...patch },
    })
  }

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
        <input type="checkbox" checked={enabled} onChange={(e) => { persist({ enabled: e.target.checked }); toast('success', e.target.checked ? 'Etiquetas de báscula activadas' : 'Desactivadas') }} className="h-5 w-5" />
        <span className="text-sm text-slate-600">Leer etiquetas de báscula (código de barras con peso o precio incrustado)</span>
      </label>
      {enabled && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="label">Prefijo</label>
              <input className="input" inputMode="numeric" value={prefix} onChange={(e) => setPrefix(e.target.value)} />
            </div>
            <div>
              <label className="label">Dígitos código</label>
              <input className="input" inputMode="numeric" value={itemDigits} onChange={(e) => setItemDigits(e.target.value)} />
            </div>
            <div>
              <label className="label">Incrusta</label>
              <select className="input" value={embeds} onChange={(e) => setEmbeds(e.target.value as 'peso' | 'precio')}>
                <option value="peso">Peso (g)</option>
                <option value="precio">Precio ($)</option>
              </select>
            </div>
          </div>
          <button onClick={() => { persist({}); toast('success', 'Configuración de báscula guardada') }} className="btn btn-primary w-full text-sm">Guardar configuración</button>
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            La balanza imprime un código como <b>{prefix || '2'} + código del producto + {embeds === 'peso' ? 'peso' : 'precio'} + control</b>. Ponle a cada producto de granel ese mismo código (en su código de barras o interno). Al escanear la etiqueta, el POS agrega el producto con su {embeds === 'peso' ? 'peso' : 'precio'} automáticamente.
          </p>
        </>
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
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [bizName, setBizName] = useState('')
  const [ownerName, setOwnerName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const legalBase = import.meta.env.BASE_URL

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
  async function connect() {
    setBusy(true)
    try {
      if (mode === 'register') {
        if (!bizName.trim() || !ownerName.trim()) { toast('error', 'Completa el nombre del negocio y el dueño'); return }
        const reg = await cloudRegister(url.trim(), { businessName: bizName.trim(), ownerName: ownerName.trim(), email: email.trim(), password })
        // Cuenta nueva = empezar limpio: borrar el demo local antes de sincronizar.
        await clearLocalData()
        await startCloud() // trae su negocio y su usuario dueño desde el servidor
        if (reg.user?.id) await useSession.getState().loginAs(reg.user.id)
        toast('success', 'Cuenta creada y conectada')
      } else {
        const log = await cloudLogin(url.trim(), email.trim(), password)
        // Empezar limpio: este dispositivo adopta SOLO los datos de la cuenta
        // (borra el demo local para que no se mezcle con los productos reales).
        await clearLocalData()
        await startCloud() // trae negocio, usuario y productos del servidor
        if (log.user?.id) await useSession.getState().loginAs(log.user.id)
        toast('success', 'Conectado y sincronizando')
      }
      setConnected(true)
    } catch (e: any) {
      toast('error', e?.message || 'No se pudo conectar')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-slate-400">
        Conecta este dispositivo a la nube para sincronizar y usar varios dispositivos.
        Sin esto, todo funciona local en el equipo.
      </p>
      <div className="flex rounded-xl bg-slate-100 p-0.5 text-sm font-semibold">
        <button onClick={() => setMode('login')} className={`flex-1 rounded-lg py-1.5 ${mode === 'login' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>Iniciar sesión</button>
        <button onClick={() => setMode('register')} className={`flex-1 rounded-lg py-1.5 ${mode === 'register' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>Crear cuenta</button>
      </div>
      <input className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="URL del API (https://…)" />
      {mode === 'register' && (
        <>
          <input className="input" value={bizName} onChange={(e) => setBizName(e.target.value)} placeholder="Nombre del negocio" />
          <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} placeholder="Tu nombre (dueño)" />
        </>
      )}
      <input className="input" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo del negocio" />
      <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña" />
      {mode === 'register' && (
        <label className="flex items-start gap-2 px-1 text-xs text-slate-500">
          <input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)} className="mt-0.5 h-4 w-4" />
          <span>Acepto los <a href={`${legalBase}terminos.html`} target="_blank" rel="noreferrer" className="text-brand-600 underline">Términos</a> y la <a href={`${legalBase}privacidad.html`} target="_blank" rel="noreferrer" className="text-brand-600 underline">Política de Privacidad</a>.</span>
        </label>
      )}
      <button className="btn btn-primary w-full" disabled={busy || !url || !email || !password || (mode === 'register' && !accepted)} onClick={connect}>
        {busy ? 'Conectando…' : mode === 'register' ? 'Crear cuenta y conectar' : 'Conectar a la nube'}
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

function LocationForm({ location, tenantId, city, activeCount, onClose }: { location?: Location; tenantId: string; city: string; activeCount: number; onClose: () => void }) {
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
        {/* Desactivar libera el punto de la licencia; el histórico de ventas se
            conserva. No se puede desactivar el único local activo. */}
        {location && location.active !== false && activeCount > 1 && (
          <button
            className="btn btn-secondary w-full text-rose-600"
            onClick={async () => {
              await db.locations.update(location.id, { active: false })
              if (useSession.getState().locationFilter === location.id) useSession.getState().setLocationFilter('all')
              toast('success', 'Local desactivado · liberaste un punto')
              onClose()
            }}
          >
            Desactivar este local
          </button>
        )}
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
  // Anular ventas es lo más sensible: por defecto OFF en empleados NUEVOS.
  const [canVoid, setCanVoid] = useState(employee ? p?.canVoid !== false : false)

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
          // El PIN debe ser único por tienda: si se repite, dos personas entrarían
          // como una sola y la auditoría quedaría mal atribuida.
          const dupe = await db.users.where('pin').equals(pin)
            .and((u) => u.tenantId === tenantId && u.active && u.id !== (employee?.id ?? '')).first()
          if (dupe) return toast('error', `El PIN ${pin} ya lo usa ${dupe.name}. Elige otro.`)
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
        <div>
          <label className="label">PIN (4 dígitos)</label>
          <div className="flex gap-2">
            <input className="input flex-1 text-center text-xl tracking-widest" inputMode="numeric" maxLength={4} value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="••••" />
            <button type="button" className="btn btn-secondary text-sm" onClick={() => setPin(randomPin())}>🎲 Generar</button>
          </div>
        </div>
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

function DianForm({ tenantId, tenant, onClose }: { tenantId: string; tenant: Tenant; onClose: () => void }) {
  const dian = tenant.dian
  const str = (n?: number) => (n == null ? '' : String(n))
  const numU = (v: string) => {
    const n = parseInt(v.replace(/\D/g, ''), 10)
    return v.trim() && Number.isFinite(n) ? n : undefined
  }
  const [provider, setProvider] = useState(dian.provider)
  const [resolutionNumber, setRes] = useState(dian.resolutionNumber)
  const [resolutionRange, setRange] = useState(dian.resolutionRange)
  const [enabled, setEnabled] = useState(dian.enabled)
  // Régimen tributario del emisor
  const [vatResp, setVatResp] = useState(tenant.vatResponsible !== false)
  const [taxResp, setTaxResp] = useState(tenant.taxResponsibilities ?? '')
  const [regime, setRegime] = useState<'ordinario' | 'simple'>(tenant.taxRegime ?? 'ordinario')
  // Resolución estructurada
  const [posPrefix, setPosPrefix] = useState(dian.pos?.prefix ?? '')
  const [posFrom, setPosFrom] = useState(str(dian.pos?.from))
  const [posTo, setPosTo] = useState(str(dian.pos?.to))
  const [posDate, setPosDate] = useState(dian.pos?.resolutionDate ?? '')
  const [posVig, setPosVig] = useState(str(dian.pos?.validityMonths))
  const [fePrefix, setFePrefix] = useState(dian.fe?.prefix ?? '')
  const [feFrom, setFeFrom] = useState(str(dian.fe?.from))
  const [feTo, setFeTo] = useState(str(dian.fe?.to))
  const [feDate, setFeDate] = useState(dian.fe?.resolutionDate ?? '')
  const [feVig, setFeVig] = useState(str(dian.fe?.validityMonths))
  // Impuestos configurables
  const [incRate, setIncRate] = useState(str(dian.incRate))
  const [uvtValue, setUvtValue] = useState(str(dian.uvtValue))
  const [posMaxUvt, setPosMaxUvt] = useState(str(dian.posMaxUvt))
  return (
    <Sheet
      open onClose={onClose} title="DIAN y régimen tributario"
      footer={
        <button className="btn btn-primary btn-lg w-full" onClick={async () => {
          await db.tenants.update(tenantId, {
            dian: {
              ...dian, provider, resolutionNumber, resolutionRange, enabled, testMode: true,
              pos: { prefix: posPrefix.trim() || undefined, from: numU(posFrom), to: numU(posTo), resolutionDate: posDate || undefined, validityMonths: numU(posVig) },
              fe: { prefix: fePrefix.trim() || undefined, from: numU(feFrom), to: numU(feTo), resolutionDate: feDate || undefined, validityMonths: numU(feVig) },
              incRate: numU(incRate), uvtValue: numU(uvtValue), posMaxUvt: numU(posMaxUvt),
            },
            vatResponsible: vatResp,
            taxResponsibilities: taxResp.trim() || undefined,
            taxRegime: regime,
          })
          toast('success', 'Configuración DIAN guardada')
          onClose()
        }}>Guardar</button>
      }
    >
      <div className="space-y-4">
        {/* Régimen tributario */}
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Régimen tributario</p>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={vatResp} onChange={(e) => setVatResp(e.target.checked)} className="h-5 w-5" />
            <span className="text-sm text-slate-600">Responsable de IVA <span className="text-slate-400">(desmárcalo si tu tienda NO cobra IVA)</span></span>
          </label>
          <div><label className="label">Responsabilidades (se imprimen en el documento)</label><input className="input" value={taxResp} onChange={(e) => setTaxResp(e.target.value)} placeholder={vatResp ? 'Responsable de IVA' : 'No responsable de IVA'} /></div>
          <div><label className="label">Régimen</label>
            <select className="input" value={regime} onChange={(e) => setRegime(e.target.value as 'ordinario' | 'simple')}>
              <option value="ordinario">Ordinario</option>
              <option value="simple">Régimen Simple (SIMPLE)</option>
            </select>
          </div>
        </div>
        <hr className="border-slate-100" />
        {/* Proveedor y resolución */}
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
        <div><label className="label">Rango de numeración (texto)</label><input className="input" value={resolutionRange} onChange={(e) => setRange(e.target.value)} placeholder="POS1 1 al 5000" /></div>
        {/* Resolución POS estructurada */}
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Resolución · Documento POS</p>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">Prefijo</label><input className="input" value={posPrefix} onChange={(e) => setPosPrefix(e.target.value)} placeholder="POS1" /></div>
            <div><label className="label">Desde</label><input className="input" inputMode="numeric" value={posFrom} onChange={(e) => setPosFrom(e.target.value)} /></div>
            <div><label className="label">Hasta</label><input className="input" inputMode="numeric" value={posTo} onChange={(e) => setPosTo(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Fecha resolución</label><input className="input" type="date" value={posDate} onChange={(e) => setPosDate(e.target.value)} /></div>
            <div><label className="label">Vigencia (meses)</label><input className="input" inputMode="numeric" value={posVig} onChange={(e) => setPosVig(e.target.value)} /></div>
          </div>
        </div>
        {/* Resolución FE estructurada */}
        <div className="space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-500">Resolución · Factura electrónica</p>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="label">Prefijo</label><input className="input" value={fePrefix} onChange={(e) => setFePrefix(e.target.value)} placeholder="FE" /></div>
            <div><label className="label">Desde</label><input className="input" inputMode="numeric" value={feFrom} onChange={(e) => setFeFrom(e.target.value)} /></div>
            <div><label className="label">Hasta</label><input className="input" inputMode="numeric" value={feTo} onChange={(e) => setFeTo(e.target.value)} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div><label className="label">Fecha resolución</label><input className="input" type="date" value={feDate} onChange={(e) => setFeDate(e.target.value)} /></div>
            <div><label className="label">Vigencia (meses)</label><input className="input" inputMode="numeric" value={feVig} onChange={(e) => setFeVig(e.target.value)} /></div>
          </div>
        </div>
        {/* Impuestos configurables */}
        <div className="grid grid-cols-3 gap-2">
          <div><label className="label">INC %</label><input className="input" inputMode="numeric" value={incRate} onChange={(e) => setIncRate(e.target.value)} placeholder="8" /></div>
          <div><label className="label">Valor UVT</label><input className="input" inputMode="numeric" value={uvtValue} onChange={(e) => setUvtValue(e.target.value)} placeholder="Ej. 49799" /></div>
          <div><label className="label">Tiquete máx (UVT)</label><input className="input" inputMode="numeric" value={posMaxUvt} onChange={(e) => setPosMaxUvt(e.target.value)} placeholder="5" /></div>
        </div>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Conexión activa</span>
        </label>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          En el demo la transmisión es simulada (no se valida ante la DIAN). En producción se usan tus credenciales reales del proveedor.
        </p>
      </div>
    </Sheet>
  )
}
