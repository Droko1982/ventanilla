import { useMemo, useState, useCallback } from 'react'
import {
  useActiveLocationId,
  useProducts,
  useCategories,
  useStockForLocation,
  useCurrentUser,
  useLocations,
  useCustomers,
  useTenant,
  useSuppliers,
} from '@/hooks/data'
import { useCart, cartSubtotal, cartTotal, cartCount, type CartLine } from '@/store/cart'
import { useBarcodeWedge } from '@/hooks/useBarcodeWedge'
import { Scanner } from '@/components/Scanner'
import { Sheet } from '@/components/Sheet'
import { ProductForm } from '@/components/ProductForm'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { EmptyState, ProductThumb } from '@/components/ui'
import { cop, kg, parseCop } from '@/lib/money'
import { uid } from '@/lib/id'
import { recordSale, adjustChangeOwed } from '@/data/repo'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '@/data/db'
import { receiptText, printReceipt } from '@/lib/receipt'
import { openCashDrawer } from '@/lib/cashDrawer'
import { readWeightOnce, scaleMessage } from '@/lib/scale'
import { hasBreB, breBPayload } from '@/lib/breB'
import { QRCode } from '@/components/QRCode'
import { waLink, mailtoLink } from '@/lib/whatsapp'
import { useSession } from '@/store/session'
import { can } from '@/lib/permissions'
import type { Payment, PaymentMethod, Product, Sale, Customer, User } from '@/types'

export default function POS() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const products = useProducts()
  const categories = useCategories()
  const suppliers = useSuppliers()
  const stock = useStockForLocation(locationId)
  const locations = useLocations()
  const user = useCurrentUser()
  const tenant = useTenant()
  const cart = useCart()

  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')
  const [scanOpen, setScanOpen] = useState(false)
  const [weightProduct, setWeightProduct] = useState<Product | null>(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState(false)
  const [scanCreateCode, setScanCreateCode] = useState<string | undefined>()
  const [serviceOpen, setServiceOpen] = useState(false)
  const [manualOpen, setManualOpen] = useState(false)
  const [displayOpen, setDisplayOpen] = useState(false)
  const [receipt, setReceipt] = useState<Sale | null>(null)
  const [editProduct, setEditProduct] = useState<Product | null>(null)

  const canManage = can(user, 'canManageInventory')
  const canDiscount = can(user, 'canDiscount')

  const customers = useCustomers()
  const vendedores = useLiveQuery(
    () => (tenantId ? db.users.where('tenantId').equals(tenantId).and((u) => u.active).toArray() : []),
    [tenantId],
  )
  const changeOwed = useLiveQuery(() => (locationId ? db.changeOwed.get(locationId) : undefined), [locationId])
  const [mode, setModeState] = useState<'tiles' | 'counter'>(
    () => (localStorage.getItem('ventanilla-sales-mode') as 'tiles' | 'counter') || 'tiles',
  )
  const setMode = (m: 'tiles' | 'counter') => { localStorage.setItem('ventanilla-sales-mode', m); setModeState(m) }
  const [vueltasOpen, setVueltasOpen] = useState(false)

  const stockMap = useMemo(() => {
    const m = new Map<string, number>()
    for (const s of stock ?? []) m.set(s.productId, s.quantity)
    return m
  }, [stock])

  const activeLoc = locations?.find((l) => l.id === locationId)

  const visibleProducts = useMemo(() => {
    let list = (products ?? []).filter((p) => p.active)
    // Granel sólo en locales habilitados
    if (activeLoc && !activeLoc.allowBulk) list = list.filter((p) => p.unit !== 'peso')
    if (cat !== 'all') list = list.filter((p) => p.categoryId === cat)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode?.includes(search) ||
          p.internalCode?.toLowerCase().includes(q) ||
          p.brand?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      )
    }
    return list
  }, [products, cat, search, activeLoc])

  const addToCart = useCallback(
    (p: Product) => {
      if ((stockMap.get(p.id) ?? 0) <= 0 && p.allowNegative === false) {
        toast('error', `${p.name} sin existencias`)
        return
      }
      if (p.unit === 'peso') {
        setWeightProduct(p)
      } else {
        cart.addProduct(p)
        toast('success', `${p.name} agregado`)
      }
    },
    [cart, stockMap],
  )

  const handleScan = useCallback(
    (code: string) => {
      const found = (products ?? []).find((p) => p.barcode === code || p.internalCode === code)
      setScanOpen(false)
      if (found) {
        addToCart(found)
      } else if (canManage) {
        // Código desconocido → crear el producto con ese código precargado
        setScanCreateCode(code)
        setQuickAdd(true)
        toast('info', `Código nuevo: regístralo`)
      } else {
        toast('error', `Código ${code} no está registrado`)
      }
    },
    [products, addToCart, canManage],
  )

  // Resuelve un código/nombre escrito en el modo mostrador y lo agrega.
  const addByCode = useCallback(
    (code: string, qty: number) => {
      const q = code.trim()
      if (!q) return
      const ql = q.toLowerCase()
      const found =
        (products ?? []).find((p) => p.barcode === q || p.internalCode === q || p.internalCode?.toLowerCase() === ql) ??
        (products ?? []).find((p) => p.name.toLowerCase().includes(ql))
      if (!found) {
        if (canManage) { setScanCreateCode(q); setQuickAdd(true) }
        else toast('error', `"${q}" no está registrado`)
        return
      }
      if ((stockMap.get(found.id) ?? 0) <= 0 && found.allowNegative === false) {
        toast('error', `${found.name} sin existencias`)
        return
      }
      if (found.unit === 'peso') setWeightProduct(found)
      else { cart.addProduct(found, qty); toast('success', `${found.name} agregado`) }
    },
    [products, canManage, cart, stockMap],
  )

  // Lector físico USB/Bluetooth siempre activo en el POS
  useBarcodeWedge(handleScan, !!locationId)

  const total = cartTotal(cart.lines, cart.globalDiscount)
  const count = cartCount(cart.lines)

  if (!locationId) {
    return <EmptyState emoji="🏪" title="Sin local asignado" hint="Selecciona un local para vender." />
  }

  return (
    <div className="pb-24">
      {/* Modo de venta + vueltas que el negocio debe ("Cambio Anterior") */}
      <div className="mb-3 flex items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-0.5 text-xs font-semibold">
          <button onClick={() => setMode('tiles')} className={`rounded-lg px-3 py-1.5 ${mode === 'tiles' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>🟩 Fichas</button>
          <button onClick={() => setMode('counter')} className={`rounded-lg px-3 py-1.5 ${mode === 'counter' ? 'bg-white text-brand-700 shadow-sm' : 'text-slate-500'}`}>⌨️ Mostrador</button>
        </div>
        <div className="flex-1" />
        <button
          onClick={() => setVueltasOpen(true)}
          className={`chip ${(changeOwed?.amount ?? 0) > 0 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}
          title="Vueltas que el negocio debe (Cambio Anterior)"
        >
          💱 Cambio: {cop(changeOwed?.amount ?? 0)}
        </button>
      </div>

      {mode === 'counter' ? (
        <CounterEntry
          products={visibleProducts}
          allProducts={products ?? []}
          customers={customers ?? []}
          vendedores={vendedores ?? []}
          canDiscount={canDiscount}
          onAddCode={(code, qty) => addByCode(code, qty)}
          onAddProduct={(p, qty) => (p.unit === 'peso' ? setWeightProduct(p) : cart.addProduct(p, qty))}
          onPay={() => setPayOpen(true)}
          onScan={() => setScanOpen(true)}
          onManual={() => setManualOpen(true)}
        />
      ) : (
        <>
      {/* Buscador + escaneo */}
      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar producto…"
            className="input pl-10"
          />
        </div>
        <button onClick={() => setScanOpen(true)} className="btn btn-primary px-4" aria-label="Escanear">
          <Icon name="scan" className="h-6 w-6" />
        </button>
        <button onClick={() => setDisplayOpen(true)} className="btn btn-secondary px-3" aria-label="Pantalla cliente" title="Mostrar al cliente">
          📺
        </button>
      </div>

      {/* Filtros por categoría */}
      <div className="no-scrollbar mb-3 flex gap-2 overflow-x-auto">
        <CatChip active={cat === 'all'} onClick={() => setCat('all')} label="Todo" emoji="🛒" />
        {(categories ?? []).map((c) => (
          <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)} label={c.name} emoji={c.emoji} />
        ))}
      </div>

      {/* Grilla de productos */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {canManage && (
          <button
            onClick={() => setQuickAdd(true)}
            className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-slate-300 p-3 text-slate-400 active:scale-[0.98]"
          >
            <Icon name="plus" className="h-7 w-7" />
            <span className="text-xs font-semibold">Producto nuevo</span>
          </button>
        )}

        <button
          onClick={() => setServiceOpen(true)}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-brand-300 bg-brand-50/40 p-3 text-brand-600 active:scale-[0.98]"
        >
          <span className="text-2xl">📱</span>
          <span className="text-xs font-semibold">Recarga / Servicio</span>
        </button>

        <button
          onClick={() => setManualOpen(true)}
          className="flex flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-amber-300 bg-amber-50/40 p-3 text-amber-700 active:scale-[0.98]"
        >
          <span className="text-2xl">✍️</span>
          <span className="text-xs font-semibold">Venta manual</span>
        </button>

        {visibleProducts.map((p) => {
          const qty = stockMap.get(p.id) ?? 0
          const out = qty <= 0
          return (
            <div key={p.id} className="relative">
              <button
                onClick={() => addToCart(p)}
                className={`flex w-full flex-col rounded-2xl border bg-white p-3 text-left shadow-sm active:scale-[0.98] ${
                  out ? 'border-rose-200 opacity-70' : 'border-slate-100'
                }`}
              >
                <ProductThumb photo={p.photo} emoji={p.imageEmoji} size={44} />
                <span className="mt-1 line-clamp-2 text-sm font-semibold leading-tight text-slate-700">
                  {p.name}
                </span>
                <span className="mt-1 font-bold text-brand-700">
                  {cop(p.price)}
                  {p.unit === 'peso' && <span className="text-xs font-normal text-slate-400">/kg</span>}
                </span>
                {p.wholesalePrice && p.wholesaleMinQty ? (
                  <span className="text-[10px] font-medium text-emerald-600">x{p.wholesaleMinQty}+ {cop(p.wholesalePrice)}</span>
                ) : null}
                <span className={`mt-0.5 text-[11px] ${out ? 'text-rose-500' : 'text-slate-400'}`}>
                  {out ? 'Agotado' : `${p.unit === 'peso' ? kg(qty) : qty} en stock`}
                </span>
              </button>
              {canManage && (
                <button
                  onClick={(e) => { e.stopPropagation(); setEditProduct(p) }}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-100/90 text-slate-500 shadow-sm backdrop-blur active:scale-95"
                  aria-label={`Editar ${p.name}`}
                  title="Editar producto"
                >
                  <Icon name="edit" className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {visibleProducts.length === 0 && (
        <EmptyState emoji="🔍" title="Sin resultados" hint="Prueba otra búsqueda o agrega el producto." />
      )}

      {/* Barra fija del carrito */}
      {count > 0 && (
        <button
          onClick={() => setCartOpen(true)}
          className="fixed inset-x-0 bottom-[60px] z-30 mx-auto flex max-w-3xl items-center justify-between gap-2 px-3"
        >
          <span className="flex w-full items-center justify-between rounded-2xl bg-brand-600 px-5 py-3.5 text-white shadow-lg">
            <span className="flex items-center gap-2 font-semibold">
              <span className="flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-white/25 px-1 text-sm">
                {count}
              </span>
              Ver carrito
            </span>
            <span className="text-lg font-bold">{cop(total)}</span>
          </span>
        </button>
      )}
        </>
      )}

      <Scanner open={scanOpen} onClose={() => setScanOpen(false)} onDetected={handleScan} />

      {weightProduct && (
        <WeightSheet
          product={weightProduct}
          onClose={() => setWeightProduct(null)}
          onConfirm={(kgQty) => {
            cart.addProduct(weightProduct, kgQty)
            toast('success', `${weightProduct.name}: ${kg(kgQty)}`)
            setWeightProduct(null)
          }}
        />
      )}

      <CartSheet open={cartOpen} canDiscount={canDiscount} onClose={() => setCartOpen(false)} onCheckout={() => { setCartOpen(false); setPayOpen(true) }} />

      {payOpen && (
        <PaymentSheet
          total={total}
          defaultCustomerId={cart.meta.customerId}
          onClose={() => setPayOpen(false)}
          onConfirm={async (payments, opts) => {
            const items = cart.lines.map((l) => ({
              productId: l.productId,
              name: l.name,
              unit: l.unit,
              qty: l.qty,
              unitPrice: l.unitPrice,
              lineDiscount: l.lineDiscount + (l.promoSaving ?? 0), // incluye promoción
              ivaRate: l.ivaRate,
              cost: l.cost,
            }))
            const sale = await recordSale({
              tenantId,
              locationId,
              userId: user!.id,
              userName: user!.name,
              items,
              discount: cart.globalDiscount,
              payments,
              customerId: opts.customerId ?? cart.meta.customerId,
              customerDoc: opts.customerDoc,
              transmitDian: opts.transmitDian,
              vendedorId: cart.meta.vendedorId,
              vendedorName: cart.meta.vendedorName,
              discountReason: cart.meta.discountReason,
              note: opts.note,
              redeemPoints: opts.redeemPoints,
            })
            cart.clear()
            setPayOpen(false)
            setReceipt(sale)
            toast('success', 'Venta registrada ✓')
            // Abre el cajón monedero en ventas con efectivo (si está activado)
            if (tenant?.autoOpenDrawer && payments.some((p) => p.method === 'efectivo')) {
              openCashDrawer().catch(() => { /* sin cajón en este dispositivo */ })
            }
          }}
        />
      )}

      {receipt && <ReceiptSheet sale={receipt} onClose={() => setReceipt(null)} />}

      {quickAdd && products && categories && suppliers && locations && (
        <ProductForm
          open={quickAdd}
          onClose={() => { setQuickAdd(false); setScanCreateCode(undefined) }}
          tenantId={tenantId}
          locations={locations}
          categories={categories}
          suppliers={suppliers}
          defaultLocationId={locationId}
          initialBarcode={scanCreateCode}
          onSaved={(p) => { addToCart(p); setScanCreateCode(undefined) }}
        />
      )}

      {editProduct && products && categories && suppliers && locations && (
        <ProductForm
          open
          onClose={() => setEditProduct(null)}
          tenantId={tenantId}
          locations={locations}
          categories={categories}
          suppliers={suppliers}
          product={editProduct}
          defaultLocationId={locationId}
        />
      )}

      {serviceOpen && (
        <ServiceSheet
          onClose={() => setServiceOpen(false)}
          onAdd={(line) => {
            cart.addLine(line)
            setServiceOpen(false)
            toast('success', `${line.name} agregado`)
          }}
        />
      )}

      {manualOpen && (
        <ManualItemSheet
          onClose={() => setManualOpen(false)}
          onAdd={(line) => { cart.addLine(line); setManualOpen(false); toast('success', `${line.name} agregado`) }}
        />
      )}

      {displayOpen && <CustomerDisplay onClose={() => setDisplayOpen(false)} />}

      {vueltasOpen && locationId && (
        <VueltasSheet
          current={changeOwed?.amount ?? 0}
          onClose={() => setVueltasOpen(false)}
          onApply={async (delta, reason) => {
            await adjustChangeOwed({ tenantId, locationId, delta, userId: user!.id, userName: user!.name, reason })
            toast('success', delta >= 0 ? 'Vueltas registradas' : 'Vueltas pagadas')
            setVueltasOpen(false)
          }}
        />
      )}
    </div>
  )
}

// --- Vueltas que el negocio debe ("Cambio Anterior") ------------------------
function VueltasSheet({ current, onClose, onApply }: { current: number; onClose: () => void; onApply: (delta: number, reason: string) => void }) {
  const [tab, setTab] = useState<'deber' | 'pagar'>('deber')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const amt = parseCop(amount)
  return (
    <Sheet open onClose={onClose} title="Vueltas (Cambio)">
      <div className="space-y-4">
        <div className="rounded-2xl bg-amber-50 p-4 text-center">
          <p className="text-sm text-amber-600">El negocio debe en vueltas</p>
          <p className="text-3xl font-extrabold text-amber-700">{cop(current)}</p>
        </div>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1 text-sm font-semibold">
          <button onClick={() => setTab('deber')} className={`rounded-lg py-1.5 ${tab === 'deber' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>Quedé debiendo</button>
          <button onClick={() => setTab('pagar')} className={`rounded-lg py-1.5 ${tab === 'pagar' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Pagar vueltas</button>
        </div>
        <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ 0" />
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nota (cliente, motivo…)" />
        <button
          className={`btn btn-lg w-full ${tab === 'deber' ? 'btn-primary' : 'btn-success'}`}
          disabled={amt <= 0}
          onClick={() => onApply(tab === 'deber' ? amt : -amt, reason.trim() || (tab === 'deber' ? 'Quedó debiendo vueltas' : 'Pago de vueltas'))}
        >
          {tab === 'deber' ? `Registrar que debo ${cop(amt)}` : `Pagar ${cop(amt)}`}
        </button>
      </div>
    </Sheet>
  )
}

// --- Pantalla para el cliente (segunda pantalla / mostrar la compra) --------
function CustomerDisplay({ onClose }: { onClose: () => void }) {
  const cart = useCart()
  const total = cartTotal(cart.lines, cart.globalDiscount)
  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-slate-900 text-white">
      <div className="flex items-center justify-between p-4">
        <span className="text-lg font-bold">🛒 Tu compra</span>
        <button onClick={onClose} className="rounded-full bg-white/10 px-4 py-2 text-sm">Cerrar</button>
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        {cart.lines.length === 0 ? (
          <p className="mt-24 text-center text-2xl text-white/40">Esperando productos…</p>
        ) : (
          <div className="space-y-3">
            {cart.lines.map((l) => (
              <div key={l.productId} className="flex items-center justify-between border-b border-white/10 pb-3 text-xl">
                <span>{l.emoji} {l.name} <span className="text-white/50">{l.unit === 'peso' ? kg(l.qty) : `x${l.qty}`}</span></span>
                <span className="font-bold">{cop(l.unitPrice * l.qty - l.lineDiscount - (l.promoSaving ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="bg-brand-600 p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-brand-100">Total a pagar</p>
        <p className="text-6xl font-extrabold">{cop(total)}</p>
      </div>
    </div>
  )
}

// --- Recargas y servicios (no afectan inventario) ---------------------------
function ServiceSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (line: CartLine) => void }) {
  const tipos = [
    { id: 'recarga', label: 'Recarga celular', emoji: '📱', commissionPct: 4 },
    { id: 'datos', label: 'Paquete de datos', emoji: '🌐', commissionPct: 4 },
    { id: 'servicio', label: 'Pago de servicio', emoji: '🧾', commissionPct: 0 },
    { id: 'giro', label: 'Giro / Baloto', emoji: '💸', commissionPct: 0 },
    { id: 'otro', label: 'Otro servicio', emoji: '🔧', commissionPct: 0 },
  ]
  const [tipo, setTipo] = useState(tipos[0])
  const [amount, setAmount] = useState('')
  const [commission, setCommission] = useState('')
  const [ref, setRef] = useState('')
  const amt = parseCop(amount)
  const suggestedCommission = Math.round((amt * tipo.commissionPct) / 100)
  const comm = commission ? parseCop(commission) : suggestedCommission

  return (
    <Sheet
      open
      onClose={onClose}
      title="Recarga / Servicio"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={amt <= 0}
          onClick={() =>
            onAdd({
              productId: `srv:${tipo.id}:${uid()}`,
              name: `${tipo.label}${ref ? ` (${ref})` : ''}`,
              unit: 'unidad',
              qty: 1,
              unitPrice: amt,
              lineDiscount: 0,
              ivaRate: 0,
              cost: Math.max(0, amt - comm), // la ganancia es la comisión
              emoji: tipo.emoji,
            })
          }
        >
          Agregar · {cop(amt)}
        </button>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-2">
          {tipos.map((t) => (
            <button
              key={t.id}
              onClick={() => setTipo(t)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-semibold ${
                tipo.id === t.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}
            >
              <span className="text-xl">{t.emoji}</span>
              {t.label}
            </button>
          ))}
        </div>
        <div>
          <label className="label">Valor que paga el cliente</label>
          <input autoFocus className="input text-center text-2xl font-bold" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="$ 0" />
          <div className="mt-2 grid grid-cols-4 gap-2">
            {[2000, 5000, 10000, 20000].map((v) => (
              <button key={v} onClick={() => setAmount(String(v))} className="btn btn-secondary py-2 text-xs">{cop(v)}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Tu ganancia (comisión)</label>
            <input className="input" inputMode="numeric" value={commission} onChange={(e) => setCommission(e.target.value)} placeholder={cop(suggestedCommission)} />
          </div>
          <div>
            <label className="label">Referencia (opcional)</label>
            <input className="input" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Celular / factura" />
          </div>
        </div>
        <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Se cobra {cop(amt)} y tu utilidad registrada es {cop(comm)}. No descuenta inventario.
        </p>
      </div>
    </Sheet>
  )
}

// --- Venta manual (producto libre, no afecta inventario) -------------------
function ManualItemSheet({ onClose, onAdd }: { onClose: () => void; onAdd: (line: CartLine) => void }) {
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('1')
  const [cost, setCost] = useState('')
  const [iva, setIva] = useState(0)
  const unitPrice = parseCop(price)
  const n = parseFloat(qty.replace(',', '.')) || 1
  return (
    <Sheet
      open
      onClose={onClose}
      title="Venta manual"
      footer={
        <button
          className="btn btn-primary btn-lg w-full"
          disabled={!name.trim() || unitPrice <= 0}
          onClick={() =>
            onAdd({
              productId: `man:${uid()}`,
              name: name.trim(),
              unit: 'unidad',
              qty: n,
              unitPrice,
              lineDiscount: 0,
              ivaRate: iva,
              cost: parseCop(cost),
              emoji: '✍️',
            })
          }
        >
          Agregar · {cop(unitPrice * n)}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Para productos que llevas en papel o que no están en el catálogo. No afecta el inventario.</p>
        <div><label className="label">Descripción</label><input autoFocus className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Tornillos surtidos" /></div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Valor unitario</label><input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" /></div>
          <div><label className="label">Cantidad</label><input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><label className="label">Costo (opcional)</label><input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$" /></div>
          <div>
            <label className="label">IVA</label>
            <select className="input" value={iva} onChange={(e) => setIva(Number(e.target.value))}>
              <option value={0}>0%</option><option value={5}>5%</option><option value={19}>19%</option>
            </select>
          </div>
        </div>
      </div>
    </Sheet>
  )
}

// --- Modo mostrador (formulario clásico tipo SEITEM) -----------------------
function CounterEntry({
  products, allProducts, customers, vendedores, canDiscount, onAddCode, onAddProduct, onPay, onScan, onManual,
}: {
  products: Product[]
  allProducts: Product[]
  customers: Customer[]
  vendedores: User[]
  canDiscount: boolean
  onAddCode: (code: string, qty: number) => void
  onAddProduct: (p: Product, qty: number) => void
  onPay: () => void
  onScan: () => void
  onManual: () => void
}) {
  const cart = useCart()
  const subtotal = cartSubtotal(cart.lines)
  const total = cartTotal(cart.lines, cart.globalDiscount)
  const [code, setCode] = useState('')
  const [qty, setQty] = useState('1')
  const [results, setResults] = useState<Product[]>([])

  function submit() {
    if (!code.trim()) return
    onAddCode(code, parseFloat(qty.replace(',', '.')) || 1)
    setCode(''); setQty('1'); setResults([])
  }
  function onCodeChange(v: string) {
    setCode(v)
    const q = v.trim().toLowerCase()
    if (q.length < 2) { setResults([]); return }
    setResults(
      allProducts
        .filter((p) => p.active && (p.name.toLowerCase().includes(q) || p.barcode?.includes(v) || p.internalCode?.toLowerCase().includes(q)))
        .slice(0, 5),
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="label">Cliente</label>
          <select className="input" value={cart.meta.customerId ?? ''} onChange={(e) => cart.setMeta({ customerId: e.target.value || undefined })}>
            <option value="">Consumidor Final</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div>
          <label className="label">Vendedor</label>
          <select className="input" value={cart.meta.vendedorId ?? ''} onChange={(e) => { const v = vendedores.find((x) => x.id === e.target.value); cart.setMeta({ vendedorId: v?.id, vendedorName: v?.name }) }}>
            <option value="">Seleccione…</option>
            {vendedores.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
        </div>
      </div>

      <div className="relative">
        <div className="flex gap-2">
          <input className="input flex-1" value={code} autoFocus onChange={(e) => onCodeChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') submit() }} placeholder="Cód. barras / interno o nombre" />
          <input className="input w-16 text-center" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button onClick={submit} className="btn btn-primary px-4">AGREGAR</button>
          <button onClick={onScan} className="btn btn-secondary px-3" aria-label="Escanear"><Icon name="scan" className="h-5 w-5" /></button>
          <button onClick={onManual} className="btn btn-secondary px-3" title="Venta manual">✍️</button>
        </div>
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {results.map((p) => (
              <button key={p.id} onClick={() => { onAddProduct(p, parseFloat(qty.replace(',', '.')) || 1); setCode(''); setQty('1'); setResults([]) }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="truncate">{p.imageEmoji} {p.name}</span>
                <span className="font-semibold text-brand-700">{cop(p.price)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-slate-500">
            <tr>
              <th className="px-2 py-1.5 text-left">Cant.</th>
              <th className="px-2 py-1.5 text-left">Producto</th>
              <th className="px-2 py-1.5 text-right">Vr. Unidad</th>
              <th className="px-2 py-1.5 text-right">Vr. Total</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {cart.lines.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-slate-400">Escanea o escribe el código y pulsa AGREGAR.</td></tr>
            )}
            {cart.lines.map((l) => (
              <tr key={l.productId} className="border-t border-slate-100">
                <td className="px-2 py-1.5">
                  <div className="flex items-center gap-1">
                    <button onClick={() => cart.setQty(l.productId, l.qty - 1)} className="flex h-6 w-6 items-center justify-center rounded bg-slate-100"><Icon name="minus" className="h-3 w-3" /></button>
                    <span className="w-9 text-center font-semibold">{l.unit === 'peso' ? kg(l.qty) : l.qty}</span>
                    <button onClick={() => cart.setQty(l.productId, l.qty + 1)} className="flex h-6 w-6 items-center justify-center rounded bg-brand-100 text-brand-700"><Icon name="plus" className="h-3 w-3" /></button>
                  </div>
                </td>
                <td className="px-2 py-1.5"><span className="line-clamp-1">{l.name}</span></td>
                <td className="px-2 py-1.5 text-right text-slate-500">{cop(l.unitPrice)}</td>
                <td className="px-2 py-1.5 text-right font-semibold">{cop(l.unitPrice * l.qty - l.lineDiscount - (l.promoSaving ?? 0))}</td>
                <td className="px-1"><button onClick={() => cart.remove(l.productId)} className="text-slate-300 hover:text-rose-500"><Icon name="trash" className="h-4 w-4" /></button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canDiscount && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">Descuento $</label>
            <input className="input" inputMode="numeric" value={cart.globalDiscount || ''} onChange={(e) => cart.setGlobalDiscount(parseCop(e.target.value))} placeholder="$ 0" />
          </div>
          <div>
            <label className="label">Motivo del descuento</label>
            <input className="input" value={cart.meta.discountReason ?? ''} onChange={(e) => cart.setMeta({ discountReason: e.target.value })} placeholder="Opcional" />
          </div>
        </div>
      )}

      <div className="card sticky bottom-[64px] flex items-center justify-between p-3">
        <div>
          <p className="text-xs text-slate-400">Subtotal {cop(subtotal)}</p>
          <p className="text-2xl font-extrabold text-brand-700">{cop(total)}</p>
        </div>
        <button onClick={onPay} disabled={!cart.lines.length} className="btn btn-success btn-lg">REALIZAR PAGO</button>
      </div>
    </div>
  )
}

function CatChip({ active, onClick, label, emoji }: { active: boolean; onClick: () => void; label: string; emoji: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-1 rounded-full border px-3 py-1.5 text-sm font-medium ${
        active ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
      }`}
    >
      <span>{emoji}</span> {label}
    </button>
  )
}

// --- Venta por peso / granel ------------------------------------------------
function WeightSheet({ product, onClose, onConfirm }: { product: Product; onClose: () => void; onConfirm: (kg: number) => void }) {
  const [grams, setGrams] = useState('')
  const [reading, setReading] = useState(false)
  const kgQty = (parseInt(grams || '0', 10) || 0) / 1000
  const subtotal = Math.round(product.price * kgQty)

  async function readScale() {
    setReading(true)
    const r = await readWeightOnce(true)
    setReading(false)
    const m = scaleMessage(r)
    toast(m.tone, m.text)
    if (r.ok) setGrams(String(Math.round(r.kg * 1000)))
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={`Pesar · ${product.name}`}
      footer={
        <button className="btn btn-primary btn-lg w-full" disabled={kgQty <= 0} onClick={() => onConfirm(kgQty)}>
          Agregar {kg(kgQty)} · {cop(subtotal)}
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Precio: <b>{cop(product.price)}/kg</b>. Lee la báscula o escribe el peso en gramos.
        </p>
        <button onClick={readScale} disabled={reading} className="btn btn-secondary w-full disabled:opacity-60">
          ⚖️ {reading ? 'Leyendo báscula…' : 'Leer báscula'}
        </button>
        <input
          autoFocus
          className="input text-center text-2xl font-bold"
          inputMode="numeric"
          value={grams}
          onChange={(e) => setGrams(e.target.value)}
          placeholder="0 g"
        />
        <div className="grid grid-cols-4 gap-2">
          {[100, 250, 500, 1000].map((g) => (
            <button key={g} onClick={() => setGrams(String(g))} className="btn btn-secondary py-2 text-sm">
              {g >= 1000 ? '1 kg' : `${g} g`}
            </button>
          ))}
        </div>
        <p className="text-center text-3xl font-extrabold text-brand-700">{cop(subtotal)}</p>
      </div>
    </Sheet>
  )
}

// --- Carrito ----------------------------------------------------------------
function CartSheet({ open, canDiscount, onClose, onCheckout }: { open: boolean; canDiscount: boolean; onClose: () => void; onCheckout: () => void }) {
  const cart = useCart()
  const subtotal = cartSubtotal(cart.lines)
  const total = cartTotal(cart.lines, cart.globalDiscount)
  const [discProduct, setDiscProduct] = useState<CartLine | null>(null)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Carrito"
      footer={
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <span>Subtotal</span>
            <span>{cop(subtotal)}</span>
          </div>
          {canDiscount && (
            <>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Descuento venta</span>
                <input
                  className="w-28 rounded-lg border border-slate-200 px-2 py-1 text-right"
                  inputMode="numeric"
                  value={cart.globalDiscount || ''}
                  onChange={(e) => cart.setGlobalDiscount(parseCop(e.target.value))}
                  placeholder="$ 0"
                />
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => {
                    const rem = total % 50
                    if (rem) cart.setGlobalDiscount(cart.globalDiscount + rem)
                  }}
                  className="text-xs font-medium text-brand-600"
                >
                  Redondear total a $50 ↓
                </button>
              </div>
            </>
          )}
          <div className="flex items-center justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-brand-700">{cop(total)}</span>
          </div>
          <button className="btn btn-primary btn-lg w-full" disabled={!cart.lines.length} onClick={onCheckout}>
            Cobrar {cop(total)}
          </button>
        </div>
      }
    >
      {cart.lines.length === 0 ? (
        <EmptyState emoji="🛒" title="Carrito vacío" hint="Escanea o toca productos para agregarlos." />
      ) : (
        <div className="space-y-2">
          {cart.lines.map((l) => (
            <div key={l.productId} className="flex items-center gap-3 rounded-xl border border-slate-100 p-2.5">
              <span className="text-2xl">{l.emoji ?? '📦'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">{l.name}</p>
                <p className="text-xs text-slate-400">
                  {cop(l.unitPrice)}
                  {l.unit === 'peso' ? '/kg' : ' c/u'}
                  {l.lineDiscount > 0 && <span className="text-emerald-600"> · -{cop(l.lineDiscount)}</span>}
                  {l.promoSaving ? <span className="text-emerald-600"> · {l.promoType === '2x1' ? '2x1' : 'promo'} -{cop(l.promoSaving)}</span> : null}
                </p>
                {canDiscount && (
                  <button onClick={() => setDiscProduct(l)} className="mt-0.5 text-[11px] font-medium text-brand-600">
                    + descuento
                  </button>
                )}
              </div>
              {l.unit === 'peso' ? (
                <span className="text-sm font-semibold">{kg(l.qty)}</span>
              ) : (
                <div className="flex items-center gap-1.5">
                  <button onClick={() => cart.setQty(l.productId, l.qty - 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100">
                    <Icon name="minus" className="h-4 w-4" />
                  </button>
                  <span className="w-6 text-center font-bold">{l.qty}</span>
                  <button onClick={() => cart.setQty(l.productId, l.qty + 1)} className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                    <Icon name="plus" className="h-4 w-4" />
                  </button>
                </div>
              )}
              <div className="w-20 text-right text-sm font-bold text-slate-700">
                {cop(l.unitPrice * l.qty - l.lineDiscount - (l.promoSaving ?? 0))}
              </div>
              <button onClick={() => cart.remove(l.productId)} className="text-slate-300 hover:text-rose-500">
                <Icon name="trash" className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button onClick={() => cart.clear()} className="mt-2 w-full text-center text-sm text-rose-500">
            Vaciar carrito
          </button>
        </div>
      )}

      {discProduct && (
        <Sheet open onClose={() => setDiscProduct(null)} title={`Descuento · ${discProduct.name}`}>
          <DiscountInput
            onApply={(v) => {
              cart.setLineDiscount(discProduct.productId, v)
              setDiscProduct(null)
            }}
          />
        </Sheet>
      )}
    </Sheet>
  )
}

function DiscountInput({ onApply }: { onApply: (v: number) => void }) {
  const [v, setV] = useState('')
  return (
    <div className="space-y-3">
      <input autoFocus className="input text-center text-xl font-bold" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value)} placeholder="$ 0" />
      <button className="btn btn-primary w-full" onClick={() => onApply(parseCop(v))}>
        Aplicar descuento
      </button>
    </div>
  )
}

// --- Pago -------------------------------------------------------------------
interface PayOpts {
  customerId?: string
  customerDoc?: string
  transmitDian: boolean
  note?: string
  redeemPoints?: number
}

function PaymentSheet({ total, defaultCustomerId, onClose, onConfirm }: { total: number; defaultCustomerId?: string; onClose: () => void; onConfirm: (p: Payment[], o: PayOpts) => void }) {
  const tenant = useTenant()
  const customers = useCustomers()
  const [method, setMethod] = useState<PaymentMethod | 'mixto'>('efectivo')
  const [received, setReceived] = useState('')
  const [proof, setProof] = useState<string | undefined>()
  const [customerId, setCustomerId] = useState(defaultCustomerId ?? '')
  const [wantInvoice, setWantInvoice] = useState(false)
  const [customerDoc, setCustomerDoc] = useState('')
  const [note, setNote] = useState('')
  const [transmitDian, setTransmitDian] = useState(tenant?.dian.enabled ?? true)
  const [split, setSplit] = useState<{ method: PaymentMethod; amount: number }[]>([])
  const [redeem, setRedeem] = useState(false)

  // Fidelización: puntos disponibles del cliente seleccionado y su canje
  const loyaltyOn = !!tenant?.loyaltyEnabled
  const redeemVal = tenant?.loyaltyRedeemValue ?? 20
  const selectedCustomer = (customers ?? []).find((c) => c.id === customerId)
  const availablePoints = selectedCustomer?.points ?? 0
  const redeemPointsUsed = redeem && loyaltyOn ? Math.min(availablePoints, Math.floor(total / redeemVal)) : 0
  const redeemValue = redeemPointsUsed * redeemVal
  const chargeTotal = Math.max(0, total - redeemValue)

  const receivedNum = parseCop(received)
  const change = method === 'efectivo' && receivedNum > chargeTotal ? receivedNum - chargeTotal : 0

  const splitSum = split.reduce((s, p) => s + p.amount, 0)
  const splitRemaining = chargeTotal - splitSum

  const methods: { id: PaymentMethod; label: string; emoji: string }[] = [
    { id: 'efectivo', label: 'Efectivo', emoji: '💵' },
    { id: 'nequi', label: 'Nequi', emoji: '📲' },
    { id: 'tarjeta', label: 'Tarjeta', emoji: '💳' },
    { id: 'transferencia', label: 'Transferencia', emoji: '🏦' },
    { id: 'fiado', label: 'Fiado', emoji: '📒' },
  ]

  function buildPayments(): Payment[] | null {
    if (method === 'mixto') {
      if (splitRemaining !== 0) {
        toast('error', 'El pago mixto debe sumar el total exacto')
        return null
      }
      return split.map((p) => ({ method: p.method, amount: p.amount, confirmed: p.method !== 'fiado', proofPhoto: undefined }))
    }
    if (method === 'fiado' && !customerId) {
      toast('error', 'Elige el cliente para el fiado')
      return null
    }
    if (method === 'efectivo' && receivedNum > 0 && receivedNum < chargeTotal) {
      toast('error', 'El efectivo recibido es menor al total')
      return null
    }
    return [{ method, amount: chargeTotal, confirmed: method !== 'fiado', proofPhoto: proof }]
  }

  function pickPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setProof(reader.result as string)
    reader.readAsDataURL(file)
  }

  const needsProof = ['nequi', 'tarjeta', 'transferencia'].includes(method)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Cobrar"
      footer={
        <button
          className="btn btn-success btn-lg w-full"
          onClick={() => {
            const payments = buildPayments()
            if (!payments) return
            onConfirm(payments, {
              customerId: customerId || undefined,
              customerDoc: wantInvoice ? customerDoc : undefined,
              transmitDian,
              note: note.trim() || undefined,
              redeemPoints: redeemPointsUsed || undefined,
            })
          }}
        >
          <Icon name="check" className="h-6 w-6" /> Recibí el pago · Cerrar venta
        </button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-brand-50 p-4 text-center">
          <p className="text-xs uppercase tracking-wide text-brand-600">Total a cobrar</p>
          {redeemValue > 0 ? (
            <>
              <p className="text-lg font-semibold text-slate-400 line-through">{cop(total)}</p>
              <p className="text-4xl font-extrabold text-brand-700">{cop(chargeTotal)}</p>
              <p className="text-xs font-semibold text-emerald-600">− {cop(redeemValue)} con {redeemPointsUsed} puntos</p>
            </>
          ) : (
            <p className="text-4xl font-extrabold text-brand-700">{cop(total)}</p>
          )}
        </div>

        {/* Método */}
        <div className="grid grid-cols-5 gap-1.5">
          {methods.map((m) => (
            <button
              key={m.id}
              onClick={() => setMethod(m.id)}
              className={`flex flex-col items-center gap-1 rounded-xl border py-2 text-[11px] font-semibold ${
                method === m.id ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
              }`}
            >
              <span className="text-xl">{m.emoji}</span>
              {m.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setMethod('mixto')}
          className={`w-full rounded-xl border py-2 text-sm font-semibold ${
            method === 'mixto' ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 text-slate-500'
          }`}
        >
          🔀 Pago mixto (dividir entre métodos)
        </button>

        {/* Efectivo: vuelto */}
        {method === 'efectivo' && (
          <div className="space-y-2">
            <label className="label">¿Con cuánto paga?</label>
            <input className="input text-center text-xl font-bold" inputMode="numeric" value={received} onChange={(e) => setReceived(e.target.value)} placeholder={cop(chargeTotal)} />
            <div className="grid grid-cols-4 gap-2">
              {[chargeTotal, 10000, 20000, 50000].map((b, i) => (
                <button key={i} onClick={() => setReceived(String(b))} className="btn btn-secondary py-2 text-xs">
                  {i === 0 ? 'Exacto' : cop(b)}
                </button>
              ))}
            </div>
            {change > 0 && (
              <div className="rounded-xl bg-emerald-50 p-3 text-center">
                <span className="text-sm text-emerald-600">Cambio / vuelto</span>
                <p className="text-2xl font-bold text-emerald-700">{cop(change)}</p>
              </div>
            )}
          </div>
        )}

        {/* Bre-B: QR/llave de cobro para pagos digitales */}
        {(method === 'nequi' || method === 'transferencia') && tenant && hasBreB(tenant) && (
          <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3 text-center">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-cyan-700">Cobra con Bre-B</p>
            <QRCode value={breBPayload(tenant)} size={150} />
            <p className="mt-2 text-base font-bold text-slate-700">{tenant.breBKey}</p>
            <p className="text-xs text-cyan-700">El cliente escanea o escribe tu llave desde cualquier banco/billetera y paga {cop(chargeTotal)}.</p>
          </div>
        )}

        {/* Nequi / Tarjeta / Transferencia: comprobante */}
        {needsProof && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <p className="text-sm text-slate-600">
              Intentando confirmación automática… <span className="text-amber-600">(se conecta con el banco/Nequi después)</span>
            </p>
            <label className="btn btn-secondary w-full cursor-pointer">
              📷 Adjuntar foto del comprobante
              <input type="file" accept="image/*" capture="environment" className="hidden" onChange={pickPhoto} />
            </label>
            {proof && <img src={proof} alt="comprobante" className="mx-auto h-24 rounded-lg object-cover" />}
          </div>
        )}

        {/* Fiado / cliente (también cuando hay programa de puntos) */}
        {(method === 'fiado' || method === 'mixto' || loyaltyOn) && (
          <div>
            <label className="label">Cliente {method === 'fiado' ? '(obligatorio)' : loyaltyOn ? '(para acumular puntos)' : ''}</label>
            <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setRedeem(false) }}>
              <option value="">Sin cliente</option>
              {(customers ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.creditBalance > 0 ? `(debe ${cop(c.creditBalance)})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Canje de puntos de fidelización */}
        {loyaltyOn && selectedCustomer && availablePoints > 0 && (
          <label className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <span className="text-sm text-amber-800">
              ⭐ {selectedCustomer.name} tiene <b>{availablePoints} puntos</b> (≈ {cop(availablePoints * redeemVal)})
            </span>
            <input type="checkbox" checked={redeem} onChange={(e) => setRedeem(e.target.checked)} className="h-5 w-5" />
          </label>
        )}

        {/* Pago mixto */}
        {method === 'mixto' && (
          <div className="space-y-2 rounded-xl bg-slate-50 p-3">
            <p className="text-sm font-semibold text-slate-600">Falta por cubrir: {cop(splitRemaining)}</p>
            {split.map((p, i) => (
              <div key={i} className="flex items-center justify-between rounded-lg bg-white px-3 py-2 text-sm">
                <span className="capitalize">{p.method}</span>
                <span className="font-semibold">{cop(p.amount)}</span>
                <button onClick={() => setSplit(split.filter((_, j) => j !== i))} className="text-rose-400">✕</button>
              </div>
            ))}
            {splitRemaining > 0 && (
              <div className="grid grid-cols-3 gap-1.5">
                {(['efectivo', 'nequi', 'tarjeta', 'transferencia', 'fiado'] as PaymentMethod[]).map((m) => (
                  <button key={m} onClick={() => setSplit([...split, { method: m, amount: splitRemaining }])} className="rounded-lg border border-slate-200 bg-white py-1.5 text-xs font-medium capitalize">
                    + {m}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Factura electrónica */}
        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={wantInvoice} onChange={(e) => setWantInvoice(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">El cliente pide factura electrónica (CC/NIT)</span>
        </label>
        {wantInvoice && (
          <input className="input" value={customerDoc} onChange={(e) => setCustomerDoc(e.target.value)} placeholder="CC o NIT del cliente" />
        )}

        {/* Nota / observaciones de la venta */}
        <div>
          <label className="label">Nota / observaciones (opcional)</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Detalle de la venta…" />
        </div>

        {/* DIAN */}
        <label className="flex items-center gap-3 rounded-xl border border-brand-100 bg-brand-50/50 px-4 py-3">
          <input type="checkbox" checked={transmitDian} onChange={(e) => setTransmitDian(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-700">
            Generar documento DIAN ahora <span className="text-slate-400">(si no, queda pendiente para revisar)</span>
          </span>
        </label>
      </div>
    </Sheet>
  )
}

// --- Recibo -----------------------------------------------------------------
function ReceiptSheet({ sale, onClose }: { sale: Sale; onClose: () => void }) {
  const tenant = useTenant()
  const locations = useLocations()
  const location = locations?.find((l) => l.id === sale.locationId)
  const [phone, setPhone] = useState('')

  if (!tenant || !location) return null
  const text = receiptText(sale, tenant, location)

  return (
    <Sheet
      open
      onClose={onClose}
      title="¡Venta lista! 🎉"
      footer={<button className="btn btn-primary btn-lg w-full" onClick={onClose}>Nueva venta</button>}
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-emerald-50 p-4 text-center">
          <p className="text-sm text-emerald-600">Total cobrado</p>
          <p className="text-3xl font-extrabold text-emerald-700">{cop(sale.total)}</p>
          <p className="mt-1 text-xs text-emerald-600">
            {sale.dianStatus === 'enviado' ? `DIAN ✓ ${sale.dianDocNumber}` : 'DIAN pendiente de transmitir'}
          </p>
        </div>

        <p className="text-center text-sm font-semibold text-slate-600">Entregar recibo al cliente:</p>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => printReceipt(sale, tenant, location)} className="btn btn-secondary flex-col py-3 text-xs">
            <Icon name="print" className="h-6 w-6" /> Imprimir
          </button>
          <a href={mailtoLink('', `Recibo ${tenant.businessName}`, text)} className="btn btn-secondary flex-col py-3 text-xs">
            <Icon name="mail" className="h-6 w-6" /> Correo
          </a>
          <a
            href={waLink(phone || '57', text)}
            target="_blank"
            rel="noreferrer"
            className="btn btn-secondary flex-col py-3 text-xs"
            onClick={() => !phone && toast('info', 'Tip: escribe el celular para enviarlo directo')}
          >
            <Icon name="whatsapp" className="h-6 w-6" /> WhatsApp
          </a>
        </div>
        <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Celular para WhatsApp (ej. 3001234567)" />

        <details className="rounded-xl bg-slate-50 p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-slate-600">Ver recibo</summary>
          <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-slate-600">{text}</pre>
        </details>
      </div>
    </Sheet>
  )
}
