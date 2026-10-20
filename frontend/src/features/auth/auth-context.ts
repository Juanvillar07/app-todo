import { createContext, useContext } from 'react'
import type { User } from '@/lib/api'

export const meQueryKey = ['me'] as const

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export type RegisterInput = { email: string; password: string; full_name?: string | null }

export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  login: (email: string, password: string) => Promise<void>
  register: (data: RegisterInput) => Promise<void>
  /** Entrar o registrarse con el ID token que devuelve el botón de Google. */
  loginWithGoogle: (credential: string) => Promise<void>
  /** ID de cliente OAuth de Google, o null si el login con Google está desactivado. */
  googleClientId: string | null
  logout: () => void
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
