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
  phone: '+57 310 555 0101',
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
    leadTimeDays: 2,
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
  },
  {
    id: 's_aseo',
    tenantId: TENANT_ID,
    name: 'Aseo y Hogar del Café',
    contactName: 'Pedro Niño',
    whatsapp: '573015550377',
    email: 'aseohogar@demo.co',
    leadTimeDays: 4,
  },
  {
    id: 's_granos',
    tenantId: TENANT_ID,
    name: 'Granos y Abarrotes El Edén',
    contactName: 'Marta Ruiz',
    whatsapp: '573015550466',
    email: 'eleden.granos@demo.co',
    leadTimeDays: 2,
  },
]

// ---------------------------------------------------------------------------
// Productos.  [nombre, barcode, categoría, precio, costo, iva, emoji, unidad, proveedor, perecedero]
// ---------------------------------------------------------------------------
type P = [string, string, string, number, number, number, string, 'unidad' | 'peso', string, boolean]
const productDefs: P[] = [
  ['Gaseosa Postobón 1.5L', '7702011000011', 'c_beb', 4500, 3100, 19, '🥤', 'unidad', 's_postobon', false],
  ['Coca-Cola 400ml', '7702011000028', 'c_beb', 2500, 1700, 19, '🥤', 'unidad', 's_postobon', false],
  ['Agua Cristal 600ml', '7702011000035', 'c_beb', 2000, 1200, 19, '💧', 'unidad', 's_postobon', false],
  ['Jugo Hit Mora 500ml', '7702011000042', 'c_beb', 3000, 2000, 19, '🧃', 'unidad', 's_postobon', false],
  ['Pony Malta 330ml', '7702011000059', 'c_beb', 2800, 1900, 19, '🍺', 'unidad', 's_postobon', false],
  ['Papas Margarita Pollo', '7702011000066', 'c_mec', 2000, 1300, 19, '🥔', 'unidad', 's_nutresa', false],
  ['Doritos Mega Queso', '7702011000073', 'c_mec', 3500, 2400, 19, '🌮', 'unidad', 's_nutresa', false],
  ['Galleta Festival', '7702011000080', 'c_mec', 1500, 950, 19, '🍪', 'unidad', 's_nutresa', false],
  ['Chocorramo', '7702011000097', 'c_mec', 1800, 1150, 19, '🍫', 'unidad', 's_nutresa', false],
  ['Bon Bon Bum', '7702011000103', 'c_mec', 500, 280, 19, '🍭', 'unidad', 's_nutresa', false],
  ['Jabón Rey 300g', '7702011000110', 'c_aseo', 3200, 2200, 19, '🧼', 'unidad', 's_aseo', false],
  ['Detergente Fab 1kg', '7702011000127', 'c_aseo', 9800, 7200, 19, '🧴', 'unidad', 's_aseo', false],
  ['Papel Higiénico x4', '7702011000134', 'c_aseo', 6500, 4600, 19, '🧻', 'unidad', 's_aseo', false],
  ['Crema Dental Colgate', '7702011000141', 'c_aseo', 5200, 3700, 19, '🪥', 'unidad', 's_aseo', false],
  ['Arroz Diana 500g', '7702011000158', 'c_aba', 2700, 2000, 5, '🍚', 'unidad', 's_granos', false],
  ['Aceite Premier 1L', '7702011000165', 'c_aba', 11500, 9000, 5, '🛢️', 'unidad', 's_granos', false],
  ['Panela Cuadrada 500g', '7702011000172', 'c_aba', 3500, 2600, 5, '🟫', 'unidad', 's_granos', false],
  ['Sal Refisal 500g', '7702011000189', 'c_aba', 1800, 1200, 5, '🧂', 'unidad', 's_granos', false],
  ['Atún Van Camps', '7702011000196', 'c_aba', 5800, 4300, 19, '🐟', 'unidad', 's_granos', false],
  ['Leche Colanta 1L', '7702011000202', 'c_lac', 4200, 3300, 0, '🥛', 'unidad', 's_nutresa', true],
  ['Yogur Alpina 1L', '7702011000219', 'c_lac', 7500, 5800, 0, '🥛', 'unidad', 's_nutresa', true],
  ['Queso Campesino 250g', '7702011000226', 'c_lac', 6800, 5200, 0, '🧀', 'unidad', 's_nutresa', true],
  ['Huevos AA x12', '7702011000233', 'c_lac', 9500, 7800, 0, '🥚', 'unidad', 's_granos', true],
  ['Cerveza Águila lata', '7702011000240', 'c_lic', 3000, 2100, 19, '🍺', 'unidad', 's_postobon', false],
  ['Cerveza Poker lata', '7702011000257', 'c_lic', 3000, 2100, 19, '🍺', 'unidad', 's_postobon', false],
  ['Aguardiente Cristal 375', '7702011000264', 'c_lic', 28000, 22000, 19, '🍶', 'unidad', 's_postobon', false],
  // Granel (por peso) — sólo locales con allowBulk
  ['Arroz a granel', '', 'c_gra', 3800, 2900, 5, '🌾', 'peso', 's_granos', false],
  ['Fríjol cargamanto', '', 'c_gra', 9500, 7500, 5, '🫘', 'peso', 's_granos', false],
  ['Lenteja', '', 'c_gra', 6500, 4800, 5, '🫘', 'peso', 's_granos', false],
  ['Azúcar a granel', '', 'c_gra', 4200, 3200, 5, '🍬', 'peso', 's_granos', false],
]

function buildProducts(): Product[] {
  return productDefs.map((d, i) => {
    const [name, barcode, categoryId, price, cost, ivaRate, emoji, unit, supplierId, perishable] = d
    return {
      id: `p_${i}`,
      tenantId: TENANT_ID,
      name,
      barcode: barcode || undefined,
      internalCode: barcode ? undefined : `VEN-${100000 + i}`,
      categoryId,
      unit,
      price,
      cost,
      ivaRate,
      supplierId,
      perishable,
      imageEmoji: emoji,
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
      const fast = ['p_0', 'p_1', 'p_2', 'p_5', 'p_19', 'p_23', 'p_24'].includes(p.id)
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
export async function seedIfEmpty(): Promise<void> {
  const count = await db.tenants.count()
  if (count > 0) return
  await seedNow()
}

export async function seedNow(): Promise<void> {
  const products = buildProducts()
  const stock = buildStock(products)
  const sales = buildHistory(products)
  const expenses = buildExpenses()
  const notifications = buildNotifications(stock)

  await db.transaction(
    'rw',
    [
      db.tenants, db.locations, db.users, db.categories, db.products, db.stock,
      db.sales, db.customers, db.suppliers, db.expenses, db.notifications,
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
    },
  )
}

/** Borra TODO y recarga el demo (botón "reiniciar demo"). */
export async function resetDemo(): Promise<void> {
  await db.delete()
  await db.open()
  await seedNow()
}
