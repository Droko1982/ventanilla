import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useLocations, useCurrentUser, useTenant } from '@/hooks/data'
import { openCashSession, closeCashSession, addCashMovement, audit, generateZReport } from '@/data/repo'
import { openCashDrawer, drawerMessage } from '@/lib/cashDrawer'
import { summarize } from '@/lib/analytics'
import { localYMD, todayYMD, saleDay } from '@/lib/businessDay'
import { Sheet } from '@/components/Sheet'
import { StatCard, Money, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { fmtDateTime, fmtTime, fmtDate } from '@/lib/format'
import { waLink } from '@/lib/whatsapp'
import { useSession } from '@/store/session'
import { can } from '@/lib/permissions'

const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta', transferencia: 'Transferencia', fiado: 'Fiado',
}

// Arma el resumen del día para enviar al dueño por WhatsApp.
function dailySummaryText(o: {
  businessName: string; locName: string; revenue: number; count: number
  byMethod: Record<string, number>; openingFloat: number; expectedCash: number
  movNet?: number; counted?: number; diff?: number
}): string {
  const L: string[] = []
  L.push(`*Resumen del día · ${o.businessName}*`)
  L.push(`${o.locName} · ${fmtDate(new Date().toISOString())}`)
  L.push('')
  L.push(`🧾 Ventas: ${o.count} por ${cop(o.revenue)}`)
  L.push(`💵 Efectivo: ${cop(o.byMethod.efectivo ?? 0)}`)
  L.push(`📱 Nequi: ${cop(o.byMethod.nequi ?? 0)}`)
  L.push(`💳 Tarjeta: ${cop(o.byMethod.tarjeta ?? 0)}`)
  L.push(`🏦 Transferencia: ${cop(o.byMethod.transferencia ?? 0)}`)
  L.push(`📒 Fiado: ${cop(o.byMethod.fiado ?? 0)}`)
  if (o.movNet) L.push(`↕️ Ingresos/egresos: ${o.movNet >= 0 ? '+' : '−'}${cop(Math.abs(o.movNet))}`)
  L.push('')
  L.push(`Base: ${cop(o.openingFloat)}`)
  L.push(`Efectivo esperado: ${cop(o.expectedCash)}`)
  if (o.counted !== undefined) {
    L.push(`Efectivo contado: ${cop(o.counted)}`)
    L.push(`Diferencia: ${o.diff === 0 ? 'cuadrada ✓' : (o.diff! < 0 ? `faltó ${cop(Math.abs(o.diff!))}` : `sobró ${cop(o.diff!)}`)}`)
  }
  return L.join('\n')
}

export default function Caja() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const locations = useLocations()
  const user = useCurrentUser()
  const tenant = useTenant()
  const [openSheet, setOpenSheet] = useState(false)
  const [closeSheet, setCloseSheet] = useState(false)
  const [movSheet, setMovSheet] = useState<null | 'ingreso' | 'egreso'>(null)
  const [base, setBase] = useState('')
  const [counted, setCounted] = useState('')
  const [autoZ, setAutoZ] = useState(true)

  const session = useLiveQuery(
    () =>
      locationId
        ? db.cashSessions.where('locationId').equals(locationId).and((c) => c.status === 'abierta').first()
        : undefined,
    [locationId],
  )

  const closedSessions = useLiveQuery(
    () =>
      locationId
        ? db.cashSessions.where('locationId').equals(locationId).and((c) => c.status === 'cerrada').reverse().limit(8).toArray()
        : [],
    [locationId],
  )

  // Ventas del DÍA CONTABLE: si hay caja abierta, el día es el de su apertura
  // (aunque ya pasó medianoche); si no, el día calendario de hoy.
  const todaySales = useLiveQuery(
    async () => {
      if (!locationId) return []
      const bizDay = session ? localYMD(session.openedAt) : todayYMD()
      const all = await db.sales.where('locationId').equals(locationId).toArray()
      return all.filter((s) => s.status === 'completada' && saleDay(s) === bizDay)
    },
    [locationId, session?.id],
  )

  const summary = useMemo(() => summarize(todaySales ?? []), [todaySales])
  const activeLoc = locations?.find((l) => l.id === locationId)

  // Ventas desde la apertura (no solo las de hoy: una caja puede cruzar
  // medianoche). Debe coincidir con lo que calcula el cierre (closeCashSession).
  const sessionSales = useLiveQuery(
    async () => {
      if (!session || !locationId) return []
      const since = new Date(session.openedAt).getTime()
      const all = await db.sales.where('locationId').equals(locationId).toArray()
      return all.filter((s) => s.status === 'completada' && new Date(s.createdAt).getTime() >= since)
    },
    [session?.id, locationId],
  )
  // Efectivo esperado en caja = base + ventas efectivo desde apertura
  const cashSinceOpen = useMemo(() => {
    let sum = 0
    for (const s of sessionSales ?? []) for (const p of s.payments) if (p.method === 'efectivo') sum += p.amount
    return sum
  }, [sessionSales])
  // Movimientos de efectivo (ingresos/egresos) de la sesión abierta
  const movements = useLiveQuery(
    () => (session ? db.cashMovements.where('sessionId').equals(session.id).reverse().toArray() : []),
    [session?.id],
  )
  const movNet = (movements ?? []).reduce((s, m) => s + (m.type === 'ingreso' ? m.amount : -m.amount), 0)
  const expectedCash = (session?.openingFloat ?? 0) + cashSinceOpen + movNet
  const countedNum = parseCop(counted)
  const diff = countedNum - expectedCash

  // Resumen del día al WhatsApp del dueño (o el número del negocio).
  function sendSummary(arqueo?: { counted: number; diff: number }) {
    const phone = tenant?.phone || ''
    if (!phone) return toast('error', 'Configura el teléfono del negocio en Ajustes')
    const msg = dailySummaryText({
      businessName: tenant?.businessName ?? 'Mi tienda',
      locName: activeLoc?.name ?? '',
      revenue: summary.revenue, count: summary.count, byMethod: summary.byMethod,
      openingFloat: session?.openingFloat ?? 0, expectedCash, movNet,
      counted: arqueo?.counted, diff: arqueo?.diff,
    })
    window.open(waLink(phone, msg), '_blank')
  }

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader title="Caja" subtitle={activeLoc?.name} />

      {/* Resumen del día (conciliación) */}
      <div className="mb-4 grid grid-cols-2 gap-2.5">
        <StatCard label="Ventas de hoy" value={<Money value={summary.revenue} />} sub={`${summary.count} ventas`} accent="text-brand-700" />
        <StatCard label="Efectivo de hoy" value={<Money value={summary.byMethod.efectivo} />} accent="text-emerald-600" />
      </div>

      <div className="card mb-4 p-4">
        <p className="mb-3 text-sm font-semibold text-slate-600">Conciliación por método</p>
        <div className="space-y-1.5">
          {Object.entries(summary.byMethod).map(([m, v]) => (
            <div key={m} className="flex items-center justify-between text-sm">
              <span className="text-slate-500">{methodLabels[m]}</span>
              <span className="font-semibold text-slate-700">{cop(v)}</span>
            </div>
          ))}
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-base font-bold">
            <span>Total registrado</span>
            <span className="text-brand-700">{cop(summary.revenue)}</span>
          </div>
        </div>
        <button onClick={() => sendSummary()} className="btn btn-success mt-3 w-full text-sm">
          <Icon name="whatsapp" className="h-4 w-4" /> Enviar resumen del día al dueño
        </button>
      </div>

      {/* Estado de la caja */}
      {!session ? (
        <div className="card mb-4 p-5 text-center">
          <div className="mb-2 text-4xl">🔒</div>
          <p className="font-semibold text-slate-700">La caja está cerrada</p>
          <p className="mb-4 text-sm text-slate-500">Ábrela con la base inicial para empezar a vender.</p>
          <button onClick={() => setOpenSheet(true)} className="btn btn-primary btn-lg w-full">
            Abrir caja
          </button>
        </div>
      ) : (
        <div className="card mb-4 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-700">Caja abierta 🟢</p>
              <p className="text-xs text-slate-400">Desde {fmtTime(session.openedAt)}</p>
            </div>
            <button onClick={() => setCloseSheet(true)} className="btn btn-danger px-4 py-2 text-sm">
              Cerrar caja
            </button>
          </div>
          <div className="space-y-1.5 text-sm">
            <Row label="Base inicial" value={cop(session.openingFloat)} />
            <Row label="Ventas en efectivo" value={cop(cashSinceOpen)} />
            {movNet !== 0 && <Row label="Ingresos/egresos" value={`${movNet >= 0 ? '+' : '−'}${cop(Math.abs(movNet))}`} />}
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-bold">
              <span>Efectivo esperado en caja</span>
              <span className="text-emerald-600">{cop(expectedCash)}</span>
            </div>
          </div>

          {can(user, 'canCashMovement') && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setMovSheet('ingreso')} className="btn btn-secondary py-2 text-sm">+ Ingreso</button>
                <button onClick={() => setMovSheet('egreso')} className="btn btn-secondary py-2 text-sm">− Egreso / gasto</button>
              </div>
              <button
                onClick={async () => {
                  const r = await openCashDrawer(true)
                  const m = drawerMessage(r)
                  toast(m.tone, m.text)
                  if (r === 'ok') {
                    await audit({ tenantId, locationId, userId: user!.id, userName: user!.name, action: 'abrió cajón (sin venta)', entity: 'caja', entityId: locationId, detail: 'Apertura manual del cajón monedero' })
                  }
                }}
                className="btn btn-secondary w-full py-2 text-sm"
              >
                💵 Abrir cajón monedero
              </button>
            </div>
          )}

          {(movements?.length ?? 0) > 0 && (
            <div className="mt-3 space-y-1.5">
              {movements?.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="truncate text-slate-600">
                    {m.type === 'ingreso' ? '⬆️' : '⬇️'} {m.reason}{m.isExpense ? ' · gasto' : ''}
                  </span>
                  <span className={`font-semibold ${m.type === 'ingreso' ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.type === 'ingreso' ? '+' : '−'}{cop(m.amount)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Historial de cierres */}
      {(closedSessions?.length ?? 0) > 0 && (
        <div className="card p-4">
          <p className="mb-3 text-sm font-semibold text-slate-600">Cierres recientes (arqueo)</p>
          <div className="space-y-2">
            {closedSessions?.map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <div>
                  <p className="font-medium text-slate-600">{fmtDateTime(c.closedAt!)}</p>
                  <p className="text-xs text-slate-400">Esperado {cop(c.expectedCash ?? 0)} · Contado {cop(c.countedCash ?? 0)}</p>
                </div>
                <span
                  className={`chip ${
                    (c.difference ?? 0) === 0 ? 'bg-emerald-100 text-emerald-700'
                    : (c.difference ?? 0) < 0 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {(c.difference ?? 0) === 0 ? 'Cuadrada' : (c.difference ?? 0) < 0 ? `Faltó ${cop(Math.abs(c.difference!))}` : `Sobró ${cop(c.difference!)}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Abrir caja */}
      <Sheet
        open={openSheet}
        onClose={() => setOpenSheet(false)}
        title="Abrir caja"
        footer={
          <button
            className="btn btn-primary btn-lg w-full"
            onClick={async () => {
              await openCashSession({ tenantId, locationId, userId: user!.id, openingFloat: parseCop(base) })
              toast('success', 'Caja abierta')
              setBase('')
              setOpenSheet(false)
            }}
          >
            Abrir con {cop(parseCop(base))}
          </button>
        }
      >
        <label className="label">Base inicial (efectivo con el que abres)</label>
        <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={base} onChange={(e) => setBase(e.target.value)} placeholder="$ 0" />
      </Sheet>

      {/* Cerrar caja (arqueo) */}
      <Sheet
        open={closeSheet}
        onClose={() => setCloseSheet(false)}
        title="Cierre de caja (arqueo)"
        footer={
          <button
            className="btn btn-danger btn-lg w-full"
            onClick={async () => {
              if (!session) return
              const cs = await closeCashSession({ sessionId: session.id, countedCash: countedNum, userId: user!.id, userName: user!.name })
              if (cs)
                toast(cs.difference === 0 ? 'success' : 'info', cs.difference === 0 ? 'Caja cuadrada ✓' : `Diferencia: ${cop(cs.difference!)}`)
              // Informe Z del día automático al cerrar (si está activado)
              if (cs && autoZ) {
                try { await generateZReport(tenantId, locationId, localYMD(session.openedAt), false, user!.id, user!.name); toast('success', 'Informe Z generado') } catch { /* no bloquea el cierre */ }
              }
              // Envía el resumen del cierre al dueño por WhatsApp (gesto del usuario → no se bloquea)
              if (cs && tenant?.phone) sendSummary({ counted: countedNum, diff: cs.difference ?? diff })
              setCounted('')
              setCloseSheet(false)
            }}
          >
            Confirmar cierre
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Cuenta los billetes y monedas: el total se calcula solo. O escribe el efectivo contado directamente.</p>
          <BillCounter onTotal={(n) => setCounted(String(n))} />
          <div>
            <label className="label">Efectivo contado</label>
            <input className="input text-center text-2xl font-bold" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="$ 0" />
          </div>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
            <Row label="Esperado" value={cop(expectedCash)} />
            <Row label="Contado" value={cop(countedNum)} />
            <div className={`flex items-center justify-between border-t border-slate-200 pt-2 font-bold ${diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
              <span>Diferencia</span>
              <span>{diff > 0 ? '+' : ''}{cop(diff)}</span>
            </div>
          </div>
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={autoZ} onChange={(e) => setAutoZ(e.target.checked)} className="h-5 w-5" />
            <span className="text-sm text-slate-600">Generar Informe Z del día al cerrar</span>
          </label>
        </div>
      </Sheet>

      {/* Registrar ingreso / egreso de efectivo */}
      {movSheet && session && (
        <MovementForm
          type={movSheet}
          onClose={() => setMovSheet(null)}
          onSubmit={async ({ amount, reason, isExpense }) => {
            await addCashMovement({
              tenantId, locationId, sessionId: session.id, type: movSheet,
              amount, reason, isExpense, userId: user!.id, userName: user!.name,
            })
            toast('success', movSheet === 'ingreso' ? 'Ingreso registrado' : 'Egreso registrado')
            setMovSheet(null)
          }}
        />
      )}
    </div>
  )
}

function MovementForm({
  type, onClose, onSubmit,
}: {
  type: 'ingreso' | 'egreso'
  onClose: () => void
  onSubmit: (v: { amount: number; reason: string; isExpense: boolean }) => void
}) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [isExpense, setIsExpense] = useState(type === 'egreso')
  const egreso = type === 'egreso'
  const quick = egreso
    ? ['Pago proveedor', 'Domicilio', 'Servicios', 'Arriendo', 'Retiro (sangría)']
    : ['Base extra', 'Préstamo', 'Otro ingreso']
  return (
    <Sheet
      open
      onClose={onClose}
      title={egreso ? 'Egreso / gasto de caja' : 'Ingreso a caja'}
      footer={
        <button
          className={`btn btn-lg w-full ${egreso ? 'btn-danger' : 'btn-success'}`}
          disabled={parseCop(amount) <= 0 || !reason.trim()}
          onClick={() => onSubmit({ amount: parseCop(amount), reason: reason.trim(), isExpense })}
        >
          {egreso ? 'Registrar egreso' : 'Registrar ingreso'} · {cop(parseCop(amount))}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Monto</label>
          <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ 0" />
        </div>
        <div>
          <label className="label">Concepto</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={egreso ? 'Ej. pago a proveedor' : 'Ej. base extra'} />
          <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
            {quick.map((q) => (
              <button key={q} onClick={() => setReason(q)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">{q}</button>
            ))}
          </div>
        </div>
        {egreso && (
          <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
            <input type="checkbox" checked={isExpense} onChange={(e) => setIsExpense(e.target.checked)} className="h-5 w-5" />
            <span className="text-sm text-slate-600">Es un gasto del negocio (réstalo de la utilidad)</span>
          </label>
        )}
      </div>
    </Sheet>
  )
}

// Arqueo asistido: cuenta billetes/monedas y suma el total automáticamente.
const DENOMS = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50]
function BillCounter({ onTotal }: { onTotal: (n: number) => void }) {
  const [qty, setQty] = useState<Record<number, string>>({})
  const total = DENOMS.reduce((s, d) => s + d * (parseInt(qty[d] || '0', 10) || 0), 0)
  function set(d: number, v: string) {
    const nq = { ...qty, [d]: v.replace(/\D/g, '') }
    setQty(nq)
    onTotal(DENOMS.reduce((s, x) => s + x * (parseInt(nq[x] || '0', 10) || 0), 0))
  }
  return (
    <div className="rounded-xl border border-slate-100 p-3">
      <p className="mb-2 text-xs font-semibold text-slate-500">🧮 Contar billetes y monedas</p>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
        {DENOMS.map((d) => (
          <div key={d} className="flex items-center gap-2">
            <span className="w-16 shrink-0 text-right text-xs text-slate-500">{cop(d)}</span>
            <span className="text-xs text-slate-300">×</span>
            <input className="w-full rounded-lg border border-slate-200 px-2 py-1 text-right text-sm" inputMode="numeric" value={qty[d] ?? ''} onChange={(e) => set(d, e.target.value)} placeholder="0" />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-bold text-slate-700">
        <span>Total contado</span><span>{cop(total)}</span>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className="font-semibold text-slate-700">{value}</span>
    </div>
  )
}
