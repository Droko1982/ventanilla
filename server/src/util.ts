import { randomUUID } from 'node:crypto'

export function uid(prefix = ''): string {
  const id = randomUUID()
  return prefix ? `${prefix}_${id}` : id
}
