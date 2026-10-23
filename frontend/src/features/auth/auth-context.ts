import { createContext, useContext } from 'react'
import type { User } from '@/lib/api'

export const meQueryKey = ['me'] as const

// 'error': no se pudo preguntar al backend si hay sesión (caído, sin red…). No es lo mismo que
// no tener sesión: se muestra un error con "Reintentar" en vez del login.
export type AuthStatus = 'loading' | 'authenticated' | 'anonymous' | 'error'

export type RegisterInput = { email: string; password: string; full_name?: string | null }

export type AuthContextValue = {
  status: AuthStatus
  user: User | null
  /** Vuelve a preguntar al backend por la sesión (tras un status 'error'). */
  retrySession: () => void
  login: (email: string, password: string) => Promise<void>
  /** Crea la cuenta y envía el enlace de verificación. No abre sesión hasta confirmar el email. */
  register: (data: RegisterInput) => Promise<void>
  /** Entrar o registrarse con el ID token que devuelve el botón de Google. */
  loginWithGoogle: (credential: string) => Promise<void>
  /** ID de cliente OAuth de Google, o null si el login con Google está desactivado. */
  googleClientId: string | null
  logout: () => void
  /** Pide el correo con el enlace de recuperación (responde igual exista o no la cuenta). */
  requestPasswordReset: (email: string) => Promise<void>
  /** Pone la contraseña nueva con el token del enlace. El backend cierra todas las sesiones. */
  resetPassword: (token: string, password: string) => Promise<void>
  /** Confirma el email con el token del enlace y abre sesión. */
  verifyEmail: (token: string) => Promise<void>
  /** Reenvía el enlace de verificación (responde igual exista o no la cuenta). */
  resendVerification: (email: string) => Promise<void>
  /** Si un enlace del correo sigue valiendo, sin gastarlo (false si caducó o ya se usó). */
  isVerificationLinkValid: (token: string) => Promise<boolean>
  isResetLinkValid: (token: string) => Promise<boolean>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
