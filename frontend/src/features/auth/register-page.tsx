import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthLayout } from './auth-layout'
import { useAuth } from './auth-context'
import { CheckEmail } from './check-email'
import { FormError } from './form-error'
import { GoogleSignIn } from './google-sign-in'
import { PasswordInput } from './password-input'
import { type RegisterValues, registerSchema } from './schemas'

export function RegisterPage() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [sentTo, setSentTo] = useState<string | null>(null)

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { full_name: '', email: '', password: '' },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async ({ full_name, ...rest }) => {
    try {
      await register({ ...rest, full_name: full_name || null })
      // Sin sesión todavía: hay que confirmar el email con el enlace del correo.
      setSentTo(rest.email)
    } catch (error) {
      form.setError('root', { message: (error as Error).message })
    }
  })

  if (sentTo) {
    return (
      <AuthLayout title="Revisa tu correo" subtitle="Confirma tu email para empezar.">
        <CheckEmail email={sentTo} onBack={() => setSentTo(null)} />
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Crea tu cuenta"
      subtitle="Organiza tus tareas en un minuto."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Inicia sesión
          </Link>
        </>
      }
    >
      <GoogleSignIn
        onSuccess={() => navigate('/', { replace: true })}
        onError={(message) => form.setError('root', { message })}
      />
      <form onSubmit={onSubmit} noValidate>
        <FieldGroup>
          <Field data-invalid={!!errors.full_name}>
            <FieldLabel htmlFor="full_name">Nombre</FieldLabel>
            <Input
              id="full_name"
              autoComplete="name"
              autoFocus
              placeholder="Opcional"
              {...form.register('full_name')}
            />
            <FieldError errors={[errors.full_name]} />
          </Field>
          <Field data-invalid={!!errors.email}>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              {...form.register('email')}
            />
            <FieldError errors={[errors.email]} />
          </Field>
          <Field data-invalid={!!errors.password}>
            <FieldLabel htmlFor="password">Contraseña</FieldLabel>
            <PasswordInput
              id="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...form.register('password')}
            />
            {errors.password ? (
              <FieldError errors={[errors.password]} />
            ) : (
              <FieldDescription>Mínimo 8 caracteres.</FieldDescription>
            )}
          </Field>
          <FormError message={errors.root?.message} />
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Creando cuenta…' : 'Crear cuenta'}
          </Button>
        </FieldGroup>
      </form>
    </AuthLayout>
  )
}
