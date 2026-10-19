import { isRouteErrorResponse, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'

/** Error de ruta. Tras un deploy, los chunks viejos ya no existen: recargar lo arregla. */
export function RouteError() {
  const error = useRouteError()
  const isChunkError =
    error instanceof TypeError && /dynamically imported module|Importing a module script/i.test(error.message)
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : null

  return (
    <main className="flex min-h-svh items-center justify-center px-4">
      <div className="max-w-sm text-center">
        <h1 className="text-lg font-semibold tracking-tight">
          {isChunkError ? 'Hay una nueva versión' : 'Algo salió mal'}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isChunkError ? 'Recarga la página para continuar.' : 'Recarga la página o vuelve a intentarlo más tarde.'}
        </p>
        {!isChunkError && import.meta.env.DEV && detail && (
          <p className="mt-4 font-mono text-xs break-words text-muted-foreground">{detail}</p>
        )}
        <Button className="mt-6" size="sm" onClick={() => window.location.reload()}>
          Recargar
        </Button>
      </div>
    </main>
  )
}
