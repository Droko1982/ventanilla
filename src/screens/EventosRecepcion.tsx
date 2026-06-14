import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useScopeLocationIds, useCurrentUser } from '@/hooks/data'
import { registerReceptionEvent } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDateTime } from '@/lib/format'
import type { Purchase } from '@/types'

const EVENTS: { key: 'acuse' | 'reciboBien' | 'aceptacion'; label: string }[] = [
  { key: 'acuse', label: 'Acuse de recibo' },
  { key: 'reciboBien', label: 'Recibo del bien/servicio' },
  { key: 'aceptacion', label: 'Aceptación expresa' },
]

export default function EventosRecepcion() {
  const scopeIds = useScopeLocationIds()
  const user = useCurrentUser()
  const [detail, setDetail] = useState<Purchase | null>(null)

  const purchases = useLiveQuery(
    () => (scopeIds.length ? db.purchases.where('locationId').anyOf(scopeIds).reverse().toArray() : []),
    [scopeIds.join(',')],
  )

  function pendientes(p: Purchase): number {
    const e = p.dianEvents ?? {}
    return EVENTS.filter((ev) => !e[ev.key]).length
  }

  return (
    <div>
      <PageHeader title="Eventos Recepción" subtitle="Acuses DIAN de facturas de compra recibidas" />
      <p className="mb-3 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-700">
        Por cada factura electrónica que te envía un proveedor debes transmitir a la DIAN el acuse de recibo, el recibo del bien y la aceptación. (Simulado en el demo.)
      </p>
      <div className="space-y-2">
        {purchases?.map((p) => {
          const pend = pendientes(p)
          return (
            <button key={p.id} onClick={() => setDetail(p)} className="card flex w-full items-center gap-3 p-3 text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700"><Icon name="doc" className="h-5 w-5" /></span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-700">{p.number} · {p.supplierName}</p>
                <p className="truncate text-xs text-slate-400">{p.supplierInvoice ? `Fac. ${p.supplierInvoice} · ` : ''}{cop(p.total)}</p>
              </div>
              <span className={`chip ${pend === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {pend === 0 ? 'Al día' : `${pend} pendiente${pend > 1 ? 's' : ''}`}
              </span>
            </button>
          )
        })}
        {(purchases?.length ?? 0) === 0 && <EmptyState emoji="🧾" title="Sin facturas de compra" hint="Registra compras para enviar sus eventos." />}
      </div>

      {detail && (
        <Sheet open onClose={() => setDetail(null)} title={`Eventos · ${detail.number}`}>
          <div className="space-y-3">
            <div className="text-sm text-slate-500">
              <p className="font-semibold text-slate-700">{detail.supplierName}</p>
              {detail.supplierInvoice && <p>Factura proveedor: {detail.supplierInvoice}</p>}
              <p>{cop(detail.total)}</p>
            </div>
            {EVENTS.map((ev) => {
              const ts = detail.dianEvents?.[ev.key]
              return (
                <div key={ev.key} className="flex items-center justify-between rounded-xl border border-slate-100 p-3">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{ev.label}</p>
                    {ts ? <p className="text-xs text-emerald-600">✓ {fmtDateTime(ts)}</p> : <p className="text-xs text-slate-400">Pendiente</p>}
                  </div>
                  {!ts && (
                    <button
                      onClick={async () => {
                        await registerReceptionEvent(detail.id, ev.key, user!.id, user!.name)
                        toast('success', `${ev.label} transmitido`)
                        const upd = await db.purchases.get(detail.id)
                        if (upd) setDetail(upd)
                      }}
                      className="btn btn-primary px-3 py-2 text-xs"
                    >
                      Transmitir
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </Sheet>
      )}
    </div>
  )
}
