import { useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/lib/api'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-context'
import { FormError } from './form-error'
import { useLinkToken } from './use-link-token'

/** Destino del enlace del correo: /verify-email?token=… Al confirmar se abre sesión. */
export function VerifyEmailPage() {
  const { status, verifyEmail, isVerificationLinkValid } = useAuth()
  const navigate = useNavigate()
  const link = useLinkToken(isVerificationLinkValid)
  const [verifying, setVerifying] = useState(false)
  const [rejected, setRejected] = useState(false)
  const [error, setError] = useState<string>()

  // Se confirma al pulsar y no al cargar: los antivirus de correo abren los enlaces y lo gastarían.
  const confirm = async () => {
    if (!link.token) return
    setVerifying(true)
    setError(undefined)
    try {
      await verifyEmail(link.token)
      toast.success('Email confirmado. ¡Bienvenido!')
      navigate('/', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) setRejected(true)
      else setError((err as Error).message)
      setVerifying(false)
    }
  }

  if (rejected || link.state === 'invalid') {
    const loggedIn = status === 'authenticated'
    return (
      <AuthLayout title="Enlace no válido" subtitle="El enlace no es válido o ha caducado.">
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Los enlaces caducan a las 24 horas y solo se pueden usar una vez.
            {!loggedIn && ' Para recibir otro, intenta iniciar sesión y pulsa "Reenviar enlace".'}
          </p>
          <Button asChild className="w-full">
            <Link to={loggedIn ? '/' : '/login'}>
              {loggedIn ? 'Ir a mis tareas' : 'Ir a iniciar sesión'}
            </Link>
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Confirma tu email" subtitle="Un último paso para empezar a usar Tareas.">
      <div className="space-y-4">
        <FormError message={error ?? link.error} />
        <Button
          className="w-full"
          onClick={confirm}
          disabled={link.state !== 'valid' || verifying}
        >
          {link.state === 'checking'
            ? 'Comprobando enlace…'
            : verifying
              ? 'Confirmando…'
              : 'Confirmar mi email'}
        </Button>
      </div>
    </AuthLayout>
  )
}
