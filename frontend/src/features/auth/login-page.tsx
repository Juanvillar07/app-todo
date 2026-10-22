import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { ApiError } from '@/lib/api'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-context'
import { CheckEmail } from './check-email'
import { FormError } from './form-error'
import { GoogleSignIn } from './google-sign-in'
import { PasswordInput } from './password-input'
import { type LoginValues, loginSchema } from './schemas'

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  // Contraseña correcta pero email sin confirmar (403): se ofrece reenviar el enlace.
  const [unverifiedEmail, setUnverifiedEmail] = useState<string | null>(null)

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    try {
      await login(email, password)
      navigate(from, { replace: true })
    } catch (error) {
      if (error instanceof ApiError && error.status === 403) setUnverifiedEmail(email)
      else form.setError('root', { message: (error as Error).message })
    }
  })

  if (unverifiedEmail) {
    return (
      <AuthLayout title="Confirma tu email" subtitle="Antes de entrar, verifica que el email es tuyo.">
        <CheckEmail email={unverifiedEmail} onBack={() => setUnverifiedEmail(null)} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Inicia sesión"
      subtitle="Bienvenido de nuevo."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="font-medium text-primary underline-offset-4 hover:underline">
            Regístrate
          </Link>
        </>
      }
    >
      <GoogleSignIn
        onSuccess={() => navigate(from, { replace: true })}
        onError={(message) => form.setError('root', { message })}
      />
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
          <Field data-invalid={!!errors.password}>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="password">Contraseña</FieldLabel>
              <Link
                to="/forgot-password"
                className="text-sm text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </Link>
            </div>
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            <FieldError errors={[errors.password]} />
          </Field>
          <FormError message={errors.root?.message} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
