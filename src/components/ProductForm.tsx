import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { Scanner } from './Scanner'
import { Icon } from './icons'
import { toast } from './Toast'
import { db } from '@/data/db'
import { uid, internalCode } from '@/lib/id'
import { parseCop } from '@/lib/money'
import { PriceMarginEditor } from './PriceMarginEditor'
import { fileToCompressedDataUrl } from '@/lib/image'
import { bankLookup, bankSearch, bankContribute, externalBarcodeLookup, isCloudConfigured, type BankProduct } from '@/data/api'
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
  initialBarcode,
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
  initialBarcode?: string
}) {
  const editing = !!product
  const [name, setName] = useState(product?.name ?? '')
  const [barcode, setBarcode] = useState(product?.barcode ?? initialBarcode ?? '')
  const [scanOpen, setScanOpen] = useState(false)
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '')
  // Garantiza una categoría "Otro" para clasificar productos que no encajan en
  // ninguna (también en tiendas ya creadas, no solo en el demo nuevo).
  useEffect(() => {
    if (!tenantId) return
    void (async () => {
      const has = await db.categories.where('tenantId').equals(tenantId).filter((c) => c.name.trim().toLowerCase() === 'otro').count()
      if (has === 0) await db.categories.put({ id: uid('cat'), tenantId, name: 'Otro', color: '#94a3b8', emoji: '📦' })
    })()
  }, [tenantId])
  const [unit, setUnit] = useState<'unidad' | 'peso'>(product?.unit ?? 'unidad')
  const [price, setPrice] = useState(product ? String(product.price) : '')
  const [cost, setCost] = useState(product ? String(product.cost) : '')
  const [iva, setIva] = useState(product?.ivaRate ?? 19)
  const [supplierId, setSupplierId] = useState(product?.supplierId ?? '')
  const [perishable, setPerishable] = useState(product?.perishable ?? false)
  const [emoji, setEmoji] = useState(product?.imageEmoji ?? '📦')
  const [photo, setPhoto] = useState(product?.photo ?? '')
  const [brand, setBrand] = useState(product?.brand ?? '')
  const [description, setDescription] = useState(product?.description ?? '')
  const [wholesalePrice, setWholesalePrice] = useState(product?.wholesalePrice ? String(product.wholesalePrice) : '')
  const [wholesaleMinQty, setWholesaleMinQty] = useState(product?.wholesaleMinQty ? String(product.wholesaleMinQty) : '')
  const [promoType, setPromoType] = useState<'none' | '2x1' | 'percent'>(product?.promoType ?? 'none')
  const [promoValue, setPromoValue] = useState(product?.promoValue ? String(product.promoValue) : '')
  const [section, setSection] = useState(product?.section ?? '')
  const [avgCost, setAvgCost] = useState(product?.avgCost ? String(product.avgCost) : '')
  const [blockNegative, setBlockNegative] = useState(product?.allowNegative === false)
  const [uploading, setUploading] = useState(false)
  const [initialQty, setInitialQty] = useState('')
  const [saving, setSaving] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const bankOn = isCloudConfigured()

  // Rellena el formulario con una ficha del banco (sin tocar precio/costo).
  // gentle=true (autocompletar al escanear): no pisa categoría/unidad que el
  // usuario ya eligió; solo completa lo que está vacío/por defecto.
  function prefillFromBank(hit: BankProduct, gentle = false) {
    setName(hit.name)
    if (hit.barcode) setBarcode(hit.barcode)
    if (hit.brand && (!gentle || !brand.trim())) setBrand(hit.brand)
    if ((hit.unit === 'peso' || hit.unit === 'unidad') && (!gentle || unit === 'unidad')) setUnit(hit.unit)
    if (hit.imageEmoji && (!gentle || emoji === '📦')) setEmoji(hit.imageEmoji)
    const cat = hit.category && categories.find((c) => c.name.toLowerCase() === hit.category!.toLowerCase())
    if (cat && (!gentle || categoryId === (categories[0]?.id ?? ''))) setCategoryId(cat.id)
  }

  // Al escribir/escanear un código (creando), busca la ficha: primero en el banco
  // compartido (instantáneo) y, si no está, en la base mundial Open Food Facts.
  // No pisa lo que el usuario ya escribió. Lo que llega de internet se aporta al
  // banco para que la próxima vez sea instantáneo y lo aprovechen otras tiendas.
  useEffect(() => {
    const code = barcode.trim()
    if (editing || name.trim() || code.length < 6) return
    let cancel = false
    const t = setTimeout(async () => {
      const hit = bankOn ? await bankLookup(code) : null
      if (cancel) return
      if (hit) {
        prefillFromBank(hit, true)
        toast('success', '✨ Autocompletado desde el banco de productos')
        return
      }
      const ext = await externalBarcodeLookup(code)
      if (cancel || !ext) return
      prefillFromBank(ext, true)
      bankContribute({ barcode: ext.barcode, name: ext.name, brand: ext.brand ?? null })
      toast('success', '🌐 Autocompletado desde la base mundial de productos')
    }, 450)
    return () => { cancel = true; clearTimeout(t) }
  }, [barcode, editing, name, bankOn])

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      setPhoto(await fileToCompressedDataUrl(file))
    } catch {
      toast('error', 'No se pudo cargar la foto')
    } finally {
      setUploading(false)
    }
  }

  async function save() {
    if (!name.trim()) {
      toast('error', 'Ponle un nombre al producto')
      return
    }
    const priceNum = parseCop(price)
    if (priceNum <= 0) {
      toast('error', 'Ponle un precio mayor a $0')
      return
    }
    // Código de barras único (si se repite, el escáner tomaría uno ambiguo).
    const code = barcode.trim()
    if (code) {
      const dupe = await db.products.where('barcode').equals(code).and((pp) => pp.id !== (product?.id ?? '')).first()
      if (dupe) {
        toast('error', `El código ${code} ya lo usa "${dupe.name}"`)
        return
      }
    }
    const costNum = parseCop(cost)
    if (costNum > 0 && priceNum < costNum && !confirm(`El precio ($${priceNum.toLocaleString('es-CO')}) es menor al costo ($${costNum.toLocaleString('es-CO')}). ¿Guardar de todas formas?`)) {
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
      photo: photo || undefined,
      brand: brand.trim() || undefined,
      description: description.trim() || undefined,
      wholesalePrice: parseCop(wholesalePrice) || undefined,
      wholesaleMinQty: parseInt(wholesaleMinQty || '0', 10) || undefined,
      promoType: promoType === 'none' ? undefined : promoType,
      promoValue: promoType === 'percent' ? parseInt(promoValue || '0', 10) || undefined : undefined,
      section: section.trim() || undefined,
      avgCost: parseCop(avgCost) || undefined,
      allowNegative: !blockNegative,
      active: product?.active ?? true,
      createdAt: product?.createdAt ?? new Date().toISOString(),
    }
    await db.products.put(p)

    // Al crear, generamos el registro de stock en cada local
    if (!editing) {
      const qty = parseInt(initialQty || '0', 10) || 0
      const now = new Date().toISOString()
      for (const loc of locations) {
        const stockId = `${loc.id}:${p.id}`
        const exists = await db.stock.get(stockId)
        if (!exists) {
          const locQty = loc.id === defaultLocationId ? qty : 0
          await db.stock.put({
            id: stockId,
            tenantId,
            locationId: loc.id,
            productId: p.id,
            quantity: locQty,
            reorderThreshold: 4,
            reorderTarget: 12,
            updatedAt: now,
          })
          // Movimiento "inicial": el servidor reconstruye la cantidad sumando
          // movimientos, así que el stock inicial debe quedar registrado como uno.
          if (locQty > 0) {
            await db.stockMovements.put({
              id: uid('mv'), tenantId, locationId: loc.id, productId: p.id,
              type: 'inicial', qty: locQty, userId: '', createdAt: now,
            })
          }
        }
      }
    }
    // Aporta la ficha al banco compartido (solo catálogo, sin precios) si tiene código.
    if (p.barcode) {
      const catName = categories.find((c) => c.id === categoryId)?.name
      bankContribute({ barcode: p.barcode, name: p.name, brand: p.brand ?? null, category: catName ?? null, unit: p.unit, imageEmoji: p.imageEmoji ?? null })
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

        {/* Código de barras (visible y arriba: así el producto queda escaneable) */}
        <div>
          <label className="label">Código de barras / QR <span className="text-brand-600">— escanéalo para vender</span></label>
          <div className="flex gap-2">
            <input className="input flex-1" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="Escribe o escanea el código" />
            <button type="button" onClick={() => setScanOpen(true)} className="btn btn-primary px-4" aria-label="Escanear código">
              <Icon name="scan" className="h-5 w-5" /> Escanear
            </button>
          </div>
          {bankOn && (
            <button type="button" onClick={() => setBankOpen(true)} className="mt-1.5 text-sm font-semibold text-brand-600">
              🏦 Buscar en el banco de productos
            </button>
          )}
        </div>

        {/* Foto del producto (opcional) */}
        <div>
          <label className="label">Foto del producto (opcional)</label>
          <div className="flex items-center gap-3">
            {photo ? (
              <img src={photo} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-xl bg-slate-100 text-3xl">{emoji}</div>
            )}
            <div className="flex flex-1 flex-col gap-2">
              <label className="btn btn-secondary cursor-pointer text-sm">
                {uploading ? 'Cargando…' : photo ? '📷 Cambiar foto' : '📷 Subir foto'}
                <input type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhoto} />
              </label>
              {photo && (
                <button onClick={() => setPhoto('')} className="text-left text-xs text-rose-500">
                  Quitar foto
                </button>
              )}
            </div>
          </div>
        </div>

        <div>
          <label className="label">Marca (opcional)</label>
          <input className="input" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej. Postobón, Colanta…" />
        </div>

        <div>
          <label className="label">{photo ? 'Ícono de respaldo' : 'Ícono rápido'}</label>
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

        <PriceMarginEditor cost={cost} price={price} setCost={setCost} setPrice={setPrice} priceLabel={unit === 'peso' ? 'Precio/kg' : 'Precio venta'} showCost />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Costo promedio</label>
            <input className="input" inputMode="numeric" value={avgCost} onChange={(e) => setAvgCost(e.target.value)} placeholder="auto al comprar" />
          </div>
          <div>
            <label className="label">Sección / posición</label>
            <input className="input" value={section} onChange={(e) => setSection(e.target.value)} placeholder="Ej. Góndola 3" />
          </div>
        </div>

        <div>
          <label className="label">IVA (DIAN)</label>
          <select className="input" value={iva} onChange={(e) => setIva(Number(e.target.value))}>
            <option value={0}>0% (excluido)</option>
            <option value={5}>5%</option>
            <option value={19}>19%</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Precio por mayor (opcional)</label>
            <input className="input" inputMode="numeric" value={wholesalePrice} onChange={(e) => setWholesalePrice(e.target.value)} placeholder="$" />
          </div>
          <div>
            <label className="label">Desde cuántas unidades</label>
            <input className="input" inputMode="numeric" value={wholesaleMinQty} onChange={(e) => setWholesaleMinQty(e.target.value)} placeholder="Ej. 6" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Promoción</label>
            <select className="input" value={promoType} onChange={(e) => setPromoType(e.target.value as any)}>
              <option value="none">Sin promoción</option>
              <option value="2x1">2x1 (lleva 2 paga 1)</option>
              <option value="percent">% de descuento</option>
            </select>
          </div>
          {promoType === 'percent' && (
            <div>
              <label className="label">% descuento</label>
              <input className="input" inputMode="numeric" value={promoValue} onChange={(e) => setPromoValue(e.target.value)} placeholder="Ej. 15" />
            </div>
          )}
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

        <div>
          <label className="label">Detalles / descripción (opcional)</label>
          <textarea
            className="input min-h-[72px] resize-none"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Presentación, contenido, notas para el cliente…"
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={perishable} onChange={(e) => setPerishable(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">Es perecedero (controlar vencimiento)</span>
        </label>

        <label className="flex items-center gap-3 rounded-xl bg-slate-50 px-4 py-3">
          <input type="checkbox" checked={blockNegative} onChange={(e) => setBlockNegative(e.target.checked)} className="h-5 w-5" />
          <span className="text-sm text-slate-600">No permitir vender sin existencias (bloquear negativo)</span>
        </label>

        {!barcode.trim() && !editing && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Sin código de barras: se generará un código interno propio para imprimir etiqueta.
          </p>
        )}
      </div>

      <Scanner
        open={scanOpen}
        onClose={() => setScanOpen(false)}
        onDetected={(code) => {
          setBarcode(code)
          setScanOpen(false)
          toast('success', `Código ${code} capturado`)
        }}
      />

      {bankOpen && (
        <BankSearchSheet
          onPick={(hit) => { prefillFromBank(hit); setBankOpen(false); toast('success', `"${hit.name}" traído del banco`) }}
          onClose={() => setBankOpen(false)}
        />
      )}
    </Sheet>
  )
}

// Buscar una ficha en el banco compartido (por nombre o código) e importarla.
function BankSearchSheet({ onPick, onClose }: { onPick: (p: BankProduct) => void; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<BankProduct[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const t = setTimeout(async () => {
      if (q.trim().length < 2) { setResults([]); return }
      setBusy(true)
      setResults(await bankSearch(q.trim()))
      setBusy(false)
    }, 350)
    return () => clearTimeout(t)
  }, [q])
  return (
    <Sheet open onClose={onClose} title="Banco de productos">
      <div className="space-y-3">
        <p className="text-sm text-slate-500">Catálogo compartido por todas las tiendas. Encuentra el producto y tráelo ya con su nombre, marca y categoría (tú pones tu precio).</p>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Nombre o código de barras…" autoFocus />
        {busy && <p className="text-xs text-slate-400">Buscando…</p>}
        <div className="space-y-1">
          {results.map((r) => (
            <button key={r.barcode} onClick={() => onPick(r)} className="card flex w-full items-center gap-3 p-2.5 text-left active:scale-[0.99]">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-lg">{r.imageEmoji || '📦'}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-700">{r.name}</p>
                <p className="truncate text-xs text-slate-400">{[r.brand, r.category, r.barcode].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="shrink-0 text-xs font-semibold text-brand-600">Traer</span>
            </button>
          ))}
          {q.trim().length >= 2 && !busy && results.length === 0 && <p className="px-1 text-xs text-slate-400">Sin resultados en el banco.</p>}
        </div>
      </div>
    </Sheet>
  )
}
