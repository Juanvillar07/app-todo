import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router'
import { vi } from 'vitest'
import { AuthContext, type AuthContextValue } from '@/features/auth/auth-context'

export function fakeAuth(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    status: 'anonymous',
    user: null,
    login: vi.fn().mockResolvedValue(undefined),
    register: vi.fn().mockResolvedValue(undefined),
    loginWithGoogle: vi.fn().mockResolvedValue(undefined),
    googleClientId: null,
    logout: vi.fn(),
    ...overrides,
  }
}

type InitialEntry = string | { pathname: string; state?: unknown }

/** Renderiza rutas con un contexto de sesión falso, empezando en `entry`. */
export function renderRoutes(routes: RouteObject[], entry: InitialEntry, auth: AuthContextValue) {
  const router = createMemoryRouter(routes, { initialEntries: [entry] })
  const wrap = (children: ReactNode) => (
    <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
  )
  render(wrap(<RouterProvider router={router} />))
  return router
}
