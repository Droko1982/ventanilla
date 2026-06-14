import 'dotenv/config'

function req(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback
  if (v === undefined) throw new Error(`Falta la variable de entorno ${name}`)
  return v
}

export const env = {
  databaseUrl: req('DATABASE_URL'),
  jwtSecret: req('JWT_SECRET', 'dev-secret-cambiar'),
  port: parseInt(process.env.PORT ?? '4000', 10),
  corsOrigins: (process.env.CORS_ORIGIN ?? '*').split(',').map((s) => s.trim()),
  superAdmin: {
    email: process.env.SUPERADMIN_EMAIL ?? 'admin@ventanilla.co',
    password: process.env.SUPERADMIN_PASSWORD ?? 'ventanilla-admin',
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
  dian: {
    provider: process.env.DIAN_PROVIDER ?? '',
    apiKey: process.env.DIAN_API_KEY ?? '',
  },
}
