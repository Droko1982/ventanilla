import { useMemo, useState } from 'react'
import {
  useActiveLocationId, useProducts, useStockForLocation, useCurrentUser,
} from '@/hooks/data'
import { db } from '@/data/db'
import { stockMove, audit } from '@/data/repo'
import { Segmented, EmptyState, PageHeader } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, parseCop, kg } from '@/lib/money'
import { useSession } from '@/store/session'
import type { Product, Stock } from '@/types'

type Mode = 'entrada' | 'salida' | 'precio' | 'seccion'

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
      <PageHeader title="Ajustes de inventario" subtitle="Entradas, salidas, precio y sección" />
      <div className="mb-4">
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'entrada', label: '⬆️ Entrada' },
            { value: 'salida', label: '⬇️ Salida' },
            { value: 'precio', label: '💲 Precio' },
            { value: 'seccion', label: '📍 Sección' },
          ]}
        />
      </div>

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
    await stockMove({ tenantId, locationId, productId: sel.id, delta, reason: reason || (mode === 'entrada' ? 'Entrada' : 'Salida'), userId, userName })
    toast('success', mode === 'entrada' ? 'Entrada registrada' : 'Salida registrada')
    setDone((d) => [{ name: sel.name, delta }, ...d])
    setCode(''); setQty(''); setReason(''); setSel(null); setResults([])
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

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products.slice(0, 20)
    return products.filter((p) => p.name.toLowerCase().includes(q) || p.barcode?.includes(search) || p.section?.toLowerCase().includes(q)).slice(0, 30)
  }, [products, search])

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
