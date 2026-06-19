import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useScopeSales, useTenant, useLocations, useActiveLocationId, useCurrentUser } from '@/hooks/data'
import { useSession } from '@/store/session'
import { saleDay, todayYMD } from '@/lib/businessDay'
import { cloudStatus, syncNow } from '@/data/cloud'
import { isCloudConfigured } from '@/data/api'
import { transmitDian, voidSale } from '@/data/repo'
import { cop } from '@/lib/money'
import { fmtTime } from '@/lib/format'
import { Sheet } from '@/components/Sheet'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { SaleDetail } from '@/screens/Ventas'
import type { Sale } from '@/types'

const methodLabel: Record<string, string> = {
  efectivo: 'Efectivo', nequi: 'Nequi', daviplata: 'Daviplata', tarjeta: 'Tarjeta', transferencia: 'Transferencia', otro: 'Otro', fiado: 'Fiado',
}

// Panel "Ventas de hoy": el dueño verifica de un vistazo cuánto se vendió, que las
// transacciones estén sincronizadas, el efectivo esperado en caja (para detectar
// descuadre) y puede abrir cada venta para ver detalle, anular o devolver.
export function DaySalesSheet({ onClose }: { onClose: () => void }) {
  const sales = useScopeSales()
  const tenant = useTenant()
  const locations = useLocations()
  const locationId = useActiveLocationId()
  const user = useCurrentUser()
  const role = useSession((s) => s.role)
  const isOwner = role === 'admin'
  const [detail, setDetail] = useState<Sale | null>(null)
  const [syncing, setSyncing] = useState(false)

  const today = todayYMD()
  // El dueño ve todas las ventas del día; el cajero ve SOLO las suyas (para
  // confirmar que sus transacciones se registraron y subieron).
  const todaySales = (sales ?? [])
    .filter((s) => saleDay(s) === today && (isOwner || s.userId === user?.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  const valid = todaySales.filter((s) => s.status !== 'anulada')
  const total = valid.reduce((a, s) => a + s.total, 0)
  const anuladas = todaySales.filter((s) => s.status === 'anulada').length
  const devueltas = todaySales.filter((s) => s.status === 'devuelta').length

  const byMethod: Record<string, number> = {}
  for (const s of valid) for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount

  // Sincronización: tranquilidad de que "las transacciones van".
  const cs = cloudStatus()
  const cloudOn = isCloudConfigured()

  // Caja abierta → efectivo esperado (para cuadrar contra el cajón).
  const session = useLiveQuery(
    () => (locationId ? db.cashSessions.where('locationId').equals(locationId).and((c) => c.status === 'abierta').first() : undefined),
    [locationId],
  )
  const movements = useLiveQuery(() => (session ? db.cashMovements.where('sessionId').equals(session.id).toArray() : []), [session?.id])
  // Efectivo esperado = base + efectivo de las ventas de ESTA sesión (por
  // cashSessionId, igual que el cierre), no del subconjunto del día. Solo dueño.
  let expectedCash: number | null = null
  if (session && isOwner) {
    let cashSales = 0
    for (const s of (sales ?? [])) {
      if (s.cashSessionId !== session.id || s.status !== 'completada') continue
      for (const p of s.payments) if (p.method === 'efectivo') cashSales += p.amount
    }
    let movNet = 0
    for (const m of movements ?? []) movNet += m.type === 'ingreso' ? m.amount : -m.amount
    expectedCash = session.openingFloat + cashSales + movNet
  }

  const locName = locations?.find((l) => l.id === locationId)?.name ?? ''

  return (
    <Sheet open onClose={onClose} title={isOwner ? 'Ventas de hoy' : 'Mis ventas de hoy'}>
      <div className="space-y-3">
        {/* Resumen: el dueño ve el total del negocio; el cajero solo el conteo. */}
        <div className="rounded-2xl bg-brand-50 p-4 text-center">
          {isOwner ? (
            <>
              <p className="text-sm text-brand-600">Vendido hoy ({valid.length} ventas)</p>
              <p className="text-3xl font-extrabold text-brand-700">{cop(total)}</p>
            </>
          ) : (
            <>
              <p className="text-sm text-brand-600">Tus ventas de hoy</p>
              <p className="text-3xl font-extrabold text-brand-700">{valid.length}</p>
              <p className="text-xs text-brand-600">venta(s) registrada(s)</p>
            </>
          )}
          {(anuladas > 0 || devueltas > 0) && (
            <p className="mt-1 text-xs text-slate-500">{anuladas} anuladas · {devueltas} con devolución</p>
          )}
        </div>

        {/* Desglose por método (solo dueño) */}
        {isOwner && Object.keys(byMethod).length > 0 && (
          <div className="rounded-2xl border border-slate-100 p-3">
            <div className="space-y-1">
              {Object.entries(byMethod).map(([m, v]) => (
                <div key={m} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{methodLabel[m] ?? m}</span>
                  <span className={`font-semibold ${m === 'efectivo' ? 'text-emerald-600' : m === 'fiado' ? 'text-rose-600' : 'text-slate-700'}`}>{cop(v)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Efectivo esperado en caja (para cuadrar) — solo dueño */}
        {isOwner && expectedCash !== null && (
          <div className="flex items-center justify-between rounded-2xl bg-emerald-50 p-3">
            <div>
              <p className="text-sm font-semibold text-emerald-700">Efectivo esperado en caja</p>
              <p className="text-xs text-emerald-600">Cuenta el cajón y compáralo con esto.</p>
            </div>
            <p className="text-xl font-extrabold text-emerald-700">{cop(expectedCash)}</p>
          </div>
        )}

        {/* Estado de sincronización */}
        <div className="flex items-center justify-between rounded-2xl border border-slate-100 p-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{!cloudOn ? '💾' : cs.pending === 0 ? '✅' : '⏳'}</span>
            <div>
              <p className="text-sm font-semibold text-slate-700">
                {!cloudOn ? 'Guardado en este equipo' : cs.pending === 0 ? 'Todo sincronizado' : `${cs.pending} cambio(s) por subir`}
              </p>
              <p className="text-xs text-slate-400">
                {!cloudOn ? 'Las ventas quedan seguras aquí.' : cs.pending === 0 ? 'Tus ventas están a salvo en la nube.' : 'Se suben solas al haber internet.'}
              </p>
            </div>
          </div>
          {cloudOn && cs.pending > 0 && (
            <button
              onClick={async () => { setSyncing(true); try { await syncNow() } catch { /* */ } setSyncing(false) }}
              disabled={syncing}
              className="btn btn-secondary text-xs"
            >
              {syncing ? 'Subiendo…' : 'Sincronizar ahora'}
            </button>
          )}
        </div>

        {/* Lista de ventas del día */}
        <p className="pt-1 text-sm font-semibold text-slate-600">Ventas del día</p>
        {todaySales.length === 0 && <p className="py-6 text-center text-sm text-slate-400">Aún no hay ventas hoy.</p>}
        <div className="space-y-2">
          {todaySales.slice(0, 200).map((s) => {
            const anulada = s.status === 'anulada'
            const metodos = [...new Set(s.payments.map((p) => methodLabel[p.method] ?? p.method))].join(' · ')
            return (
              <button
                key={s.id}
                onClick={() => setDetail(s)}
                className={`flex w-full items-center gap-3 rounded-xl border p-3 text-left active:scale-[0.99] ${anulada ? 'border-dashed border-slate-200 bg-slate-50 opacity-70' : 'border-slate-100 bg-white'}`}
              >
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-semibold ${anulada ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                    {fmtTime(s.createdAt)} · {metodos}
                  </p>
                  <p className="text-xs text-slate-400">
                    {s.items.length} ítem(s){s.dianDocNumber ? ` · ${s.dianDocNumber}` : ''}
                    {anulada && ' · ANULADA'}{s.status === 'devuelta' && ' · DEVUELTA'}
                  </p>
                </div>
                <p className={`text-base font-bold ${anulada ? 'text-slate-400' : 'text-slate-800'}`}>{cop(s.total)}</p>
                <Icon name="arrow-left" className="h-4 w-4 rotate-180 text-slate-300" />
              </button>
            )
          })}
        </div>
        <p className="pb-2 text-center text-xs text-slate-400">Toca una venta para ver el detalle, anular o devolver.</p>
      </div>

      {detail && (
        <SaleDetail
          sale={detail}
          locName={locName}
          tenantName={tenant?.businessName ?? ''}
          onClose={() => setDetail(null)}
          onTransmit={async () => { await transmitDian(detail.id); toast('success', 'Documento DIAN generado (consecutivo asignado)'); setDetail(null) }}
          onVoid={async () => { await voidSale(detail.id, user!.id, user!.name); toast('success', 'Venta anulada · nota crédito'); setDetail(null) }}
        />
      )}
    </Sheet>
  )
}
