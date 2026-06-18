import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { cop } from '@/lib/money'
import { waLink } from '@/lib/whatsapp'
import { toast } from '@/components/Toast'
import { Icon } from '@/components/icons'
import { ProductThumb } from '@/components/ui'
import type { Product } from '@/types'

// Tienda online pública (sin login): el cliente arma su pedido y lo envía por
// WhatsApp al tendero. Se comparte como link: …/#/tienda
export default function Tienda() {
  const tenants = useLiveQuery(() => db.tenants.toArray(), [])
  const products = useLiveQuery(() => db.products.filter((p) => p.active).toArray(), [])
  const stockRows = useLiveQuery(() => db.stock.toArray(), [])
  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stockRows ?? []) m.set(s.productId, (m.get(s.productId) ?? 0) + s.quantity)
    return m
  }, [stockRows])
  const tenant = useMemo(() => {
    const tid = products?.[0]?.tenantId
    return (tenants ?? []).find((t) => t.id === tid) ?? (tenants ?? [])[0]
  }, [tenants, products])

  const [search, setSearch] = useState('')
  const [qty, setQty] = useState<Record<string, number>>({})
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    const all = products ?? []
    if (!q) return all.slice(0, 60)
    return all.filter((p) => p.name.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)).slice(0, 60)
  }, [products, search])

  const lines = (products ?? []).filter((p) => (qty[p.id] ?? 0) > 0)
  const total = lines.reduce((s, p) => s + p.price * (qty[p.id] ?? 0), 0)
  const count = lines.reduce((s, p) => s + (qty[p.id] ?? 0), 0)

  const phone = tenant?.phone || ''
  const storeName = tenant?.businessName || 'la tienda'

  function setQ(id: string, v: number) {
    setQty((prev) => ({ ...prev, [id]: Math.max(0, v) }))
  }

  function sendOrder() {
    if (!lines.length) return toast('error', 'Agrega productos a tu pedido')
    if (!phone) return toast('error', 'Esta tienda aún no tiene WhatsApp configurado')
    const L: string[] = []
    L.push(`*Pedido a ${storeName}* 🛒`)
    L.push('')
    for (const p of lines) L.push(`• ${qty[p.id]} × ${p.name} — ${cop(p.price * (qty[p.id] ?? 0))}`)
    L.push('')
    L.push(`*Total: ${cop(total)}*`)
    if (name.trim()) L.push(`Cliente: ${name.trim()}`)
    if (address.trim()) L.push(`Dirección (domicilio): ${address.trim()}`)
    window.open(waLink(phone, L.join('\n')), '_blank')
  }

  function shareCatalog() {
    const url = window.location.href
    if (navigator.share) {
      navigator.share({ title: storeName, text: `Mira el catálogo de ${storeName} y pide a domicilio`, url }).catch(() => {})
    } else {
      navigator.clipboard?.writeText(url).then(() => toast('success', 'Link copiado')).catch(() => toast('info', url))
    }
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-28">
      {/* Encabezado de la tienda */}
      <div className="bg-gradient-to-b from-brand-700 to-brand-800 px-5 pb-5 pt-7 text-white">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-brand-100">Catálogo · pide a domicilio</p>
            <h1 className="text-2xl font-extrabold">{storeName}</h1>
            {tenant?.city && <p className="text-sm text-brand-100">{tenant.city}</p>}
          </div>
          <button onClick={shareCatalog} className="rounded-full bg-white/15 p-2.5 backdrop-blur active:scale-95" aria-label="Compartir">
            <Icon name="whatsapp" className="h-5 w-5" />
          </button>
        </div>
        <div className="relative mt-4">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="w-full rounded-xl border-0 py-2.5 pl-10 pr-3 text-slate-700 outline-none"
          />
        </div>
      </div>

      {/* Productos */}
      <div className="space-y-2 p-3">
        {list.map((p) => (
          <CatalogRow key={p.id} product={p} qty={qty[p.id] ?? 0} stock={stockByProduct.get(p.id) ?? 0} onChange={(v) => setQ(p.id, v)} />
        ))}
        {list.length === 0 && (
          <p className="py-10 text-center text-sm text-slate-400">No hay productos para mostrar.</p>
        )}
      </div>

      {/* Datos del cliente (para domicilio) */}
      {count > 0 && (
        <div className="space-y-2 px-3">
          <p className="text-sm font-semibold text-slate-600">Tus datos (para el domicilio)</p>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" />
          <input className="input" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Dirección y barrio (opcional)" />
        </div>
      )}

      {/* Barra fija: enviar pedido */}
      {count > 0 && (
        <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md border-t border-slate-200 bg-white p-3 shadow-2xl">
          <button onClick={sendOrder} className="btn btn-success btn-lg w-full">
            <Icon name="whatsapp" className="h-6 w-6" />
            Enviar pedido por WhatsApp · {count} ít. · {cop(total)}
          </button>
        </div>
      )}
    </div>
  )
}

function CatalogRow({ product, qty, stock, onChange }: { product: Product; qty: number; stock: number; onChange: (v: number) => void }) {
  const out = stock <= 0
  return (
    <div className={`flex items-center gap-3 rounded-2xl bg-white p-2.5 shadow-sm ${out ? 'opacity-70' : ''}`}>
      <ProductThumb photo={product.photo} emoji={product.imageEmoji} size={48} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-700">{product.name}</p>
        <p className="font-bold text-brand-700">{cop(product.price)}{product.unit === 'peso' && <span className="text-xs font-normal text-slate-400">/kg</span>}</p>
        {out
          ? <span className="text-xs font-semibold text-rose-500">Agotado</span>
          : stock <= 5
            ? <span className="text-xs font-medium text-amber-600">Últimas {product.unit === 'peso' ? `${stock} kg` : `${stock} und`}</span>
            : <span className="text-xs text-slate-400">Disponible</span>}
      </div>
      {out ? (
        <span className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-semibold text-slate-400">Agotado</span>
      ) : qty <= 0 ? (
        <button onClick={() => onChange(1)} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white active:scale-95">Agregar</button>
      ) : (
        <div className="flex items-center gap-2">
          <button onClick={() => onChange(qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100"><Icon name="minus" className="h-4 w-4" /></button>
          <span className="w-6 text-center font-bold">{qty}</span>
          <button onClick={() => onChange(qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700"><Icon name="plus" className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  )
}
