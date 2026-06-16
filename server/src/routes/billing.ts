import { Router } from 'express'
import crypto from 'crypto'
import { prisma } from '../db.js'
import { authRequired, type AuthedRequest } from '../auth.js'
import { env } from '../env.js'
import { uid } from '../util.js'

export const billingRouter = Router()

// Verifica la firma del evento de Wompi (algoritmo oficial: SHA256 de los
// valores de las propiedades indicadas + timestamp + secreto de eventos).
function wompiSignatureValid(event: any, secret: string): boolean {
  const props: unknown = event?.signature?.properties
  const given: unknown = event?.signature?.checksum
  const ts = event?.timestamp
  if (!Array.isArray(props) || typeof given !== 'string' || ts === undefined) return false
  let concat = ''
  for (const path of props) {
    const val = String(path).split('.').reduce((o: any, k) => (o == null ? o : o[k]), event.data)
    concat += val == null ? '' : String(val)
  }
  concat += String(ts) + secret
  const digest = crypto.createHash('sha256').update(concat).digest('hex')
  return digest.toLowerCase() === given.toLowerCase()
}

// Crea un enlace de pago para la mensualidad del SaaS.
// Si hay llaves de Wompi configuradas, crea un Payment Link real; si no, simula.
billingRouter.post('/checkout', authRequired, async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Sin tenant' })
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  if (!tenant) return res.status(404).json({ error: 'Tenant no encontrado' })

  const amount = tenant.monthlyFeePerLocation * Math.max(1, tenant.locationCount)
  const reference = uid('pay')
  await prisma.payment.create({ data: { id: uid(), tenantId, amount, reference, status: 'pendiente' } })

  if (!env.wompi.privateKey) {
    // Modo simulado (sin llaves): devuelve un enlace ficticio para ver el flujo.
    return res.json({ simulated: true, amount, reference, url: `https://checkout.wompi.co/l/SIMULADO_${reference}` })
  }

  try {
    const r = await fetch('https://production.wompi.co/v1/payment_links', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.wompi.privateKey}` },
      body: JSON.stringify({
        name: `Ventanilla — ${tenant.businessName}`,
        description: `Mensualidad (${tenant.locationCount} ventanilla/s)`,
        single_use: true,
        currency: 'COP',
        amount_in_cents: amount * 100,
        reference,
      }),
    })
    const data = (await r.json()) as any
    const id = data?.data?.id
    res.json({ simulated: false, amount, reference, url: id ? `https://checkout.wompi.co/l/${id}` : null, raw: data })
  } catch (e) {
    res.status(502).json({ error: 'No se pudo crear el enlace de pago', detail: String(e) })
  }
})

// Webhook de Wompi: confirma el pago y extiende la mensualidad.
billingRouter.post('/webhook', async (req, res) => {
  const event = req.body
  // Sin secreto de eventos configurado no se puede verificar la firma: no se
  // confía en el evento (evita que cualquiera marque pagos como aprobados).
  if (!env.wompi.eventsSecret) return res.status(503).json({ error: 'Webhook no configurado' })
  if (!wompiSignatureValid(event, env.wompi.eventsSecret)) {
    return res.status(401).json({ error: 'Firma del evento inválida' })
  }
  try {
    const tx = event?.data?.transaction
    if (tx?.status === 'APPROVED' && tx?.reference) {
      const payment = await prisma.payment.findUnique({ where: { reference: tx.reference } })
      if (payment) {
        await prisma.payment.update({ where: { reference: tx.reference }, data: { status: 'aprobado', raw: event } })
        const tenant = await prisma.tenant.findUnique({ where: { id: payment.tenantId } })
        const base = Math.max(Date.now(), tenant ? new Date(tenant.paidUntil).getTime() : Date.now())
        await prisma.tenant.update({
          where: { id: payment.tenantId },
          data: { status: 'activo', paidUntil: new Date(base + 30 * 86400000) },
        })
      }
    }
  } catch {
    /* ignora payloads malformados */
  }
  res.json({ received: true })
})

// Estado de pagos del negocio.
billingRouter.get('/status', authRequired, async (req: AuthedRequest, res) => {
  const tenantId = req.auth!.tenantId
  if (!tenantId) return res.status(400).json({ error: 'Sin tenant' })
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } })
  const payments = await prisma.payment.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 12 })
  res.json({ status: tenant?.status, paidUntil: tenant?.paidUntil, payments })
})
