import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import type { Request, Response, NextFunction } from 'express'
import { env } from './env.js'

export interface AuthPayload {
  userId: string
  tenantId: string | null
  role: 'superadmin' | 'admin' | 'empleado'
  name: string
}

export function hash(plain: string): string {
  return bcrypt.hashSync(plain, 10)
}
export function verify(plain: string, hashed: string | null | undefined): boolean {
  if (!hashed) return false
  return bcrypt.compareSync(plain, hashed)
}

export function signToken(payload: AuthPayload): string {
  return jwt.sign(payload, env.jwtSecret, { expiresIn: '30d' })
}

// Extiende Request con el usuario autenticado
export interface AuthedRequest extends Request {
  auth?: AuthPayload
}

export function authRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'No autorizado' })
  try {
    req.auth = jwt.verify(header.slice(7), env.jwtSecret) as AuthPayload
    next()
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' })
  }
}

export function superAdminRequired(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.auth?.role !== 'superadmin') return res.status(403).json({ error: 'Solo Super-Admin' })
  next()
}
