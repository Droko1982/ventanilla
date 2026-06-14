// ============================================================================
// Modelo de dominio de Ventanilla
// Todas las cantidades de dinero se guardan como ENTEROS en pesos colombianos
// (COP no usa centavos en la práctica). El peso/granel se guarda en kilogramos.
// ============================================================================

export type Role = 'superadmin' | 'admin' | 'empleado'

export type Unit = 'unidad' | 'peso'

export type PaymentMethod =
  | 'efectivo'
  | 'nequi'
  | 'tarjeta'
  | 'transferencia'
  | 'fiado' // crédito al cliente (muy usado en tiendas de barrio en Colombia)

export type SaleStatus = 'completada' | 'anulada' | 'devuelta'

export type DianStatus = 'pendiente' | 'enviado' | 'error' | 'no_requiere'

export type AccountStatus = 'activo' | 'suspendido' | 'prueba'

// --- SaaS: cliente de la plataforma (dueño de una o varias ventanillas) ------
export interface Tenant {
  id: string
  businessName: string
  ownerName: string
  nit: string
  email: string
  phone: string
  city: string
  status: AccountStatus
  // Facturación del SaaS
  monthlyFeePerLocation: number // tarifa base por ventanilla
  paidUntil: string // ISO date
  createdAt: string
  // Configuración DIAN del cliente (cada cliente conecta su propio proveedor)
  dian: DianConfig
  // Conteo de locales (lo usa el panel del Super-Admin para el cobro escalonado)
  locationCount?: number
}

export interface DianConfig {
  enabled: boolean
  provider: 'alegra' | 'factus' | 'dian_gratuito' | 'otro' | 'ninguno'
  resolutionNumber: string
  resolutionRange: string // ej. "POS1 1 al 5000"
  technicalKey: string
  testMode: boolean // en demo siempre true
}

// --- Local / ventanilla física ----------------------------------------------
export interface Location {
  id: string
  tenantId: string
  name: string
  address: string
  city: string
  allowBulk: boolean // ¿esta ventanilla vende a granel/por peso?
  active: boolean
  createdAt: string
}

// --- Usuarios ----------------------------------------------------------------
export interface UserPermissions {
  canDiscount?: boolean // puede aplicar descuentos / redondeo
  canManageInventory?: boolean // puede crear/editar productos y ajustar stock
  canVoid?: boolean // puede anular / hacer devoluciones
  canCashMovement?: boolean // puede registrar ingresos/egresos de caja
}

export interface User {
  id: string
  tenantId: string | null // null para el super-admin de la plataforma
  name: string
  role: Role
  pin: string // 4 dígitos para empleados (y admin en demo)
  email?: string
  locationId?: string // empleado: su local asignado
  permissions?: UserPermissions // permisos finos (sólo aplican a empleados)
  active: boolean
}

// --- Catálogo ----------------------------------------------------------------
export interface Category {
  id: string
  tenantId: string
  name: string
  color: string
  emoji: string
}

export interface Product {
  id: string
  tenantId: string
  name: string
  barcode?: string // código de barras / QR
  internalCode?: string // código propio para artículos sin barra
  categoryId: string
  unit: Unit
  price: number // precio de venta (por unidad, o por kg si unit='peso')
  cost: number // costo de compra (para margen)
  ivaRate: number // 0, 5, 19 (lo necesita la DIAN)
  supplierId?: string
  perishable: boolean
  imageEmoji?: string // imagen rápida para el POS (si no hay foto)
  photo?: string // foto real del producto (dataURL, opcional)
  brand?: string // marca (opcional)
  description?: string // detalles / descripción (opcional)
  wholesalePrice?: number // precio al por mayor (opcional)
  wholesaleMinQty?: number // cantidad mínima para el precio al por mayor
  active: boolean
  createdAt: string
}

// Stock por producto y por local (se descuenta solo con cada venta)
export interface Stock {
  id: string // `${locationId}:${productId}`
  tenantId: string
  locationId: string
  productId: string
  quantity: number // unidades o kg
  reorderThreshold: number // umbral de reorden DINÁMICO (recalculado por velocidad)
  reorderTarget: number // hasta cuánto reabastecer
  nearestExpiry?: string // fecha de vencimiento más próxima (lote)
  updatedAt: string
}

// --- Ventas ------------------------------------------------------------------
export interface SaleItem {
  productId: string
  name: string
  unit: Unit
  qty: number // unidades, o kg si es por peso
  unitPrice: number // precio por unidad o por kg
  lineDiscount: number // descuento sobre la línea (en pesos)
  ivaRate: number
  cost: number // costo unitario (para utilidad)
}

export interface Payment {
  method: PaymentMethod
  amount: number
  proofPhoto?: string // dataURL del comprobante (Nequi/transferencia/tarjeta)
  confirmed: boolean // confirmación (automática futura / manual hoy)
}

export interface Sale {
  id: string
  tenantId: string
  locationId: string
  userId: string // cajero que la registró
  items: SaleItem[]
  subtotal: number
  discount: number // descuento global
  total: number
  payments: Payment[]
  customerId?: string
  customerDoc?: string // CC/NIT si pide factura electrónica completa
  // Datos fiscales del adquiriente (factura electrónica de venta)
  customerName?: string
  customerIdType?: 'CC' | 'NIT' | 'CE'
  customerAddress?: string
  customerEmail?: string
  status: SaleStatus
  dianStatus: DianStatus
  dianDocType: 'tiquete_pos' | 'factura' | 'nota_credito'
  dianDocNumber?: string
  note?: string
  editedFromId?: string // si es una edición de otra venta (auditoría)
  remisionId?: string // si la factura se generó a partir de una remisión
  returns?: { productId: string; qty: number; at: string }[] // devoluciones parciales
  creditNoteNumber?: string // nota crédito por devolución
  createdAt: string
  syncedAt?: string // null mientras está sólo en local (offline)
}

// --- Remisión (nota de despacho/entrega; NO es documento DIAN) --------------
export type RemisionStatus = 'emitida' | 'facturada' | 'anulada'

export interface Remision {
  id: string
  tenantId: string
  locationId: string
  userId: string
  number: string // REM-####
  customerName: string
  customerId?: string
  customerDoc?: string
  customerAddress?: string
  items: SaleItem[]
  subtotal: number
  discount: number
  total: number
  note?: string
  status: RemisionStatus
  facturaId?: string // venta (factura) generada al convertir
  createdAt: string
}

// --- Clientes (CRM + fiado) --------------------------------------------------
export interface Customer {
  id: string
  tenantId: string
  name: string
  phone?: string
  idNumber?: string // CC / NIT
  creditBalance: number // saldo de fiado pendiente
  totalSpent: number
  createdAt: string
}

// --- Proveedores y reabastecimiento -----------------------------------------
export interface Supplier {
  id: string
  tenantId: string
  name: string
  contactName?: string
  whatsapp?: string // ej. 573001234567
  email?: string
  leadTimeDays: number // tiempo de entrega
  note?: string
}

export type PurchaseOrderStatus = 'sugerido' | 'enviado' | 'recibido' | 'cancelado'

export interface PurchaseOrderItem {
  productId: string
  name: string
  suggestedQty: number
  receivedQty?: number
  cost: number
}

export interface PurchaseOrder {
  id: string
  tenantId: string
  locationId: string
  supplierId: string
  items: PurchaseOrderItem[]
  status: PurchaseOrderStatus
  createdAt: string
  sentAt?: string
  receivedAt?: string
  expectedAt?: string
  paid?: boolean // cuentas por pagar: ¿ya se le pagó al proveedor?
  paidAt?: string
}

// --- Movimientos de stock (entradas, traslados, ajustes, devoluciones) -------
export type StockMovementType =
  | 'venta'
  | 'entrada'
  | 'traslado_salida'
  | 'traslado_entrada'
  | 'ajuste'
  | 'devolucion'
  | 'remision'

export interface StockMovement {
  id: string
  tenantId: string
  locationId: string
  productId: string
  type: StockMovementType
  qty: number // positivo suma, negativo resta
  refId?: string // venta, pedido, traslado relacionado
  userId: string
  createdAt: string
}

// --- Caja --------------------------------------------------------------------
export interface CashSession {
  id: string
  tenantId: string
  locationId: string
  userId: string
  openedAt: string
  closedAt?: string
  openingFloat: number // base inicial
  countedCash?: number // efectivo contado al cierre (arqueo)
  expectedCash?: number // efectivo esperado por el sistema
  difference?: number // sobrante (+) o faltante (-)
  status: 'abierta' | 'cerrada'
}

// --- Auditoría ---------------------------------------------------------------
export interface AuditLog {
  id: string
  tenantId: string
  locationId?: string
  userId: string
  userName: string
  action: string // ej. "editó venta", "anuló venta", "ajustó stock"
  entity: string
  entityId: string
  detail: string
  createdAt: string
}

// --- Notificaciones ----------------------------------------------------------
export type NotificationType = 'stock' | 'vencimiento' | 'caja' | 'dian' | 'fraude'

export interface AppNotification {
  id: string
  tenantId: string
  locationId?: string
  type: NotificationType
  severity: 'info' | 'aviso' | 'critico'
  title: string
  message: string
  read: boolean
  createdAt: string
}

// --- Movimientos de efectivo en caja (ingresos / egresos / sangría) ---------
export interface CashMovement {
  id: string
  tenantId: string
  locationId: string
  sessionId?: string // sesión de caja a la que pertenece
  type: 'ingreso' | 'egreso'
  amount: number
  reason: string
  isExpense: boolean // egreso que además es gasto del negocio (afecta utilidad)
  userId: string
  createdAt: string
}

// --- Gastos (para utilidad neta real) ---------------------------------------
export interface Expense {
  id: string
  tenantId: string
  locationId: string
  category: string // arriendo, servicios, nómina, otros
  amount: number
  note?: string
  date: string
}
