import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { useAuth } from './auth-context'
import { FormError } from './form-error'

type ResendState = 'idle' | 'sending' | 'sent'

/** "Revisa tu correo": tras registrarse o al intentar entrar sin haber confirmado el email. */
export function CheckEmail({ email, onBack }: { email: string; onBack: () => void }) {
  const { resendVerification } = useAuth()
  const [resend, setResend] = useState<ResendState>('idle')
  const [error, setError] = useState<string>()

  // El backend envía como mucho un enlace por minuto: el botón vuelve a estar disponible después.
  useEffect(() => {
    if (resend !== 'sent') return
    const timer = setTimeout(() => setResend('idle'), 60_000)
    return () => clearTimeout(timer)
  }, [resend])

  const onResend = async () => {
    setResend('sending')
    setError(undefined)
    try {
      await resendVerification(email)
      setResend('sent')
    } catch (err) {
      setResend('idle')
      setError((err as Error).message)
    }
  }

  return (
    <div className="space-y-4 text-sm text-muted-foreground">
      <p>
        Te enviamos un enlace a <span className="font-medium text-foreground">{email}</span> para
        confirmar tu email. Ábrelo para entrar; caduca en 24 horas.
      </p>
      <p>¿No llega? Revisa la carpeta de spam.</p>
      <FormError message={error} />
      <Button
        variant="outline"
        className="w-full"
        onClick={onResend}
        disabled={resend !== 'idle'}
      >
        {resend === 'sent' ? 'Enlace reenviado' : resend === 'sending' ? 'Enviando…' : 'Reenviar enlace'}
      </Button>
      <Button variant="ghost" className="w-full" onClick={onBack}>
        Usar otro email
      </Button>
    </div>
  )
}
