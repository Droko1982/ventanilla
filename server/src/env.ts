import 'dotenv/config'
import crypto from 'crypto'

const isProd = process.env.NODE_ENV === 'production'

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Falta la variable de entorno ${name}`)
  return v
}

// Secretos: en producción NUNCA se usa el valor de desarrollo por defecto
// (es público en el repo). Si la variable falta en prod, se genera un secreto
// aleatorio en memoria: el servidor arranca igual (no se cae el despliegue),
// pero el token no es forjable y el super-admin con clave por defecto queda
// inutilizable. Conviene definir la variable en el panel para estabilidad
// (un secreto aleatorio cambia en cada reinicio e invalida los tokens).
function secret(name: string, devFallback: string): string {
  const v = process.env[name]
  if (v && v.length > 0) return v
  if (isProd) {
    console.warn(`⚠️  ${name} no está definida; se generó un secreto temporal. Defínela en el panel del servidor para mayor estabilidad y control.`)
    return crypto.randomBytes(48).toString('hex')
  }
  return devFallback
}

export const env = {
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: secret('JWT_SECRET', 'dev-secret-cambiar'),
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigins: (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim()),
  superAdmin: {
    email: process.env.SUPERADMIN_EMAIL ?? 'admin@ventanilla.co',
    password: secret('SUPERADMIN_PASSWORD', 'ventanilla-admin'),
  },
  wompi: {
    publicKey: process.env.WOMPI_PUBLIC_KEY ?? '',
    privateKey: process.env.WOMPI_PRIVATE_KEY ?? '',
    eventsSecret: process.env.WOMPI_EVENTS_SECRET ?? '',
  },
  whatsapp: {
    token: process.env.WHATSAPP_TOKEN ?? '',
    phoneId: process.env.WHATSAPP_PHONE_ID ?? '',
  },
  email: {
    apiKey: process.env.EMAIL_API_KEY ?? '', // Resend (https://resend.com), tramo gratis
    from: process.env.EMAIL_FROM ?? 'Ventanilla <pedidos@ventanilla.co>',
  },
  dian: {
    provider: process.env.DIAN_PROVIDER ?? '',
    apiKey: process.env.DIAN_API_KEY ?? '',
  },
}
