import express from 'express'
import cors from 'cors'
import { env } from './env.js'
import { authRouter } from './routes/auth.js'
import { syncRouter } from './routes/sync.js'
import { billingRouter } from './routes/billing.js'
import { whatsappRouter } from './routes/whatsapp.js'
import { emailRouter } from './routes/email.js'
import { dianRouter } from './routes/dian.js'
import { adminRouter } from './routes/admin.js'

const app = express()
app.use(express.json({ limit: '15mb' }))
app.use(
  cors({
    origin: env.corsOrigins.includes('*') ? true : env.corsOrigins,
    credentials: false,
  }),
)

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

app.use('/auth', authRouter)
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
