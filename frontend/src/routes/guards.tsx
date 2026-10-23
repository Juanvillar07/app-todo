import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState } from '@/components/error-state'
import { useAuth } from '@/features/auth/auth-context'

function FullPageLoader() {
  return (
    <div className="flex min-h-svh items-center justify-center" aria-busy="true">
      <span className="size-2 animate-pulse rounded-full bg-muted-foreground" />
      <span className="sr-only">Cargando…</span>
    </div>
  )
}

/** El backend no respondió al comprobar la sesión: no es "sin sesión", así que no se manda al login. */
function SessionError() {
  const { retrySession } = useAuth()
  return (
    <div className="flex min-h-svh items-center justify-center bg-canvas px-4">
      <ErrorState title="No se pudo conectar con el servidor" onRetry={retrySession} />
    </div>
  )
}

/** Solo para usuarios con sesión; si no, a /login recordando a dónde iban. */
export function ProtectedRoute() {
  const { status } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullPageLoader />
  if (status === 'error') return <SessionError />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Login y registro: si ya hay sesión (o se acaba de iniciar), a la ruta de origen o al inicio. */
export function PublicOnlyRoute() {
  const { status } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  if (status === 'loading') return <FullPageLoader />
  if (status === 'error') return <SessionError />
  if (status === 'authenticated') return <Navigate to={from} replace />
  return <Outlet />
}
