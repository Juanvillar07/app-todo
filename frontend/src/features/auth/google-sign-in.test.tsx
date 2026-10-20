import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fakeAuth, renderRoutes } from '@/test/render'
import { LoginPage } from './login-page'

// El botón real es un iframe de Google: se sustituye por uno que devuelve un ID token de prueba.
vi.mock('@react-oauth/google', () => ({
  GoogleOAuthProvider: ({ children }: { children: ReactNode }) => children,
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential?: string }) => void }) => (
    <button type="button" onClick={() => onSuccess({ credential: 'id-token-de-google' })}>
      Continuar con Google
    </button>
  ),
}))

vi.mock('@/components/theme-context', () => ({ useTheme: () => ({ resolvedTheme: 'light' }) }))

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/', element: <p>inicio</p> },
  { path: '/list', element: <p>lista</p> },
]

describe('Login con Google', () => {
  it('no aparece si Google no está configurado', () => {
    renderRoutes(routes, '/login', fakeAuth({ googleClientId: null }))
    expect(screen.queryByRole('button', { name: 'Continuar con Google' })).not.toBeInTheDocument()
    expect(screen.queryByText('o')).not.toBeInTheDocument()
  })

  it('envía el ID token al backend y vuelve a la ruta de origen', async () => {
    const auth = fakeAuth({ googleClientId: 'cliente.apps.googleusercontent.com' })
    renderRoutes(routes, { pathname: '/login', state: { from: '/list' } }, auth)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(auth.loginWithGoogle).toHaveBeenCalledWith('id-token-de-google')
    expect(await screen.findByText('lista')).toBeInTheDocument()
  })

  it('muestra el error si el backend rechaza la cuenta', async () => {
    const auth = fakeAuth({
      googleClientId: 'cliente.apps.googleusercontent.com',
      loginWithGoogle: vi
        .fn()
        .mockRejectedValue(new ApiError(401, 'No se pudo verificar la cuenta de Google')),
    })
    renderRoutes(routes, '/login', auth)
    await userEvent.click(screen.getByRole('button', { name: 'Continuar con Google' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo verificar la cuenta de Google',
    )
  })
})
