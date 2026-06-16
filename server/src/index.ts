import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import rateLimit from 'express-rate-limit'
import { env } from './env.js'
import { authRouter } from './routes/auth.js'
import { syncRouter } from './routes/sync.js'
import { billingRouter } from './routes/billing.js'
import { whatsappRouter } from './routes/whatsapp.js'
import { emailRouter } from './routes/email.js'
import { dianRouter } from './routes/dian.js'
import { adminRouter } from './routes/admin.js'

const app = express()
// En Render (y cualquier proxy) confía en el primer proxy para obtener la IP
// real del cliente (necesario para que el rate-limit cuente por IP).
app.set('trust proxy', 1)
// Cabeceras de seguridad. CORP en false para no interferir con el consumo
// del API por fetch desde otro origen (GitHub Pages); CORS ya está controlado.
app.use(helmet({ crossOriginResourcePolicy: false }))
app.use(express.json({ limit: '15mb' }))
app.use(
  cors({
    origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    credentials: false,
  }),
)

// Límite anti-fuerza-bruta en autenticación (login, PIN, registro).
const authLimiter = rateLimit({
  windowMs: 60_000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera un minuto e inténtalo de nuevo.' },
})

app.get('/health', (_req, res) =>
  res.json({ ok: true, service: 'ventanilla-api', time: new Date().toISOString() }),
)

app.get('/', (_req, res) =>
  res.json({
    service: 'Ventanilla API',
    status: 'ok',
    docs: 'POST /auth/register · POST /auth/login · GET/POST /sync',
    app: 'https://droko1982.github.io/ventanilla/',
  }),
)

app.use('/auth', authLimiter, authRouter)
app.use('/sync', syncRouter)
app.use('/billing', billingRouter)
app.use('/whatsapp', whatsappRouter)
app.use('/email', emailRouter)
app.use('/dian', dianRouter)
app.use('/admin', adminRouter)

app.use((_req, res) => res.status(404).json({ error: 'Ruta no encontrada' }))

app.listen(env.port, () => {
  console.log(`✅ Ventanilla API escuchando en http://localhost:${env.port}`)
})
