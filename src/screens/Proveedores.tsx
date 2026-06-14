import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useSuppliers, useCurrentUser, useLocations } from '@/hooks/data'
import { suggestReorder, createPurchaseOrder, receivePurchase, markPurchaseOrderPaid, type ReorderSuggestion } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { fmtDateTime } from '@/lib/format'
import { waLink, mailtoLink } from '@/lib/whatsapp'
import { uid } from '@/lib/id'
import { useSession } from '@/store/session'
import type { Supplier } from '@/types'

export default function Proveedores() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const suppliers = useSuppliers()
  const locations = useLocations()
  const user = useCurrentUser()
  const [tab, setTab] = useState<'reabastecer' | 'proveedores' | 'pedidos' | 'porpagar'>('reabastecer')
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  const suggestions = useLiveQuery(
    () => (locationId ? suggestReorder(tenantId, locationId) : []),
    [tenantId, locationId],
  )
  const orders = useLiveQuery(
    () => (locationId ? db.purchaseOrders.where('locationId').equals(locationId).reverse().toArray() : []),
    [locationId],
  )

  // Agrupa sugerencias por proveedor
  const bySupplier = useMemo(() => {
    const map = new Map<string, ReorderSuggestion[]>()
    for (const s of suggestions ?? []) {
      const key = s.supplierId ?? 'sin'
      map.set(key, [...(map.get(key) ?? []), s])
    }
    return [...map.entries()]
  }, [suggestions])

  const supplierById = useMemo(() => new Map((suppliers ?? []).map((s) => [s.id, s])), [suppliers])
  const activeLoc = locations?.find((l) => l.id === locationId)

  // Cuentas por pagar: pedidos recibidos aún no pagados
  const poDebt = (po: { items: { receivedQty?: number; suggestedQty: number; cost: number }[] }) =>
    po.items.reduce((a, it) => a + (it.receivedQty ?? it.suggestedQty) * it.cost, 0)
  const payables = useMemo(
    () => (orders ?? []).filter((po) => po.status === 'recibido' && !po.paid),
    [orders],
  )
  const totalDebt = payables.reduce((s, po) => s + poDebt(po), 0)

  return (
    <div>
      <PageHeader title="Proveedores" subtitle={activeLoc?.name} />

      <div className="mb-4">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'reabastecer', label: 'Reabastecer' },
            { value: 'pedidos', label: 'Pedidos' },
            { value: 'porpagar', label: 'Por pagar' },
            { value: 'proveedores', label: 'Directorio' },
          ]}
        />
      </div>

      {tab === 'reabastecer' && (
        <div className="space-y-4">
          {bySupplier.length === 0 && (
            <EmptyState emoji="✅" title="Todo abastecido" hint="Ningún producto cruzó su umbral de reorden." />
          )}
          {bySupplier.map(([supplierId, items]) => {
            const supplier = supplierById.get(supplierId)
            const totalCost = items.reduce((s, it) => s + it.product.cost * it.suggestedQty, 0)
            const orderText = buildOrderText(supplier?.name, items, activeLoc?.name)
            return (
              <div key={supplierId} className="card p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="font-bold text-slate-800">{supplier?.name ?? 'Sin proveedor asignado'}</p>
                    {supplier && (
                      <p className="text-xs text-slate-400">Entrega ~{supplier.leadTimeDays} días</p>
                    )}
                  </div>
                  <span className="chip bg-amber-100 text-amber-700">{items.length} productos</span>
                </div>

                <div className="mb-3 space-y-1.5">
                  {items.map((it) => (
                    <div key={it.product.id} className="flex items-center justify-between text-sm">
                      <span className="flex-1 truncate text-slate-600">
                        {it.product.imageEmoji} {it.product.name}
                        <span className="text-xs text-slate-400"> · vende {it.avgDaily.toFixed(1)}/día</span>
                      </span>
                      <span className="font-semibold text-brand-700">pedir {it.suggestedQty}</span>
                    </div>
                  ))}
                </div>
                <div className="mb-3 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold">
                  <span>Costo estimado del pedido</span>
                  <span>{cop(totalCost)}</span>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <a
                    href={supplier?.email ? mailtoLink(supplier.email, `Pedido ${activeLoc?.name}`, orderText) : '#'}
                    className="btn btn-secondary flex-col py-2 text-xs"
                    onClick={() => !supplier?.email && toast('error', 'Agrega un correo al proveedor')}
                  >
                    <Icon name="mail" className="h-5 w-5" /> Correo
                  </a>
                  <a
                    href={supplier?.whatsapp ? waLink(supplier.whatsapp, orderText) : '#'}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-success flex-col py-2 text-xs"
                    onClick={() => !supplier?.whatsapp && toast('error', 'Agrega WhatsApp al proveedor')}
                  >
                    <Icon name="whatsapp" className="h-5 w-5" /> WhatsApp
                  </a>
                  <button
                    onClick={async () => {
                      if (!supplier) return toast('error', 'Asigna un proveedor primero')
                      await createPurchaseOrder(
                        tenantId, locationId!, supplier.id,
                        items.map((it) => ({ productId: it.product.id, name: it.product.name, suggestedQty: it.suggestedQty, cost: it.product.cost })),
                      )
                      toast('success', 'Pedido creado (queda en Pedidos)')
                      setTab('pedidos')
                    }}
                    className="btn btn-primary flex-col py-2 text-xs"
                  >
                    <Icon name="check" className="h-5 w-5" /> Crear pedido
                  </button>
                </div>
              </div>
            )
          })}
          <p className="px-2 text-center text-xs text-slate-400">
            El pedido sugerido se calcula por velocidad de venta (últimos 30 días) y el tiempo de entrega del proveedor.
          </p>
        </div>
      )}

      {tab === 'pedidos' && (
        <div className="space-y-3">
          {(orders?.length ?? 0) === 0 && <EmptyState emoji="📦" title="Sin pedidos" hint="Crea pedidos desde la pestaña Reabastecer." />}
          {orders?.map((po) => (
            <PurchaseOrderCard key={po.id} po={po} supplierName={supplierById.get(po.supplierId)?.name} userId={user!.id} userName={user!.name} />
          ))}
        </div>
      )}

      {tab === 'porpagar' && (
        <div className="space-y-3">
          <div className="card flex items-center justify-between p-4">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-400">Total por pagar</p>
              <p className="text-2xl font-bold text-rose-600">{cop(totalDebt)}</p>
            </div>
            <span className="text-3xl">💳</span>
          </div>
          {payables.length === 0 && <EmptyState emoji="✅" title="Sin cuentas por pagar" hint="No le debes a ningún proveedor." />}
          {payables.map((po) => (
            <div key={po.id} className="card flex items-center gap-3 p-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-slate-700">{supplierById.get(po.supplierId)?.name ?? 'Proveedor'}</p>
                <p className="text-xs text-slate-400">Recibido {fmtDateTime(po.receivedAt ?? po.createdAt)} · {po.items.length} productos</p>
              </div>
              <span className="font-bold text-rose-600">{cop(poDebt(po))}</span>
              <button
                onClick={async () => { await markPurchaseOrderPaid(po.id); toast('success', 'Marcado como pagado') }}
                className="btn btn-success px-3 py-2 text-xs"
              >
                Pagar
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'proveedores' && (
        <div className="space-y-2">
          <button onClick={() => setAddOpen(true)} className="btn btn-primary w-full">
            <Icon name="plus" className="h-5 w-5" /> Nuevo proveedor
          </button>
          {suppliers?.map((s) => (
            <button key={s.id} onClick={() => setEditSupplier(s)} className="card flex w-full items-center gap-3 p-3 text-left">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
                <Icon name="truck" className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-slate-700">{s.name}</p>
                <p className="truncate text-xs text-slate-400">
                  {s.contactName} · {s.whatsapp ? `📲 ${s.whatsapp}` : 'sin WhatsApp'} · {s.leadTimeDays}d
                </p>
              </div>
              <Icon name="edit" className="h-4 w-4 text-slate-300" />
            </button>
          ))}
        </div>
      )}

      {(editSupplier || addOpen) && (
        <SupplierForm
          supplier={editSupplier ?? undefined}
          tenantId={tenantId}
          onClose={() => {
            setEditSupplier(null)
            setAddOpen(false)
          }}
        />
      )}
    </div>
  )
}

function buildOrderText(supplierName: string | undefined, items: ReorderSuggestion[], locName?: string): string {
  const lines = [
    `Hola${supplierName ? ' ' + supplierName : ''}, pedido para *${locName ?? 'la tienda'}*:`,
    '',
    ...items.map((it) => `• ${it.product.name}: ${it.suggestedQty}`),
    '',
    'Gracias. Enviado desde Ventanilla.',
  ]
  return lines.join('\n')
}

function PurchaseOrderCard({ po, supplierName, userId, userName }: { po: any; supplierName?: string; userId: string; userName: string }) {
  const [open, setOpen] = useState(false)
  const [received, setReceived] = useState<Record<string, string>>(
    Object.fromEntries(po.items.map((it: any) => [it.productId, String(it.suggestedQty)])),
  )
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-semibold text-slate-700">{supplierName ?? 'Proveedor'}</p>
          <p className="text-xs text-slate-400">{fmtDateTime(po.createdAt)} · {po.items.length} productos</p>
        </div>
        <span className={`chip ${po.status === 'recibido' ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-100 text-blue-700'}`}>
          {po.status === 'recibido' ? 'Recibido' : 'Enviado'}
        </span>
      </div>
      {po.status !== 'recibido' && (
        <button onClick={() => setOpen(true)} className="btn btn-primary mt-3 w-full py-2 text-sm">
          Recibir mercancía
        </button>
      )}

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title="Recibir mercancía"
        footer={
          <button
            className="btn btn-primary btn-lg w-full"
            onClick={async () => {
              const map: Record<string, number> = {}
              for (const [k, v] of Object.entries(received)) map[k] = parseInt(v || '0', 10) || 0
              await receivePurchase(po.id, map, userId, userName)
              toast('success', 'Mercancía recibida y stock actualizado')
              setOpen(false)
            }}
          >
            Confirmar entrada
          </button>
        }
      >
        <p className="mb-3 text-sm text-slate-500">Confirma lo que llegó de verdad (puede diferir de lo pedido):</p>
        <div className="space-y-2">
          {po.items.map((it: any) => (
            <div key={it.productId} className="flex items-center justify-between gap-2">
              <span className="flex-1 truncate text-sm text-slate-600">{it.name}</span>
              <span className="text-xs text-slate-400">pedido {it.suggestedQty}</span>
              <input
                className="w-20 rounded-lg border border-slate-200 px-2 py-1.5 text-right"
                inputMode="numeric"
                value={received[it.productId]}
                onChange={(e) => setReceived({ ...received, [it.productId]: e.target.value })}
              />
            </div>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

function SupplierForm({ supplier, tenantId, onClose }: { supplier?: Supplier; tenantId: string; onClose: () => void }) {
  const [name, setName] = useState(supplier?.name ?? '')
  const [contactName, setContactName] = useState(supplier?.contactName ?? '')
  const [whatsapp, setWhatsapp] = useState(supplier?.whatsapp ?? '')
  const [email, setEmail] = useState(supplier?.email ?? '')
  const [leadTimeDays, setLead] = useState(String(supplier?.leadTimeDays ?? 3))

  return (
    <Sheet
      open
      onClose={onClose}
      title={supplier ? 'Editar proveedor' : 'Nuevo proveedor'}
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          onClick={async () => {
            if (!name.trim()) return toast('error', 'Ponle nombre al proveedor')
            await db.suppliers.put({
              id: supplier?.id ?? uid('s'),
              tenantId, name: name.trim(), contactName, whatsapp, email,
              leadTimeDays: parseInt(leadTimeDays, 10) || 3,
              note: supplier?.note,
            })
            toast('success', 'Proveedor guardado')
            onClose()
          }}
        >
          Guardar
        </button>
      }
    >
      <div className="space-y-3">
        <div><label className="label">Nombre</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Contacto</label><input className="input" value={contactName} onChange={(e) => setContactName(e.target.value)} /></div>
        <div><label className="label">WhatsApp (con indicativo, ej. 573001234567)</label><input className="input" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
        <div><label className="label">Correo</label><input className="input" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="label">Tiempo de entrega (días)</label><input className="input" inputMode="numeric" value={leadTimeDays} onChange={(e) => setLead(e.target.value)} /></div>
      </div>
    </Sheet>
  )
}
