import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fakeAuth, renderRoutes } from '@/test/render'
import { VerifyEmailPage } from './verify-email-page'

const routes = [
  { path: '/verify-email', element: <VerifyEmailPage /> },
  { path: '/', element: <p>inicio</p> },
]

describe('Página de verificación', () => {
  it('sin token muestra que el enlace no es válido', async () => {
    renderRoutes(routes, '/verify-email', fakeAuth())
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login')
  })

  it('un enlace caducado se detecta al abrir la página', async () => {
    const auth = fakeAuth({ isVerificationLinkValid: vi.fn().mockResolvedValue(false) })
    renderRoutes(routes, '/verify-email?token=viejo', auth)
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
    expect(auth.isVerificationLinkValid).toHaveBeenCalledWith('viejo')
    expect(auth.verifyEmail).not.toHaveBeenCalled()
  })

  it('confirma al pulsar (no al cargar), quita el token de la URL y entra a la app', async () => {
    const auth = fakeAuth()
    const router = renderRoutes(routes, '/verify-email?token=abc', auth)
    const button = await screen.findByRole('button', { name: 'Confirmar mi email' })
    expect(router.state.location.search).toBe('')
    expect(auth.verifyEmail).not.toHaveBeenCalled()

    await userEvent.click(button)
    expect(auth.verifyEmail).toHaveBeenCalledWith('abc')
    expect(await screen.findByText('inicio')).toBeInTheDocument()
  })

  it('si el enlace caduca entre abrirlo y pulsar, lo indica', async () => {
    const auth = fakeAuth({
      verifyEmail: vi.fn().mockRejectedValue(new ApiError(400, 'El enlace no es válido')),
    })
    renderRoutes(routes, '/verify-email?token=abc', auth)
    await userEvent.click(await screen.findByRole('button', { name: 'Confirmar mi email' }))
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument()
  })
})
