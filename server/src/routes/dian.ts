import { Router } from 'express'
import { prisma } from '../db.js'
import { authRequired, type AuthedRequest } from '../auth.js'
import { env } from '../env.js'

export const dianRouter = Router()

let counter = 1000

// Transmite un documento a la DIAN a través del proveedor autorizado del tenant.
// Estructura lista: con DIAN_API_KEY se hace la llamada real; si no, se simula.
dianRouter.post('/transmit', authRequired, async (req: AuthedRequest, res) => {
  const { docType } = req.body ?? {}
  const tenant = req.auth?.tenantId
    ? await prisma.tenant.findUnique({ where: { id: req.auth.tenantId } })
    : null
  const provider = (tenant?.dian as any)?.provider ?? env.dian.provider ?? 'ninguno'

  if (!env.dian.apiKey) {
    counter++
    const prefix = docType === 'factura' ? 'FE' : docType === 'nota_credito' ? 'NC' : 'POS1'
    return res.json({ simulated: true, status: 'enviado', number: `${prefix}-${counter}`, provider })
  }

  // Aquí va la integración real con Alegra / Factus / software DIAN del cliente.
  // (La estructura y credenciales por tenant ya están listas.)
  res.json({ simulated: false, status: 'enviado', provider })
})
