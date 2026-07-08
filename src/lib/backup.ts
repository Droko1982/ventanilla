// Seguridad de datos SIN backend: los datos viven en IndexedDB del navegador.
// (1) Pedimos "almacenamiento persistente" para que el navegador no los borre.
// (2) Llevamos la fecha del último respaldo para recordar descargarlo.

const LAST_BACKUP_KEY = 'ventanilla-last-backup'

/**
 * Pide al navegador que NO purgue los datos locales. Sin esto, algunos navegadores
 * (iOS Safari tras ~7 días sin uso, o al liberar espacio) pueden borrar IndexedDB.
 * Es "best effort": si el navegador no lo soporta o lo niega, no pasa nada malo.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false
    if (navigator.storage.persisted && (await navigator.storage.persisted())) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    return (await navigator.storage?.persisted?.()) ?? false
  } catch {
    return false
  }
}

export function markBackupDone(): void {
  try { localStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString()) } catch { /* */ }
}

export function lastBackupAt(): string | null {
  try { return localStorage.getItem(LAST_BACKUP_KEY) } catch { return null }
}

/** Días desde el último respaldo, o null si nunca se ha hecho. */
export function daysSinceBackup(): number | null {
  const at = lastBackupAt()
  if (!at) return null
  return Math.floor((Date.now() - new Date(at).getTime()) / 86400000)
}
