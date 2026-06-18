import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { useActiveLocationId, useProducts, useSuppliers, useCurrentUser, useScopeLocationIds } from '@/hooks/data'
import { recordPurchase, recordSupplierReturn } from '@/data/repo'
import { Sheet } from '@/components/Sheet'
import { EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop } from '@/lib/money'
import { fmtDateTime } from '@/lib/format'
import { useSession } from '@/store/session'
import type { Product, PurchaseItem, Supplier } from '@/types'

export default function Compras() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const products = useProducts()
  const suppliers = useSuppliers()
  const scopeIds = useScopeLocationIds()
  const [newOpen, setNewOpen] = useState(false)
  const [returnOpen, setReturnOpen] = useState(false)

  const purchases = useLiveQuery(
    () => (scopeIds.length ? db.purchases.where('locationId').anyOf(scopeIds).reverse().toArray() : []),
    [scopeIds.join(',')],
  )

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader help="compras" title="Compras" subtitle="Facturas de compra / entradas de mercancía" />

      <div className="mb-3 flex gap-2">
        <button onClick={() => setNewOpen(true)} className="btn btn-primary flex-1">
          <Icon name="plus" className="h-5 w-5" /> Nueva factura de compra
        </button>
        <button onClick={() => setReturnOpen(true)} className="btn btn-secondary px-3" title="Devolución a proveedor">
          <Icon name="arrow-left" className="h-5 w-5" /> Devolución
        </button>
      </div>

      <div className="space-y-2">
        {purchases?.map((c) => (
          <div key={c.id} className="card flex items-center gap-3 p-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
              <Icon name="truck" className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-700">{c.number} · {c.supplierName}</p>
              <p className="truncate text-xs text-slate-400">{fmtDateTime(c.createdAt)} · {c.items.length} productos</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-slate-700">{cop(c.total)}</p>
              <span className={`chip ${c.paymentMethod === 'contado' ? 'bg-emerald-100 text-emerald-700' : c.paid ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                {c.paymentMethod === 'contado' ? 'Contado' : c.paid ? 'Pagada' : 'A crédito'}
              </span>
            </div>
          </div>
        ))}
        {(purchases?.length ?? 0) === 0 && <EmptyState emoji="🧾" title="Sin compras" hint="Registra las facturas de tus proveedores." />}
      </div>

      {newOpen && products && suppliers && (
        <NewPurchaseSheet
          products={products}
          suppliers={suppliers}
          tenantId={tenantId}
          locationId={locationId}
          onClose={() => setNewOpen(false)}
        />
      )}

      {returnOpen && products && suppliers && (
        <ReturnToSupplierSheet
          products={products}
          suppliers={suppliers}
          tenantId={tenantId}
          locationId={locationId}
          onClose={() => setReturnOpen(false)}
        />
      )}
    </div>
  )
}

// --- Devolución a proveedor (sale del inventario, baja la deuda) ------------
function ReturnToSupplierSheet({ products, suppliers, tenantId, locationId, onClose }: {
  products: Product[]; suppliers: Supplier[]; tenantId: string; locationId: string; onClose: () => void
}) {
  const user = useCurrentUser()
  const [supplierId, setSupplierId] = useState('')
  const [reduceDebt, setReduceDebt] = useState(true)
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [code, setCode] = useState('')
  const [qty, setQty] = useState('1')
  const total = items.reduce((s, it) => s + it.unitCost * it.qty, 0)
  const supplier = suppliers.find((s) => s.id === supplierId)

  function addByCode() {
    const q = code.trim().toLowerCase()
    if (!q) return
    const p = products.find((x) => x.barcode === code.trim() || x.internalCode === code.trim()) ?? products.find((x) => x.name.toLowerCase().includes(q))
    if (!p) return toast('error', `"${code}" no encontrado`)
    const n = parseFloat(qty.replace(',', '.')) || 1
    setItems((prev) => {
      const ex = prev.find((i) => i.productId === p.id)
      if (ex) return prev.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + n } : i))
      return [...prev, { productId: p.id, name: p.name, qty: n, unitCost: p.avgCost ?? p.cost }]
    })
    setCode(''); setQty('1')
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Devolución a proveedor"
      footer={
        <button
          className="btn btn-danger btn-lg w-full"
          disabled={!supplierId || !items.length}
          onClick={async () => {
            await recordSupplierReturn({
              tenantId, locationId, supplierId, supplierName: supplier?.name ?? 'Proveedor',
              items, reduceDebt, userId: user!.id, userName: user!.name,
            })
            toast('success', 'Devolución registrada · stock actualizado')
            onClose()
          }}
        >
          Registrar devolución · {cop(total)}
        </button>
      }
    >
      <div className="space-y-3">
        <div>
          <label className="label">Proveedor</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Seleccione…</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{(s.debt ?? 0) > 0 ? ` (debe ${cop(s.debt)})` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Producto a devolver</label>
          <div className="flex gap-2">
            <input className="input flex-1" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addByCode() }} placeholder="Cód. barras / interno o nombre" />
            <input className="input w-14 text-center" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
            <button onClick={addByCode} className="btn btn-primary px-3">AGREGAR</button>
          </div>
        </div>
        <div className="space-y-1.5">
          {items.map((it) => (
            <div key={it.productId} className="flex items-center justify-between rounded-lg border border-slate-100 p-2 text-sm">
              <span className="flex-1 truncate">{it.qty} × {it.name}</span>
              <span className="font-semibold">{cop(it.unitCost * it.qty)}</span>
              <button onClick={() => setItems(items.filter((x) => x.productId !== it.productId))} className="ml-2 text-rose-400">✕</button>
            </div>
          ))}
        </div>
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={reduceDebt} onChange={(e) => setReduceDebt(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Descontar de la deuda con el proveedor</span>
        </label>
      </div>
    </Sheet>
  )
}

function NewPurchaseSheet({ products, suppliers, tenantId, locationId, onClose }: {
  products: Product[]; suppliers: Supplier[]; tenantId: string; locationId: string; onClose: () => void
}) {
  const user = useCurrentUser()
  const [supplierId, setSupplierId] = useState('')
  const [supplierInvoice, setSupplierInvoice] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'contado' | 'credito'>('contado')
  const [commercialDiscount, setCommercialDiscount] = useState('')
  const [weightSign, setWeightSign] = useState<'sumar' | 'restar'>('sumar')
  const [weightAdjust, setWeightAdjust] = useState('')
  const [items, setItems] = useState<PurchaseItem[]>([])
  const [code, setCode] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [results, setResults] = useState<Product[]>([])

  const subtotal = items.reduce((s, it) => s + it.unitCost * it.qty, 0)
  const wAdj = (weightSign === 'restar' ? -1 : 1) * parseCop(weightAdjust)
  const total = Math.max(0, Math.round(subtotal - parseCop(commercialDiscount) + wAdj))

  function add(p: Product, q: number, c: number) {
    const unitCost = c > 0 ? c : (p.cost || 0)
    setItems((prev) => {
      const ex = prev.find((i) => i.productId === p.id)
      if (ex) return prev.map((i) => (i.productId === p.id ? { ...i, qty: i.qty + q, unitCost } : i))
      return [...prev, { productId: p.id, name: p.name, qty: q, unitCost }]
    })
    setCode(''); setQty('1'); setCost(''); setResults([])
  }
  function submitCode() {
    const q = code.trim().toLowerCase()
    if (!q) return
    const p = products.find((x) => x.barcode === code.trim() || x.internalCode === code.trim()) ?? products.find((x) => x.name.toLowerCase().includes(q))
    if (!p) { toast('error', `"${code}" no encontrado`); return }
    add(p, parseFloat(qty.replace(',', '.')) || 1, parseCop(cost))
  }
  function onCodeChange(v: string) {
    setCode(v)
    const q = v.trim().toLowerCase()
    if (q.length < 2) { setResults([]); return }
    setResults(products.filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.barcode?.includes(v) || p.internalCode?.toLowerCase().includes(q))).slice(0, 5))
  }

  const supplier = suppliers.find((s) => s.id === supplierId)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Nueva factura de compra"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={!supplierId || !items.length}
          onClick={async () => {
            await recordPurchase({
              tenantId, locationId, supplierId, supplierName: supplier?.name ?? 'Proveedor',
              supplierInvoice: supplierInvoice.trim() || undefined,
              items, commercialDiscount: parseCop(commercialDiscount), weightAdjust: wAdj,
              paymentMethod, userId: user!.id, userName: user!.name,
            })
            toast('success', 'Compra guardada · stock y costo promedio actualizados')
            onClose()
          }}
        >
          GUARDAR · {cop(total)}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Proveedor</label>
            <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Seleccione…</option>
              {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="label">No. Factura proveedor</label>
            <input className="input" value={supplierInvoice} onChange={(e) => setSupplierInvoice(e.target.value)} placeholder="Opcional" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Forma de pago</label>
            <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as any)}>
              <option value="contado">Contado</option>
              <option value="credito">A crédito (deuda)</option>
            </select>
          </div>
          <div>
            <label className="label">Descuento comercial</label>
            <input className="input" inputMode="numeric" value={commercialDiscount} onChange={(e) => setCommercialDiscount(e.target.value)} placeholder="$ 0" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Ajuste al peso</label>
            <div className="flex gap-1">
              <select className="input w-24" value={weightSign} onChange={(e) => setWeightSign(e.target.value as any)}>
                <option value="sumar">Sumar</option>
                <option value="restar">Restar</option>
              </select>
              <input className="input" inputMode="numeric" value={weightAdjust} onChange={(e) => setWeightAdjust(e.target.value)} placeholder="$ 0" />
            </div>
          </div>
        </div>

        {/* Entrada de productos */}
        <div className="relative">
          <p className="label">Producto</p>
          <div className="flex gap-2">
            <input className="input flex-1" value={code} onChange={(e) => onCodeChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submitCode() }} placeholder="Cód. barras / interno o nombre" />
            <input className="input w-14 text-center" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} title="Cantidad" />
            <input className="input w-24 text-center" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Costo" />
            <button onClick={submitCode} className="btn btn-primary px-3">AGREGAR</button>
          </div>
          {results.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
              {results.map((p) => (
                <button key={p.id} onClick={() => add(p, parseFloat(qty.replace(',', '.')) || 1, parseCop(cost))} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                  <span className="truncate">{p.imageEmoji} {p.name}</span>
                  <span className="text-xs text-slate-400">costo {cop(p.cost)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500">
              <tr><th className="px-2 py-1.5 text-left">Cant.</th><th className="px-2 py-1.5 text-left">Producto</th><th className="px-2 py-1.5 text-right">Vr. Unidad</th><th className="px-2 py-1.5 text-right">Vr. Total</th><th></th></tr>
            </thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={5} className="px-3 py-5 text-center text-slate-400">Agrega los productos de la factura.</td></tr>}
              {items.map((it) => (
                <tr key={it.productId} className="border-t border-slate-100">
                  <td className="px-2 py-1.5">{it.qty}</td>
                  <td className="px-2 py-1.5"><span className="line-clamp-1">{it.name}</span></td>
                  <td className="px-2 py-1.5 text-right text-slate-500">{cop(it.unitCost)}</td>
                  <td className="px-2 py-1.5 text-right font-semibold">{cop(it.unitCost * it.qty)}</td>
                  <td className="px-1"><button onClick={() => setItems(items.filter((x) => x.productId !== it.productId))} className="text-slate-300 hover:text-rose-500"><Icon name="trash" className="h-4 w-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-1 rounded-xl bg-slate-50 p-3 text-sm">
          <div className="flex justify-between text-slate-500"><span>Subtotal</span><span>{cop(subtotal)}</span></div>
          {parseCop(commercialDiscount) > 0 && <div className="flex justify-between text-slate-500"><span>Descuento comercial</span><span>-{cop(parseCop(commercialDiscount))}</span></div>}
          {wAdj !== 0 && <div className="flex justify-between text-slate-500"><span>Ajuste al peso</span><span>{wAdj > 0 ? '+' : ''}{cop(wAdj)}</span></div>}
          <div className="flex justify-between border-t border-slate-200 pt-1 text-base font-bold"><span>Total</span><span className="text-brand-700">{cop(total)}</span></div>
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">Al guardar: suma al inventario, actualiza el costo promedio y el último proveedor. Si es a crédito, suma a la deuda del proveedor.</p>
      </div>
    </Sheet>
  )
}
