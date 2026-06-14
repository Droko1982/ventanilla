import { useEffect, useState } from 'react'

// Captura el evento de instalación de PWA para ofrecer "Instalar app".
interface BIPEvent extends Event {
  prompt: () => void
  userChoice: Promise<{ outcome: string }>
}

export function useInstallPrompt() {
  const [deferred, setDeferred] = useState<BIPEvent | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BIPEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function promptInstall(): Promise<boolean> {
    if (!deferred) return false
    deferred.prompt()
    await deferred.userChoice
    setDeferred(null)
    return true
  }

  return { canInstall: !!deferred, promptInstall }
}
