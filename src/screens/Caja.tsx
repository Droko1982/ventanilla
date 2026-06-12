import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useLocations, useCurrentUser } from '@/hooks/data'
import { openCashSession, closeCashSession } from '@/data/repo'
import { summarize, todayRange } from '@/lib/analytics'
import { Sheet } from '@/components/Sheet'
import { StatCard, Money, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { fmtDateTime, fmtTime } from '@/lib/format'
import { useSession } from '@/store/session'

const methodLabels: Record<string, string> = {
  efectivo: 'Efectivo', nequi: 'Nequi', tarjeta: 'Tarjeta', transferencia: 'Transferencia', fiado: 'Fiado',
}

export default function Caja() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const locations = useLocations()
  const user = useCurrentUser()
  const [openSheet, setOpenSheet] = useState(false)
  const [closeSheet, setCloseSheet] = useState(false)
  const [base, setBase] = useState('')
  const [counted, setCounted] = useState('')

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

  const todaySales = useLiveQuery(
    async () => (locationId ? todayRange(await db.sales.where('locationId').equals(locationId).toArray()) : []),
    [locationId],
  )

  const summary = useMemo(() => summarize(todaySales ?? []), [todaySales])
  const activeLoc = locations?.find((l) => l.id === locationId)

  // Efectivo esperado en caja = base + ventas efectivo desde apertura
  const cashSinceOpen = useMemo(() => {
    if (!session || !todaySales) return 0
    const since = new Date(session.openedAt).getTime()
    let sum = 0
    for (const s of todaySales) {
      if (new Date(s.createdAt).getTime() < since || s.status !== 'completada') continue
      for (const p of s.payments) if (p.method === 'efectivo') sum += p.amount
    }
    return sum
  }, [session, todaySales])
  const expectedCash = (session?.openingFloat ?? 0) + cashSinceOpen
  const countedNum = parseCop(counted)
  const diff = countedNum - expectedCash

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
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 font-bold">
              <span>Efectivo esperado en caja</span>
              <span className="text-emerald-600">{cop(expectedCash)}</span>
            </div>
          </div>
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
              setCounted('')
              setCloseSheet(false)
            }}
          >
            Confirmar cierre
          </button>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-500">Cuenta el efectivo físico en la caja y escríbelo. El sistema lo compara con lo registrado.</p>
          <div>
            <label className="label">Efectivo contado</label>
            <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={counted} onChange={(e) => setCounted(e.target.value)} placeholder="$ 0" />
          </div>
          <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
            <Row label="Esperado" value={cop(expectedCash)} />
            <Row label="Contado" value={cop(countedNum)} />
            <div className={`flex items-center justify-between border-t border-slate-200 pt-2 font-bold ${diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
              <span>Diferencia</span>
              <span>{diff > 0 ? '+' : ''}{cop(diff)}</span>
            </div>
          </div>
        </div>
      </Sheet>
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
