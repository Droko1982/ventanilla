import { Component, type ReactNode } from 'react'

// Evita que un error de render en una pantalla deje TODA la app en blanco:
// muestra una tarjeta amigable con botón de recarga. Los datos siguen a salvo
// en el dispositivo (IndexedDB), así que recargar recupera la app.
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // Queda en consola para diagnóstico; no rompe la experiencia del usuario.
    console.error('ErrorBoundary capturó:', error)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 p-6 text-center">
          <div className="text-5xl">😕</div>
          <h1 className="text-lg font-bold text-slate-700 dark:text-slate-200">Algo salió mal en esta pantalla</h1>
          <p className="max-w-xs text-sm text-slate-500">
            No te preocupes: tus datos están guardados en el dispositivo. Recarga para continuar.
          </p>
          <button onClick={() => location.reload()} className="btn btn-primary">Recargar</button>
        </div>
      )
    }
    return this.props.children
  }
}
