import Dexie, { type Table } from 'dexie'
import type {
  Tenant,
  Location,
  User,
  Category,
  Product,
  Stock,
  Sale,
  Customer,
  Supplier,
  PurchaseOrder,
  StockMovement,
  CashSession,
  AuditLog,
  AppNotification,
  Expense,
} from '@/types'

// ============================================================================
// Base de datos local (IndexedDB vía Dexie).
//
// Toda la app del demo corre 100% en el navegador: la ventanilla puede vender
// SIN internet y los datos quedan guardados en el dispositivo. En la versión
// con backend, esta misma capa se sincroniza con el servidor (cada registro
// tiene `syncedAt` para saber qué falta subir).
// ============================================================================

export class VentanillaDB extends Dexie {
  tenants!: Table<Tenant, string>
  locations!: Table<Location, string>
  users!: Table<User, string>
  categories!: Table<Category, string>
  products!: Table<Product, string>
  stock!: Table<Stock, string>
  sales!: Table<Sale, string>
  customers!: Table<Customer, string>
  suppliers!: Table<Supplier, string>
  purchaseOrders!: Table<PurchaseOrder, string>
  stockMovements!: Table<StockMovement, string>
  cashSessions!: Table<CashSession, string>
  auditLogs!: Table<AuditLog, string>
  notifications!: Table<AppNotification, string>
  expenses!: Table<Expense, string>

  constructor() {
    super('ventanilla')
    this.version(1).stores({
      tenants: 'id, status',
      locations: 'id, tenantId',
      users: 'id, tenantId, role, pin',
      categories: 'id, tenantId',
      products: 'id, tenantId, barcode, internalCode, categoryId, supplierId',
      stock: 'id, tenantId, locationId, productId',
      sales: 'id, tenantId, locationId, userId, status, dianStatus, createdAt',
      customers: 'id, tenantId',
      suppliers: 'id, tenantId',
      purchaseOrders: 'id, tenantId, locationId, supplierId, status',
      stockMovements: 'id, tenantId, locationId, productId, createdAt',
      cashSessions: 'id, tenantId, locationId, status',
      auditLogs: 'id, tenantId, locationId, createdAt',
      notifications: 'id, tenantId, locationId, read, createdAt',
      expenses: 'id, tenantId, locationId, date',
    })
  }
}

export const db = new VentanillaDB()
