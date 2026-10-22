import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fakeAuth, renderRoutes } from '@/test/render'
import { ForgotPasswordPage } from './forgot-password-page'
import { LoginPage } from './login-page'
import { ResetPasswordPage } from './reset-password-page'

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/forgot-password', element: <ForgotPasswordPage /> },
  { path: '/reset-password', element: <ResetPasswordPage /> },
]

describe('Recuperación de contraseña', () => {
  it('el login enlaza a "¿Olvidaste tu contraseña?"', async () => {
    renderRoutes(routes, '/login', fakeAuth())
    await userEvent.click(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' }))
    expect(await screen.findByRole('heading', { name: '¿Olvidaste tu contraseña?' })).toBeInTheDocument()
  })

  it('pide el enlace y muestra un mensaje que no revela si la cuenta existe', async () => {
    const auth = fakeAuth()
    renderRoutes(routes, '/forgot-password', auth)

    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(await screen.findByText('Introduce un email válido')).toBeInTheDocument()
    expect(auth.requestPasswordReset).not.toHaveBeenCalled()

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }))
    expect(auth.requestPasswordReset).toHaveBeenCalledWith('ana@example.com')
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(screen.getByText(/Si existe una cuenta con/)).toHaveTextContent('ana@example.com')
  })

  it('sin token muestra que el enlace no es válido', async () => {
    renderRoutes(routes, '/reset-password', fakeAuth())
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Pedir otro enlace' })).toHaveAttribute(
      'href',
      '/forgot-password',
    )
  })

  it('un enlace caducado se detecta al abrir la página, sin enviar nada', async () => {
    const auth = fakeAuth({ isResetLinkValid: vi.fn().mockResolvedValue(false) })
    renderRoutes(routes, '/reset-password?token=viejo', auth)
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(auth.isResetLinkValid).toHaveBeenCalledWith('viejo')
    expect(screen.queryByLabelText('Contraseña nueva')).not.toBeInTheDocument()
    expect(auth.resetPassword).not.toHaveBeenCalled()
  })

  it('exige que las dos contraseñas coincidan', async () => {
    const auth = fakeAuth()
    renderRoutes(routes, '/reset-password?token=abc', auth)
    await userEvent.type(await screen.findByLabelText('Contraseña nueva'), 'nueva-clave-1')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'otra-cosa-22')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument()
    expect(auth.resetPassword).not.toHaveBeenCalled()
  })

  it('guarda la contraseña, quita el token de la URL y vuelve al login', async () => {
    const auth = fakeAuth()
    const router = renderRoutes(routes, '/reset-password?token=abc', auth)
    await screen.findByRole('heading', { name: 'Crea una contraseña nueva' })
    expect(router.state.location.search).toBe('')

    await userEvent.type(await screen.findByLabelText('Contraseña nueva'), 'nueva-clave-1')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'nueva-clave-1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))

    expect(auth.resetPassword).toHaveBeenCalledWith('abc', 'nueva-clave-1')
    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument()
  })

  it('un token caducado lleva a pedir otro enlace', async () => {
    const auth = fakeAuth({
      resetPassword: vi
        .fn()
        .mockRejectedValue(new ApiError(400, 'El enlace no es válido o ha caducado')),
    })
    renderRoutes(routes, '/reset-password?token=viejo', auth)
    await userEvent.type(await screen.findByLabelText('Contraseña nueva'), 'nueva-clave-1')
    await userEvent.type(screen.getByLabelText('Repite la contraseña'), 'nueva-clave-1')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }))
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
  })
})
