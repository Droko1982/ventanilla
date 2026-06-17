import { useMemo, useState } from 'react'
import {
  useActiveLocationId, useProducts, useStockForLocation, useCurrentUser, useTenant,
} from '@/hooks/data'
import { db } from '@/data/db'
import { stockMove, setStockExpiry, audit, bulkPriceChange, runExpiryMarkdowns } from '@/data/repo'
import { Segmented, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop, kg } from '@/lib/money'
import { daysUntil } from '@/lib/format'
import { useSession } from '@/store/session'
import { printLabels } from '@/lib/label'
import { internalCode } from '@/lib/id'
import type { Product, Stock } from '@/types'

type Mode = 'entrada' | 'salida' | 'precio' | 'seccion' | 'vence' | 'etiquetas'

export default function AjustesInventario() {
  const tenantId = useSession((s) => s.tenantId)!
  const locationId = useActiveLocationId()
  const products = useProducts()
  const stock = useStockForLocation(locationId)
  const user = useCurrentUser()
  const [mode, setMode] = useState<Mode>('entrada')

  const stockMap = useMemo(() => {
    const m = new Map<string, Stock>()
    for (const s of stock ?? []) m.set(s.productId, s)
    return m
  }, [stock])

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader title="Ajustes de inventario" subtitle="Entradas, salidas, precio, sección y vencimientos" />
      <div className="mb-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'entrada', label: '⬆️ Entrada' },
            { value: 'salida', label: '⬇️ Salida' },
            { value: 'precio', label: '💲 Precio' },
            { value: 'seccion', label: '📍 Sección' },
            { value: 'vence', label: '⏳ Vence' },
            { value: 'etiquetas', label: '🏷️ Etiquetas' },
          ]}
        />
      </div>

      {mode === 'etiquetas' && <LabelPanel products={(products ?? []).filter((p) => p.active)} tenantId={tenantId} />}

      {(mode === 'entrada' || mode === 'salida') && user && (
        <MoveForm
          mode={mode}
          products={(products ?? []).filter((p) => p.active)}
          stockMap={stockMap}
          tenantId={tenantId}
          locationId={locationId}
          userId={user.id}
          userName={user.name}
        />
      )}

      {(mode === 'precio' || mode === 'seccion') && user && (
        <QuickEdit
          field={mode}
          products={(products ?? []).filter((p) => p.active)}
          stockMap={stockMap}
          userId={user.id}
          userName={user.name}
          tenantId={tenantId}
          locationId={locationId}
        />
      )}

      {mode === 'vence' && user && (
        <ExpiryManager
          products={(products ?? []).filter((p) => p.active && p.perishable)}
          stockMap={stockMap}
          userId={user.id}
          userName={user.name}
          tenantId={tenantId}
          locationId={locationId}
        />
      )}
    </div>
  )
}

// --- Etiquetas con código de barras (impresión en lote) --------------------
function LabelPanel({ products, tenantId }: { products: Product[]; tenantId: string }) {
  const tenant = useTenant()
  const [copies, setCopies] = useState('1')
  const [busy, setBusy] = useState(false)
  const sinCodigo = products.filter((p) => !p.barcode && !p.internalCode)
  const biz = tenant?.businessName ?? 'Ventanilla'

  async function generarCodigos() {
    if (!sinCodigo.length) return toast('info', 'Todos los productos ya tienen código')
    setBusy(true)
    try {
      for (const p of sinCodigo) {
        await db.products.update(p.id, { internalCode: internalCode() })
      }
      await audit({ tenantId, locationId: '', userId: '', userName: 'sistema', action: 'generó códigos internos', entity: 'producto', entityId: '', detail: `${sinCodigo.length} productos` })
      toast('success', `${sinCodigo.length} producto(s) ahora tienen código`)
    } finally {
      setBusy(false)
    }
  }

  function imprimir(list: Product[]) {
    const n = Math.max(1, parseInt(copies || '1', 10) || 1)
    const expanded: Product[] = []
    for (const p of list) for (let i = 0; i < n; i++) expanded.push(p)
    if (!expanded.length) return toast('info', 'No hay productos para imprimir')
    printLabels(expanded, biz)
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-500">
        Imprime etiquetas con <b>código de barras real</b> (Code 128). Los productos sin
        código de barras reciben un código interno para poder escanearlos.
      </p>
      {sinCodigo.length > 0 && (
        <div className="rounded-xl bg-amber-50 p-3 text-sm">
          <p className="font-semibold text-amber-700">{sinCodigo.length} producto(s) sin código.</p>
          <button onClick={generarCodigos} disabled={busy} className="btn btn-secondary mt-2 text-sm">
            {busy ? 'Generando…' : '🔢 Generar códigos internos faltantes'}
          </button>
        </div>
      )}
      <label className="flex items-center gap-2 text-sm text-slate-600">
        Copias por producto:
        <input value={copies} onChange={(e) => setCopies(e.target.value)} inputMode="numeric" className="input w-20" />
      </label>
      <button onClick={() => imprimir(products)} className="btn btn-primary w-full">
        🖨️ Imprimir etiquetas de todos los activos ({products.length})
      </button>
      <button onClick={() => imprimir(products.filter((p) => !p.barcode && p.internalCode))} className="btn btn-secondary w-full text-sm">
        Solo los que usan código interno
      </button>
      <p className="text-xs text-slate-400">
        Se abre la ventana de impresión: elige tu impresora de etiquetas o una térmica.
      </p>
    </div>
  )
}

// --- Entrada / Salida con motivo -------------------------------------------
function MoveForm({ mode, products, stockMap, tenantId, locationId, userId, userName }: {
  mode: 'entrada' | 'salida'; products: Product[]; stockMap: Map<string, Stock>
  tenantId: string; locationId: string; userId: string; userName: string
}) {
  const [code, setCode] = useState('')
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('')
  const [expiry, setExpiry] = useState('')
  const [results, setResults] = useState<Product[]>([])
  const [sel, setSel] = useState<Product | null>(null)
  const [done, setDone] = useState<{ name: string; delta: number }[]>([])

  const reasons = mode === 'entrada'
    ? ['Regalo del proveedor', 'Promoción', 'Ajuste de conteo', 'Producción / desempaque']
    : ['Avería / vencido', 'Regalo a cliente', 'Consumo interno', 'Ajuste de conteo']

  function onCode(v: string) {
    setCode(v); setSel(null)
    const q = v.trim().toLowerCase()
    if (q.length < 2) { setResults([]); return }
    const exact = products.find((p) => p.barcode === v.trim() || p.internalCode === v.trim())
    if (exact) { setSel(exact); setResults([]); return }
    setResults(products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6))
  }

  async function apply() {
    if (!sel) return toast('error', 'Elige el producto')
    const n = parseFloat(qty.replace(',', '.')) || 0
    if (n <= 0) return toast('error', 'Cantidad inválida')
    const delta = mode === 'entrada' ? n : -n
    await stockMove({
      tenantId, locationId, productId: sel.id, delta,
      reason: reason || (mode === 'entrada' ? 'Entrada' : 'Salida'), userId, userName,
      expiry: mode === 'entrada' && sel.perishable && expiry ? expiry : undefined,
    })
    toast('success', mode === 'entrada' ? 'Entrada registrada' : 'Salida registrada')
    setDone((d) => [{ name: sel.name, delta }, ...d])
    setCode(''); setQty(''); setReason(''); setExpiry(''); setSel(null); setResults([])
  }

  return (
    <div className="space-y-3">
      <div className="relative">
        <label className="label">Producto</label>
        <input className="input" value={sel ? sel.name : code} onChange={(e) => onCode(e.target.value)} placeholder="Cód. barras / interno o nombre" />
        {results.length > 0 && (
          <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            {results.map((p) => (
              <button key={p.id} onClick={() => { setSel(p); setCode(p.name); setResults([]) }} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-slate-50">
                <span className="truncate">{p.imageEmoji} {p.name}</span>
                <span className="text-xs text-slate-400">stock {stockMap.get(p.id)?.quantity ?? 0}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      {sel && <p className="text-xs text-slate-400">Existencia actual: <b>{sel.unit === 'peso' ? kg(stockMap.get(sel.id)?.quantity ?? 0) : (stockMap.get(sel.id)?.quantity ?? 0)}</b></p>}
      <div>
        <label className="label">Cantidad</label>
        <input className="input" inputMode="decimal" value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0" />
      </div>
      <div>
        <label className="label">Motivo</label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Motivo del ajuste" />
        <div className="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
          {reasons.map((r) => <button key={r} onClick={() => setReason(r)} className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-500">{r}</button>)}
        </div>
      </div>
      {mode === 'entrada' && sel?.perishable && (
        <div>
          <label className="label">⏳ Vencimiento del lote (perecedero)</label>
          <input className="input" type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <p className="mt-1 text-xs text-slate-400">Se usará para alertar antes de que se venza.</p>
        </div>
      )}
      <button onClick={apply} className={`btn btn-lg w-full ${mode === 'entrada' ? 'btn-success' : 'btn-danger'}`}>
        {mode === 'entrada' ? 'Registrar entrada' : 'Registrar salida'}
      </button>

      {done.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-slate-400">Movimientos de esta sesión</p>
          {done.map((d, i) => (
            <div key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
              <span className="truncate text-slate-600">{d.name}</span>
              <span className={`font-semibold ${d.delta >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{d.delta >= 0 ? '+' : ''}{d.delta}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Cambio rápido de precio / sección -------------------------------------
function QuickEdit({ field, products, stockMap, userId, userName, tenantId, locationId }: {
  field: 'precio' | 'seccion'; products: Product[]; stockMap: Map<string, Stock>
  userId: string; userName: string; tenantId: string; locationId: string
}) {
  const [search, setSearch] = useState('')
  const [vals, setVals] = useState<Record<string, string>>({})
  const [bulkPct, setBulkPct] = useState('')

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products.slice(0, 20)
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(search) || p.section?.toLowerCase().includes(q)).slice(0, 30)
  }, [products, search])

  async function applyBulk() {
    const pct = parseFloat(bulkPct.replace(',', '.'))
    if (!pct || isNaN(pct)) return toast('error', 'Escribe un % (ej. 10 o -5)')
    if (!confirm(`¿Aplicar ${pct > 0 ? '+' : ''}${pct}% al precio de ${list.length} producto(s) mostrados?`)) return
    const n = await bulkPriceChange(list, pct, { tenantId, locationId, userId, userName })
    toast('success', `${n} precio(s) actualizados`)
    setBulkPct('')
  }

  async function save(p: Product) {
    const raw = vals[p.id]
    if (raw === undefined) return
    if (field === 'precio') {
      const price = parseCop(raw)
      if (price <= 0) return
      await db.products.update(p.id, { price })
      await audit({ tenantId, locationId, userId, userName, action: 'cambió precio', entity: 'producto', entityId: p.id, detail: `${p.name}: ${cop(p.price)} → ${cop(price)}` })
    } else {
      await db.products.update(p.id, { section: raw.trim() || undefined })
      await audit({ tenantId, locationId, userId, userName, action: 'cambió sección', entity: 'producto', entityId: p.id, detail: `${p.name} → ${raw.trim()}` })
    }
    toast('success', 'Guardado')
    setVals((v) => { const n = { ...v }; delete n[p.id]; return n })
  }

  return (
    <div>
      <div className="relative mb-3">
        <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
        <input className="input pl-10" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar producto…" />
      </div>

      {field === 'precio' && (
        <div className="mb-3 rounded-xl bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">Cambio masivo (a los {list.length} mostrados; usa el buscador para acotar)</p>
          <div className="flex items-center gap-2">
            <input className="input flex-1 text-center" inputMode="numeric" value={bulkPct} onChange={(e) => setBulkPct(e.target.value)} placeholder="% ej. 10 (sube) o -5 (baja)" />
            <button onClick={applyBulk} className="btn btn-primary px-4 text-sm">Aplicar</button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">Redondea a $50.</p>
        </div>
      )}
      <div className="space-y-2">
        {list.map((p) => (
          <div key={p.id} className="card flex items-center gap-2 p-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-700">{p.imageEmoji} {p.name}</p>
              <p className="text-xs text-slate-400">
                {field === 'precio' ? `Actual ${cop(p.price)}` : `Sección: ${p.section ?? '—'}`} · stock {stockMap.get(p.id)?.quantity ?? 0}
              </p>
            </div>
            <input
              className="w-28 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm"
              inputMode={field === 'precio' ? 'numeric' : 'text'}
              value={vals[p.id] ?? (field === 'precio' ? '' : p.section ?? '')}
              onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') save(p) }}
              placeholder={field === 'precio' ? 'Nuevo $' : 'Sección'}
            />
            <button onClick={() => save(p)} className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-white"><Icon name="check" className="h-5 w-5" /></button>
          </div>
        ))}
        {list.length === 0 && <EmptyState emoji="🔍" title="Sin productos" />}
      </div>
    </div>
  )
}

// --- Control de vencimientos (perecederos) ---------------------------------
function ExpiryManager({ products, stockMap, userId, userName, tenantId, locationId }: {
  products: Product[]; stockMap: Map<string, Stock>
  userId: string; userName: string; tenantId: string; locationId: string
}) {
  const [vals, setVals] = useState<Record<string, string>>({})
  const tenant = useTenant()
  const mdDays = tenant?.markdownDays ?? 3
  const mdPct = tenant?.markdownPercent ?? 20

  async function applyMarkdownNow() {
    const n = await runExpiryMarkdowns(tenantId, mdDays, mdPct)
    toast(n > 0 ? 'success' : 'info', n > 0 ? `${n} producto(s) rebajado(s) ${mdPct}%` : 'Nada por rebajar ahora')
  }
  async function toggleAutoMarkdown(v: boolean) {
    await db.tenants.update(tenantId, { autoMarkdownExpiry: v })
    toast('success', v ? 'Auto-rebaja activada' : 'Auto-rebaja desactivada')
  }

  // Ordena: primero lo que vence antes (o ya vencido), luego sin fecha.
  const list = useMemo(() => {
    return [...products].sort((a, b) => {
      const da = stockMap.get(a.id)?.nearestExpiry
      const dbx = stockMap.get(b.id)?.nearestExpiry
      if (da && dbx) return da < dbx ? -1 : 1
      if (da) return -1
      if (dbx) return 1
      return 0
    })
  }, [products, stockMap])

  async function saveDate(p: Product) {
    const raw = vals[p.id]
    if (raw === undefined) return
    await setStockExpiry(locationId, p.id, raw || undefined, { tenantId, userId, userName, productName: p.name })
    toast('success', raw ? 'Vencimiento actualizado' : 'Fecha quitada')
    setVals((v) => { const n = { ...v }; delete n[p.id]; return n })
  }

  async function darDeBaja(p: Product) {
    const st = stockMap.get(p.id)
    const qty = st?.quantity ?? 0
    if (qty <= 0) return toast('error', 'Sin existencias para dar de baja')
    await stockMove({ tenantId, locationId, productId: p.id, delta: -qty, reason: 'Vencido / merma', userId, userName })
    await setStockExpiry(locationId, p.id, undefined, { tenantId, userId, userName, productName: p.name })
    toast('success', `${p.name}: ${qty} dado(s) de baja por vencimiento`)
  }

  if (products.length === 0) {
    return <EmptyState emoji="⏳" title="Sin perecederos" hint="Marca un producto como “perecedero” en su ficha para controlar su vencimiento." />
  }

  return (
    <div className="space-y-2">
      <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Fija la fecha de vencimiento del lote en góndola. Te avisamos antes de que se venza para rebajarlo o retirarlo.
      </p>

      {/* Auto-rebaja de los por vencer */}
      <div className="rounded-xl border border-slate-100 bg-white p-3">
        <button onClick={applyMarkdownNow} className="btn btn-primary w-full text-sm">🏷️ Rebajar −{mdPct}% los que vencen en ≤{mdDays} días</button>
        <label className="mt-2 flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2">
          <input type="checkbox" checked={tenant?.autoMarkdownExpiry ?? false} onChange={(e) => toggleAutoMarkdown(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Rebajar automáticamente cada día</span>
        </label>
        <p className="mt-1 text-[11px] text-slate-400">La rebaja se quita sola cuando el producto se reabastece o se agota.</p>
      </div>

      {list.map((p) => {
        const st = stockMap.get(p.id)
        const d = st?.nearestExpiry ? daysUntil(st.nearestExpiry) : null
        const tone = d === null ? 'text-slate-400'
          : d < 0 ? 'text-rose-600 font-semibold'
          : d <= 7 ? 'text-amber-600 font-semibold'
          : 'text-emerald-600'
        const etiqueta = d === null ? 'Sin fecha'
          : d < 0 ? `Vencido hace ${-d} día(s)`
          : d === 0 ? 'Vence hoy'
          : `Vence en ${d} día(s)`
        return (
          <div key={p.id} className="card p-2.5">
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">{p.imageEmoji} {p.name}</p>
                <p className={`text-xs ${tone}`}>{etiqueta} · stock {st?.quantity ?? 0}</p>
              </div>
              <input
                className="w-36 rounded-lg border border-slate-200 px-2 py-1.5 text-sm"
                type="date"
                value={vals[p.id] ?? (st?.nearestExpiry?.slice(0, 10) ?? '')}
                onChange={(e) => setVals((v) => ({ ...v, [p.id]: e.target.value }))}
              />
              <button onClick={() => saveDate(p)} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-white"><Icon name="check" className="h-5 w-5" /></button>
            </div>
            {d !== null && d <= 7 && (st?.quantity ?? 0) > 0 && (
              <button onClick={() => darDeBaja(p)} className="mt-2 w-full rounded-lg bg-rose-50 py-1.5 text-xs font-semibold text-rose-600">
                Dar de baja por vencimiento (merma)
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
