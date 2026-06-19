import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import {
  useActiveLocationId, useProducts, useCurrentUser, useTenant, useLocations,
  useCustomers, useScopeSales, useScopeLocationIds,
} from '@/hooks/data'
import { createRemision, convertRemisionToFactura, voidRemision, voidSale, recordSale, transmitDian } from '@/data/repo'
import { can } from '@/lib/permissions'
import { ProductPicker, itemsTotal } from '@/components/ProductPicker'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader, DianChip } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, kg, parseCop } from '@/lib/money'
import { fmtDateTime, timeAgo } from '@/lib/format'
import { saleDay, localYMD, todayYMD } from '@/lib/businessDay'
import { ivaBreakdown } from '@/lib/documents'
import { facturaText, remisionText, printFactura, printRemision } from '@/lib/docprint'
import { waLink, mailtoLink } from '@/lib/whatsapp'
import { useSession } from '@/store/session'
import type { Sale, Remision, SaleItem, PaymentMethod } from '@/types'

export default function Documentos() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const products = useProducts()
  const sales = useScopeSales()
  const scopeIds = useScopeLocationIds()
  const [tab, setTab] = useState<'facturas' | 'remisiones'>('facturas')
  const [newFactura, setNewFactura] = useState(false)
  const [newRemision, setNewRemision] = useState(false)
  const [detailSale, setDetailSale] = useState<Sale | null>(null)
  const [detailRem, setDetailRem] = useState<Remision | null>(null)

  const [q, setQ] = useState('') // buscar por número, cliente o monto
  const [day, setDay] = useState('') // ver documentos de un día concreto

  const facturas = useMemo(
    () => (sales ?? []).filter((s) => s.dianDocType === 'factura'),
    [sales],
  )
  const remisiones = useLiveQuery(
    () => (scopeIds.length ? db.remisiones.where('locationId').anyOf(scopeIds).reverse().toArray() : []),
    [scopeIds.join(',')],
  )

  // Búsqueda + filtro por día, para encontrar un documento de cualquier fecha.
  const ql = q.trim().toLowerCase()
  const facturasShown = facturas.filter((f) => {
    if (day && saleDay(f) !== day) return false
    if (ql && !`${f.dianDocNumber ?? ''} ${f.customerName ?? ''} ${f.total}`.toLowerCase().includes(ql)) return false
    return true
  })
  const remisionesShown = (remisiones ?? []).filter((r) => {
    if (day && localYMD(r.createdAt) !== day) return false
    if (ql && !`${r.number} ${r.customerName ?? ''} ${r.total}`.toLowerCase().includes(ql)) return false
    return true
  })

  // Exporta el registro de facturas a CSV (para contabilidad / respaldo).
  function exportFacturas() {
    if (facturasShown.length === 0) return toast('info', 'No hay facturas para exportar')
    const rows: string[][] = [['Numero', 'Fecha', 'Cliente', 'Base', 'IVA', 'Total', 'Estado DIAN']]
    for (const f of facturasShown) {
      const br = ivaBreakdown(f.items, f.discount)
      rows.push([f.dianDocNumber ?? '', saleDay(f), f.customerName ?? 'Consumidor final', String(br.base), String(br.iva), String(f.total), f.dianStatus ?? ''])
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `facturas-${todayYMD()}.csv`
    a.click()
  }

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader help="ventas" title="Facturas y remisiones" subtitle="Documentos electrónicos y notas de entrega" />

      <div className="mb-3">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'facturas', label: `Facturas (${facturas.length})` },
            { value: 'remisiones', label: `Remisiones (${remisiones?.length ?? 0})` },
          ]}
        />
      </div>

      {/* Buscar / filtrar por día — para encontrar un documento de cualquier fecha */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por número, cliente o monto…" className="input" />
        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm">
          <span className="text-base">📅</span>
          <span className="shrink-0 text-slate-500">Día:</span>
          <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="min-w-0 flex-1 bg-transparent text-slate-700 outline-none" />
          {day && <button onClick={() => setDay('')} className="shrink-0 text-xs font-semibold text-brand-600">limpiar</button>}
        </label>
      </div>

      {tab === 'facturas' ? (
        <>
          <div className="mb-3 flex gap-2">
            <button onClick={() => setNewFactura(true)} className="btn btn-primary flex-1">
              <Icon name="plus" className="h-5 w-5" /> Nueva factura electrónica
            </button>
            <button onClick={exportFacturas} className="btn btn-secondary px-3" title="Exportar el registro de facturas a CSV (contabilidad / respaldo)">
              ⬇️ Exportar
            </button>
          </div>
          {(q || day) && <p className="mb-2 text-xs text-slate-400">{facturasShown.length} factura(s){day ? ` del ${day}` : ''}</p>}
          <div className="space-y-2">
            {facturasShown.map((f) => (
              <button key={f.id} onClick={() => setDetailSale(f)} className="card flex w-full items-center gap-3 p-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
                  <Icon name="doc" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-700">{f.dianDocNumber ?? 'FE (pendiente)'} · {cop(f.total)}</p>
                  <p className="truncate text-xs text-slate-400">{f.customerName ?? 'Consumidor final'} · {timeAgo(f.createdAt)}</p>
                </div>
                <DianChip status={f.dianStatus} />
              </button>
            ))}
            {facturasShown.length === 0 && <EmptyState emoji="🧾" title={q || day ? 'Sin resultados' : 'Sin facturas'} hint={q || day ? 'Cambia la búsqueda o el día.' : 'Crea una factura electrónica con datos del cliente.'} />}
          </div>
        </>
      ) : (
        <>
          <button onClick={() => setNewRemision(true)} className="btn btn-primary mb-3 w-full">
            <Icon name="plus" className="h-5 w-5" /> Nueva remisión
          </button>
          {(q || day) && <p className="mb-2 text-xs text-slate-400">{remisionesShown.length} remisión(es){day ? ` del ${day}` : ''}</p>}
          <div className="space-y-2">
            {remisionesShown.map((r) => (
              <button key={r.id} onClick={() => setDetailRem(r)} className="card flex w-full items-center gap-3 p-3 text-left">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
                  <Icon name="truck" className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-slate-700">{r.number} · {cop(r.total)}</p>
                  <p className="truncate text-xs text-slate-400">{r.customerName} · {timeAgo(r.createdAt)}</p>
                </div>
                <RemStatusChip status={r.status} />
              </button>
            ))}
            {remisionesShown.length === 0 && <EmptyState emoji="📦" title={q || day ? 'Sin resultados' : 'Sin remisiones'} hint={q || day ? 'Cambia la búsqueda o el día.' : 'Crea notas de entrega/despacho.'} />}
          </div>
        </>
      )}

      {newFactura && products && (
        <NewFacturaSheet
          products={products}
          tenantId={tenantId}
          locationId={locationId}
          onClose={() => setNewFactura(false)}
          onCreated={(s: Sale) => { setNewFactura(false); setDetailSale(s) }}
        />
      )}
      {newRemision && products && (
        <NewRemisionSheet
          products={products}
          tenantId={tenantId}
          locationId={locationId}
          onClose={() => setNewRemision(false)}
          onCreated={(r: Remision) => { setNewRemision(false); setDetailRem(r) }}
        />
      )}
      {detailSale && <FacturaDetail sale={detailSale} onClose={() => setDetailSale(null)} />}
      {detailRem && <RemisionDetail rem={detailRem} onClose={() => setDetailRem(null)} />}
    </div>
  )
}

function RemStatusChip({ status }: { status: Remision['status'] }) {
  const map = { emitida: 'bg-amber-100 text-amber-700', facturada: 'bg-emerald-100 text-emerald-700', anulada: 'bg-rose-100 text-rose-700' }
  const label = { emitida: 'Emitida', facturada: 'Facturada', anulada: 'Anulada' }
  return <span className={`chip ${map[status]}`}>{label[status]}</span>
}

// --- Datos del cliente (compartido por factura y remisión) ------------------
function CustomerFields({
  name, setName, doc, setDoc, idType, setIdType, address, setAddress, email, setEmail, showEmail,
}: any) {
  const customers = useCustomers()
  return (
    <div className="space-y-3">
      {(customers?.length ?? 0) > 0 && (
        <select
          className="input"
          onChange={(e) => {
            const c = customers?.find((x) => x.id === e.target.value)
            if (c) { setName(c.name); setDoc(c.idNumber ?? ''); setAddress?.(c.address ?? '') }
          }}
          defaultValue=""
        >
          <option value="">— Elegir cliente guardado —</option>
          {customers?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      )}
      <div className="grid grid-cols-3 gap-2">
        <select className="input" value={idType} onChange={(e) => setIdType(e.target.value)}>
          <option value="CC">CC</option>
          <option value="NIT">NIT</option>
          <option value="CE">CE</option>
        </select>
        <input className="input col-span-2" value={doc} onChange={(e) => setDoc(e.target.value)} placeholder="Número de documento" />
      </div>
      <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre / razón social" />
      {setAddress && <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección (opcional)" />}
      {showEmail && setEmail && <input className="input" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo (opcional)" />}
    </div>
  )
}

// --- Nueva factura electrónica ---------------------------------------------
function NewFacturaSheet({ products, tenantId, locationId, onClose, onCreated }: any) {
  const user = useCurrentUser()
  const [items, setItems] = useState<SaleItem[]>([])
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [idType, setIdType] = useState<'CC' | 'NIT' | 'CE'>('CC')
  const [address, setAddress] = useState('')
  const [email, setEmail] = useState('')
  const [discount, setDiscount] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const t = ivaBreakdown(items, parseCop(discount))

  return (
    <Sheet
      open onClose={onClose} title="Nueva factura electrónica"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={!items.length}
          onClick={async () => {
            if (!doc.trim() || !name.trim()) return toast('error', 'La factura requiere documento y nombre del cliente')
            const total = t.total
            const sale = await recordSale({
              tenantId, locationId, userId: user!.id, userName: user!.name,
              items, discount: parseCop(discount),
              payments: [{ method, amount: total, confirmed: method !== 'fiado' }],
              customerName: name.trim(), customerDoc: doc.trim(), customerIdType: idType,
              customerAddress: address.trim() || undefined, customerEmail: email.trim() || undefined,
              transmitDian: true, docType: 'factura',
            })
            toast('success', 'Factura electrónica generada')
            onCreated(sale)
          }}
        >
          Generar y transmitir · {cop(t.total)}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Datos del cliente (obligatorio)</p>
          <CustomerFields name={name} setName={setName} doc={doc} setDoc={setDoc} idType={idType} setIdType={setIdType} address={address} setAddress={setAddress} email={email} setEmail={setEmail} showEmail />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Productos</p>
          <ProductPicker products={products} items={items} onChange={setItems} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Descuento</label>
            <input className="input" inputMode="numeric" value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="$ 0" />
          </div>
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="efectivo">Efectivo</option>
              <option value="transferencia">Transferencia</option>
              <option value="nequi">Nequi</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="fiado">A crédito</option>
            </select>
          </div>
        </div>
        {items.length > 0 && (
          <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
            <div className="flex justify-between text-slate-500"><span>Base gravable</span><span>{cop(t.base)}</span></div>
            {t.lines.filter((l) => l.iva > 0).map((l) => (
              <div key={l.rate} className="flex justify-between text-slate-500"><span>IVA {l.rate}%</span><span>{cop(l.iva)}</span></div>
            ))}
            <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span className="text-brand-700">{cop(t.total)}</span></div>
          </div>
        )}
      </div>
    </Sheet>
  )
}

// --- Nueva remisión ---------------------------------------------------------
function NewRemisionSheet({ products, tenantId, locationId, onClose, onCreated }: any) {
  const user = useCurrentUser()
  const [items, setItems] = useState<SaleItem[]>([])
  const [name, setName] = useState('')
  const [doc, setDoc] = useState('')
  const [idType, setIdType] = useState<'CC' | 'NIT' | 'CE'>('CC')
  const [address, setAddress] = useState('')
  const [note, setNote] = useState('')
  const [onCredit, setOnCredit] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const total = itemsTotal(items)

  return (
    <Sheet
      open onClose={onClose} title="Nueva remisión"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={!items.length}
          onClick={async () => {
            if (!name.trim()) return toast('error', 'Escribe el nombre del cliente')
            const rem = await createRemision({
              tenantId, locationId, userId: user!.id, userName: user!.name,
              customerName: name.trim(), customerDoc: doc.trim() || undefined,
              customerAddress: address.trim() || undefined,
              items, discount: 0, note: note.trim() || undefined,
              onCredit, dueDate: onCredit ? (dueDate || undefined) : undefined,
            })
            toast('success', 'Remisión emitida · stock despachado')
            onCreated(rem)
          }}
        >
          Generar remisión · {cop(total)}
        </button>
      }
    >
      <div className="space-y-5">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Cliente</p>
          <CustomerFields name={name} setName={setName} doc={doc} setDoc={setDoc} idType={idType} setIdType={setIdType} address={address} setAddress={setAddress} />
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Productos a despachar</p>
          <ProductPicker products={products} items={items} onChange={setItems} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={onCredit ? 'credito' : 'contado'} onChange={(e) => setOnCredit(e.target.value === 'credito')}>
              <option value="contado">Contado</option>
              <option value="credito">A crédito</option>
            </select>
          </div>
          {onCredit && (
            <div>
              <label className="label">Vence el</label>
              <input type="date" className="input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          )}
        </div>
        <div>
          <label className="label">Observaciones</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej. entrega a domicilio, factura después…" />
        </div>
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
          La remisión descuenta el stock (despacho) pero NO es factura. A crédito entra a la Cartera con su vencimiento.
        </p>
      </div>
    </Sheet>
  )
}

// --- Detalle de factura -----------------------------------------------------
function FacturaDetail({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const tenant = useTenant()
  const locations = useLocations()
  const user = useCurrentUser()
  const location = locations?.find((l) => l.id === sale.locationId)
  if (!tenant || !location) return null
  const t = ivaBreakdown(sale.items, sale.discount)
  const text = facturaText(sale, tenant, location)

  return (
    <Sheet open onClose={onClose} title={`Factura ${sale.dianDocNumber ?? ''}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            <p className="font-semibold text-slate-700">{sale.customerName ?? 'Consumidor final'}</p>
            <p>{sale.customerIdType} {sale.customerDoc}</p>
            <p>{fmtDateTime(sale.createdAt)}</p>
          </div>
          <DianChip status={sale.dianStatus} />
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          {sale.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span className="flex-1 truncate text-slate-600">{it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`} {it.name}</span>
              <span className="font-semibold text-slate-700">{cop(it.unitPrice * it.qty - it.lineDiscount)}</span>
            </div>
          ))}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-slate-500"><span>Base gravable</span><span>{cop(t.base)}</span></div>
          {t.lines.filter((l) => l.iva > 0).map((l) => (
            <div key={l.rate} className="flex justify-between text-slate-500"><span>IVA {l.rate}%</span><span>{cop(l.iva)}</span></div>
          ))}
          <div className="flex justify-between text-base font-bold"><span>Total</span><span className="text-brand-700">{cop(sale.total)}</span></div>
        </div>

        {sale.dianStatus === 'pendiente' && (
          <button onClick={async () => { await transmitDian(sale.id); toast('success', 'Documento generado (consecutivo asignado)'); onClose() }} className="btn btn-primary w-full">
            <Icon name="doc" className="h-5 w-5" /> Transmitir a la DIAN
          </button>
        )}

        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => printFactura(sale, tenant, location)} className="btn btn-secondary flex-col py-3 text-xs"><Icon name="print" className="h-6 w-6" /> Imprimir</button>
          <a href={mailtoLink(sale.customerEmail ?? '', `Factura ${sale.dianDocNumber ?? ''}`, text)} className="btn btn-secondary flex-col py-3 text-xs"><Icon name="mail" className="h-6 w-6" /> Correo</a>
          <a href={waLink('', text)} target="_blank" rel="noreferrer" className="btn btn-secondary flex-col py-3 text-xs"><Icon name="whatsapp" className="h-6 w-6" /> WhatsApp</a>
        </div>

        {sale.status === 'completada' && can(user, 'canVoid') && (
          <button onClick={async () => { await voidSale(sale.id, user!.id, user!.name); toast('success', 'Factura anulada · nota crédito'); onClose() }} className="btn btn-secondary w-full text-rose-600">
            <Icon name="trash" className="h-5 w-5" /> Anular (nota crédito)
          </button>
        )}
      </div>
    </Sheet>
  )
}

// --- Detalle de remisión ----------------------------------------------------
function RemisionDetail({ rem, onClose }: { rem: Remision; onClose: () => void }) {
  const tenant = useTenant()
  const locations = useLocations()
  const user = useCurrentUser()
  const location = locations?.find((l) => l.id === rem.locationId)
  const [converting, setConverting] = useState(false)
  const [method, setMethod] = useState<PaymentMethod>('transferencia')
  if (!tenant || !location) return null
  const text = remisionText(rem, tenant, location)

  return (
    <Sheet open onClose={onClose} title={`Remisión ${rem.number}`}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            <p className="font-semibold text-slate-700">{rem.customerName}</p>
            {rem.customerDoc && <p>{rem.customerDoc}</p>}
            <p>{fmtDateTime(rem.createdAt)}</p>
          </div>
          <RemStatusChip status={rem.status} />
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          {rem.items.map((it, i) => (
            <div key={i} className="flex justify-between">
              <span className="flex-1 truncate text-slate-600">{it.unit === 'peso' ? kg(it.qty) : `${it.qty} x`} {it.name}</span>
              <span className="font-semibold text-slate-700">{cop(it.unitPrice * it.qty - it.lineDiscount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span className="text-brand-700">{cop(rem.total)}</span></div>
        </div>
        {rem.note && <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Obs: {rem.note}</p>}

        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => printRemision(rem, tenant, location)} className="btn btn-secondary flex-col py-3 text-xs"><Icon name="print" className="h-6 w-6" /> Imprimir</button>
          <a href={mailtoLink('', `Remisión ${rem.number}`, text)} className="btn btn-secondary flex-col py-3 text-xs"><Icon name="mail" className="h-6 w-6" /> Correo</a>
          <a href={waLink('', text)} target="_blank" rel="noreferrer" className="btn btn-secondary flex-col py-3 text-xs"><Icon name="whatsapp" className="h-6 w-6" /> WhatsApp</a>
        </div>

        {rem.status === 'emitida' && (
          <>
            {converting ? (
              <div className="space-y-2 rounded-xl border border-brand-100 bg-brand-50/50 p-3">
                <label className="label">Forma de pago de la factura</label>
                <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
                  <option value="transferencia">Transferencia</option>
                  <option value="efectivo">Efectivo</option>
                  <option value="nequi">Nequi</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="fiado">A crédito</option>
                </select>
                <button
                  className="btn btn-primary w-full"
                  onClick={async () => {
                    const sale = await convertRemisionToFactura(rem.id, [{ method, amount: rem.total, confirmed: method !== 'fiado' }], { userId: user!.id, userName: user!.name })
                    if (sale) toast('success', `Factura ${sale.dianDocNumber} generada`)
                    onClose()
                  }}
                >
                  Confirmar factura · {cop(rem.total)}
                </button>
              </div>
            ) : (
              <button onClick={() => setConverting(true)} className="btn btn-success w-full">
                <Icon name="doc" className="h-5 w-5" /> Convertir en factura electrónica
              </button>
            )}
            {can(user, 'canVoid') && (
              <button onClick={async () => { await voidRemision(rem.id, user!.id, user!.name); toast('success', 'Remisión anulada · stock devuelto'); onClose() }} className="btn btn-secondary w-full text-rose-600">
                <Icon name="trash" className="h-5 w-5" /> Anular remisión
              </button>
            )}
          </>
        )}
        {rem.status === 'facturada' && (
          <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">Ya facturada.</p>
        )}
      </div>
    </Sheet>
  )
}
