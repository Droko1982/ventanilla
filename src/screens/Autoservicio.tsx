import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActiveLocationId, useProducts, useCurrentUser, useTenant } from '@/hooks/data'
import { db } from '@/data/db'
import { recordSale } from '@/data/repo'
import { priceLine } from '@/store/cart'
import { Scanner } from '@/components/Scanner'
import { ProductThumb } from '@/components/ui'
import { QRCode } from '@/components/QRCode'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop } from '@/lib/money'
import { hasBreB, breBPayload } from '@/lib/breB'
import { useSession } from '@/store/session'
import type { Product, SaleItem, PaymentMethod } from '@/types'

// Self-checkout (autoservicio) estilo supermercado: el CLIENTE escanea sus
// productos, ve la lista y el total en vivo, y paga (Bre-B o en caja).
export default function Autoservicio() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const tenant = useTenant()
  const user = useCurrentUser()
  const products = useProducts()
  const navigate = useNavigate()

  const [lines, setLines] = useState<{ product: Product; qty: number }[]>([])
  const [scanOpen, setScanOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [pay, setPay] = useState(false)
  const [done, setDone] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [exitPin, setExitPin] = useState<string | null>(null)
  const [pinInput, setPinInput] = useState('')

  const byCode = useMemo(() => {
    const m = new Map<string, Product>()
    for (const p of products ?? []) {
      if (p.unit === 'peso') continue // los productos a granel requieren pesaje: no en autoservicio
      if (p.barcode) m.set(p.barcode, p)
      if (p.internalCode) m.set(p.internalCode, p)
    }
    return m
  }, [products])

  // Precios por línea con el MISMO cálculo del POS (respeta por-mayor y promos).
  const priced = lines.map((l) => {
    const pr = priceLine(
      { basePrice: l.product.price, unitPrice: l.product.price, wholesalePrice: l.product.wholesalePrice, wholesaleMinQty: l.product.wholesaleMinQty, promoType: l.product.promoType, promoValue: l.product.promoValue, unit: l.product.unit },
      l.qty,
    )
    return { l, unitPrice: pr.unitPrice, lineDiscount: pr.promoSaving }
  })
  const total = priced.reduce((s, x) => s + x.unitPrice * x.l.qty - x.lineDiscount, 0)
  const count = lines.reduce((s, l) => s + l.qty, 0)

  function add(p: Product) {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.product.id === p.id)
      if (i >= 0) { const cp = [...prev]; cp[i] = { ...cp[i], qty: cp[i].qty + 1 }; return cp }
      return [...prev, { product: p, qty: 1 }]
    })
  }
  function setQty(id: string, qty: number) {
    setLines((prev) => prev.flatMap((l) => (l.product.id === id ? (qty <= 0 ? [] : [{ ...l, qty }]) : [l])))
  }
  function onCode(code: string) {
    const p = byCode.get(code.trim())
    if (p) { add(p); toast('success', `${p.name} agregado`) }
    else toast('error', 'Producto no encontrado')
  }

  const results = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return []
    return (products ?? []).filter((p) => p.unit !== 'peso' && (p.name.toLowerCase().includes(q) || p.barcode?.includes(search))).slice(0, 8)
  }, [products, search])

  async function finalize(method: PaymentMethod) {
    if (!lines.length || !locationId || processing) return // candado: evita doble cobro por doble toque
    setProcessing(true)
    try {
      const items: SaleItem[] = priced.map((x) => ({
        productId: x.l.product.id, name: x.l.product.name, unit: x.l.product.unit, qty: x.l.qty,
        unitPrice: x.unitPrice, lineDiscount: x.lineDiscount, ivaRate: x.l.product.ivaRate, cost: x.l.product.cost,
      }))
      await recordSale({
        tenantId, locationId, userId: user?.id ?? 'autoservicio', userName: 'Autoservicio',
        items, discount: 0, payments: [{ method, amount: total, confirmed: method !== 'fiado' }],
        transmitDian: tenant?.dian.enabled ?? false, note: 'Venta de autoservicio',
      })
      setDone(true)
    } catch {
      toast('error', 'No se pudo completar el pago. Intenta de nuevo o paga en caja.')
    } finally {
      setProcessing(false)
    }
  }

  function reset() {
    setLines([]); setPay(false); setDone(false); setSearch('')
  }

  if (!locationId) {
    return <div className="flex h-screen items-center justify-center bg-slate-900 text-white">Selecciona un local para el autoservicio.</div>
  }

  // Pantalla de "gracias" tras pagar
  if (done) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-emerald-600 px-6 text-center text-white">
        <div className="text-7xl">✅</div>
        <h1 className="text-3xl font-extrabold">¡Gracias por tu compra!</h1>
        <p className="text-lg text-emerald-50">Retira tu recibo en la caja. Total: {cop(total)}</p>
        <button onClick={reset} className="btn btn-lg mt-4 bg-white text-emerald-700">Nueva compra</button>
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-slate-900 text-white">
      {/* Encabezado */}
      <div className="flex items-center justify-between bg-slate-950/60 px-5 py-3">
        <span className="text-xl font-extrabold">🛒 Autoservicio · {tenant?.businessName ?? ''}</span>
        <button onClick={() => setExitPin('')} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">Salir</button>
      </div>

      {/* Salida con PIN (para que el cliente no salga del modo kiosco) */}
      {exitPin !== null && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-slate-900/95">
          <p className="text-lg">PIN del cajero para salir</p>
          <input autoFocus type="password" inputMode="numeric" value={pinInput}
            onChange={(e) => setPinInput(e.target.value)} aria-label="PIN del cajero"
            className="w-40 rounded-xl border border-white/20 bg-white/10 px-4 py-3 text-center text-2xl tracking-widest" />
          <div className="flex gap-2">
            <button onClick={() => { setExitPin(null); setPinInput('') }} className="rounded-lg bg-white/10 px-4 py-2">Cancelar</button>
            <button
              onClick={async () => {
                const users = await db.users.where('tenantId').equals(tenantId).toArray()
                const match = users.find((x) => x.pin && x.pin === pinInput)
                if (match) navigate('/')
                else { toast('error', 'PIN incorrecto'); setPinInput('') }
              }}
              className="rounded-lg bg-emerald-600 px-4 py-2 font-semibold">Salir</button>
          </div>
        </div>
      )}

      {/* Cuerpo: escaneo + búsqueda + lista */}
      <div className="flex-1 overflow-y-auto px-5 py-4">
        <button onClick={() => setScanOpen(true)} className="mb-3 flex w-full items-center justify-center gap-3 rounded-2xl bg-brand-600 py-5 text-xl font-bold active:scale-[0.99]">
          <Icon name="scan" className="h-8 w-8" /> Escanea tu producto
        </button>
        <input
          value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="…o búscalo por nombre" aria-label="Buscar producto por nombre"
          className="mb-2 w-full rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-white placeholder:text-white/40"
        />
        {results.length > 0 && (
          <div className="mb-3 space-y-1.5">
            {results.map((p) => (
              <button key={p.id} onClick={() => { add(p); setSearch('') }} className="flex w-full items-center gap-3 rounded-xl bg-white/5 p-2 text-left active:scale-[0.99]">
                <ProductThumb photo={p.photo} emoji={p.imageEmoji} size={36} />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="font-bold">{cop(p.price)}</span>
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {lines.length === 0 ? (
            <p className="mt-16 text-center text-2xl text-white/30">Escanea para empezar…</p>
          ) : priced.map(({ l, unitPrice, lineDiscount }) => (
            <div key={l.product.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-2.5 text-lg">
              <ProductThumb photo={l.product.photo} emoji={l.product.imageEmoji} size={40} />
              <span className="flex-1 truncate">{l.product.name}</span>
              <button onClick={() => setQty(l.product.id, l.qty - 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10"><Icon name="minus" className="h-5 w-5" /></button>
              <span className="w-7 text-center font-bold">{l.qty}</span>
              <button onClick={() => setQty(l.product.id, l.qty + 1)} className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-500"><Icon name="plus" className="h-5 w-5" /></button>
              <span className="w-24 text-right font-bold tabular-nums">{cop(unitPrice * l.qty - lineDiscount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Total + pagar */}
      <div className="bg-brand-600 px-5 py-4">
        <div className="mb-2 flex items-end justify-between">
          <span className="text-sm uppercase tracking-widest text-brand-100">{count} producto(s) · Total</span>
          <span className="text-5xl font-extrabold tabular-nums">{cop(total)}</span>
        </div>
        <button onClick={() => setPay(true)} disabled={!lines.length} className="btn btn-lg w-full bg-white text-brand-700 disabled:opacity-50">
          Pagar
        </button>
      </div>

      {scanOpen && <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={(c) => { onCode(c); setScanOpen(false) }} />}

      {/* Hoja de pago */}
      {pay && (
        <div className="absolute inset-0 z-40 flex flex-col bg-slate-900 px-6 pt-6 text-white">
          <button onClick={() => setPay(false)} className="self-start text-sm text-white/60">← Volver</button>
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <p className="text-lg text-white/70">Total a pagar</p>
            <p className="text-6xl font-extrabold">{cop(total)}</p>
            {tenant && hasBreB(tenant) && (
              <div className="rounded-2xl bg-white p-4 text-slate-800">
                <p className="mb-2 text-xs font-bold uppercase text-cyan-700">Paga con Bre-B</p>
                <QRCode value={breBPayload(tenant)} size={180} />
                <p className="mt-2 font-bold">{tenant.breBKey}</p>
              </div>
            )}
            <div className="flex w-full max-w-xs flex-col gap-2">
              <button onClick={() => finalize('transferencia')} disabled={processing} className="btn btn-lg w-full bg-cyan-500 disabled:opacity-50">{processing ? 'Procesando…' : 'Ya pagué con Bre-B / Nequi'}</button>
              <button onClick={() => finalize('efectivo')} disabled={processing} className="btn btn-lg w-full bg-white text-slate-800 disabled:opacity-50">{processing ? 'Procesando…' : 'Pagar en caja (efectivo)'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
