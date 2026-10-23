import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Error al cargar datos, con "Reintentar". Sustituye al estado vacío: un fallo de la API no debe
 * parecer "no tienes tareas".
 */
export function ErrorState({
  title = 'No se pudieron cargar los datos',
  error,
  onRetry,
  retrying = false,
  className,
}: {
  title?: string
  error?: Error | null
  onRetry: () => void
  retrying?: boolean
  className?: string
}) {
  return (
    <div role="alert" className={cn('py-16 text-center text-sm', className)}>
      <p className="font-medium">{title}</p>
      {error?.message && <p className="mt-1 text-muted-foreground">{error.message}</p>}
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry} disabled={retrying}>
        {retrying ? 'Reintentando…' : 'Reintentar'}
      </Button>
    </div>
  )
}
