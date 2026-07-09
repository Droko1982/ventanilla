import { useMemo, useState } from 'react'
import { useScopeSales, useLocations, useCurrentUser, useTenant } from '@/hooks/data'
import { can } from '@/lib/permissions'
import { transmitDian, voidSale, returnSaleItems, generateDebitNote } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader, DianChip, Money } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, kg, parseCop } from '@/lib/money'
import { fmtDateTime, fmtTime, timeAgo } from '@/lib/format'
import { saleDay } from '@/lib/businessDay'
import type { Sale } from '@/types'

const methodEmoji: Record<string, string> = {
  efectivo: '💵', nequi: '📲', daviplata: '📱', tarjeta: '💳', transferencia: '🏦', otro: '🧾', fiado: '📒',
}

export default function Ventas() {
  const sales = useScopeSales()
  const locations = useLocations()
  const user = useCurrentUser()
  const tenant = useTenant()
  const [filter, setFilter] = useState<'todas' | 'pendiente'>('todas')
  const [day, setDay] = useState('') // YYYY-MM-DD: ver las ventas de un día concreto
  const [q, setQ] = useState('') // buscar por monto, documento o producto
  const [detail, setDetail] = useState<Sale | null>(null)
  const [busyDian, setBusyDian] = useState(false)

  const locName = useMemo(() => new Map((locations ?? []).map((l) => [l.id, l.name])), [locations])

  const pending = (sales ?? []).filter((s) => s.dianStatus === 'pendiente' && s.status === 'completada')
  // Filtro por día contable (para hallar la factura de un día previo) y por texto.
  const ql = q.trim().toLowerCase()
  const list = (filter === 'pendiente' ? pending : (sales ?? [])).filter((s) => {
    if (day && saleDay(s) !== day) return false
    if (ql) {
      const hay = `${s.total} ${s.dianDocNumber ?? ''} ${s.items.map((i) => i.name).join(' ')}`.toLowerCase()
      if (!hay.includes(ql)) return false
    }
    return true
  })

  // Alerta de pendientes "viejos" (más de 24h sin transmitir → riesgo de sanción)
  const oldPending = pending.filter((s) => Date.now() - new Date(s.createdAt).getTime() > 24 * 3600000)

  return (
    <div>
      <PageHeader help="ventas" title="Ventas y facturas" subtitle="Historial · busca por día y reimprime/emite facturas" />

      {oldPending.length > 0 && (
        <div className="mb-3 flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-3">
          <Icon name="alert" className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-700">
            <b>{oldPending.length} ventas</b> llevan más de 24 h sin transmitir a la DIAN. Tienes 48 h de contingencia: transmítelas pronto.
          </p>
        </div>
      )}

      <div className="mb-3">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'todas', label: `Todas (${sales?.length ?? 0})` },
            { value: 'pendiente', label: `DIAN pendiente (${pending.length})` },
          ]}
        />
      </div>

      {/* Buscar la venta de un día anterior para reimprimir/emitir su factura */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <span className="text-base">📅</span>
          <span className="shrink-0 text-slate-500">Ver un día:</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="min-w-0 flex-1 bg-transparent text-slate-700 outline-none" />
          {day && <button onClick={() => setDay('')} className="shrink-0 text-xs font-semibold text-brand-600">limpiar</button>}
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por monto, documento o producto…"
          className="input"
        />
      </div>
      {(day || ql) && (
        <p className="mb-3 text-xs text-slate-400">
          {list.length} venta(s){day ? ` del ${day}` : ''}{ql ? ` que coinciden con "${q.trim()}"` : ''}
        </p>
      )}

      {pending.length > 0 && (
        <button
          onClick={async () => {
            setBusyDian(true)
            let n = 0
            for (const s of pending) { try { await transmitDian(s.id); n++ } catch { /* sigue con las demás */ } }
            setBusyDian(false)
            toast('success', `${n} documento(s) procesados (consecutivo asignado)`)
          }}
          disabled={busyDian}
          className="btn btn-primary mb-4 w-full text-sm disabled:opacity-60"
        >
          {busyDian ? 'Transmitiendo…' : `🧾 Transmitir todos los pendientes (${pending.length})`}
        </button>
      )}

      <div className="space-y-2">
        {list.slice(0, 100).map((s) => (
          <button key={s.id} onClick={() => setDetail(s)} className="card flex w-full items-center gap-3 p-3 text-left active:scale-[0.99]">
            <span className="text-2xl">{methodEmoji[s.payments[0]?.method] ?? '🧾'}</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700">
                {cop(s.total)} {s.status === 'anulada' && <span className="text-xs text-rose-500">(anulada)</span>}
              </p>
              <p className="truncate text-xs text-slate-400">
                {locName.get(s.locationId)} · {timeAgo(s.createdAt)} · {s.items.length} items
              </p>
            </div>
            <DianChip status={s.dianStatus} />
          </button>
        ))}
        {list.length === 0 && <EmptyState emoji="🧾" title="Sin ventas" hint="Las ventas aparecerán aquí." />}
      </div>

      {detail && (
        <SaleDetail
          sale={detail}
          locName={locName.get(detail.locationId) ?? ''}
          tenantName={tenant?.businessName ?? ''}
          onClose={() => setDetail(null)}
          onTransmit={async () => {
            await transmitDian(detail.id)
            toast('success', 'Documento DIAN generado (consecutivo asignado)')
            setDetail(null)
          }}
          onVoid={async () => {
            await voidSale(detail.id, user!.id, user!.name)
            toast('success', 'Venta anulada · nota crédito generada')
            setDetail(null)
          }}
        />
      )}
    </div>
  )
}

export function SaleDetail({
  sale, locName, tenantName, onClose, onTransmit, onVoid,
}: {
  sale: Sale; locName: string; tenantName: string; onClose: () => void; onTransmit: () => void; onVoid: () => void
}) {
  const user = useCurrentUser()
  const [returnOpen, setReturnOpen] = useState(false)
  const [ndOpen, setNdOpen] = useState(false)
  return (
    <Sheet open onClose={onClose} title={`Venta · ${fmtTime(sale.createdAt)}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-400">{tenantName} · {locName}</p>
            <p className="text-xs text-slate-400">{fmtDateTime(sale.createdAt)}</p>
            {sale.vendedorName && <p className="text-xs text-slate-400">Vendedor: {sale.vendedorName}</p>}
            {sale.note && <p className="text-xs text-slate-500">📝 {sale.note}</p>}
          </div>
          <DianChip status={sale.dianStatus} />
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3">
          {sale.items.map((it, i) => (
            <div key={i} className="flex items-center justify-between text-sm">
              <span className="flex-1 truncate text-slate-600">
                {it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`} {it.name}
              </span>
              <span className="font-semibold text-slate-700">{cop(it.unitPrice * it.qty - it.lineDiscount)}</span>
            </div>
          ))}
          {sale.discount > 0 && (
            <div className="flex justify-between text-sm text-emerald-600">
              <span>Descuento{sale.discountReason ? ` (${sale.discountReason})` : ''}</span><span>-{cop(sale.discount)}</span>
            </div>
          )}
          <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-bold">
            <span>Total</span><span className="text-brand-700">{cop(sale.total)}</span>
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm font-semibold text-slate-600">Pago</p>
          {sale.payments.map((p, i) => (
            <div key={i} className="flex justify-between text-sm text-slate-500">
              <span>{methodEmoji[p.method]} {p.method}</span>
              <span>{cop(p.amount)}</span>
            </div>
          ))}
        </div>

        {/* Botón DIAN: revisar y transmitir */}
        {sale.status === 'completada' && (
          <div className="rounded-xl border border-brand-100 bg-brand-50/50 p-3">
            {sale.dianStatus === 'enviado' ? (
              <p className="text-sm text-emerald-700">
                ✓ Documento {sale.dianDocType.replace('_', ' ')} {sale.dianDocNumber} generado (consecutivo local).
              </p>
            ) : (
              <>
                <p className="mb-2 text-sm text-slate-600">
                  Revisa la venta y genera el Documento Equivalente Electrónico (DEE POS).
                </p>
                <button onClick={onTransmit} className="btn btn-primary w-full">
                  <Icon name="doc" className="h-5 w-5" /> Generar y transmitir a la DIAN
                </button>
                <p className="mt-1 text-center text-[11px] text-slate-400">Simulado en el demo · cada cliente conecta su proveedor real.</p>
              </>
            )}
          </div>
        )}

        {/* Devolución parcial / anular / nota débito — solo con permiso (anti-fraude) */}
        {sale.status === 'completada' && sale.items.length > 0 && can(user, 'canVoid') && (
          <button onClick={() => setReturnOpen(true)} className="btn btn-secondary w-full text-amber-600">
            <Icon name="arrow-left" className="h-5 w-5" /> Devolución parcial (algunos ítems)
          </button>
        )}
        {sale.status === 'completada' && can(user, 'canVoid') && (
          <button onClick={onVoid} className="btn btn-secondary w-full text-rose-600">
            <Icon name="trash" className="h-5 w-5" /> Anular venta completa (nota crédito)
          </button>
        )}
        {sale.status === 'completada' && can(user, 'canVoid') && (
          <button onClick={() => setNdOpen(true)} className="btn btn-secondary w-full text-blue-600">
            <Icon name="doc" className="h-5 w-5" /> Generar nota débito (cargo adicional)
          </button>
        )}
        {sale.creditNoteNumber && (
          <p className="rounded-xl bg-amber-50 p-2 text-center text-xs text-amber-700">
            Nota crédito {sale.creditNoteNumber}{sale.creditNoteConcept ? ` · ${NC_CONCEPTS[sale.creditNoteConcept]}` : ''}
            {sale.referencedDoc ? ` (ref. ${sale.referencedDoc.number})` : ''}
          </p>
        )}
        {sale.debitNoteNumber && (
          <p className="rounded-xl bg-blue-50 p-2 text-center text-xs text-blue-700">
            Nota débito {sale.debitNoteNumber}: +{cop(sale.debitNoteAmount ?? 0)}{sale.debitNoteConcept ? ` · ${ND_CONCEPTS[sale.debitNoteConcept]}` : ''}
          </p>
        )}

        {ndOpen && (
          <Sheet open onClose={() => setNdOpen(false)} title="Nota débito">
            <DebitNoteForm
              onApply={async (amount, reason, concept) => {
                const n = await generateDebitNote(sale.id, amount, reason, user!.id, user!.name, concept)
                toast('success', `Nota débito ${n} generada`)
                setNdOpen(false)
                onClose()
              }}
            />
          </Sheet>
        )}
        {sale.status === 'anulada' && (
          <p className="rounded-xl bg-rose-50 p-3 text-center text-sm text-rose-600">Venta anulada. El stock fue devuelto.</p>
        )}
      </div>

      {returnOpen && (
        <ReturnSheet
          sale={sale}
          onClose={() => setReturnOpen(false)}
          onDone={async (returns) => {
            const refund = await returnSaleItems(sale.id, returns, user!.id, user!.name)
            toast('success', refund > 0 ? `Devolución por ${cop(refund)} · nota crédito` : 'Sin ítems para devolver')
            setReturnOpen(false)
            onClose()
          }}
        />
      )}
    </Sheet>
  )
}

function ReturnSheet({
  sale, onClose, onDone,
}: {
  sale: Sale
  onClose: () => void
  onDone: (returns: { index: number; qty: number }[]) => void
}) {
  const [qtys, setQtys] = useState<Record<number, number>>({})
  const total = sale.items.reduce((s, it, i) => s + it.unitPrice * (qtys[i] ?? 0), 0)
  return (
    <Sheet
      open
      onClose={onClose}
      title="Devolución parcial"
      footer={
        <button
          className="btn btn-danger btn-lg w-full"
          disabled={total <= 0}
          onClick={() => onDone(sale.items.map((_, i) => ({ index: i, qty: qtys[i] ?? 0 })))}
        >
          Devolver · {cop(total)}
        </button>
      }
    >
      <p className="mb-3 text-sm text-slate-500">Elige cuántas unidades de cada ítem devuelve el cliente. Se reintegra el stock y se genera nota crédito.</p>
      <div className="space-y-2">
        {sale.items.map((it, i) => {
          const max = it.unit === 'peso' ? it.qty : Math.floor(it.qty)
          const val = qtys[i] ?? 0
          return (
            <div key={i} className="flex items-center gap-2 rounded-xl border border-slate-100 p-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{it.name}</p>
                <p className="text-xs text-slate-400">Vendido: {it.unit === 'peso' ? kg(it.qty) : it.qty} · {cop(it.unitPrice)}</p>
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setQtys({ ...qtys, [i]: Math.max(0, val - 1) })} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                  <Icon name="minus" className="h-4 w-4" />
                </button>
                <span className="w-8 text-center font-bold">{val}</span>
                <button onClick={() => setQtys({ ...qtys, [i]: Math.min(max, val + 1) })} className="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                  <Icon name="plus" className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

// Conceptos DIAN de las notas (Anexo Técnico).
const NC_CONCEPTS: Record<number, string> = { 1: 'Devolución', 2: 'Anulación', 3: 'Rebaja', 4: 'Descuento', 5: 'Otros' }
const ND_CONCEPTS: Record<number, string> = { 1: 'Intereses', 2: 'Gastos por cobrar', 3: 'Cambio de valor', 4: 'Otros' }

function DebitNoteForm({ onApply }: { onApply: (amount: number, reason: string, concept: 1 | 2 | 3 | 4) => void }) {
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [concept, setConcept] = useState<1 | 2 | 3 | 4>(4)
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">Cargo adicional sobre esta venta (ej. interés por mora, recargo). Si tiene cliente, suma a su saldo.</p>
      <input autoFocus className="input text-center text-xl font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ 0" />
      <div>
        <label className="label">Concepto (DIAN)</label>
        <select className="input" value={concept} onChange={(e) => setConcept(Number(e.target.value) as 1 | 2 | 3 | 4)}>
          <option value={1}>Intereses</option>
          <option value={2}>Gastos por cobrar</option>
          <option value={3}>Cambio de valor</option>
          <option value={4}>Otros</option>
        </select>
      </div>
      <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo" />
      <button className="btn btn-primary w-full" disabled={parseCop(amount) <= 0} onClick={() => onApply(parseCop(amount), reason.trim() || 'Cargo adicional', concept)}>
        Generar nota débito
      </button>
    </div>
  )
}
