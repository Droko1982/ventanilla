import { useState } from 'react'
import { Sheet } from './Sheet'
import { toast } from './Toast'
import { db } from '@/data/db'
import { uid, internalCode } from '@/lib/id'
import { parseCop } from '@/lib/money'
import type { Category, Location, Product, Supplier } from '@/types'

// Formulario de producto reutilizable: crear (con stock inicial) o editar.
// Lo usan el POS ("agregar al vuelo") y el Inventario.
export function ProductForm({
  open,
  onClose,
  tenantId,
  locations,
  categories,
  suppliers,
  product,
  defaultLocationId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  tenantId: string
  locations: Location[]
  categories: Category[]
  suppliers: Supplier[]
  product?: Product
  defaultLocationId?: string | null
  onSaved?: (p: Product) => void
}) {
  const editing = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [barcode, setBarcode] = useState(product?.barcode ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '')
  const [unit, setUnit] = useState<'unidad' | 'peso'>(product?.unit ?? 'unidad')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [cost, setCost] = useState(product ? String(product.cost) : '')
  const [iva, setIva] = useState(product?.ivaRate ?? 19)
  const [supplierId, setSupplierId] = useState(product?.supplierId ?? '')
  const [perishable, setPerishable] = useState(product?.perishable ?? false)
  const [emoji, setEmoji] = useState(product?.imageEmoji ?? '📦')
  const [initialQty, setInitialQty] = useState('')
  const [saving, setSaving] = useState(false)

  async function save() {
    if (!name.trim()) {
      toast('error', 'Ponle un nombre al producto')
      return
    }
    setSaving(true)
    const p: Product = {
      id: product?.id ?? uid('p'),
      tenantId,
      name: name.trim(),
      barcode: barcode.trim() || undefined,
      internalCode: product?.internalCode ?? (barcode.trim() ? undefined : internalCode()),
      categoryId,
      unit,
      price: parseCop(price),
      cost: parseCop(cost),
      ivaRate: iva,
      supplierId: supplierId || undefined,
      perishable,
      imageEmoji: emoji,
      active: product?.active ?? true,
      createdAt: product?.createdAt ?? new Date().toISOString(),
    }
    await db.products.put(p)

    // Al crear, generamos el registro de stock en cada local
    if (!editing) {
      const qty = parseInt(initialQty || '0', 10) || 0
      for (const loc of locations) {
        const stockId = `${loc.id}:${p.id}`
        const exists = await db.stock.get(stockId)
        if (!exists) {
          await db.stock.put({
            id: stockId,
            tenantId,
            locationId: loc.id,
            productId: p.id,
            quantity: loc.id === defaultLocationId ? qty : 0,
            reorderThreshold: 4,
            reorderTarget: 12,
            updatedAt: new Date().toISOString(),
          })
        }
      }
    }
    setSaving(false)
    toast('success', editing ? 'Producto actualizado' : 'Producto creado')
    onSaved?.(p)
    onClose()
  }

  const emojiOptions = ['📦', '🥤', '🍪', '🧼', '🍚', '🥛', '🍺', '🧴', '🍫', '🥔', '🧀', '🥚', '⚖️', '🌾']

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={editing ? 'Editar producto' : 'Nuevo producto'}
      footer={
        <button className="btn btn-primary btn-lg w-full" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label">Nombre</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej. Gaseosa 1.5L" />
        </div>

        <div>
          <label className="label">Ícono rápido</label>
          <div className="no-scrollbar flex gap-2 overflow-x-auto">
            {emojiOptions.map((e) => (
              <button
                key={e}
                onClick={() => setEmoji(e)}
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-xl ${
                  emoji === e ? 'border-brand-500 bg-brand-50' : 'border-slate-200'
                }`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Categoría</label>
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Se vende por</label>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as any)}>
              <option value="unidad">Unidad</option>
              <option value="peso">Peso / granel (kg)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{unit === 'peso' ? 'Precio por kg' : 'Precio venta'}</label>
            <input className="input" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" />
          </div>
          <div>
            <label className="label">Costo de compra</label>
            <input className="input" inputMode="numeric" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="$" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">IVA (DIAN)</label>
            <select className="input" value={iva} onChange={(e) => setIva(Number(e.target.value))}>
              <option value={0}>0% (excluido)</option>
              <option value={5}>5%</option>
              <option value={19}>19%</option>
            </select>
          </div>
          <div>
            <label className="label">Código de barras</label>
            <input className="input" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div>
          <label className="label">Proveedor</label>
          <select className="input" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">Sin proveedor</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {!editing && (
          <div>
            <label className="label">Stock inicial (en este local)</label>
            <input className="input" inputMode="numeric" value={initialQty} onChange={(e) => setInitialQty(e.target.value)} placeholder="0" />
          </div>
        )}

        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={perishable} onChange={(e) => setPerishable(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Es perecedero (controlar vencimiento)</span>
        </label>

        {!barcode.trim() && !editing && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sin código de barras: se generará un código interno propio para imprimir etiqueta.
          </p>
        )}
      </div>
    </Sheet>
  )
}
