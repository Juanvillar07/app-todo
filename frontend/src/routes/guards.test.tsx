import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RouteObject } from 'react-router'
import { describe, expect, it } from 'vitest'
import { fakeAuth, renderRoutes } from '@/test/render'
import { ProtectedRoute, PublicOnlyRoute } from './guards'

const routes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [{ path: '/login', element: <p>pantalla de login</p> }],
  },
  {
    element: <ProtectedRoute />,
    children: [
      { path: '/', element: <p>inicio privado</p> },
      { path: '/list', element: <p>lista privada</p> },
    ],
  },
]

const user = {
  id: '1',
  email: 'ana@example.com',
  full_name: 'Ana',
  is_active: true,
  email_verified: true,
  created_at: '2026-10-18T00:00:00Z',
}

describe('Sin conexión con el backend', () => {
  it('muestra un error con Reintentar en vez de mandar al login', async () => {
    const auth = fakeAuth({ status: 'error' })
    renderRoutes(routes, '/', auth)
    expect(await screen.findByText('No se pudo conectar con el servidor')).toBeInTheDocument()
    expect(screen.queryByText('pantalla de login')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(auth.retrySession).toHaveBeenCalled()
  })
})

describe('ProtectedRoute', () => {
  it('redirige a /login sin sesión y recuerda la ruta', () => {
    const router = renderRoutes(routes, '/list?q=x', fakeAuth({ status: 'anonymous' }))
    expect(screen.getByText('pantalla de login')).toBeInTheDocument()
    expect(router.state.location.state).toEqual({ from: '/list?q=x' })
  })

  it('muestra la página con sesión', () => {
    renderRoutes(routes, '/list', fakeAuth({ status: 'authenticated', user }))
    expect(screen.getByText('lista privada')).toBeInTheDocument()
  })

  it('muestra un cargador mientras se comprueba la sesión', () => {
    renderRoutes(routes, '/', fakeAuth({ status: 'loading' }))
    expect(screen.queryByText('inicio privado')).not.toBeInTheDocument()
    expect(screen.getByText('Cargando…')).toBeInTheDocument()
  })
})

describe('PublicOnlyRoute', () => {
  it('manda al inicio si ya hay sesión', () => {
    renderRoutes(routes, '/login', fakeAuth({ status: 'authenticated', user }))
    expect(screen.getByText('inicio privado')).toBeInTheDocument()
  })

  it('al iniciar sesión vuelve a la ruta de origen', () => {
    renderRoutes(
      routes,
      { pathname: '/login', state: { from: '/list' } },
      fakeAuth({ status: 'authenticated', user }),
    )
    expect(screen.getByText('lista privada')).toBeInTheDocument()
  })
})
