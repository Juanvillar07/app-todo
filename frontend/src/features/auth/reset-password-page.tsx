import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { ApiError } from '@/lib/api'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-context'
import { FormError } from './form-error'
import { PasswordInput } from './password-input'
import { type ResetPasswordValues, resetPasswordSchema } from './schemas'
import { useLinkToken } from './use-link-token'

const loginFooter = (
  <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
    Volver a iniciar sesión
  </Link>
)

/** Destino del enlace del correo: /reset-password?token=… (funciona con o sin sesión). */
export function ResetPasswordPage() {
  const { resetPassword, isResetLinkValid } = useAuth()
  const navigate = useNavigate()
  const { token, state } = useLinkToken(isResetLinkValid)
  const [rejected, setRejected] = useState(false)

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirm: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ password }) => {
    if (!token) return
    try {
      await resetPassword(token, password)
      toast.success('Contraseña actualizada. Inicia sesión.')
      navigate('/login', { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) setRejected(true)
      else form.setError('root', { message: (error as Error).message })
    }
  })

  if (state === 'checking') {
    return (
      <AuthLayout title="Crea una contraseña nueva" subtitle="Comprobando el enlace…" footer={loginFooter}>
        <div className="h-24" aria-busy="true" />
      </AuthLayout>
    )
  }

  if (rejected || state === 'invalid') {
    return (
      <AuthLayout
        title="Enlace no válido"
        subtitle="El enlace no es válido o ha caducado."
        footer={loginFooter}
      >
        <p className="mb-6 text-sm text-muted-foreground">
          Los enlaces caducan a los 60 minutos y solo se pueden usar una vez. Pide uno nuevo.
        </p>
        <Button asChild className="w-full">
          <Link to="/forgot-password">Pedir otro enlace</Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Crea una contraseña nueva"
      subtitle="Después tendrás que iniciar sesión con ella."
      footer={loginFooter}
    >
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Contraseña nueva</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              autoFocus
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <Field data-invalid={!!errors.confirm}>
            <FieldLabel htmlFor="confirm">Repite la contraseña</FieldLabel>
            <PasswordInput
              id="confirm"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...form.register('confirm')}
            />
            <FieldError errors={[errors.confirm]} />
          </Field>
          <FormError message={errors.root?.message} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Guardando…' : 'Guardar contraseña'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
