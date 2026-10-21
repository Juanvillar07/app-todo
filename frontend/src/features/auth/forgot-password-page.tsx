import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-context'
import { FormError } from './form-error'
import { type ForgotPasswordValues, forgotPasswordSchema } from './schemas'

const linkClass = 'font-medium text-primary underline-offset-4 hover:underline'

export function ForgotPasswordPage() {
  const { requestPasswordReset } = useAuth()
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email }) => {
    try {
      await requestPasswordReset(email)
      setSentTo(email)
    } catch (error) {
      form.setError('root', { message: (error as Error).message })
    }
  })

  const footer = (
    <>
      ¿Te acordaste?{' '}
      <Link to="/login" className={linkClass}>
        Inicia sesión
      </Link>
    </>
  )

  if (sentTo) {
    return (
      <AuthLayout title="Revisa tu correo" subtitle="Te enviamos un enlace." footer={footer}>
        <div className="space-y-4 text-sm text-muted-foreground">
          <p>
            Si existe una cuenta con <span className="font-medium text-foreground">{sentTo}</span>,
            recibirás un enlace para crear una contraseña nueva. Caduca en 60 minutos.
          </p>
          <p>¿No llega? Revisa la carpeta de spam o vuelve a intentarlo en un minuto.</p>
          <Button variant="outline" className="w-full" onClick={() => setSentTo(null)}>
            Usar otro email
          </Button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviaremos un enlace para crear una nueva."
      footer={footer}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <FormError message={errors.root?.message} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Enviando…' : 'Enviar enlace'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
