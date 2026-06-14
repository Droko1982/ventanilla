import { Router } from 'express'
import { authRequired } from '../auth.js'
import { env } from '../env.js'

export const emailRouter = Router()

// Envía un correo (p.ej. el pedido automático al proveedor). Con EMAIL_API_KEY
// (Resend) configurado lo envía de verdad; si no, responde en modo simulado.
emailRouter.post('/send', authRequired, async (req, res) => {
  const { to, subject, message } = req.body ?? {}
  if (!to || !subject || !message) return res.status(400).json({ error: 'Se requieren "to", "subject" y "message"' })

  if (!env.email.apiKey) {
    return res.json({ simulated: true, sent: true, to })
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.email.apiKey}` },
      body: JSON.stringify({ from: env.email.from, to: [String(to)], subject: String(subject), text: String(message) }),
    })
    const data = await r.json()
    res.json({ simulated: false, sent: r.ok, raw: data })
  } catch (e) {
    res.status(502).json({ error: 'Email falló', detail: String(e) })
  }
})
