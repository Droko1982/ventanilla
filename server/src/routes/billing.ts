import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, type AuthedRequest } from '../auth.js'
import { env } from '../env.js'
import { uid } from '../util.js'

export const billingRouter = Router()

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
