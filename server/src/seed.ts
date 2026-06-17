import { prisma } from './db.js'
import { hash } from './auth.js'

// Crea un negocio de ejemplo para probar el API (mismo de la app demo).
async function main() {
  // Seguridad: nunca sembrar datos demo (con clave conocida) en producción.
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== '1') {
    console.error('⛔ Seed bloqueado en producción. Usa ALLOW_SEED=1 sólo si de verdad lo quieres.')
    return
  }
  const email = 'laesquina@demo.co'
  const existing = await prisma.tenant.findUnique({ where: { email } })
  if (existing) {
    console.log('El negocio demo ya existe:', email)
    return
  }
  const tenant = await prisma.tenant.create({
    data: {
      id: 't_esquina',
      businessName: 'Tienda La Esquina',
      ownerName: 'Marcela Ríos',
      email,
      passwordHash: hash('demo1234'),
      nit: '900.123.456-7',
      city: 'Armenia, Quindío',
      phone: '+57 314 755 5896',
      status: 'activo',
      paidUntil: new Date(Date.now() + 30 * 86400000),
      locationCount: 3,
      dian: { enabled: true, provider: 'alegra', testMode: true },
    },
  })
  await prisma.user.create({
    data: { id: 'u_admin', tenantId: tenant.id, name: 'Marcela Ríos', role: 'admin', email, passwordHash: hash('demo1234') },
  })
  await prisma.user.create({
    data: { id: 'u_caj1', tenantId: tenant.id, name: 'Juan Ortiz', role: 'empleado', pinHash: hash('1234'), locationId: 'l_centro', permissions: {} },
  })
  console.log('✅ Seed listo.')
  console.log('   Admin: laesquina@demo.co / demo1234')
  console.log('   Cajero PIN: 1234')
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
