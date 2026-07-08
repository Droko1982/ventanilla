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
  | 'daviplata'
  | 'tarjeta'
  | 'transferencia'
  | 'otro' // cualquier otro medio (Bancolombia, PSE, bono, etc.)
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
  monthlyGoal?: number // meta de ventas del mes (opcional)
  commissionPct?: number // % de comisión por vendedor (para reportes)
  autoReorder?: boolean // reabastecimiento automático: WhatsApp al proveedor al bajar el stock
  autoOpenDrawer?: boolean // abrir el cajón monedero automáticamente en ventas en efectivo
  // Etiquetas de báscula: la balanza imprime un EAN-13 con el peso (o el precio)
  // incrustado. Ej. "2 CCCCCC VVVVV D": prefijo 2 + código de producto + valor + control.
  scaleLabel?: { enabled?: boolean; prefix?: string; embeds?: 'peso' | 'precio'; itemDigits?: number }
  // Pagos Bre-B (sistema interoperable del Banco de la República)
  breBKey?: string // la "llave" del comercio (celular, cédula, correo o alfanumérica)
  breBKeyType?: 'celular' | 'cedula' | 'correo' | 'alfanumerica'
  // Programa de fidelización (puntos)
  loyaltyEnabled?: boolean
  loyaltyPointsPerThousand?: number // puntos que gana el cliente por cada $1.000 comprados
  loyaltyRedeemValue?: number // valor en $ de cada punto al canjear (ej. 1 punto = $20)
  // Licenciamiento (lo controla el Super-Admin de la plataforma)
  maxSeats?: number // puntos/ventanillas que la licencia permite abrir
  maxDevices?: number // dispositivos que pueden conectarse/descargar la app
  // Módulos visibles: el dueño oculta lo que no usa (todo activo por defecto).
  modules?: Record<string, boolean>
  // Recordatorios de fiado automáticos por WhatsApp
  autoFiadoReminder?: boolean
  fiadoReminderDays?: number // recordar si la deuda lleva ≥ N días sin recordatorio
  // Auto-rebaja de productos por vencer
  autoMarkdownExpiry?: boolean
  markdownDays?: number // rebaja los que vencen en ≤ N días
  markdownPercent?: number // % de rebaja
}

// Dispositivo que instaló/usa la app de un cliente (para el control de licencia).
export interface Device {
  id: string // id único generado al instalar (persistente en el dispositivo)
  tenantId: string
  name: string // navegador · sistema, o un alias
  firstSeen: string
  lastSeen: string
  blocked?: boolean // true si excede la licencia (no debe operar)
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
  supplierId?: string // último proveedor
  avgCost?: number // costo promedio ponderado (se recalcula al comprar)
  section?: string // sección / posición en la tienda (ej. "Góndola 3")
  perishable: boolean
  imageEmoji?: string // imagen rápida para el POS (si no hay foto)
  photo?: string // foto real del producto (dataURL, opcional)
  brand?: string // marca (opcional)
  description?: string // detalles / descripción (opcional)
  wholesalePrice?: number // precio al por mayor (opcional)
  wholesaleMinQty?: number // cantidad mínima para el precio al por mayor
  promoType?: '2x1' | 'percent' // promoción automática (opcional)
  promoValue?: number // % de descuento cuando promoType = 'percent'
  markdownAuto?: boolean // la promo la puso la auto-rebaja por vencimiento (para revertir)
  allowNegative?: boolean // permitir vender por debajo de 0 (false = bloquear)
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
  vendedorId?: string // vendedor de la venta (puede diferir del cajero)
  vendedorName?: string
  discountReason?: string // motivo del descuento
  editedFromId?: string // si es una edición de otra venta (auditoría)
  remisionId?: string // si la factura se generó a partir de una remisión
  redeemPoints?: number // puntos de fidelización canjeados en esta venta (para devolverlos si se anula)
  returns?: { productId: string; qty: number; at: string }[] // devoluciones parciales
  creditNoteNumber?: string // nota crédito por devolución
  debitNoteNumber?: string // nota débito (cargo adicional)
  debitNoteAmount?: number
  createdAt: string
  // Día contable y caja (turno) a la que pertenece la venta. businessDate es el
  // día en que se abrió la caja (YYYY-MM-DD): una caja que cruza medianoche
  // mantiene todas sus ventas en el mismo día hasta que se cierra.
  cashSessionId?: string
  businessDate?: string
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
  // Crédito / cartera
  onCredit?: boolean // ¿el cliente la lleva a crédito?
  dueDate?: string // fecha de vencimiento
  abonado?: number // total abonado (para la cartera)
  createdAt: string
}

// --- Domicilios (entregas a domicilio) --------------------------------------
export type DomicilioStatus = 'pendiente' | 'en_camino' | 'entregado' | 'cancelado'

export interface Domicilio {
  id: string
  tenantId: string
  locationId: string
  customerName: string
  phone?: string
  address: string
  barrio?: string
  city?: string
  items: SaleItem[]
  total: number
  paymentMethod: PaymentMethod
  repartidor?: string
  status: DomicilioStatus
  saleId?: string // venta generada
  note?: string
  createdAt: string
  deliveredAt?: string
}

// --- Informe Z (cierre fiscal diario, como las "Zetas" de SEITEM) -----------
export interface ZReport {
  id: string
  tenantId: string
  locationId: string
  number: string // Z-####
  date: string // YYYY-MM-DD del día fiscal
  cumulative: boolean // "Z hasta hoy"
  count: number
  revenue: number
  base: number
  iva: number
  ivaByRate: { rate: number; base: number; iva: number }[]
  byMethod: Record<string, number>
  byDocType: Record<string, number>
  discounts: number
  returnsCount: number
  generatedAt: string
}

// --- Clientes (CRM + fiado) --------------------------------------------------
export interface Customer {
  id: string
  tenantId: string
  name: string
  nombreComercial?: string
  phone?: string
  idNumber?: string // CC / NIT
  address?: string
  barrio?: string
  city?: string
  creditBalance: number // saldo de fiado pendiente
  creditLimit?: number // cupo máximo de fiado (0/undefined = sin tope). Avisa al superarlo.
  totalSpent: number
  points: number // puntos de fidelización acumulados
  creditSince?: string // desde cuándo debe (para la antigüedad de la deuda)
  lastReminder?: string // último recordatorio de pago enviado
  createdAt: string
}

// --- Proveedores y reabastecimiento -----------------------------------------
export interface Supplier {
  id: string
  tenantId: string
  name: string
  contactName?: string
  whatsapp?: string // ej. 573001234567
  phone?: string
  email?: string
  address?: string
  leadTimeDays: number // tiempo de entrega
  debt: number // deuda con el proveedor (cuentas por pagar)
  note?: string
}

// --- Factura de compra (entrada de mercancía con costo) ---------------------
export interface PurchaseItem {
  productId: string
  name: string
  qty: number
  unitCost: number
}

export interface Purchase {
  id: string
  tenantId: string
  locationId: string
  supplierId: string
  supplierName: string
  number: string // consecutivo interno (Cod Factura)
  supplierInvoice?: string // No. Fac Proveedor
  items: PurchaseItem[]
  subtotal: number
  commercialDiscount: number
  weightAdjust: number // ajuste al peso (+/-)
  total: number
  paymentMethod: 'contado' | 'credito'
  dueDate?: string
  paid: boolean
  // Eventos de recepción ante la DIAN (acuse, recibo del bien, aceptación)
  dianEvents?: { acuse?: string; reciboBien?: string; aceptacion?: string }
  createdAt: string
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
  | 'inicial'
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

// Movimiento de crédito (fiado): el saldo del cliente se reconstruye sumando
// estos deltas en el servidor, para que dos cajas no se pisen el saldo.
export interface CreditMovement {
  id: string
  tenantId: string
  customerId: string
  delta: number // positivo: fía más; negativo: abona/paga
  type: 'fiado' | 'abono' | 'nota'
  refId?: string // venta / nota débito relacionada
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

// --- Vueltas que el negocio quedó debiendo a clientes (el "Cambio Anterior") -
export interface ChangeOwed {
  id: string // = locationId (una fila por local)
  tenantId: string
  locationId: string
  amount: number
  updatedAt: string
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
