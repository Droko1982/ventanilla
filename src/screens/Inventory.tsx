import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  useActiveLocationId, useProducts, useCategories, useSuppliers,
  useStockForLocation, useLocations, useCurrentUser, useTenant,
} from '@/hooks/data'
import { db } from '@/data/db'
import { adjustStock, recalcThresholds, transferStock } from '@/data/repo'
import { printLabel } from '@/lib/label'
import { ProductForm } from '@/components/ProductForm'
import { Sheet } from '@/components/Sheet'
import { Segmented, EmptyState, PageHeader, ProductThumb } from '@/components/ui'
import { Icon } from '@/components/icons'
import { toast } from '@/components/Toast'
import { cop, kg } from '@/lib/money'
import { daysUntil, timeAgo } from '@/lib/format'
import { uid } from '@/lib/id'
import { useSession } from '@/store/session'
import type { Product, Stock } from '@/types'

export default function Inventory() {
  const tenantId = useSession((s) => s.tenantId)!
  const role = useSession((s) => s.role)
  const locationId = useActiveLocationId()
  const products = useProducts()
  const categories = useCategories()
  const suppliers = useSuppliers()
  const locations = useLocations()
  const stock = useStockForLocation(locationId)
  const user = useCurrentUser()

  const [search, setSearch] = useState('')
  const [view, setView] = useState<'todos' | 'bajo' | 'vencer'>('todos')
  const [addOpen, setAddOpen] = useState(false)
  const [editProduct, setEditProduct] = useState<Product | null>(null)
  const [detail, setDetail] = useState<{ product: Product; stock: Stock } | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [countOpen, setCountOpen] = useState(false)

  const stockMap = useMemo(() => {
    const m = new Map<string, Stock>()
    for (const s of stock ?? []) m.set(s.productId, s)
    return m
  }, [stock])

  const catMap = useMemo(() => new Map((categories ?? []).map((c) => [c.id, c])), [categories])
  const activeLoc = locations?.find((l) => l.id === locationId)

  const rows = useMemo(() => {
    let list = (products ?? []).filter((p) => p.active)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.barcode?.includes(search) ||
          p.brand?.toLowerCase().includes(q) ||
          p.description?.toLowerCase().includes(q),
      )
    }
    const withStock = list
      .map((p) => ({ product: p, stock: stockMap.get(p.id) }))
      .filter((r): r is { product: Product; stock: Stock } => !!r.stock)
    if (view === 'bajo') return withStock.filter((r) => r.stock.quantity <= r.stock.reorderThreshold)
    if (view === 'vencer') return withStock.filter((r) => r.stock.nearestExpiry && daysUntil(r.stock.nearestExpiry) <= 30)
    return withStock
  }, [products, stockMap, search, view])

  if (!locationId) return <EmptyState emoji="🏪" title="Sin local" hint="Selecciona un local arriba." />

  return (
    <div>
      <PageHeader
        title="Inventario"
        subtitle={`${activeLoc?.name ?? ''}`}
        right={
          <button onClick={() => setAddOpen(true)} className="btn btn-primary px-3 py-2 text-sm">
            <Icon name="plus" className="h-5 w-5" /> Producto
          </button>
        }
      />

      <div className="mb-3 flex gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar…" className="input pl-10" />
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="flex-1">
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'bajo', label: 'Stock bajo' },
              { value: 'vencer', label: 'Por vencer' },
            ]}
          />
        </div>
      </div>

      {role === 'admin' && (
        <div className="mb-3 flex gap-2">
          <button onClick={() => setImportOpen(true)} className="btn btn-secondary flex-1 py-2 text-sm">
            <Icon name="doc" className="h-5 w-5" /> Importar Excel/CSV
          </button>
          <button
            onClick={async () => {
              const n = await recalcThresholds(tenantId, locationId)
              toast('success', `Umbrales recalculados (${n} productos)`)
            }}
            className="btn btn-secondary flex-1 py-2 text-sm"
          >
            <Icon name="chart" className="h-5 w-5" /> Recalcular umbrales
          </button>
        </div>
      )}

      {role === 'admin' && (
        <button onClick={() => setCountOpen(true)} className="btn btn-secondary mb-3 w-full py-2 text-sm">
          <Icon name="box" className="h-5 w-5" /> Toma física de inventario
        </button>
      )}

      <div className="space-y-2">
        {rows.map(({ product, stock }) => {
          const low = stock.quantity <= stock.reorderThreshold
          const dExp = stock.nearestExpiry ? daysUntil(stock.nearestExpiry) : null
          const cat = catMap.get(product.categoryId)
          return (
            <button
              key={product.id}
              onClick={() => setDetail({ product, stock })}
              className="flex w-full items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left shadow-sm active:scale-[0.99]"
            >
              <ProductThumb photo={product.photo} emoji={product.imageEmoji} size={44} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">{product.name}</p>
                <p className="text-xs text-slate-400">
                  {cat?.emoji} {cat?.name} · {cop(product.price)}
                  {product.unit === 'peso' ? '/kg' : ''}
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {low && <span className="chip bg-amber-100 text-amber-700">Reordenar</span>}
                  {dExp !== null && dExp <= 7 && <span className="chip bg-rose-100 text-rose-700">Vence en {dExp}d</span>}
                  {dExp !== null && dExp > 7 && dExp <= 30 && <span className="chip bg-orange-100 text-orange-600">Vence en {dExp}d</span>}
                </div>
              </div>
              <div className="text-right">
                <p className={`text-lg font-bold ${low ? 'text-amber-600' : 'text-slate-700'}`}>
                  {product.unit === 'peso' ? kg(stock.quantity) : stock.quantity}
                </p>
                <p className="text-[11px] text-slate-400">umbral {stock.reorderThreshold}</p>
              </div>
            </button>
          )
        })}
        {rows.length === 0 && <EmptyState emoji="📦" title="Sin productos" hint="Agrega productos o cambia el filtro." />}
      </div>

      {addOpen && products && categories && suppliers && locations && (
        <ProductForm open={addOpen} onClose={() => setAddOpen(false)} tenantId={tenantId} locations={locations} categories={categories} suppliers={suppliers} defaultLocationId={locationId} />
      )}

      {editProduct && products && categories && suppliers && locations && (
        <ProductForm open onClose={() => setEditProduct(null)} tenantId={tenantId} locations={locations} categories={categories} suppliers={suppliers} product={editProduct} />
      )}

      {detail && (
        <ProductDetailSheet
          product={detail.product}
          stock={detail.stock}
          onClose={() => setDetail(null)}
          onEdit={() => {
            setEditProduct(detail.product)
            setDetail(null)
          }}
          userId={user!.id}
          userName={user!.name}
          tenantId={tenantId}
          locationId={locationId}
        />
      )}

      {importOpen && <ImportSheet tenantId={tenantId} locationId={locationId} categories={categories ?? []} locations={locations ?? []} onClose={() => setImportOpen(false)} />}

      {countOpen && (
        <CountSheet
          products={(products ?? []).filter((p) => p.active && p.unit === 'unidad')}
          stockMap={stockMap}
          tenantId={tenantId}
          locationId={locationId}
          userId={user!.id}
          userName={user!.name}
          onClose={() => setCountOpen(false)}
        />
      )}
    </div>
  )
}

// --- Toma física: contar y ajustar el inventario ---------------------------
function CountSheet({
  products, stockMap, tenantId, locationId, userId, userName, onClose,
}: {
  products: Product[]
  stockMap: Map<string, Stock>
  tenantId: string
  locationId: string
  userId: string
  userName: string
  onClose: () => void
}) {
  const [counts, setCounts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const diffs = products
    .map((p) => {
      const st = stockMap.get(p.id)
      const sys = st?.quantity ?? 0
      const raw = counts[p.id]
      const counted = raw === undefined || raw === '' ? null : parseInt(raw, 10) || 0
      return { product: p, sys, counted, diff: counted === null ? 0 : counted - sys }
    })
    .filter((d) => d.counted !== null && d.diff !== 0)

  async function apply() {
    setSaving(true)
    for (const d of diffs) {
      await adjustStock({
        tenantId, locationId, productId: d.product.id,
        newQty: d.counted!, userId, userName, reason: 'Toma física',
      })
    }
    toast('success', `Ajustados ${diffs.length} productos`)
    setSaving(false)
    onClose()
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="Toma física de inventario"
      footer={
        <button className="btn btn-primary btn-lg w-full" disabled={!diffs.length || saving} onClick={apply}>
          {saving ? 'Aplicando…' : `Aplicar ${diffs.length} ajustes`}
        </button>
      }
    >
      <p className="mb-3 text-sm text-slate-500">Escribe lo que cuentas físicamente. El sistema marca las diferencias y ajusta el stock.</p>
      <div className="space-y-1.5">
        {products.map((p) => {
          const sys = stockMap.get(p.id)?.quantity ?? 0
          const raw = counts[p.id]
          const counted = raw === undefined || raw === '' ? null : parseInt(raw, 10) || 0
          const diff = counted === null ? null : counted - sys
          return (
            <div key={p.id} className="flex items-center gap-2 rounded-lg border border-slate-100 p-2">
              <span className="min-w-0 flex-1 truncate text-sm text-slate-700">{p.name}</span>
              <span className="w-12 text-right text-xs text-slate-400">sis {sys}</span>
              <input
                className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
                inputMode="numeric"
                value={raw ?? ''}
                onChange={(e) => setCounts({ ...counts, [p.id]: e.target.value })}
                placeholder="—"
              />
              <span className={`w-10 text-right text-xs font-semibold ${diff === null ? 'text-slate-300' : diff === 0 ? 'text-emerald-600' : diff < 0 ? 'text-rose-600' : 'text-amber-600'}`}>
                {diff === null ? '' : `${diff > 0 ? '+' : ''}${diff}`}
              </span>
            </div>
          )
        })}
      </div>
    </Sheet>
  )
}

// --- Detalle de producto: ajustar stock, ver otros locales, trasladar -------
function ProductDetailSheet({
  product, stock, onClose, onEdit, userId, userName, tenantId, locationId,
}: {
  product: Product; stock: Stock; onClose: () => void; onEdit: () => void
  userId: string; userName: string; tenantId: string; locationId: string
}) {
  const locations = useLocations()
  const tenant = useTenant()
  const [newQty, setNewQty] = useState(String(stock.quantity))
  const allStock = useLiveQuery(() => db.stock.where('productId').equals(product.id).toArray(), [product.id])
  const movements = useLiveQuery(
    async () => {
      const all = await db.stockMovements.where('productId').equals(product.id).reverse().toArray()
      return all.filter((m) => m.locationId === locationId).slice(0, 20)
    },
    [product.id, locationId],
  )
  const [transferTo, setTransferTo] = useState('')
  const [transferQty, setTransferQty] = useState('')
  const dExp = stock.nearestExpiry ? daysUntil(stock.nearestExpiry) : null

  async function applyDiscount() {
    const newPrice = Math.round(product.price * 0.85)
    await db.products.update(product.id, { price: newPrice })
    toast('success', `Descuento aplicado: ${cop(product.price)} → ${cop(newPrice)}`)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={product.name}>
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <ProductThumb photo={product.photo} emoji={product.imageEmoji} size={64} />
          <div className="min-w-0">
            {product.brand && <p className="text-xs font-medium text-slate-400">{product.brand}</p>}
            <p className="text-2xl font-bold text-brand-700">
              {cop(product.price)}
              {product.unit === 'peso' && <span className="text-sm text-slate-400">/kg</span>}
            </p>
            <p className="truncate text-xs text-slate-400">
              Costo {cop(product.cost)} · IVA {product.ivaRate}% · {product.barcode || product.internalCode}
            </p>
          </div>
          <button onClick={onEdit} className="btn btn-secondary ml-auto px-3 py-2 text-sm">
            <Icon name="edit" className="h-4 w-4" /> Editar
          </button>
        </div>

        {product.description && (
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">{product.description}</p>
        )}

        <button onClick={() => printLabel(product, tenant?.businessName ?? 'Ventanilla')} className="btn btn-secondary w-full text-sm">
          <Icon name="print" className="h-5 w-5" /> Imprimir etiqueta de precio
        </button>

        {dExp !== null && dExp <= 30 && (
          <div className="flex items-center justify-between rounded-xl bg-rose-50 p-3">
            <span className="text-sm text-rose-700">Vence en {dExp} días</span>
            <button onClick={applyDiscount} className="btn btn-danger px-3 py-1.5 text-xs">
              Aplicar -15% promoción
            </button>
          </div>
        )}

        {/* Ajustar stock */}
        <div>
          <label className="label">Stock en este local (entrada / conteo)</label>
          <div className="flex gap-2">
            <input className="input" inputMode="numeric" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
            <button
              className="btn btn-primary px-4"
              onClick={async () => {
                await adjustStock({
                  tenantId, locationId, productId: product.id,
                  newQty: Number(newQty), userId, userName, reason: 'Ajuste manual',
                })
                toast('success', 'Stock actualizado')
                onClose()
              }}
            >
              Guardar
            </button>
          </div>
        </div>

        {/* Consulta de stock cruzado */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Stock en todos los locales</p>
          <div className="space-y-1.5">
            {(allStock ?? []).map((s) => {
              const loc = locations?.find((l) => l.id === s.locationId)
              return (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">{loc?.name}</span>
                  <span className="font-semibold text-slate-700">
                    {product.unit === 'peso' ? kg(s.quantity) : s.quantity}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Traslado entre locales */}
        {(locations?.length ?? 0) > 1 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-600">Trasladar a otro local</p>
            <div className="flex gap-2">
              <select className="input" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                <option value="">Destino…</option>
                {locations?.filter((l) => l.id !== locationId).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
              <input className="input w-24" inputMode="numeric" placeholder="Cant." value={transferQty} onChange={(e) => setTransferQty(e.target.value)} />
              <button
                className="btn btn-secondary px-3"
                disabled={!transferTo || !transferQty}
                onClick={async () => {
                  await transferStock({
                    tenantId, fromLocationId: locationId, toLocationId: transferTo,
                    productId: product.id, qty: Number(transferQty), userId, userName,
                  })
                  toast('success', 'Traslado registrado')
                  setTransferQty('')
                  setTransferTo('')
                }}
              >
                Mover
              </button>
            </div>
          </div>
        )}

        {/* Kardex: historial de movimientos del producto en este local */}
        <div>
          <p className="mb-2 text-sm font-semibold text-slate-600">Movimientos (kardex)</p>
          {(movements?.length ?? 0) === 0 ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-400">Sin movimientos aún.</p>
          ) : (
            <div className="space-y-1">
              {movements?.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">{MOV_LABEL[m.type] ?? m.type}</span>
                  <span className="text-xs text-slate-400">{timeAgo(m.createdAt)}</span>
                  <span className={`w-16 text-right font-semibold ${m.qty >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {m.qty >= 0 ? '+' : ''}{product.unit === 'peso' ? kg(m.qty) : m.qty}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Sheet>
  )
}

const MOV_LABEL: Record<string, string> = {
  venta: 'Venta', entrada: 'Entrada', traslado_salida: 'Traslado (salida)',
  traslado_entrada: 'Traslado (entrada)', ajuste: 'Ajuste', devolucion: 'Devolución', remision: 'Remisión',
}

// --- Carga masiva CSV / Excel ----------------------------------------------
function ImportSheet({
  tenantId, locationId, categories, locations, onClose,
}: {
  tenantId: string; locationId: string
  categories: { id: string; name: string }[]
  locations: { id: string }[]
  onClose: () => void
}) {
  const [preview, setPreview] = useState<string[][]>([])
  const [count, setCount] = useState(0)

  function parseCSV(text: string): string[][] {
    return text
      .split(/\r?\n/)
      .filter((l) => l.trim())
      .map((line) => line.split(/[;,]/).map((c) => c.trim()))
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const rows = parseCSV(reader.result as string)
      setPreview(rows.slice(0, 6))
      setCount(Math.max(0, rows.length - 1))
    }
    reader.readAsText(file)
  }

  async function doImport() {
    if (preview.length === 0) return
    // Asumimos: nombre, codigo, categoria, precio, costo, iva, unidad, stock
    const fileInput = document.getElementById('csv-file') as HTMLInputElement
    const file = fileInput?.files?.[0]
    if (!file) return
    const text = await file.text()
    const rows = parseCSV(text)
    const body = rows.slice(1) // saltar encabezado
    let imported = 0
    for (const r of body) {
      const [name, codigo, categoria, precio, costo, iva, unidad, stockQty] = r
      if (!name) continue
      const cat = categories.find((c) => c.name.toLowerCase() === (categoria || '').toLowerCase()) ?? categories[0]
      const pid = uid('p')
      await db.products.put({
        id: pid, tenantId, name,
        barcode: codigo || undefined,
        internalCode: codigo ? undefined : `VEN-${100000 + imported}`,
        categoryId: cat?.id ?? '',
        unit: (unidad || '').toLowerCase().startsWith('p') ? 'peso' : 'unidad',
        price: parseInt((precio || '0').replace(/[^\d]/g, ''), 10) || 0,
        cost: parseInt((costo || '0').replace(/[^\d]/g, ''), 10) || 0,
        ivaRate: Number(iva) || 19,
        perishable: false, imageEmoji: '📦', active: true,
        createdAt: new Date().toISOString(),
      })
      for (const loc of locations) {
        await db.stock.put({
          id: `${loc.id}:${pid}`, tenantId, locationId: loc.id, productId: pid,
          quantity: loc.id === locationId ? (parseInt(stockQty || '0', 10) || 0) : 0,
          reorderThreshold: 4, reorderTarget: 12, updatedAt: new Date().toISOString(),
        })
      }
      imported++
    }
    toast('success', `${imported} productos importados`)
    onClose()
  }

  const template = 'nombre,codigo_barras,categoria,precio,costo,iva,unidad,stock\nArroz Diana 500g,7702000000001,Abarrotes,2700,2000,5,unidad,40'
  const templateUrl = 'data:text/csv;charset=utf-8,' + encodeURIComponent(template)

  return (
    <Sheet
      open
      onClose={onClose}
      title="Carga masiva de productos"
      footer={
        <button className="btn btn-primary btn-lg w-full" disabled={!count} onClick={doImport}>
          Importar {count} productos
        </button>
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-slate-500">
          Sube un archivo <b>CSV</b> (puedes exportarlo desde Excel: <i>Guardar como → CSV</i>). Columnas:
          nombre, código, categoría, precio, costo, iva, unidad, stock.
        </p>
        <a href={templateUrl} download="plantilla-productos.csv" className="btn btn-secondary w-full text-sm">
          ⬇️ Descargar plantilla de ejemplo
        </a>
        <label className="btn btn-primary w-full cursor-pointer">
          📂 Elegir archivo CSV
          <input id="csv-file" type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
        </label>
        {preview.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-xs">
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className={i === 0 ? 'bg-slate-100 font-semibold' : ''}>
                    {row.slice(0, 5).map((cell, j) => (
                      <td key={j} className="border-b border-slate-100 px-2 py-1">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Sheet>
  )
}
