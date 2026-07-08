import { db } from './db'
import { api, isCloudConfigured } from './api'
import { uid } from '@/lib/id'
import { startOfToday } from '@/lib/format'
import { localYMD, saleDay } from '@/lib/businessDay'
import { cop } from '@/lib/money'
import type {
  Sale,
  SaleItem,
  Payment,
  PaymentMethod,
  Product,
  Tenant,
  Stock,
  AuditLog,
  AppNotification,
  PurchaseOrder,
  CashSession,
  Customer,
  Remision,
  CashMovement,
  Expense,
  Purchase,
  PurchaseItem,
  ZReport,
  Domicilio,
  DomicilioStatus,
} from '@/types'
import { ivaBreakdown } from '@/lib/documents'

// ============================================================================
// Lógica de negocio (mutaciones) y consultas reutilizables.
// Esta capa concentra TODO lo que cambia datos para que sea fácil, mañana,
// reflejar lo mismo contra un backend real (cada función sería una llamada API).
// ============================================================================

// ---- Auditoría: cada acción sensible queda firmada ------------------------
export async function audit(entry: {
  tenantId: string
  locationId?: string
  userId: string
  userName: string
  action: string
  entity: string
  entityId: string
  detail: string
}): Promise<void> {
  const log: AuditLog = {
    id: uid('al'),
    createdAt: new Date().toISOString(),
    ...entry,
  }
  await db.auditLogs.put(log)
}

export async function notify(n: Omit<AppNotification, 'id' | 'read' | 'createdAt'>): Promise<void> {
  await db.notifications.put({
    id: uid('n'),
    read: false,
    createdAt: new Date().toISOString(),
    ...n,
  })
}

// ---- DIAN (simulado en demo) ----------------------------------------------
// Numeración consecutiva por tipo de documento.
//  POS1-####  tiquete (documento equivalente POS)
//  FE-####    factura electrónica de venta
//  REM-####   remisión (no es documento DIAN)
// Consecutivos PERSISTENTES (no se reinician al recargar la PWA, para no
// repetir números de documento fiscal entre sesiones).
function nextSeq(key: string, base: number, prefix: string): string {
  let n = base
  try {
    const stored = Number(localStorage.getItem(key))
    if (Number.isFinite(stored) && stored >= base) n = stored
  } catch { /* sin almacenamiento */ }
  n += 1
  try { localStorage.setItem(key, String(n)) } catch { /* ignore */ }
  return `${prefix}${n}`
}
export function nextDianNumber(): string { return nextSeq('ventanilla-seq-pos', 5000, 'POS1-') }
export function nextFacturaNumber(): string { return nextSeq('ventanilla-seq-fe', 940, 'FE-') }
export function nextRemisionNumber(): string { return nextSeq('ventanilla-seq-rem', 120, 'REM-') }
export function nextCreditNoteNumber(): string { return nextSeq('ventanilla-seq-nc', 300, 'NC-') }
export function nextDebitNoteNumber(): string { return nextSeq('ventanilla-seq-nd', 200, 'ND-') }

// ---- Registrar una venta ---------------------------------------------------
export interface RecordSaleInput {
  tenantId: string
  locationId: string
  userId: string
  userName: string
  items: SaleItem[]
  discount: number
  payments: Payment[]
  customerId?: string
  customerDoc?: string
  transmitDian: boolean // ¿generar/transmitir el DEE ya?
  vendedorId?: string
  vendedorName?: string
  discountReason?: string
  note?: string // nota / observaciones de la venta
  // Factura electrónica: tipo de documento y datos fiscales del adquiriente
  docType?: 'tiquete_pos' | 'factura'
  customerName?: string
  customerIdType?: 'CC' | 'NIT' | 'CE'
  customerAddress?: string
  customerEmail?: string
  remisionId?: string // si la factura nace de una remisión
  skipStock?: boolean // true cuando el stock ya se descontó (p.ej. en la remisión)
  redeemPoints?: number // puntos de fidelización que el cliente canjea en esta venta
}

export async function recordSale(input: RecordSaleInput): Promise<Sale> {
  const tenant = await db.tenants.get(input.tenantId)
  const loyaltyOn = !!tenant?.loyaltyEnabled
  const redeemVal = tenant?.loyaltyRedeemValue ?? 20
  const perThousand = tenant?.loyaltyPointsPerThousand ?? 1
  const subtotal = input.items.reduce(
    (s, it) => s + it.unitPrice * it.qty - it.lineDiscount,
    0,
  )
  const baseAfterDiscount = Math.max(0, subtotal - input.discount)
  // Canje de puntos: cada punto vale `redeemVal` pesos, tope al total de la venta
  const redeemPoints = loyaltyOn && input.customerId ? Math.max(0, Math.floor(input.redeemPoints ?? 0)) : 0
  const redeemDiscount = Math.min(redeemPoints * redeemVal, baseAfterDiscount)
  const total = Math.max(0, Math.round(baseAfterDiscount - redeemDiscount))
  // Red de seguridad: los pagos DEBEN sumar el total (tolerancia de $1 por redondeo).
  // Evita registrar una venta descuadrada (recibo/Informe Z incoherentes).
  const paySum = Math.round(input.payments.reduce((s, p) => s + p.amount, 0))
  if (Math.abs(paySum - total) > 1) {
    throw new Error(`Los pagos ($${paySum.toLocaleString('es-CO')}) no cuadran con el total ($${total.toLocaleString('es-CO')}).`)
  }
  const now = new Date().toISOString()
  let crossedThreshold = false // ¿algún producto bajó del umbral en esta venta?
  const docType = input.docType ?? (input.customerDoc ? 'factura' : 'tiquete_pos')
  // Solo se consume el consecutivo si REALMENTE se transmite (evita saltos de
  // numeración fiscal en ventas que no generan documento).
  const docNumber = input.transmitDian ? (docType === 'factura' ? nextFacturaNumber() : nextDianNumber()) : undefined
  // Caja abierta del local → día contable (día de apertura). Si no hay caja
  // abierta, el día contable es el de hoy (calendario).
  const openSession = await db.cashSessions
    .where('locationId').equals(input.locationId)
    .and((c) => c.status === 'abierta')
    .first()
  const businessDate = openSession ? localYMD(openSession.openedAt) : localYMD(now)

  const sale: Sale = {
    id: uid('s'),
    tenantId: input.tenantId,
    locationId: input.locationId,
    userId: input.userId,
    items: input.items,
    subtotal: Math.round(subtotal),
    discount: input.discount + redeemDiscount,
    total,
    payments: input.payments,
    customerId: input.customerId,
    customerDoc: input.customerDoc,
    customerName: input.customerName,
    customerIdType: input.customerIdType,
    customerAddress: input.customerAddress,
    customerEmail: input.customerEmail,
    vendedorId: input.vendedorId,
    vendedorName: input.vendedorName,
    discountReason: input.discountReason,
    note: input.note,
    status: 'completada',
    dianStatus: input.transmitDian ? 'enviado' : 'pendiente',
    dianDocType: docType,
    dianDocNumber: input.transmitDian ? docNumber : undefined,
    remisionId: input.remisionId,
    redeemPoints: redeemPoints || undefined,
    createdAt: now,
    cashSessionId: openSession?.id,
    businessDate,
    syncedAt: navigator.onLine ? now : undefined, // offline: queda sin sincronizar
  }

  // Bloqueo de stock negativo: si un producto NO permite negativos y no alcanza,
  // se rechaza la venta antes de tocar nada (no se vende lo que no hay).
  if (!input.skipStock) {
    for (const it of input.items) {
      if (it.productId.startsWith('srv:') || it.productId.startsWith('man:')) continue
      const prod = await db.products.get(it.productId)
      if (prod && prod.allowNegative === false) {
        const st = await db.stock.get(`${input.locationId}:${it.productId}`)
        const have = st?.quantity ?? 0
        if (have < it.qty) {
          throw new Error(`No hay suficiente "${it.name}" (disponible ${have}). No permite venta en negativo.`)
        }
      }
    }
  }

  await db.transaction(
    'rw',
    [db.sales, db.stock, db.stockMovements, db.customers, db.creditMovements, db.notifications, db.auditLogs],
    async () => {
      await db.sales.put(sale)

      // Descontar stock + movimiento por cada ítem (salvo que ya se descontó)
      // Los servicios/recargas (productId "srv:") no afectan inventario.
      if (!input.skipStock) for (const it of input.items) {
        // Servicios/recargas ("srv:") y productos manuales ("man:") no tienen inventario.
        if (it.productId.startsWith('srv:') || it.productId.startsWith('man:')) continue
        const stockId = `${input.locationId}:${it.productId}`
        const st = await db.stock.get(stockId)
        if (st) {
          st.quantity = Number((st.quantity - it.qty).toFixed(3))
          st.updatedAt = now
          await db.stock.put(st)
          // Alerta si cruzó el umbral
          if (st.quantity <= st.reorderThreshold) {
            crossedThreshold = true
            await notify({
              tenantId: input.tenantId,
              locationId: input.locationId,
              type: 'stock',
              severity: st.quantity <= 0 ? 'critico' : 'aviso',
              title: st.quantity <= 0 ? 'Producto agotado' : 'Stock bajo',
              message: `"${it.name}" quedó en ${st.quantity}. Conviene reabastecer.`,
            })
          }
        }
        await db.stockMovements.put({
          id: uid('mv'),
          tenantId: input.tenantId,
          locationId: input.locationId,
          productId: it.productId,
          type: 'venta',
          qty: -it.qty,
          refId: sale.id,
          userId: input.userId,
          createdAt: now,
        })
      }

      // Fiado: aumenta saldo del cliente (suma TODAS las parcialidades fiado del
      // pago mixto, no solo la primera).
      const earned = loyaltyOn ? Math.floor(total / 1000) * perThousand : 0
      const fiadoAmount = input.payments.filter((p) => p.method === 'fiado').reduce((a, p) => a + p.amount, 0)
      if (fiadoAmount > 0 && input.customerId) {
        const c = await db.customers.get(input.customerId)
        if (c) {
          if (c.creditBalance <= 0) c.creditSince = now // empieza a deber: cuenta la antigüedad
          c.creditBalance += fiadoAmount
          c.totalSpent += total
          c.points = Math.max(0, (c.points ?? 0) - redeemPoints + earned)
          await db.customers.put(c)
          // Libro de crédito: el servidor reconstruye el saldo sumando estos deltas.
          await db.creditMovements.put({
            id: uid('cm'), tenantId: input.tenantId, customerId: c.id, delta: fiadoAmount,
            type: 'fiado', refId: sale.id, userId: input.userId, createdAt: now,
          })
        }
      } else if (input.customerId) {
        const c = await db.customers.get(input.customerId)
        if (c) {
          c.totalSpent += total
          c.points = Math.max(0, (c.points ?? 0) - redeemPoints + earned)
          await db.customers.put(c)
        }
      }

      // Antifraude simple: efectivo muy por encima del promedio del local
      await detectAnomaly(sale)
    },
  )

  await audit({
    tenantId: input.tenantId,
    locationId: input.locationId,
    userId: input.userId,
    userName: input.userName,
    action: 'registró venta',
    entity: 'venta',
    entityId: sale.id,
    detail: `Total ${total} · ${input.payments.map((p) => p.method).join(', ')}`,
  })

  // Reabastecimiento automático: si bajó del umbral y está activado, pide solo.
  if (crossedThreshold) {
    try {
      if (tenant?.autoReorder) await runAutoReorder(input.tenantId, input.locationId, input.userId, input.userName)
    } catch {
      /* el auto-pedido nunca debe romper la venta */
    }
  }

  return sale
}

// Alerta al dashboard si una venta en efectivo supera mucho el promedio.
async function detectAnomaly(sale: Sale): Promise<void> {
  const cash = sale.payments.find((p) => p.method === 'efectivo')
  if (!cash) return
  const recent = await db.sales
    .where('locationId')
    .equals(sale.locationId)
    .reverse()
    .limit(50)
    .toArray()
  if (recent.length < 10) return
  const avg = recent.reduce((s, x) => s + x.total, 0) / recent.length
  if (sale.total > avg * 4 && sale.total > 50000) {
    await notify({
      tenantId: sale.tenantId,
      locationId: sale.locationId,
      type: 'fraude',
      severity: 'aviso',
      title: 'Venta inusual en efectivo',
      message: `Una venta de ${sale.total} supera 4× el promedio del local. Revísela.`,
    })
  }
}

// ---- Anular / Devolver venta ----------------------------------------------
// Revierte en el cliente la parte de fiado, total gastado y puntos de una venta
// que se anula o se devuelve (parcial o total). `amount` = valor revertido;
// `baseTotal` = total original de la venta (para prorratear el fiado/puntos).
// Debe llamarse DENTRO de una transacción que incluya db.customers y db.creditMovements.
async function revertCustomerAggregates(
  sale: Sale, amount: number, baseTotal: number, tenant: Tenant | undefined, userId: string, now: string,
): Promise<void> {
  if (!sale.customerId || amount <= 0) return
  const c = await db.customers.get(sale.customerId)
  if (!c) return
  const fiadoTotal = sale.payments.filter((p) => p.method === 'fiado').reduce((a, p) => a + p.amount, 0)
  if (fiadoTotal > 0 && baseTotal > 0) {
    const fiadoRevert = Math.min(c.creditBalance, Math.round((fiadoTotal * amount) / baseTotal))
    if (fiadoRevert > 0) {
      c.creditBalance = Number((c.creditBalance - fiadoRevert).toFixed(2))
      if (c.creditBalance <= 0) { c.creditSince = undefined; c.lastReminder = undefined }
      await db.creditMovements.put({
        id: uid('cm'), tenantId: sale.tenantId, customerId: c.id, delta: -fiadoRevert,
        type: 'abono', refId: sale.id, userId, createdAt: now,
      })
    }
  }
  c.totalSpent = Math.max(0, (c.totalSpent ?? 0) - amount)
  if (tenant?.loyaltyEnabled) {
    const earnedRevert = Math.floor(amount / 1000) * (tenant.loyaltyPointsPerThousand ?? 1)
    // Devuelve al cliente los puntos que canjeó (a prorrata del monto devuelto),
    // ya que la venta se anula/devuelve y no debió costarle esos puntos.
    const redeemBack = baseTotal > 0 ? Math.round(((sale.redeemPoints ?? 0) * amount) / baseTotal) : 0
    c.points = Math.max(0, (c.points ?? 0) - earnedRevert + redeemBack)
  }
  await db.customers.put(c)
}

export async function voidSale(saleId: string, userId: string, userName: string): Promise<void> {
  const sale = await db.sales.get(saleId)
  if (!sale || sale.status !== 'completada') return
  const now = new Date().toISOString()
  const tenant = await db.tenants.get(sale.tenantId) // fuera de la transacción (solo lectura)
  await db.transaction('rw', [db.sales, db.stock, db.stockMovements, db.customers, db.creditMovements], async () => {
    sale.status = 'anulada'
    // Numera la nota crédito de la anulación (como en la devolución parcial).
    if (!sale.creditNoteNumber) sale.creditNoteNumber = nextCreditNoteNumber()
    await db.sales.put(sale)
    // Devuelve el stock — salvo si la venta nació de una remisión (el stock ya lo
    // maneja la remisión) y sin tocar servicios/recargas/manuales (no tienen stock).
    if (!sale.remisionId) {
      for (const it of sale.items) {
        if (it.productId.startsWith('srv:') || it.productId.startsWith('man:')) continue
        const st = await db.stock.get(`${sale.locationId}:${it.productId}`)
        if (st) {
          st.quantity = Number((st.quantity + it.qty).toFixed(3))
          st.updatedAt = now
          await db.stock.put(st)
        }
        await db.stockMovements.put({
          id: uid('mv'),
          tenantId: sale.tenantId,
          locationId: sale.locationId,
          productId: it.productId,
          type: 'devolucion',
          qty: it.qty,
          refId: sale.id,
          userId,
          createdAt: now,
        })
      }
    }
    // Revierte fiado, total gastado y puntos (otorgados y canjeados) del cliente.
    await revertCustomerAggregates(sale, sale.total, sale.total, tenant, userId, now)
  })
  await audit({
    tenantId: sale.tenantId,
    locationId: sale.locationId,
    userId,
    userName,
    action: 'anuló venta',
    entity: 'venta',
    entityId: sale.id,
    detail: `Genera nota crédito ante la DIAN. Total ${sale.total}.`,
  })
}

// ---- Devolución parcial: devolver algunos ítems de una venta --------------
export async function returnSaleItems(
  saleId: string,
  returns: { index: number; qty: number }[],
  userId: string,
  userName: string,
): Promise<number> {
  const sale = await db.sales.get(saleId)
  if (!sale || sale.status !== 'completada') return 0
  const filtered = returns.filter((r) => r.qty > 0)
  if (!filtered.length) return 0
  const now = new Date().toISOString()
  // Totales ORIGINALES, para prorratear el reembolso (incluye descuento global y
  // canje de puntos) y la reversión de fiado/puntos.
  const origSubtotal = sale.subtotal || sale.items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0)
  const origTotal = sale.total
  const tenant = await db.tenants.get(sale.tenantId)
  let refund = 0
  await db.transaction('rw', [db.sales, db.stock, db.stockMovements, db.customers, db.creditMovements], async () => {
    let returnedGross = 0
    for (const r of filtered) {
      const item = sale.items[r.index]
      if (!item) continue
      const qty = Math.min(r.qty, item.qty)
      if (qty <= 0) continue
      const oldQty = item.qty
      const refundedDiscount = oldQty > 0 ? Math.round((item.lineDiscount * qty) / oldQty) : 0
      returnedGross += item.unitPrice * qty - refundedDiscount
      const ratio = oldQty > 0 ? (oldQty - qty) / oldQty : 0
      item.lineDiscount = Math.round(item.lineDiscount * ratio)
      item.qty = Number((oldQty - qty).toFixed(3))
      // Devuelve el stock (servicios "srv:" y manuales "man:" no tienen inventario;
      // y si la venta nació de una remisión, el stock lo maneja la remisión).
      if (!sale.remisionId && !item.productId.startsWith('srv:') && !item.productId.startsWith('man:')) {
        const st = await db.stock.get(`${sale.locationId}:${item.productId}`)
        if (st) {
          st.quantity = Number((st.quantity + qty).toFixed(3))
          st.updatedAt = now
          await db.stock.put(st)
        }
        await db.stockMovements.put({
          id: uid('mv'), tenantId: sale.tenantId, locationId: sale.locationId,
          productId: item.productId, type: 'devolucion', qty, refId: sale.id, userId, createdAt: now,
        })
      }
      sale.returns = [...(sale.returns ?? []), { productId: item.productId, qty, at: now }]
    }
    // Reembolso = lo realmente pagado por esas unidades (prorratea descuento global
    // y canje de puntos, no solo el de línea), para no devolver de más. Topado al
    // total restante de la venta (nunca se reembolsa más de lo pagado).
    refund = Math.min(origTotal, origSubtotal > 0 ? Math.round((origTotal * returnedGross) / origSubtotal) : Math.round(returnedGross))
    // Revierte la parte de fiado y puntos correspondiente al reembolso.
    await revertCustomerAggregates(sale, refund, origTotal, tenant, userId, now)
    sale.items = sale.items.filter((it) => it.qty > 0)
    const subtotal = sale.items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0)
    sale.subtotal = Math.round(subtotal)
    sale.total = Math.max(0, origTotal - refund)
    // Reduce los pagos a prorrata del reembolso para mantener el invariante
    // sum(payments) == total. Así, tras una devolución: el efectivo esperado del
    // arqueo baja igual que el cajón físico (el efectivo devuelto sale de caja) y
    // el "por método" del Informe Z sigue cuadrando con el total.
    if (refund > 0 && origTotal > 0) {
      let remaining = refund
      const reduced = sale.payments.map((p) => {
        const cut = Math.min(p.amount, Math.round((refund * p.amount) / origTotal))
        remaining -= cut
        return { ...p, amount: p.amount - cut }
      })
      for (const p of reduced) {
        if (remaining <= 0) break
        const extra = Math.min(p.amount, remaining)
        p.amount -= extra
        remaining -= extra
      }
      sale.payments = reduced.filter((p) => p.amount > 0)
    }
    if (!sale.creditNoteNumber) sale.creditNoteNumber = nextCreditNoteNumber()
    if (sale.items.length === 0) sale.status = 'devuelta'
    await db.sales.put(sale)
  })
  await audit({
    tenantId: sale.tenantId,
    locationId: sale.locationId,
    userId,
    userName,
    action: 'devolución parcial',
    entity: 'venta',
    entityId: sale.id,
    detail: `Devolución por ${refund} · nota crédito ${sale.creditNoteNumber}`,
  })
  return refund
}

// ---- Ajuste manual de stock (entrada/conteo) ------------------------------
export async function adjustStock(args: {
  locationId: string
  productId: string
  newQty: number
  userId: string
  userName: string
  tenantId: string
  reason: string
}): Promise<void> {
  const stockId = `${args.locationId}:${args.productId}`
  const st = await db.stock.get(stockId)
  if (!st) return
  const delta = Number((args.newQty - st.quantity).toFixed(3))
  st.quantity = args.newQty
  st.updatedAt = new Date().toISOString()
  await db.stock.put(st)
  await db.stockMovements.put({
    id: uid('mv'),
    tenantId: args.tenantId,
    locationId: args.locationId,
    productId: args.productId,
    type: 'ajuste',
    qty: delta,
    userId: args.userId,
    createdAt: st.updatedAt,
  })
  await audit({
    tenantId: args.tenantId,
    locationId: args.locationId,
    userId: args.userId,
    userName: args.userName,
    action: 'ajustó stock',
    entity: 'producto',
    entityId: args.productId,
    detail: `${args.reason}. Nuevo: ${args.newQty} (Δ ${delta}).`,
  })
}

// ---- Entrada / Salida de inventario con motivo ----------------------------
export async function stockMove(args: {
  tenantId: string
  locationId: string
  productId: string
  delta: number // + entrada, − salida
  reason: string
  userId: string
  userName: string
  expiry?: string // fecha de vencimiento del lote (solo perecederos en entradas)
}): Promise<void> {
  const now = new Date().toISOString()
  const stockId = `${args.locationId}:${args.productId}`
  const st = await db.stock.get(stockId)
  if (st) {
    st.quantity = Number((st.quantity + args.delta).toFixed(3))
    // Guarda la fecha de vencimiento más próxima (la del lote que entra si es más cercana o no había)
    if (args.expiry && (!st.nearestExpiry || args.expiry < st.nearestExpiry)) st.nearestExpiry = args.expiry
    st.updatedAt = now
    await db.stock.put(st)
  } else if (args.delta > 0) {
    await db.stock.put({
      id: stockId, tenantId: args.tenantId, locationId: args.locationId, productId: args.productId,
      quantity: args.delta, reorderThreshold: 4, reorderTarget: 12, nearestExpiry: args.expiry, updatedAt: now,
    })
  }
  await db.stockMovements.put({
    id: uid('mv'), tenantId: args.tenantId, locationId: args.locationId, productId: args.productId,
    type: args.delta >= 0 ? 'entrada' : 'ajuste', qty: args.delta, userId: args.userId, createdAt: now,
  })
  await audit({
    tenantId: args.tenantId, locationId: args.locationId, userId: args.userId, userName: args.userName,
    action: args.delta >= 0 ? 'entrada de inventario' : 'salida de inventario',
    entity: 'producto', entityId: args.productId,
    detail: `${args.delta >= 0 ? '+' : ''}${args.delta} · ${args.reason}`,
  })
}

// Fija o corrige la fecha de vencimiento del lote de un producto en un local.
export async function setStockExpiry(
  locationId: string, productId: string, expiry: string | undefined,
  meta: { tenantId: string; userId: string; userName: string; productName: string },
): Promise<void> {
  const stockId = `${locationId}:${productId}`
  const st = await db.stock.get(stockId)
  if (!st) return
  st.nearestExpiry = expiry
  st.updatedAt = new Date().toISOString()
  await db.stock.put(st)
  await audit({
    tenantId: meta.tenantId, locationId, userId: meta.userId, userName: meta.userName,
    action: 'cambió vencimiento', entity: 'producto', entityId: productId,
    detail: `${meta.productName} → ${expiry ? `vence ${expiry.slice(0, 10)}` : 'sin fecha'}`,
  })
}

// ---- Reabastecimiento: umbral dinámico por velocidad de venta -------------
export interface ReorderSuggestion {
  product: Product
  stock: Stock
  avgDaily: number
  suggestedQty: number
  supplierId?: string
}

// Calcula sugerencias de pedido para un local: cuánto pedir según velocidad.
export async function suggestReorder(
  tenantId: string,
  locationId: string,
): Promise<ReorderSuggestion[]> {
  const window = 30 // días de análisis
  const since = Date.now() - window * 86400000
  const sales = await db.sales.where('locationId').equals(locationId).toArray()
  const sold: Record<string, number> = {}
  for (const s of sales) {
    if (new Date(s.createdAt).getTime() < since || s.status !== 'completada') continue
    for (const it of s.items) sold[it.productId] = (sold[it.productId] || 0) + it.qty
  }
  const stocks = await db.stock.where('locationId').equals(locationId).toArray()
  const products = await db.products.where('tenantId').equals(tenantId).toArray()
  const pById = new Map(products.map((p) => [p.id, p]))

  const out: ReorderSuggestion[] = []
  for (const st of stocks) {
    const p = pById.get(st.productId)
    if (!p || !p.active) continue
    const avgDaily = (sold[st.productId] || 0) / window
    // Umbral dinámico: lo que se vende en (lead time + 3 días de colchón).
    // Más rápido se vende → umbral más alto (no quedarse sin él).
    if (st.quantity <= st.reorderThreshold) {
      const target = Math.max(st.reorderTarget, Math.ceil(avgDaily * 14))
      const suggestedQty = Math.max(1, Math.ceil(target - st.quantity))
      out.push({ product: p, stock: st, avgDaily, suggestedQty, supplierId: p.supplierId })
    }
  }
  // Los más vendidos primero
  return out.sort((a, b) => b.avgDaily - a.avgDaily)
}

// Recalcula y guarda el umbral dinámico de cada producto del local.
export async function recalcThresholds(tenantId: string, locationId: string): Promise<number> {
  const window = 30
  const since = Date.now() - window * 86400000
  const sales = await db.sales.where('locationId').equals(locationId).toArray()
  const sold: Record<string, number> = {}
  for (const s of sales) {
    if (new Date(s.createdAt).getTime() < since || s.status !== 'completada') continue
    for (const it of s.items) sold[it.productId] = (sold[it.productId] || 0) + it.qty
  }
  const stocks = await db.stock.where('locationId').equals(locationId).toArray()
  const suppliers = await db.suppliers.where('tenantId').equals(tenantId).toArray()
  const products = await db.products.where('tenantId').equals(tenantId).toArray()
  const pById = new Map(products.map((p) => [p.id, p]))
  const sById = new Map(suppliers.map((s) => [s.id, s]))
  let updated = 0
  for (const st of stocks) {
    const p = pById.get(st.productId)
    const lead = (p?.supplierId && sById.get(p.supplierId)?.leadTimeDays) || 3
    const avgDaily = (sold[st.productId] || 0) / window
    const threshold = Math.max(2, Math.ceil(avgDaily * (lead + 3)))
    const target = Math.max(threshold + 2, Math.ceil(avgDaily * 14))
    if (threshold !== st.reorderThreshold || target !== st.reorderTarget) {
      st.reorderThreshold = threshold
      st.reorderTarget = target
      await db.stock.put(st)
      updated++
    }
  }
  return updated
}

// Recalcula los umbrales dinámicos automáticamente, a lo sumo 1 vez al día por
// local (los productos que más se venden quedan con un colchón de stock mayor).
export async function maybeRecalcThresholds(tenantId: string, locationId: string): Promise<void> {
  if (!locationId) return
  const key = `ventanilla-recalc-${locationId}`
  try {
    const last = Number(localStorage.getItem(key) || 0)
    if (Date.now() - last < 24 * 3600000) return
    localStorage.setItem(key, String(Date.now()))
  } catch { /* sin almacenamiento: corre igual */ }
  try { await recalcThresholds(tenantId, locationId) } catch { /* nunca debe romper */ }
}

// ---- Crear orden de compra a partir de sugerencias ------------------------
export async function createPurchaseOrder(
  tenantId: string,
  locationId: string,
  supplierId: string,
  items: { productId: string; name: string; suggestedQty: number; cost: number }[],
): Promise<PurchaseOrder> {
  const po: PurchaseOrder = {
    id: uid('po'),
    tenantId,
    locationId,
    supplierId,
    items: items.map((i) => ({ ...i })),
    status: 'enviado',
    createdAt: new Date().toISOString(),
    sentAt: new Date().toISOString(),
  }
  await db.purchaseOrders.put(po)
  return po
}

// Envía un WhatsApp al proveedor. Automático vía backend (WhatsApp Cloud API)
// si la app está conectada a la nube; si no, no puede enviarse solo.
export async function sendSupplierWhatsApp(phone: string, message: string): Promise<boolean> {
  if (!phone || !isCloudConfigured()) return false
  try {
    const r = await api<{ sent?: boolean }>('/whatsapp/send', { method: 'POST', body: { to: phone, message } })
    return !!r.sent
  } catch {
    return false
  }
}

// Pide a la nube un enlace de pago de la mensualidad (Wompi). Devuelve la URL.
export async function requestMonthlyCheckout(): Promise<{ url?: string; amount?: number; simulated?: boolean } | null> {
  if (!isCloudConfigured()) return null
  try {
    return await api<{ url?: string; amount?: number; simulated?: boolean }>('/billing/checkout', { method: 'POST' })
  } catch {
    return null
  }
}

// Envía un correo al proveedor (pedido automático). Automático vía backend si la
// app está conectada a la nube; si no, no puede enviarse solo.
export async function sendSupplierEmail(to: string, subject: string, message: string): Promise<boolean> {
  if (!to || !isCloudConfigured()) return false
  try {
    const r = await api<{ sent?: boolean }>('/email/send', { method: 'POST', body: { to, subject, message } })
    return !!r.sent
  } catch {
    return false
  }
}

function autoOrderMessage(supplierName: string | undefined, locName: string | undefined, items: { name: string; qty: number }[]): string {
  return [
    `Hola${supplierName ? ' ' + supplierName : ''}, pedido automático para *${locName ?? 'la tienda'}*:`,
    '',
    ...items.map((it) => `• ${it.name}: ${it.qty}`),
    '',
    'Generado por Ventanilla (reabastecimiento automático).',
  ].join('\n')
}

// Reabastecimiento automático: crea y (si se puede) ENVÍA el pedido por WhatsApp
// a cada proveedor que tenga productos por debajo del umbral. No duplica pedidos.
export async function runAutoReorder(tenantId: string, locationId: string, userId: string, userName: string): Promise<void> {
  const suggestions = await suggestReorder(tenantId, locationId)
  if (!suggestions.length) return
  const bySupplier = new Map<string, ReorderSuggestion[]>()
  for (const s of suggestions) {
    if (!s.supplierId) continue
    bySupplier.set(s.supplierId, [...(bySupplier.get(s.supplierId) ?? []), s])
  }
  const suppliers = await db.suppliers.where('tenantId').equals(tenantId).toArray()
  const sById = new Map(suppliers.map((s) => [s.id, s]))
  const location = await db.locations.get(locationId)
  const recentPOs = await db.purchaseOrders.where('locationId').equals(locationId).toArray()
  const since = Date.now() - 12 * 3600000 // no repetir pedidos al mismo proveedor en 12 h

  for (const [supplierId, items] of bySupplier) {
    const supplier = sById.get(supplierId)
    if (!supplier) continue
    const recent = recentPOs.find(
      (po) => po.supplierId === supplierId && po.status !== 'recibido' && po.status !== 'cancelado' && new Date(po.createdAt).getTime() > since,
    )
    if (recent) continue // ya hay un pedido reciente: no spamear

    await createPurchaseOrder(
      tenantId, locationId, supplierId,
      items.map((it) => ({ productId: it.product.id, name: it.product.name, suggestedQty: it.suggestedQty, cost: it.product.cost })),
    )
    const message = autoOrderMessage(supplier.name, location?.name, items.map((it) => ({ name: it.product.name, qty: it.suggestedQty })))
    const waSent = supplier.whatsapp ? await sendSupplierWhatsApp(supplier.whatsapp, message) : false
    const mailSent = supplier.email ? await sendSupplierEmail(supplier.email, `Pedido automático · ${location?.name ?? 'tienda'}`, message) : false
    const channels = [waSent && 'WhatsApp', mailSent && 'correo'].filter(Boolean).join(' y ')
    const sent = waSent || mailSent

    await notify({
      tenantId, locationId, type: 'stock', severity: 'aviso',
      title: sent ? 'Pedido enviado automáticamente' : 'Pedido automático listo',
      message: sent
        ? `Se envió por ${channels} el pedido a ${supplier.name}.`
        : `Pedido para ${supplier.name} creado. Conecta la nube (WhatsApp/correo) para envío 100% automático.`,
    })
    await audit({
      tenantId, locationId, userId, userName,
      action: 'reabastecimiento automático', entity: 'pedido', entityId: supplierId,
      detail: `${items.length} productos a ${supplier.name}${sent ? ` · enviado por ${channels}` : ' · pendiente de envío'}`,
    })
  }
}

// Marcar un pedido como pagado al proveedor (cuentas por pagar).
export async function markPurchaseOrderPaid(poId: string): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) return
  po.paid = true
  po.paidAt = new Date().toISOString()
  await db.purchaseOrders.put(po)
}

// Recibir mercancía: confirmar qué llegó de verdad y sumar al stock.
export async function receivePurchase(
  poId: string,
  received: Record<string, number>,
  userId: string,
  userName: string,
  costs?: Record<string, number>, // costo unitario REAL recibido (si se capturó); ajusta "por pagar"
): Promise<void> {
  const po = await db.purchaseOrders.get(poId)
  if (!po) return
  const now = new Date().toISOString()
  await db.transaction('rw', [db.purchaseOrders, db.stock, db.stockMovements, db.products], async () => {
    for (const it of po.items) {
      const qty = received[it.productId] ?? 0
      it.receivedQty = qty
      // Si llega el costo real recibido, reemplaza el estimado del pedido (para que
      // "Por pagar" refleje lo que de verdad se debe al proveedor).
      const realCost = costs?.[it.productId]
      if (realCost != null && realCost > 0) it.cost = realCost
      if (qty > 0) {
        const st = await db.stock.get(`${po.locationId}:${it.productId}`)
        const prevQty = st?.quantity ?? 0
        if (st) {
          st.quantity = Number((st.quantity + qty).toFixed(3))
          st.updatedAt = now
          await db.stock.put(st)
        } else {
          await db.stock.put({
            id: `${po.locationId}:${it.productId}`, tenantId: po.tenantId, locationId: po.locationId,
            productId: it.productId, quantity: qty, reorderThreshold: 4, reorderTarget: 12, updatedAt: now,
          })
        }
        // Producto: último costo + COSTO PROMEDIO ponderado (igual que la factura de compra).
        const p = await db.products.get(it.productId)
        if (p && it.cost > 0) {
          const oldAvg = p.avgCost ?? p.cost
          const denom = prevQty + qty
          p.cost = it.cost
          p.avgCost = denom > 0 ? Math.round((oldAvg * prevQty + it.cost * qty) / denom) : it.cost
          await db.products.put(p)
        }
        await db.stockMovements.put({
          id: uid('mv'),
          tenantId: po.tenantId,
          locationId: po.locationId,
          productId: it.productId,
          type: 'entrada',
          qty,
          refId: po.id,
          userId,
          createdAt: now,
        })
      }
    }
    po.status = 'recibido'
    po.receivedAt = now
    await db.purchaseOrders.put(po)
  })
  await audit({
    tenantId: po.tenantId,
    locationId: po.locationId,
    userId,
    userName,
    action: 'recibió mercancía',
    entity: 'pedido',
    entityId: po.id,
    detail: `Entrada confirmada contra el pedido.`,
  })
}

// ---- Compras: factura de compra (entrada con costo) -----------------------
export function nextPurchaseNumber(): string {
  return nextSeq('ventanilla-seq-fc', 400, 'FC-') // consecutivo persistente
}

export interface RecordPurchaseInput {
  tenantId: string
  locationId: string
  supplierId: string
  supplierName: string
  supplierInvoice?: string
  items: PurchaseItem[]
  commercialDiscount: number
  weightAdjust: number
  paymentMethod: 'contado' | 'credito'
  dueDate?: string
  userId: string
  userName: string
}

export async function recordPurchase(input: RecordPurchaseInput): Promise<Purchase> {
  const subtotal = input.items.reduce((s, it) => s + it.unitCost * it.qty, 0)
  const total = Math.max(0, Math.round(subtotal - input.commercialDiscount + input.weightAdjust))
  const now = new Date().toISOString()
  const purchase: Purchase = {
    id: uid('pur'),
    tenantId: input.tenantId,
    locationId: input.locationId,
    supplierId: input.supplierId,
    supplierName: input.supplierName,
    number: nextPurchaseNumber(),
    supplierInvoice: input.supplierInvoice,
    items: input.items,
    subtotal: Math.round(subtotal),
    commercialDiscount: input.commercialDiscount,
    weightAdjust: input.weightAdjust,
    total,
    paymentMethod: input.paymentMethod,
    dueDate: input.dueDate,
    paid: input.paymentMethod === 'contado',
    createdAt: now,
  }
  await db.transaction('rw', [db.purchases, db.stock, db.stockMovements, db.products, db.suppliers], async () => {
    await db.purchases.put(purchase)
    for (const it of input.items) {
      const stockId = `${input.locationId}:${it.productId}`
      const st = await db.stock.get(stockId)
      const prevQty = st?.quantity ?? 0
      if (st) {
        st.quantity = Number((st.quantity + it.qty).toFixed(3))
        st.updatedAt = now
        await db.stock.put(st)
      } else {
        await db.stock.put({
          id: stockId, tenantId: input.tenantId, locationId: input.locationId, productId: it.productId,
          quantity: it.qty, reorderThreshold: 4, reorderTarget: 12, updatedAt: now,
        })
      }
      await db.stockMovements.put({
        id: uid('mv'), tenantId: input.tenantId, locationId: input.locationId,
        productId: it.productId, type: 'entrada', qty: it.qty, refId: purchase.id, userId: input.userId, createdAt: now,
      })
      // Producto: último costo (P.Compra) + COSTO PROMEDIO ponderado + último proveedor
      const p = await db.products.get(it.productId)
      if (p) {
        const oldAvg = p.avgCost ?? p.cost
        const denom = prevQty + it.qty
        p.cost = it.unitCost
        p.avgCost = denom > 0 ? Math.round((oldAvg * prevQty + it.unitCost * it.qty) / denom) : it.unitCost
        // Entrada "Inventario" (sin proveedor): no pisar el último proveedor real.
        if (input.supplierId) p.supplierId = input.supplierId
        await db.products.put(p)
      }
    }
    if (input.paymentMethod === 'credito' && input.supplierId) {
      const sup = await db.suppliers.get(input.supplierId)
      if (sup) { sup.debt = (sup.debt ?? 0) + total; await db.suppliers.put(sup) }
    }
  })
  await audit({
    tenantId: input.tenantId, locationId: input.locationId, userId: input.userId, userName: input.userName,
    action: 'registró compra', entity: 'compra', entityId: purchase.id,
    detail: `${purchase.number} · ${input.supplierName} · total ${total} · ${input.paymentMethod}`,
  })
  return purchase
}

/** Marca una factura de compra como pagada (y baja la deuda si era a crédito). */
export async function markPurchasePaid(purchaseId: string): Promise<void> {
  await db.transaction('rw', [db.purchases, db.suppliers], async () => {
    const pur = await db.purchases.get(purchaseId)
    if (!pur || pur.paid) return
    pur.paid = true
    await db.purchases.put(pur)
    if (pur.paymentMethod === 'credito' && pur.supplierId) {
      const sup = await db.suppliers.get(pur.supplierId)
      if (sup) { sup.debt = Math.max(0, (sup.debt ?? 0) - pur.total); await db.suppliers.put(sup) }
    }
  })
}

export async function paySupplierDebt(supplierId: string, amount: number): Promise<number> {
  const sup = await db.suppliers.get(supplierId)
  if (!sup) return 0
  sup.debt = Math.max(0, (sup.debt ?? 0) - amount)
  await db.suppliers.put(sup)
  return sup.debt
}

// ---- Traslado entre locales -----------------------------------------------
export async function transferStock(args: {
  tenantId: string
  fromLocationId: string
  toLocationId: string
  productId: string
  qty: number
  userId: string
  userName: string
}): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    const from = await db.stock.get(`${args.fromLocationId}:${args.productId}`)
    const to = await db.stock.get(`${args.toLocationId}:${args.productId}`)
    if (from) {
      from.quantity = Number((from.quantity - args.qty).toFixed(3))
      from.updatedAt = now
      await db.stock.put(from)
    }
    if (to) {
      to.quantity = Number((to.quantity + args.qty).toFixed(3))
      to.updatedAt = now
      await db.stock.put(to)
    } else {
      // crea registro de stock en destino si no existía
      await db.stock.put({
        id: `${args.toLocationId}:${args.productId}`,
        tenantId: args.tenantId,
        locationId: args.toLocationId,
        productId: args.productId,
        quantity: args.qty,
        reorderThreshold: from?.reorderThreshold ?? 4,
        reorderTarget: from?.reorderTarget ?? 12,
        updatedAt: now,
      })
    }
    await db.stockMovements.bulkPut([
      {
        id: uid('mv'), tenantId: args.tenantId, locationId: args.fromLocationId,
        productId: args.productId, type: 'traslado_salida', qty: -args.qty,
        userId: args.userId, createdAt: now,
      },
      {
        id: uid('mv'), tenantId: args.tenantId, locationId: args.toLocationId,
        productId: args.productId, type: 'traslado_entrada', qty: args.qty,
        userId: args.userId, createdAt: now,
      },
    ])
  })
  await audit({
    tenantId: args.tenantId,
    locationId: args.fromLocationId,
    userId: args.userId,
    userName: args.userName,
    action: 'trasladó stock',
    entity: 'producto',
    entityId: args.productId,
    detail: `Movió ${args.qty} unidades a otro local.`,
  })
}

// ---- Eventos Recepción (DIAN) sobre facturas de compra recibidas ----------
export async function registerReceptionEvent(
  purchaseId: string,
  event: 'acuse' | 'reciboBien' | 'aceptacion',
  userId: string,
  userName: string,
): Promise<void> {
  const pur = await db.purchases.get(purchaseId)
  if (!pur) return
  const now = new Date().toISOString()
  pur.dianEvents = { ...(pur.dianEvents ?? {}), [event]: now }
  await db.purchases.put(pur)
  const labels: Record<string, string> = { acuse: 'acuse de recibo', reciboBien: 'recibo del bien', aceptacion: 'aceptación expresa' }
  await audit({
    tenantId: pur.tenantId, locationId: pur.locationId, userId, userName,
    action: `transmitió ${labels[event]} (DIAN)`, entity: 'compra', entityId: pur.id, detail: `${pur.number}`,
  })
}

// ---- Nota débito (cargo adicional sobre una venta) ------------------------
export async function generateDebitNote(saleId: string, amount: number, reason: string, userId: string, userName: string): Promise<string | null> {
  const sale = await db.sales.get(saleId)
  if (!sale) return null
  const number = nextDebitNoteNumber()
  sale.debitNoteNumber = number
  sale.debitNoteAmount = amount
  sale.note = sale.note ? `${sale.note} · ND: ${reason}` : `ND: ${reason}`
  // Venta + saldo + libro de crédito en una sola transacción (no quedan a medias).
  await db.transaction('rw', [db.sales, db.customers, db.creditMovements], async () => {
    await db.sales.put(sale)
    if (sale.customerId) {
      const c = await db.customers.get(sale.customerId)
      if (c) {
        c.creditBalance += amount
        await db.customers.put(c)
        await db.creditMovements.put({
          id: uid('cm'), tenantId: sale.tenantId, customerId: c.id, delta: amount,
          type: 'nota', refId: sale.id, userId, createdAt: new Date().toISOString(),
        })
      }
    }
  })
  await audit({
    tenantId: sale.tenantId, locationId: sale.locationId, userId, userName,
    action: 'generó nota débito', entity: 'venta', entityId: sale.id, detail: `${number} · ${amount} · ${reason}`,
  })
  return number
}

// ---- Traspaso con conversión de presentación (caja → unidades) ------------
export async function convertStock(args: {
  tenantId: string
  locationId: string
  fromProductId: string
  fromQty: number
  toProductId: string
  toQty: number
  userId: string
  userName: string
}): Promise<void> {
  const now = new Date().toISOString()
  await db.transaction('rw', [db.stock, db.stockMovements], async () => {
    const fromSt = await db.stock.get(`${args.locationId}:${args.fromProductId}`)
    if (fromSt) {
      fromSt.quantity = Number((fromSt.quantity - args.fromQty).toFixed(3))
      fromSt.updatedAt = now
      await db.stock.put(fromSt)
    }
    const toId = `${args.locationId}:${args.toProductId}`
    const toSt = await db.stock.get(toId)
    if (toSt) {
      toSt.quantity = Number((toSt.quantity + args.toQty).toFixed(3))
      toSt.updatedAt = now
      await db.stock.put(toSt)
    } else {
      await db.stock.put({
        id: toId, tenantId: args.tenantId, locationId: args.locationId, productId: args.toProductId,
        quantity: args.toQty, reorderThreshold: 4, reorderTarget: 12, updatedAt: now,
      })
    }
    await db.stockMovements.bulkPut([
      { id: uid('mv'), tenantId: args.tenantId, locationId: args.locationId, productId: args.fromProductId, type: 'traslado_salida', qty: -args.fromQty, userId: args.userId, createdAt: now },
      { id: uid('mv'), tenantId: args.tenantId, locationId: args.locationId, productId: args.toProductId, type: 'traslado_entrada', qty: args.toQty, userId: args.userId, createdAt: now },
    ])
  })
  await audit({
    tenantId: args.tenantId, locationId: args.locationId, userId: args.userId, userName: args.userName,
    action: 'convirtió presentación', entity: 'producto', entityId: args.fromProductId,
    detail: `${args.fromQty} → ${args.toQty} unidades`,
  })
}

// ---- Devolución a proveedor (sale del inventario, baja la deuda) -----------
export async function recordSupplierReturn(args: {
  tenantId: string
  locationId: string
  supplierId: string
  supplierName: string
  items: { productId: string; name: string; qty: number; unitCost: number }[]
  reduceDebt: boolean
  userId: string
  userName: string
}): Promise<void> {
  const now = new Date().toISOString()
  const total = args.items.reduce((s, it) => s + it.unitCost * it.qty, 0)
  await db.transaction('rw', [db.stock, db.stockMovements, db.suppliers], async () => {
    for (const it of args.items) {
      const st = await db.stock.get(`${args.locationId}:${it.productId}`)
      if (st) {
        st.quantity = Number((st.quantity - it.qty).toFixed(3))
        st.updatedAt = now
        await db.stock.put(st)
      }
      await db.stockMovements.put({
        id: uid('mv'), tenantId: args.tenantId, locationId: args.locationId, productId: it.productId,
        type: 'ajuste', qty: -it.qty, userId: args.userId, createdAt: now,
      })
    }
    if (args.reduceDebt) {
      const sup = await db.suppliers.get(args.supplierId)
      if (sup) { sup.debt = Math.max(0, (sup.debt ?? 0) - Math.round(total)); await db.suppliers.put(sup) }
    }
  })
  await audit({
    tenantId: args.tenantId, locationId: args.locationId, userId: args.userId, userName: args.userName,
    action: 'devolución a proveedor', entity: 'proveedor', entityId: args.supplierId,
    detail: `${args.items.length} productos a ${args.supplierName}${args.reduceDebt ? ` · −${Math.round(total)} deuda` : ''}`,
  })
}

// ---- Caja: abrir y cerrar (arqueo) ----------------------------------------
export async function openCashSession(args: {
  tenantId: string
  locationId: string
  userId: string
  openingFloat: number
}): Promise<CashSession> {
  // Cierra cualquier sesión abierta previa del local
  const open = await db.cashSessions
    .where('locationId').equals(args.locationId)
    .and((c) => c.status === 'abierta')
    .first()
  if (open) return open
  const cs: CashSession = {
    id: uid('cs'),
    tenantId: args.tenantId,
    locationId: args.locationId,
    userId: args.userId,
    openedAt: new Date().toISOString(),
    openingFloat: args.openingFloat,
    status: 'abierta',
  }
  await db.cashSessions.put(cs)
  return cs
}

export async function closeCashSession(args: {
  sessionId: string
  countedCash: number
  userId: string
  userName: string
}): Promise<CashSession | null> {
  const cs = await db.cashSessions.get(args.sessionId)
  if (!cs) return null
  // Efectivo esperado = base + ventas en efectivo de ESTA sesión de caja.
  // Por cashSessionId (no por reloj): exacto y coherente con el Informe Z aunque
  // el turno cruce la medianoche.
  const sales = await db.sales.where('locationId').equals(cs.locationId).toArray()
  let cashSales = 0
  for (const s of sales) {
    if (s.cashSessionId !== cs.id || s.status !== 'completada') continue
    for (const p of s.payments) if (p.method === 'efectivo') cashSales += p.amount
  }
  // Ingresos/egresos de efectivo registrados durante la sesión
  const movements = await db.cashMovements.where('sessionId').equals(cs.id).toArray()
  let movNet = 0
  for (const m of movements) movNet += m.type === 'ingreso' ? m.amount : -m.amount
  const expected = cs.openingFloat + cashSales + movNet
  cs.closedAt = new Date().toISOString()
  cs.countedCash = args.countedCash
  cs.expectedCash = expected
  cs.difference = args.countedCash - expected
  cs.status = 'cerrada'
  await db.cashSessions.put(cs)
  if (Math.abs(cs.difference) >= 1000) {
    await notify({
      tenantId: cs.tenantId,
      locationId: cs.locationId,
      type: 'caja',
      severity: cs.difference < 0 ? 'aviso' : 'info',
      title: cs.difference < 0 ? 'Faltante en caja' : 'Sobrante en caja',
      message: `Diferencia de ${cs.difference} en el cierre.`,
    })
  }
  await audit({
    tenantId: cs.tenantId,
    locationId: cs.locationId,
    userId: args.userId,
    userName: args.userName,
    action: 'cerró caja',
    entity: 'caja',
    entityId: cs.id,
    detail: `Contado ${args.countedCash} · esperado ${expected} · dif ${cs.difference}.`,
  })
  return cs
}

// ---- Movimientos de efectivo en caja (ingreso/egreso/sangría) -------------
export async function addCashMovement(args: {
  tenantId: string
  locationId: string
  sessionId: string
  type: 'ingreso' | 'egreso'
  amount: number
  reason: string
  isExpense: boolean
  userId: string
  userName: string
}): Promise<void> {
  const now = new Date().toISOString()
  const mov: CashMovement = {
    id: uid('cm'),
    tenantId: args.tenantId,
    locationId: args.locationId,
    sessionId: args.sessionId,
    type: args.type,
    amount: args.amount,
    reason: args.reason,
    isExpense: args.isExpense,
    userId: args.userId,
    createdAt: now,
  }
  // Movimiento de caja y (si aplica) el gasto, en una sola transacción.
  await db.transaction('rw', [db.cashMovements, db.expenses], async () => {
    await db.cashMovements.put(mov)
    // Si es un egreso marcado como gasto del negocio, también afecta la utilidad
    if (args.type === 'egreso' && args.isExpense) {
      const exp: Expense = {
        id: uid('e'),
        tenantId: args.tenantId,
        locationId: args.locationId,
        category: args.reason || 'Gasto de caja',
        amount: args.amount,
        note: 'Pagado en efectivo desde caja',
        date: now,
      }
      await db.expenses.put(exp)
    }
  })
  await audit({
    tenantId: args.tenantId,
    locationId: args.locationId,
    userId: args.userId,
    userName: args.userName,
    action: args.type === 'ingreso' ? 'registró ingreso de caja' : 'registró egreso de caja',
    entity: 'caja',
    entityId: mov.id,
    detail: `${args.type === 'ingreso' ? '+' : '-'}${args.amount} · ${args.reason}`,
  })
}

// ---- Vueltas que el negocio quedó debiendo ("Cambio Anterior") ------------
export async function adjustChangeOwed(args: {
  tenantId: string
  locationId: string
  delta: number // + queda debiendo más, − paga/abona
  userId: string
  userName: string
  reason: string
}): Promise<number> {
  const now = new Date().toISOString()
  const existing = await db.changeOwed.get(args.locationId)
  const amount = Math.max(0, (existing?.amount ?? 0) + args.delta)
  await db.changeOwed.put({
    id: args.locationId, tenantId: args.tenantId, locationId: args.locationId, amount, updatedAt: now,
  })
  // Espejo en caja: el efectivo retenido por vueltas debidas SÍ está en el cajón.
  // Sin esto el arqueo marcaría "sobrante" (entra) o "faltante" (al pagarlas).
  const realDelta = amount - (existing?.amount ?? 0) // respeta el tope en 0
  if (realDelta !== 0) {
    const session = await db.cashSessions.where('locationId').equals(args.locationId).and((c) => c.status === 'abierta').first()
    if (session) {
      await db.cashMovements.put({
        id: uid('mov'), tenantId: args.tenantId, locationId: args.locationId, sessionId: session.id,
        type: realDelta > 0 ? 'ingreso' : 'egreso', amount: Math.abs(realDelta),
        reason: realDelta > 0 ? 'Vueltas debidas (efectivo retenido)' : 'Pago de vueltas debidas',
        isExpense: false, userId: args.userId, createdAt: now,
      })
    }
  }
  await audit({
    tenantId: args.tenantId, locationId: args.locationId, userId: args.userId, userName: args.userName,
    action: args.delta >= 0 ? 'dejó vueltas debiendo' : 'pagó vueltas',
    entity: 'caja', entityId: args.locationId,
    detail: `${args.delta >= 0 ? '+' : ''}${args.delta} · ${args.reason}. Saldo: ${amount}`,
  })
  return amount
}

// ---- Informe Z (cierre fiscal diario) -------------------------------------
export async function generateZReport(
  tenantId: string,
  locationId: string,
  dateStr: string,
  cumulative: boolean,
  userId: string,
  userName: string,
): Promise<ZReport> {
  const sales = await db.sales.where('locationId').equals(locationId).toArray()

  let count = 0, revenue = 0, base = 0, iva = 0, discounts = 0, returnsCount = 0
  const byMethod: Record<string, number> = {}
  const byDocType: Record<string, number> = {}
  const ivaAgg = new Map<number, { base: number; iva: number }>()
  for (const s of sales) {
    // Día contable (día de apertura de la caja), no la medianoche del reloj: así
    // el cierre incluye las ventas de después de medianoche del mismo turno.
    const sd = saleDay(s)
    if (cumulative ? sd > dateStr : sd !== dateStr) continue
    if (s.status === 'anulada' || (s.returns && s.returns.length)) returnsCount++
    if (s.status !== 'completada') continue
    count++; revenue += s.total; discounts += s.discount
    byDocType[s.dianDocType ?? 'tiquete_pos'] = (byDocType[s.dianDocType ?? 'tiquete_pos'] || 0) + s.total
    for (const p of s.payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amount
    const br = ivaBreakdown(s.items, s.discount)
    base += br.base; iva += br.iva
    for (const ln of br.lines) {
      const cur = ivaAgg.get(ln.rate) ?? { base: 0, iva: 0 }
      cur.base += ln.base; cur.iva += ln.iva
      ivaAgg.set(ln.rate, cur)
    }
  }
  const existing = await db.zReports.where('tenantId').equals(tenantId).count()
  // Cuadre exacto del consolidado: base + IVA == total (revenue). El IVA absorbe
  // el centavo del redondeo, igual que en cada documento.
  const rRevenue = Math.round(revenue)
  const rBase = Math.round(base)
  const z: ZReport = {
    id: uid('z'), tenantId, locationId, number: `Z-${String(existing + 1).padStart(4, '0')}`,
    date: dateStr, cumulative, count, revenue: rRevenue,
    base: rBase, iva: rRevenue - rBase,
    ivaByRate: [...ivaAgg.entries()].map(([rate, v]) => ({ rate, base: Math.round(v.base), iva: Math.round(v.iva) })).sort((a, b) => a.rate - b.rate),
    byMethod, byDocType, discounts: Math.round(discounts), returnsCount,
    generatedAt: new Date().toISOString(),
  }
  await db.zReports.put(z)
  await audit({
    tenantId, locationId, userId, userName, action: 'generó informe Z',
    entity: 'caja', entityId: z.id, detail: `${z.number} · ${dateStr} · ${count} ventas · ${Math.round(revenue)}`,
  })
  return z
}

// ---- Cartera: abono a una remisión a crédito ------------------------------
export async function abonarRemision(remisionId: string, amount: number): Promise<number> {
  const rem = await db.remisiones.get(remisionId)
  if (!rem) return 0
  rem.abonado = Math.min(rem.total, (rem.abonado ?? 0) + amount)
  await db.remisiones.put(rem)
  return rem.abonado
}

// ---- Fiado: registrar abono de un cliente ---------------------------------
// Cambio masivo de precios: aplica un % (positivo sube, negativo baja) a una
// lista de productos, redondeando a $50. Devuelve cuántos cambió.
export async function bulkPriceChange(
  products: Product[], pct: number,
  meta: { tenantId: string; locationId: string; userId: string; userName: string },
): Promise<number> {
  let n = 0
  for (const p of products) {
    const raw = p.price * (1 + pct / 100)
    const np = Math.max(0, Math.round(raw / 50) * 50)
    if (np !== p.price) { await db.products.update(p.id, { price: np }); n++ }
  }
  if (n > 0) {
    await audit({
      tenantId: meta.tenantId, locationId: meta.locationId, userId: meta.userId, userName: meta.userName,
      action: 'cambio masivo de precios', entity: 'producto', entityId: 'masivo',
      detail: `${pct > 0 ? '+' : ''}${pct}% a ${n} producto(s)`,
    })
  }
  return n
}

// Auto-rebaja de productos por vencer: pone una promo de % a los perecederos que
// vencen pronto y la quita cuando ya no aplican (reabastecidos / vendidos).
export async function runExpiryMarkdowns(tenantId: string, days: number, percent: number): Promise<number> {
  const products = (await db.products.toArray()).filter((p) => p.tenantId === tenantId && p.active && p.perishable)
  const stock = await db.stock.toArray()
  const now = Date.now()
  const soon = (exp?: string) => {
    if (!exp) return false
    const d = (new Date(exp).getTime() - now) / 86400000
    return d <= days && d > -100 // por vencer o recién vencido (no fechas absurdas)
  }
  let applied = 0
  for (const p of products) {
    const expiringSoon = stock.some((s) => s.productId === p.id && s.quantity > 0 && soon(s.nearestExpiry))
    if (expiringSoon && !p.markdownAuto) {
      await db.products.update(p.id, { promoType: 'percent', promoValue: percent, markdownAuto: true })
      applied++
    } else if (!expiringSoon && p.markdownAuto) {
      await db.products.update(p.id, { promoType: undefined, promoValue: undefined, markdownAuto: false })
    }
  }
  return applied
}

export async function maybeExpiryMarkdowns(tenantId: string): Promise<void> {
  const tenant = await db.tenants.get(tenantId)
  if (!tenant?.autoMarkdownExpiry) return
  const key = `ventanilla-markdown-${tenantId}`
  try {
    const last = Number(localStorage.getItem(key) || 0)
    if (Date.now() - last < 24 * 3600000) return
    localStorage.setItem(key, String(Date.now()))
  } catch { /* sin almacenamiento */ }
  try { await runExpiryMarkdowns(tenantId, tenant.markdownDays ?? 3, tenant.markdownPercent ?? 20) } catch { /* nunca rompe */ }
}

// Mensaje de recordatorio de fiado.
export function fiadoReminderMsg(name: string, amount: number, businessName: string): string {
  return `Hola ${name}, te saluda *${businessName}*. Te recordamos amablemente tu saldo pendiente de ${cop(amount)}. ¡Gracias! 🙏`
}

// Envía recordatorios de fiado por WhatsApp (vía nube) a clientes con deuda con
// antigüedad ≥ N días y sin recordatorio reciente. Devuelve cuántos se enviaron.
export async function runFiadoReminders(tenantId: string): Promise<number> {
  const tenant = await db.tenants.get(tenantId)
  const days = tenant?.fiadoReminderDays ?? 7
  const cutoff = Date.now() - days * 86400000
  const customers = (await db.customers.toArray()).filter((c) => c.tenantId === tenantId && c.creditBalance > 0 && c.phone)
  let sent = 0
  for (const c of customers) {
    const since = c.creditSince ? new Date(c.creditSince).getTime() : 0
    const lastRem = c.lastReminder ? new Date(c.lastReminder).getTime() : 0
    if (since && since > cutoff) continue // aún no cumple los N días debiendo
    if (lastRem && lastRem > cutoff) continue // ya se le recordó hace poco
    const ok = await sendSupplierWhatsApp(c.phone!, fiadoReminderMsg(c.name, c.creditBalance, tenant?.businessName ?? 'tu tienda'))
    if (ok) { c.lastReminder = new Date().toISOString(); await db.customers.put(c); sent++ }
  }
  return sent
}

// Corre los recordatorios automáticos a lo sumo 1 vez al día (si está activado y
// hay nube + WhatsApp). Se llama al abrir la app.
export async function maybeFiadoReminders(tenantId: string): Promise<void> {
  const tenant = await db.tenants.get(tenantId)
  if (!tenant?.autoFiadoReminder || !isCloudConfigured()) return
  const key = `ventanilla-fiado-rem-${tenantId}`
  try {
    const last = Number(localStorage.getItem(key) || 0)
    if (Date.now() - last < 24 * 3600000) return
    localStorage.setItem(key, String(Date.now()))
  } catch { /* sin almacenamiento */ }
  try { await runFiadoReminders(tenantId) } catch { /* nunca rompe */ }
}

export async function payCredit(customerId: string, amount: number, by?: { userId: string }): Promise<Customer | null> {
  const c = await db.customers.get(customerId)
  if (!c) return null
  const before = c.creditBalance
  // Saldo y libro de crédito en una sola transacción (no quedan descuadrados).
  await db.transaction('rw', [db.customers, db.creditMovements], async () => {
    c.creditBalance = Math.max(0, c.creditBalance - amount)
    if (c.creditBalance === 0) { c.creditSince = undefined; c.lastReminder = undefined } // saldó: reinicia antigüedad
    await db.customers.put(c)
    const delta = Number((c.creditBalance - before).toFixed(2)) // negativo (lo que se abonó)
    if (delta !== 0) {
      await db.creditMovements.put({
        // Queda firmado con quien registró el abono (trazabilidad anti-fraude).
        id: uid('cm'), tenantId: c.tenantId, customerId: c.id, delta,
        type: 'abono', userId: by?.userId ?? '', createdAt: new Date().toISOString(),
      })
    }
  })
  return c
}

// ---- Marcar venta como transmitida a la DIAN ------------------------------
export async function transmitDian(saleId: string): Promise<void> {
  const sale = await db.sales.get(saleId)
  if (!sale) return
  sale.dianStatus = 'enviado'
  if (!sale.dianDocNumber) {
    sale.dianDocNumber = sale.dianDocType === 'factura' ? nextFacturaNumber() : nextDianNumber()
  }
  await db.sales.put(sale)
}

// ---- Remisiones (notas de despacho/entrega) -------------------------------
export interface CreateRemisionInput {
  tenantId: string
  locationId: string
  userId: string
  userName: string
  customerName: string
  customerId?: string
  customerDoc?: string
  customerAddress?: string
  items: SaleItem[]
  discount: number
  note?: string
  onCredit?: boolean
  dueDate?: string
}

export async function createRemision(input: CreateRemisionInput): Promise<Remision> {
  const subtotal = input.items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0)
  const total = Math.max(0, Math.round(subtotal - input.discount))
  const now = new Date().toISOString()
  const rem: Remision = {
    id: uid('rem'),
    tenantId: input.tenantId,
    locationId: input.locationId,
    userId: input.userId,
    number: nextRemisionNumber(),
    customerName: input.customerName,
    customerId: input.customerId,
    customerDoc: input.customerDoc,
    customerAddress: input.customerAddress,
    items: input.items,
    subtotal: Math.round(subtotal),
    discount: input.discount,
    total,
    note: input.note,
    status: 'emitida',
    onCredit: input.onCredit,
    dueDate: input.dueDate,
    abonado: input.onCredit ? 0 : total,
    createdAt: now,
  }
  await db.transaction('rw', [db.remisiones, db.stock, db.stockMovements], async () => {
    await db.remisiones.put(rem)
    // La remisión despacha mercancía → descuenta stock
    for (const it of input.items) {
      const st = await db.stock.get(`${input.locationId}:${it.productId}`)
      if (st) {
        st.quantity = Number((st.quantity - it.qty).toFixed(3))
        st.updatedAt = now
        await db.stock.put(st)
      }
      await db.stockMovements.put({
        id: uid('mv'),
        tenantId: input.tenantId,
        locationId: input.locationId,
        productId: it.productId,
        type: 'remision',
        qty: -it.qty,
        refId: rem.id,
        userId: input.userId,
        createdAt: now,
      })
    }
  })
  await audit({
    tenantId: input.tenantId,
    locationId: input.locationId,
    userId: input.userId,
    userName: input.userName,
    action: 'emitió remisión',
    entity: 'remision',
    entityId: rem.id,
    detail: `${rem.number} · ${input.customerName} · total ${total}`,
  })
  return rem
}

// Convierte una remisión en factura electrónica (sin volver a descontar stock).
export async function convertRemisionToFactura(
  remisionId: string,
  payments: Payment[],
  fiscal: {
    userId: string
    userName: string
    customerIdType?: 'CC' | 'NIT' | 'CE'
    customerEmail?: string
  },
): Promise<Sale | null> {
  const rem = await db.remisiones.get(remisionId)
  if (!rem || rem.status !== 'emitida') return null
  const sale = await recordSale({
    tenantId: rem.tenantId,
    locationId: rem.locationId,
    userId: fiscal.userId,
    userName: fiscal.userName,
    items: rem.items,
    discount: rem.discount,
    payments,
    customerId: rem.customerId,
    customerDoc: rem.customerDoc,
    customerName: rem.customerName,
    customerAddress: rem.customerAddress,
    customerIdType: fiscal.customerIdType,
    customerEmail: fiscal.customerEmail,
    transmitDian: true,
    docType: 'factura',
    remisionId: rem.id,
    skipStock: true, // el stock ya se descontó al emitir la remisión
  })
  rem.status = 'facturada'
  rem.facturaId = sale.id
  await db.remisiones.put(rem)
  return sale
}

// Anula una remisión y devuelve el stock.
export async function voidRemision(remisionId: string, userId: string, userName: string): Promise<void> {
  const rem = await db.remisiones.get(remisionId)
  if (!rem || rem.status !== 'emitida') return
  const now = new Date().toISOString()
  await db.transaction('rw', [db.remisiones, db.stock, db.stockMovements], async () => {
    rem.status = 'anulada'
    await db.remisiones.put(rem)
    for (const it of rem.items) {
      const st = await db.stock.get(`${rem.locationId}:${it.productId}`)
      if (st) {
        st.quantity = Number((st.quantity + it.qty).toFixed(3))
        st.updatedAt = now
        await db.stock.put(st)
      }
      await db.stockMovements.put({
        id: uid('mv'),
        tenantId: rem.tenantId,
        locationId: rem.locationId,
        productId: it.productId,
        type: 'devolucion',
        qty: it.qty,
        refId: rem.id,
        userId,
        createdAt: now,
      })
    }
  })
  await audit({
    tenantId: rem.tenantId,
    locationId: rem.locationId,
    userId,
    userName,
    action: 'anuló remisión',
    entity: 'remision',
    entityId: rem.id,
    detail: `${rem.number} anulada · stock devuelto`,
  })
}

// ---- Domicilios (entregas) ------------------------------------------------
export interface CreateDomicilioInput {
  tenantId: string
  locationId: string
  userId: string
  userName: string
  customerName: string
  phone?: string
  address: string
  barrio?: string
  city?: string
  items: SaleItem[]
  paymentMethod: PaymentMethod
  repartidor?: string
  note?: string
}

// Busca un cliente por teléfono o nombre; si no existe, lo crea. Sirve para
// que un fiado (p. ej. en domicilios) quede como deuda de un cliente real.
export async function findOrCreateCustomer(
  tenantId: string, info: { name: string; phone?: string; address?: string },
): Promise<string> {
  const all = (await db.customers.toArray()).filter((c) => c.tenantId === tenantId)
  const match = all.find((c) => (info.phone && c.phone && c.phone === info.phone) || c.name.toLowerCase() === info.name.trim().toLowerCase())
  if (match) return match.id
  const id = uid('c')
  await db.customers.put({
    id, tenantId, name: info.name.trim(), phone: info.phone, address: info.address,
    creditBalance: 0, totalSpent: 0, points: 0, createdAt: new Date().toISOString(),
  })
  return id
}

export async function createDomicilio(input: CreateDomicilioInput): Promise<Domicilio> {
  const total = Math.round(input.items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0))
  // Si el domicilio es a fiado, vincula (o crea) el cliente para registrar la deuda.
  const customerId = input.paymentMethod === 'fiado'
    ? await findOrCreateCustomer(input.tenantId, { name: input.customerName, phone: input.phone, address: input.address })
    : undefined
  const sale = await recordSale({
    tenantId: input.tenantId, locationId: input.locationId, userId: input.userId, userName: input.userName,
    items: input.items, discount: 0,
    payments: [{ method: input.paymentMethod, amount: total, confirmed: input.paymentMethod !== 'fiado' }],
    customerId, customerName: input.customerName, customerAddress: input.address,
    note: input.note, transmitDian: true,
  })
  const dom: Domicilio = {
    id: uid('dom'), tenantId: input.tenantId, locationId: input.locationId,
    customerName: input.customerName, phone: input.phone, address: input.address,
    barrio: input.barrio, city: input.city, items: input.items, total,
    paymentMethod: input.paymentMethod, repartidor: input.repartidor, status: 'pendiente',
    saleId: sale.id, note: input.note, createdAt: new Date().toISOString(),
  }
  await db.domicilios.put(dom)
  await audit({
    tenantId: input.tenantId, locationId: input.locationId, userId: input.userId, userName: input.userName,
    action: 'creó domicilio', entity: 'domicilio', entityId: dom.id, detail: `${input.customerName} · ${input.address} · ${total}`,
  })
  return dom
}

export async function updateDomicilioStatus(
  id: string, status: DomicilioStatus, repartidor: string | undefined, userId: string, userName: string,
): Promise<void> {
  const dom = await db.domicilios.get(id)
  if (!dom) return
  const now = new Date().toISOString()
  if (status === 'cancelado' && dom.saleId) await voidSale(dom.saleId, userId, userName)
  dom.status = status
  if (repartidor !== undefined) dom.repartidor = repartidor
  if (status === 'entregado') dom.deliveredAt = now
  await db.domicilios.put(dom)
  await audit({
    tenantId: dom.tenantId, locationId: dom.locationId, userId, userName,
    action: `domicilio: ${status.replace('_', ' ')}`, entity: 'domicilio', entityId: dom.id, detail: dom.customerName,
  })
}

// ---- Respaldo: exportar / importar TODA la base local ---------------------
export async function exportAllData(): Promise<string> {
  const out: Record<string, unknown> = {
    app: 'ventanilla',
    schema: 3,
    exportedAt: new Date().toISOString(),
  }
  for (const t of db.tables) out[t.name] = await t.toArray()
  return JSON.stringify(out)
}

export async function importAllData(json: string): Promise<void> {
  const data = JSON.parse(json) as Record<string, unknown>
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      const rows = data[t.name]
      if (Array.isArray(rows)) {
        await t.clear()
        await t.bulkPut(rows)
      }
    }
  })
}

// ---- Ventas de hoy de un local (para el POS / caja) -----------------------
export async function todaySales(locationId: string): Promise<Sale[]> {
  const since = startOfToday()
  const all = await db.sales.where('locationId').equals(locationId).toArray()
  return all
    .filter((s) => new Date(s.createdAt).getTime() >= since)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
}
