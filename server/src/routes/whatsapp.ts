import { Router } from 'express'
import { authRequired } from '../auth.js'
import { env } from '../env.js'

export const whatsappRouter = Router()

// Envía un mensaje por WhatsApp. Con WHATSAPP_TOKEN configurado usa la Cloud API
// real; si no, responde en modo simulado (el cliente igual puede usar wa.me).
whatsappRouter.post('/send', authRequired, async (req, res) => {
  const { to, message } = req.body ?? {}
  if (!to || !message) return res.status(400).json({ error: 'Se requieren "to" y "message"' })

  if (!env.whatsapp.token || !env.whatsapp.phoneId) {
    return res.json({ simulated: true, sent: true, to })
  }
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${env.whatsapp.phoneId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.whatsapp.token}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: String(to).replace(/\D/g, ''),
        type: 'text',
        text: { body: String(message) },
      }),
    })
    const data = await r.json()
    res.json({ simulated: false, sent: r.ok, raw: data })
  } catch (e) {
    res.status(502).json({ error: 'WhatsApp falló', detail: String(e) })
  }
})
