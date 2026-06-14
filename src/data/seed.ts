import { db } from './db'
import type {
  Tenant,
  Location,
  User,
  Category,
  Product,
  Stock,
  Sale,
  SaleItem,
  Payment,
  Customer,
  Supplier,
  PaymentMethod,
  AppNotification,
  Expense,
  Remision,
  PurchaseOrder,
  ChangeOwed,
  Purchase,
} from '@/types'
import { daysUntil } from '@/lib/format'

// ============================================================================
// Datos de demostración.
// Negocio principal: "Tienda La Esquina" (3 locales en el Quindío / Pereira).
// Además varios clientes adicionales para que el Super-Admin tenga qué ver.
// ============================================================================

const rnd = (min: number, max: number) => Math.floor(min + Math.random() * (max - min + 1))
const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]
const iso = (d: Date) => d.toISOString()

// ---------------------------------------------------------------------------
// Cliente principal del demo
// ---------------------------------------------------------------------------
const TENANT_ID = 't_esquina'

const tenant: Tenant = {
  id: TENANT_ID,
  businessName: 'Tienda La Esquina',
  ownerName: 'Marcela Ríos',
  nit: '900.123.456-7',
  email: 'laesquina@demo.co',
  phone: '+57 314 755 5896',
  city: 'Armenia, Quindío',
  status: 'activo',
  monthlyFeePerLocation: 49900,
  paidUntil: iso(new Date(Date.now() + 18 * 86400000)),
  createdAt: iso(new Date(Date.now() - 200 * 86400000)),
  dian: {
    enabled: true,
    provider: 'alegra',
    resolutionNumber: '18760000001',
    resolutionRange: 'POS1  1 al 5000',
    technicalKey: 'demo-clave-tecnica-xxxx',
    testMode: true,
  },
  locationCount: 3,
  monthlyGoal: 18000000,
  commissionPct: 1,
}

// ---------------------------------------------------------------------------
// Locales / ventanillas
// ---------------------------------------------------------------------------
const locations: Location[] = [
  {
    id: 'l_centro',
    tenantId: TENANT_ID,
    name: 'La Esquina · Centro',
    address: 'Cra 14 # 18-32',
    city: 'Armenia',
    allowBulk: true,
    active: true,
    createdAt: tenant.createdAt,
  },
  {
    id: 'l_norte',
    tenantId: TENANT_ID,
    name: 'La Esquina · Norte',
    address: 'Av. Bolívar # 40-15',
    city: 'Armenia',
    allowBulk: false,
    active: true,
    createdAt: tenant.createdAt,
  },
  {
    id: 'l_pereira',
    tenantId: TENANT_ID,
    name: 'La Esquina · Pereira',
    address: 'Cra 8 # 23-44',
    city: 'Pereira',
    allowBulk: true,
    active: true,
    createdAt: iso(new Date(Date.now() - 90 * 86400000)),
  },
]

// ---------------------------------------------------------------------------
// Usuarios: super-admin (plataforma), admin (dueña) y empleados (cajeros)
// ---------------------------------------------------------------------------
const users: User[] = [
  {
    id: 'u_super',
    tenantId: null,
    name: 'Plataforma Ventanilla',
    role: 'superadmin',
    pin: '0000',
    email: 'admin@ventanilla.co',
    active: true,
  },
  {
    id: 'u_admin',
    tenantId: TENANT_ID,
    name: 'Marcela Ríos (Dueña)',
    role: 'admin',
    pin: '1111',
    email: 'laesquina@demo.co',
    active: true,
  },
  {
    id: 'u_caj1',
    tenantId: TENANT_ID,
    name: 'Juan Ortiz',
    role: 'empleado',
    pin: '1234',
    locationId: 'l_centro',
    active: true,
  },
  {
    id: 'u_caj2',
    tenantId: TENANT_ID,
    name: 'Laura Gómez',
    role: 'empleado',
    pin: '2345',
    locationId: 'l_norte',
    // Demo de permisos: Laura no puede dar descuentos ni gestionar inventario
    permissions: { canDiscount: false, canManageInventory: false, canCashMovement: true, canVoid: false },
    active: true,
  },
  {
    id: 'u_caj3',
    tenantId: TENANT_ID,
    name: 'Andrés Patiño',
    role: 'empleado',
    pin: '3456',
    locationId: 'l_pereira',
    active: true,
  },
]

// ---------------------------------------------------------------------------
// Categorías
// ---------------------------------------------------------------------------
const categories: Category[] = [
  { id: 'c_beb', tenantId: TENANT_ID, name: 'Bebidas', color: '#3b82f6', emoji: '🥤' },
  { id: 'c_mec', tenantId: TENANT_ID, name: 'Mecato', color: '#f59e0b', emoji: '🍪' },
  { id: 'c_aseo', tenantId: TENANT_ID, name: 'Aseo', color: '#06b6d4', emoji: '🧼' },
  { id: 'c_aba', tenantId: TENANT_ID, name: 'Abarrotes', color: '#8b5cf6', emoji: '🍚' },
  { id: 'c_lac', tenantId: TENANT_ID, name: 'Lácteos', color: '#ec4899', emoji: '🥛' },
  { id: 'c_gra', tenantId: TENANT_ID, name: 'Granel', color: '#10b981', emoji: '⚖️' },
  { id: 'c_lic', tenantId: TENANT_ID, name: 'Licores', color: '#ef4444', emoji: '🍺' },
]

// ---------------------------------------------------------------------------
// Proveedores
// ---------------------------------------------------------------------------
const suppliers: Supplier[] = [
  {
    id: 's_postobon',
    tenantId: TENANT_ID,
    name: 'Distribuidora Postobón',
    contactName: 'Carlos Mejía',
    whatsapp: '573015550199',
    email: 'pedidos.postobon@demo.co',
    phone: '+57 606 745 1234',
    leadTimeDays: 2,
    debt: 120000,
    note: 'Entrega martes y viernes.',
  },
  {
    id: 's_nutresa',
    tenantId: TENANT_ID,
    name: 'Comercial Nutresa',
    contactName: 'Diana Salazar',
    whatsapp: '573015550288',
    email: 'ventas.nutresa@demo.co',
    leadTimeDays: 3,
    debt: 0,
  },
  {
    id: 's_aseo',
    tenantId: TENANT_ID,
    name: 'Aseo y Hogar del Café',
    contactName: 'Pedro Niño',
    whatsapp: '573015550377',
    email: 'aseohogar@demo.co',
    leadTimeDays: 4,
    debt: 45000,
  },
  {
    id: 's_granos',
    tenantId: TENANT_ID,
    name: 'Granos y Abarrotes El Edén',
    contactName: 'Marta Ruiz',
    whatsapp: '573015550466',
    email: 'eleden.granos@demo.co',
    leadTimeDays: 2,
    debt: 0,
  },
]

// ---------------------------------------------------------------------------
// Productos — precios de referencia de una ventanilla en Armenia, Quindío (COP).
// Tupla: [nombre, categoría, precio, costo, iva, emoji, unidad, proveedor, perecedero]
// El código de barras se autogenera; el granel usa código interno.
// ---------------------------------------------------------------------------
type P = [string, string, number, number, number, string, 'unidad' | 'peso', string, boolean]
const productDefs: P[] = [
  // Bebidas
  ['Gaseosa Postobón 1.5L', 'c_beb', 5000, 3700, 19, '🥤', 'unidad', 's_postobon', false],
  ['Gaseosa Postobón 2.5L', 'c_beb', 6500, 4900, 19, '🥤', 'unidad', 's_postobon', false],
  ['Coca-Cola 400ml', 'c_beb', 2800, 1900, 19, '🥤', 'unidad', 's_postobon', false],
  ['Agua Cristal 600ml', 'c_beb', 2000, 1100, 19, '💧', 'unidad', 's_postobon', false],
  ['Jugo Hit Mora 500ml', 'c_beb', 3000, 2100, 19, '🧃', 'unidad', 's_postobon', false],
  ['Pony Malta 330ml', 'c_beb', 2800, 1950, 19, '🍺', 'unidad', 's_postobon', false],
  // Mecato
  ['Papas Margarita Pollo', 'c_mec', 2000, 1300, 19, '🥔', 'unidad', 's_nutresa', false],
  ['Doritos Mega Queso', 'c_mec', 4000, 2800, 19, '🌮', 'unidad', 's_nutresa', false],
  ['Galleta Festival (taco)', 'c_mec', 3500, 2500, 19, '🍪', 'unidad', 's_nutresa', false],
  ['Chocorramo', 'c_mec', 2000, 1300, 19, '🍫', 'unidad', 's_nutresa', false],
  ['Chocolatina Jet', 'c_mec', 1200, 750, 19, '🍫', 'unidad', 's_nutresa', false],
  ['Bon Bon Bum', 'c_mec', 600, 350, 19, '🍭', 'unidad', 's_nutresa', false],
  ['Maní Moto 25g', 'c_mec', 1500, 950, 19, '🥜', 'unidad', 's_nutresa', false],
  // Aseo
  ['Jabón Rey 300g', 'c_aseo', 3000, 2100, 19, '🧼', 'unidad', 's_aseo', false],
  ['Detergente Fab 1kg', 'c_aseo', 11000, 8200, 19, '🧴', 'unidad', 's_aseo', false],
  ['Papel Higiénico Familia x4', 'c_aseo', 6500, 4700, 19, '🧻', 'unidad', 's_aseo', false],
  ['Crema Dental Colgate 75ml', 'c_aseo', 5500, 3900, 19, '🪥', 'unidad', 's_aseo', false],
  ['Jabón Protex', 'c_aseo', 3500, 2500, 19, '🧼', 'unidad', 's_aseo', false],
  // Abarrotes
  ['Arroz Diana 500g', 'c_aba', 2600, 2000, 5, '🍚', 'unidad', 's_granos', false],
  ['Arroz Diana 1kg', 'c_aba', 5000, 3900, 5, '🍚', 'unidad', 's_granos', false],
  ['Aceite Premier 1L', 'c_aba', 12500, 9800, 5, '🛢️', 'unidad', 's_granos', false],
  ['Harina PAN 1kg', 'c_aba', 5500, 4300, 5, '🌽', 'unidad', 's_granos', false],
  ['Panela cuadrada 500g', 'c_aba', 3500, 2700, 5, '🟫', 'unidad', 's_granos', false],
  ['Sal Refisal 500g', 'c_aba', 1800, 1100, 5, '🧂', 'unidad', 's_granos', false],
  ['Atún Van Camps', 'c_aba', 6000, 4500, 19, '🐟', 'unidad', 's_granos', false],
  ['Café Sello Rojo 250g', 'c_aba', 9800, 7800, 19, '☕', 'unidad', 's_granos', false],
  ['Chocolate Corona pastilla', 'c_aba', 4500, 3400, 19, '🍫', 'unidad', 's_nutresa', false],
  // Lácteos (perecederos)
  ['Leche Colanta 1L', 'c_lac', 4300, 3500, 0, '🥛', 'unidad', 's_nutresa', true],
  ['Yogur Alpina 1L', 'c_lac', 8000, 6300, 0, '🥛', 'unidad', 's_nutresa', true],
  ['Queso Campesino 250g', 'c_lac', 7000, 5500, 0, '🧀', 'unidad', 's_nutresa', true],
  ['Huevos AA x12', 'c_lac', 11000, 9000, 0, '🥚', 'unidad', 's_granos', true],
  // Licores (característicos del eje cafetero)
  ['Cerveza Águila lata 330', 'c_lic', 3200, 2300, 19, '🍺', 'unidad', 's_postobon', false],
  ['Cerveza Poker lata 330', 'c_lic', 3200, 2300, 19, '🍺', 'unidad', 's_postobon', false],
  ['Aguardiente Cristal 375ml', 'c_lic', 35000, 28000, 19, '🍶', 'unidad', 's_postobon', false],
  ['Ron Viejo de Caldas 375ml', 'c_lic', 38000, 31000, 19, '🥃', 'unidad', 's_postobon', false],
  // Granel (por peso) — sólo locales con allowBulk
  ['Arroz a granel', 'c_gra', 4200, 3300, 5, '🌾', 'peso', 's_granos', false],
  ['Fríjol cargamanto', 'c_gra', 9800, 7800, 5, '🫘', 'peso', 's_granos', false],
  ['Lenteja a granel', 'c_gra', 6500, 5000, 5, '🫘', 'peso', 's_granos', false],
  ['Azúcar a granel', 'c_gra', 4500, 3500, 5, '🍬', 'peso', 's_granos', false],
]

function buildProducts(): Product[] {
  return productDefs.map((d, i) => {
    const [name, categoryId, price, cost, ivaRate, emoji, unit, supplierId, perishable] = d
    const hasBarcode = unit !== 'peso'
    return {
      id: `p_${i}`,
      tenantId: TENANT_ID,
      name,
      barcode: hasBarcode ? `770201${100000 + i}` : undefined,
      internalCode: hasBarcode ? undefined : `VEN-${100000 + i}`,
      categoryId,
      unit,
      price,
      cost,
      avgCost: cost,
      ivaRate,
      supplierId,
      perishable,
      imageEmoji: emoji,
      // Precio al por mayor en bebidas y licores (desde 6 unidades)
      wholesalePrice: categoryId === 'c_beb' || categoryId === 'c_lic' ? Math.round(price * 0.9) : undefined,
      wholesaleMinQty: categoryId === 'c_beb' || categoryId === 'c_lic' ? 6 : undefined,
      // Promociones de ejemplo
      promoType: name.includes('Doritos') ? '2x1' : name.includes('Chocorramo') ? 'percent' : undefined,
      promoValue: name.includes('Chocorramo') ? 15 : undefined,
      active: true,
      createdAt: tenant.createdAt,
    }
  })
}

// ---------------------------------------------------------------------------
// Stock por local (incluye algunos bajos para disparar reorden y vencimientos)
// ---------------------------------------------------------------------------
function buildStock(products: Product[]): Stock[] {
  const out: Stock[] = []
  for (const loc of locations) {
    for (const p of products) {
      // El granel sólo existe en locales que lo permiten
      if (p.unit === 'peso' && !loc.allowBulk) continue
      // Alta rotación: bebidas, mecato y cervezas → umbral más alto
      const fast = p.categoryId === 'c_beb' || p.categoryId === 'c_mec' || p.name.startsWith('Cerveza')
      const base = p.unit === 'peso' ? rnd(8, 40) : rnd(6, 80)
      // Algunos productos quedan deliberadamente bajos
      const low = Math.random() < 0.18
      const qty = low ? rnd(0, 4) : base
      const threshold = fast ? rnd(12, 20) : rnd(4, 8)
      let nearestExpiry: string | undefined
      if (p.perishable) {
        const d = new Date(Date.now() + rnd(-2, 40) * 86400000)
        nearestExpiry = iso(d)
      }
      out.push({
        id: `${loc.id}:${p.id}`,
        tenantId: TENANT_ID,
        locationId: loc.id,
        productId: p.id,
        quantity: qty,
        reorderThreshold: threshold,
        reorderTarget: threshold * 3,
        nearestExpiry,
        updatedAt: iso(new Date()),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Clientes (con fiado, típico de tienda de barrio)
// ---------------------------------------------------------------------------
const customers: Customer[] = [
  {
    id: 'cl_1',
    tenantId: TENANT_ID,
    name: 'Doña Rosa (vecina)',
    phone: '573201112233',
    idNumber: '41.234.567',
    creditBalance: 23500,
    totalSpent: 540000,
    points: 540,
    createdAt: tenant.createdAt,
  },
  {
    id: 'cl_2',
    tenantId: TENANT_ID,
    name: 'Don Hernán',
    phone: '573204445566',
    idNumber: '7.890.123',
    creditBalance: 12000,
    totalSpent: 310000,
    points: 310,
    createdAt: tenant.createdAt,
  },
  {
    id: 'cl_3',
    tenantId: TENANT_ID,
    name: 'Restaurante El Sabor (NIT)',
    phone: '573207778899',
    idNumber: '901.222.333-1',
    creditBalance: 0,
    totalSpent: 1820000,
    points: 1820,
    createdAt: tenant.createdAt,
  },
]

// ---------------------------------------------------------------------------
// Ventas históricas (para que el dashboard y los reportes luzcan reales)
// ---------------------------------------------------------------------------
const PAYMENT_WEIGHTS: PaymentMethod[] = [
  'efectivo', 'efectivo', 'efectivo', 'efectivo', 'efectivo',
  'nequi', 'nequi', 'nequi',
  'tarjeta', 'tarjeta',
  'transferencia',
  'fiado',
]

function buildHistory(products: Product[]): Sale[] {
  const sales: Sale[] = []
  const days = 45
  const sellable = products
  for (let dayOffset = days; dayOffset >= 0; dayOffset--) {
    for (const loc of locations) {
      // Pereira abrió hace 90 días; igual entra en los 45.
      const isWeekend = [0, 6].includes(new Date(Date.now() - dayOffset * 86400000).getDay())
      const count = rnd(isWeekend ? 12 : 8, isWeekend ? 26 : 18)
      const emp = users.find((u) => u.locationId === loc.id)!
      for (let i = 0; i < count; i++) {
        const base = new Date(Date.now() - dayOffset * 86400000)
        base.setHours(rnd(7, 20), rnd(0, 59), rnd(0, 59), 0)
        const nItems = rnd(1, 5)
        const items: SaleItem[] = []
        for (let j = 0; j < nItems; j++) {
          const p = pick(sellable)
          if (p.unit === 'peso' && !loc.allowBulk) continue
          const qty = p.unit === 'peso' ? Number((0.1 + Math.random() * 1.5).toFixed(3)) : rnd(1, 4)
          items.push({
            productId: p.id,
            name: p.name,
            unit: p.unit,
            qty,
            unitPrice: p.price,
            lineDiscount: 0,
            ivaRate: p.ivaRate,
            cost: p.cost,
          })
        }
        if (!items.length) continue
        const subtotal = items.reduce((s, it) => s + it.unitPrice * it.qty - it.lineDiscount, 0)
        const discount = Math.random() < 0.1 ? rnd(500, 2000) : 0
        const total = Math.max(0, Math.round(subtotal - discount))
        const method = pick(PAYMENT_WEIGHTS)
        const payments: Payment[] = [{ method, amount: total, confirmed: method !== 'fiado' }]
        const dianStatus = Math.random() < 0.04 ? 'pendiente' : 'enviado'
        sales.push({
          id: `sh_${loc.id}_${dayOffset}_${i}`,
          tenantId: TENANT_ID,
          locationId: loc.id,
          userId: emp.id,
          items,
          subtotal: Math.round(subtotal),
          discount,
          total,
          payments,
          status: 'completada',
          dianStatus,
          dianDocType: 'tiquete_pos',
          dianDocNumber: dianStatus === 'enviado' ? `POS1-${rnd(1000, 4999)}` : undefined,
          createdAt: iso(base),
          syncedAt: iso(base),
        })
      }
    }
  }
  return sales
}

// ---------------------------------------------------------------------------
// Gastos (para utilidad neta real)
// ---------------------------------------------------------------------------
function buildExpenses(): Expense[] {
  const cats = ['Arriendo', 'Servicios', 'Nómina', 'Transporte', 'Otros']
  const out: Expense[] = []
  for (const loc of locations) {
    for (let m = 0; m < 2; m++) {
      out.push({
        id: `e_${loc.id}_${m}`,
        tenantId: TENANT_ID,
        locationId: loc.id,
        category: pick(cats),
        amount: rnd(300000, 1800000),
        note: 'Gasto mensual',
        date: iso(new Date(Date.now() - m * 30 * 86400000)),
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// Notificaciones iniciales (centro de notificaciones)
// ---------------------------------------------------------------------------
function buildNotifications(stock: Stock[]): AppNotification[] {
  const out: AppNotification[] = []
  const low = stock.filter((s) => s.quantity <= s.reorderThreshold).slice(0, 4)
  for (const s of low) {
    out.push({
      id: `n_${s.id}`,
      tenantId: TENANT_ID,
      locationId: s.locationId,
      type: 'stock',
      severity: s.quantity === 0 ? 'critico' : 'aviso',
      title: s.quantity === 0 ? 'Producto agotado' : 'Stock bajo',
      message: `Quedan ${s.quantity} unidades. Conviene reabastecer.`,
      read: false,
      createdAt: iso(new Date(Date.now() - rnd(1, 200) * 60000)),
    })
  }
  const expiring = stock.filter((s) => s.nearestExpiry && daysUntil(s.nearestExpiry) <= 7).slice(0, 3)
  for (const s of expiring) {
    out.push({
      id: `nv_${s.id}`,
      tenantId: TENANT_ID,
      locationId: s.locationId,
      type: 'vencimiento',
      severity: 'aviso',
      title: 'Producto por vencer',
      message: `Vence en ${daysUntil(s.nearestExpiry!)} días. Sugerencia: aplicar descuento.`,
      read: false,
      createdAt: iso(new Date(Date.now() - rnd(1, 300) * 60000)),
    })
  }
  return out
}

// ---------------------------------------------------------------------------
// Facturas electrónicas y remisiones de ejemplo
// ---------------------------------------------------------------------------
function mkItem(p: Product, qty: number): SaleItem {
  return {
    productId: p.id, name: p.name, unit: p.unit, qty,
    unitPrice: p.price, lineDiscount: 0, ivaRate: p.ivaRate, cost: p.cost,
  }
}
const sumItems = (items: SaleItem[]) => items.reduce((s, it) => s + it.unitPrice * it.qty, 0)

function buildSampleFacturas(products: Product[]): Sale[] {
  const p = (i: number) => products[i] ?? products[0]
  const i1 = [mkItem(p(19), 4), mkItem(p(15), 2), mkItem(p(0), 12)]
  const i2 = [mkItem(p(33), 3), mkItem(p(34), 2)]
  const mk = (id: string, num: string, items: SaleItem[], name: string, doc: string, idType: 'CC' | 'NIT', addr: string, ago: number): Sale => {
    const total = Math.round(sumItems(items))
    const when = iso(new Date(Date.now() - ago * 86400000))
    return {
      id, tenantId: TENANT_ID, locationId: 'l_centro', userId: 'u_admin',
      items, subtotal: total, discount: 0, total,
      payments: [{ method: 'transferencia', amount: total, confirmed: true }],
      customerName: name, customerDoc: doc, customerIdType: idType, customerAddress: addr,
      status: 'completada', dianStatus: 'enviado', dianDocType: 'factura', dianDocNumber: num,
      createdAt: when, syncedAt: when,
    }
  }
  return [
    mk('sf_fe_1', 'FE-941', i1, 'Restaurante El Sabor S.A.S.', '901.222.333-1', 'NIT', 'Cra 19 #12-40, Armenia', 3),
    mk('sf_fe_2', 'FE-942', i2, 'Carlos Mejía', '1.094.555.222', 'CC', 'Calle 21 #14-08, Armenia', 1),
  ]
}

function buildRemisiones(products: Product[]): Remision[] {
  const p = (i: number) => products[i] ?? products[0]
  const r1 = [mkItem(p(0), 24), mkItem(p(23), 12)]
  const r2 = [mkItem(p(18), 10), mkItem(p(20), 6)]
  const mk = (id: string, num: string, items: SaleItem[], name: string, addr: string, ago: number, credit?: { dueAgo: number; abonado: number }): Remision => {
    const total = Math.round(sumItems(items))
    return {
      id, tenantId: TENANT_ID, locationId: 'l_centro', userId: 'u_admin', number: num,
      customerName: name, customerAddress: addr, items, subtotal: total, discount: 0, total,
      note: 'Entrega a domicilio', status: 'emitida',
      onCredit: !!credit,
      dueDate: credit ? iso(new Date(Date.now() - credit.dueAgo * 86400000)) : undefined,
      abonado: credit ? credit.abonado : total,
      createdAt: iso(new Date(Date.now() - ago * 86400000)),
    }
  }
  return [
    // A crédito y atrasada (con abono parcial) → aparece en Cartera
    mk('rem_1', 'REM-121', r1, 'Tienda Doña Luz', 'Barrio La Patria, Armenia', 8, { dueAgo: 3, abonado: 20000 }),
    // A crédito, por vencer
    mk('rem_2', 'REM-122', r2, 'Cafetería La 15', 'Av. Centenario #15-22, Armenia', 1, { dueAgo: -10, abonado: 0 }),
  ]
}

function buildPurchaseOrders(products: Product[]): PurchaseOrder[] {
  const p = (i: number) => products[i] ?? products[0]
  const items = [
    { productId: p(0).id, name: p(0).name, suggestedQty: 24, receivedQty: 24, cost: p(0).cost },
    { productId: p(2).id, name: p(2).name, suggestedQty: 12, receivedQty: 12, cost: p(2).cost },
  ]
  return [
    {
      id: 'po_1', tenantId: TENANT_ID, locationId: 'l_centro', supplierId: 's_postobon',
      items, status: 'recibido',
      createdAt: iso(new Date(Date.now() - 3 * 86400000)),
      sentAt: iso(new Date(Date.now() - 3 * 86400000)),
      receivedAt: iso(new Date(Date.now() - 1 * 86400000)),
      paid: false,
    },
  ]
}

// ---------------------------------------------------------------------------
// Otros clientes del SaaS (para el panel del Super-Admin)
// ---------------------------------------------------------------------------
const otherTenants: Tenant[] = [
  mkTenant('t_donpan', 'Panadería Don Pan', 'José Restrepo', 'Calarcá', 'activo', 1, 5),
  mkTenant('t_minimax', 'Minimercado MiniMax', 'Sandra Loaiza', 'Pereira', 'activo', 4, 25),
  mkTenant('t_fruver', 'Fruver La Cosecha', 'Wilson Cárdenas', 'Montenegro', 'prueba', 1, 0),
  mkTenant('t_drogas', 'Drogas La Salud', 'Patricia Gil', 'Armenia', 'suspendido', 2, -6),
  mkTenant('t_licores', 'Licorera La 80', 'Mauricio Vélez', 'Pereira', 'activo', 3, 12),
]

function mkTenant(
  id: string,
  businessName: string,
  ownerName: string,
  city: string,
  status: Tenant['status'],
  locations: number,
  paidInDays: number,
): Tenant {
  return {
    id,
    businessName,
    ownerName,
    nit: `90${rnd(1000000, 9999999)}-${rnd(1, 9)}`,
    email: `${id}@demo.co`,
    phone: `+57 3${rnd(10, 25)} ${rnd(100, 999)} ${rnd(1000, 9999)}`,
    city,
    status,
    monthlyFeePerLocation: 49900,
    paidUntil: iso(new Date(Date.now() + paidInDays * 86400000)),
    createdAt: iso(new Date(Date.now() - rnd(30, 400) * 86400000)),
    dian: {
      enabled: status === 'activo',
      provider: pick(['alegra', 'factus', 'dian_gratuito'] as const),
      resolutionNumber: `${rnd(10000000, 99999999)}`,
      resolutionRange: 'POS1 1 al 5000',
      technicalKey: 'demo',
      testMode: true,
    },
    locationCount: locations,
  }
}

// ---------------------------------------------------------------------------
// Carga inicial
// ---------------------------------------------------------------------------
// Al subir una versión nueva del modelo de demo, se recarga automáticamente
// para que cualquier visitante vea los datos/precios más recientes.
const SEED_VERSION = '9-informez-cartera'
const SEED_KEY = 'ventanilla-seed-version'

export async function seedIfEmpty(): Promise<void> {
  let stored: string | null = null
  try {
    stored = localStorage.getItem(SEED_KEY)
  } catch {
    /* localStorage no disponible */
  }
  if (stored !== SEED_VERSION) {
    await resetDemo()
    try {
      localStorage.setItem(SEED_KEY, SEED_VERSION)
    } catch {
      /* ignore */
    }
    return
  }
  const count = await db.tenants.count()
  if (count === 0) await seedNow()
}

export async function seedNow(): Promise<void> {
  const products = buildProducts()
  const stock = buildStock(products)
  const sales = [...buildHistory(products), ...buildSampleFacturas(products)]
  const expenses = buildExpenses()
  const notifications = buildNotifications(stock)
  const remisiones = buildRemisiones(products)
  const purchaseOrders = buildPurchaseOrders(products)
  const changeOwed: ChangeOwed[] = [
    { id: 'l_centro', tenantId: TENANT_ID, locationId: 'l_centro', amount: 1500, updatedAt: iso(new Date()) },
  ]
  const p = (i: number) => products[i] ?? products[0]
  const purItems = [
    { productId: p(0).id, name: p(0).name, qty: 24, unitCost: p(0).cost },
    { productId: p(2).id, name: p(2).name, qty: 24, unitCost: p(2).cost },
  ]
  const purSub = purItems.reduce((s, it) => s + it.unitCost * it.qty, 0)
  const purchases: Purchase[] = [
    {
      id: 'pur_1', tenantId: TENANT_ID, locationId: 'l_centro',
      supplierId: 's_postobon', supplierName: 'Distribuidora Postobón',
      number: 'FC-401', supplierInvoice: '8842',
      items: purItems, subtotal: purSub, commercialDiscount: 0, weightAdjust: 0, total: purSub,
      paymentMethod: 'credito', paid: false, createdAt: iso(new Date(Date.now() - 2 * 86400000)),
    },
  ]

  await db.transaction(
    'rw',
    [
      db.tenants, db.locations, db.users, db.categories, db.products, db.stock,
      db.sales, db.customers, db.suppliers, db.expenses, db.notifications, db.remisiones,
      db.purchaseOrders, db.changeOwed, db.purchases,
    ],
    async () => {
      await db.tenants.bulkPut([tenant, ...otherTenants])
      await db.locations.bulkPut(locations)
      await db.users.bulkPut(users)
      await db.categories.bulkPut(categories)
      await db.products.bulkPut(products)
      await db.stock.bulkPut(stock)
      await db.customers.bulkPut(customers)
      await db.suppliers.bulkPut(suppliers)
      await db.sales.bulkPut(sales)
      await db.expenses.bulkPut(expenses)
      await db.notifications.bulkPut(notifications)
      await db.remisiones.bulkPut(remisiones)
      await db.purchaseOrders.bulkPut(purchaseOrders)
      await db.changeOwed.bulkPut(changeOwed)
      await db.purchases.bulkPut(purchases)
    },
  )
}

/** Borra TODO y recarga el demo (botón "reiniciar demo"). */
export async function resetDemo(): Promise<void> {
  await db.delete()
  await db.open()
  await seedNow()
}
