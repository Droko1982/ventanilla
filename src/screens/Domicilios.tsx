import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useProducts, useCurrentUser, useScopeLocationIds } from '@/hooks/data'
import { createDomicilio, updateDomicilioStatus } from '@/data/repo'
import { ProductPicker, itemsTotal } from '@/components/ProductPicker'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { timeAgo } from '@/lib/format'
import { waLink } from '@/lib/whatsapp'
import { useSession } from '@/store/session'
import type { Domicilio, DomicilioStatus, PaymentMethod, Product, SaleItem } from '@/types'

const statusMeta: Record<DomicilioStatus, { label: string; chip: string }> = {
  pendiente: { label: 'Pendiente', chip: 'bg-amber-100 text-amber-700' },
  en_camino: { label: 'En camino', chip: 'bg-blue-100 text-blue-700' },
  entregado: { label: 'Entregado', chip: 'bg-emerald-100 text-emerald-700' },
  cancelado: { label: 'Cancelado', chip: 'bg-rose-100 text-rose-700' },
}

// Mensaje de WhatsApp al cliente según el estado real del pedido.
function avisoMsg(status: DomicilioStatus, name: string): string {
  const n = name || 'cliente'
  switch (status) {
    case 'pendiente': return `Hola ${n}, estamos preparando tu pedido 📦`
    case 'en_camino': return `Hola ${n}, tu pedido ya va en camino 🛵`
    case 'entregado': return `Hola ${n}, tu pedido fue entregado ✓ ¡Gracias por tu compra!`
    case 'cancelado': return `Hola ${n}, tu pedido fue cancelado. Cualquier duda, escríbenos.`
  }
}

export default function Domicilios() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const products = useProducts()
  const scopeIds = useScopeLocationIds()
  const [filter, setFilter] = useState<'activos' | 'todos'>('activos')
  const [newOpen, setNewOpen] = useState(false)
  const [detail, setDetail] = useState<Domicilio | null>(null)

  const domicilios = useLiveQuery(
    () => (scopeIds.length ? db.domicilios.where('locationId').anyOf(scopeIds).reverse().toArray() : []),
    [scopeIds.join(',')],
  )

  const list = useMemo(() => {
    const all = domicilios ?? []
    if (filter === 'activos') return all.filter((d) => d.status === 'pendiente' || d.status === 'en_camino')
    return all
  }, [domicilios, filter])

  const pendientes = (domicilios ?? []).filter((d) => d.status === 'pendiente' || d.status === 'en_camino').length

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader help="mas" title="Domicilios" subtitle={`${pendientes} entrega(s) en curso`} />

      <button onClick={() => setNewOpen(true)} className="btn btn-primary mb-3 w-full">
        <Icon name="plus" className="h-5 w-5" /> Nuevo domicilio
      </button>

      <div className="mb-3">
        <Segmented value={filter} onChange={setFilter} options={[{ value: 'activos', label: 'En curso' }, { value: 'todos', label: 'Todos' }]} />
      </div>

      <div className="space-y-2">
        {list.map((d) => (
          <button key={d.id} onClick={() => setDetail(d)} className="card flex w-full items-center gap-3 p-3 text-left">
            <span className="text-2xl">🛵</span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700">{d.customerName} · {cop(d.total)}</p>
              <p className="truncate text-xs text-slate-400">{d.address}{d.barrio ? `, ${d.barrio}` : ''} · {timeAgo(d.createdAt)}{d.repartidor ? ` · ${d.repartidor}` : ''}</p>
            </div>
            <span className={`chip ${statusMeta[d.status].chip}`}>{statusMeta[d.status].label}</span>
          </button>
        ))}
        {list.length === 0 && <EmptyState emoji="🛵" title="Sin domicilios" hint="Crea una entrega a domicilio." />}
      </div>

      {newOpen && products && (
        <NewDomicilioSheet
          products={products}
          tenantId={tenantId}
          locationId={locationId}
          onClose={() => setNewOpen(false)}
        />
      )}
      {detail && <DomicilioDetail dom={detail} onClose={() => setDetail(null)} />}
    </div>
  )
}

function NewDomicilioSheet({ products, tenantId, locationId, onClose }: {
  products: Product[]; tenantId: string; locationId: string; onClose: () => void
}) {
  const user = useCurrentUser()
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [barrio, setBarrio] = useState('')
  const [repartidor, setRepartidor] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('efectivo')
  const [items, setItems] = useState<SaleItem[]>([])
  const total = itemsTotal(items)

  return (
    <Sheet
      open onClose={onClose} title="Nuevo domicilio"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={!name.trim() || !address.trim() || !items.length}
          onClick={async () => {
            await createDomicilio({
              tenantId, locationId, userId: user!.id, userName: user!.name,
              customerName: name.trim(), phone: phone.trim() || undefined, address: address.trim(),
              barrio: barrio.trim() || undefined, items, paymentMethod: method, repartidor: repartidor.trim() || undefined,
            })
            toast('success', 'Domicilio creado · stock despachado')
            onClose()
          }}
        >
          Crear domicilio · {cop(total)}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Cliente y dirección</p>
          <div className="space-y-2">
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del cliente" />
            <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Celular (para WhatsApp)" />
            <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección" />
            <input className="input" value={barrio} onChange={(e) => setBarrio(e.target.value)} placeholder="Barrio (opcional)" />
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Pedido</p>
          <ProductPicker products={products} items={items} onChange={setItems} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Pago</label>
            <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)}>
              <option value="efectivo">Efectivo (contraentrega)</option>
              <option value="nequi">Nequi</option>
              <option value="transferencia">Transferencia</option>
              <option value="tarjeta">Tarjeta</option>
              <option value="fiado">Fiado</option>
            </select>
          </div>
          <div>
            <label className="label">Repartidor</label>
            <input className="input" value={repartidor} onChange={(e) => setRepartidor(e.target.value)} placeholder="Nombre" />
          </div>
        </div>
      </div>
    </Sheet>
  )
}

function DomicilioDetail({ dom, onClose }: { dom: Domicilio; onClose: () => void }) {
  const user = useCurrentUser()
  const [repartidor, setRepartidor] = useState(dom.repartidor ?? '')

  async function setStatus(status: DomicilioStatus) {
    await updateDomicilioStatus(dom.id, status, repartidor.trim() || undefined, user!.id, user!.name)
    toast('success', `Domicilio: ${statusMeta[status].label}`)
    onClose()
  }

  const mapsUrl = `https://maps.google.com/?q=${encodeURIComponent(`${dom.address} ${dom.barrio ?? ''} ${dom.city ?? ''}`)}`

  return (
    <Sheet open onClose={onClose} title="Domicilio">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-sm text-slate-500">
            <p className="text-base font-semibold text-slate-700">{dom.customerName}</p>
            <p>{dom.address}{dom.barrio ? `, ${dom.barrio}` : ''}</p>
            {dom.phone && <p>📲 {dom.phone}</p>}
          </div>
          <span className={`chip ${statusMeta[dom.status].chip}`}>{statusMeta[dom.status].label}</span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <a href={mapsUrl} target="_blank" rel="noreferrer" className="btn btn-secondary text-sm">🗺️ Ver en mapa</a>
          {dom.phone && <a href={waLink(dom.phone, avisoMsg(dom.status, dom.customerName))} target="_blank" rel="noreferrer" className="btn btn-success text-sm"><Icon name="whatsapp" className="h-4 w-4" /> Avisar</a>}
        </div>

        <div className="space-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
          {dom.items.map((it, i) => (
            <div key={i} className="flex justify-between"><span className="flex-1 truncate text-slate-600">{it.qty} × {it.name}</span><span className="font-semibold">{cop(it.unitPrice * it.qty - it.lineDiscount)}</span></div>
          ))}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span className="text-brand-700">{cop(dom.total)}</span></div>
          <p className="text-xs text-slate-400">Pago: {dom.paymentMethod}</p>
        </div>

        {(dom.status === 'pendiente' || dom.status === 'en_camino') && (
          <>
            <div>
              <label className="label">Repartidor</label>
              <input className="input" value={repartidor} onChange={(e) => setRepartidor(e.target.value)} placeholder="Nombre del repartidor" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {dom.status === 'pendiente' && <button onClick={() => setStatus('en_camino')} className="btn btn-primary">🛵 En camino</button>}
              <button onClick={() => setStatus('entregado')} className="btn btn-success">✓ Entregado</button>
              <button onClick={() => setStatus('cancelado')} className="btn btn-secondary text-rose-600">Cancelar</button>
            </div>
          </>
        )}
        {dom.status === 'entregado' && <p className="rounded-xl bg-emerald-50 p-3 text-center text-sm text-emerald-700">Entregado ✓</p>}
        {dom.status === 'cancelado' && <p className="rounded-xl bg-rose-50 p-3 text-center text-sm text-rose-600">Cancelado · venta anulada y stock devuelto</p>}
      </div>
    </Sheet>
  )
}
