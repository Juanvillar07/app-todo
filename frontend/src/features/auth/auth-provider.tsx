import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo } from 'react'
import { ApiError, api, setUnauthorizedHandler, unwrap, type User } from '@/lib/api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  meQueryKey,
  type RegisterInput,
} from './auth-context'

const authConfigQueryKey = ['auth-config'] as const

/** Usuario de la cookie de sesión, o null si no hay sesión (401). */
async function fetchMe(): Promise<User | null> {
  try {
    return await unwrap(api.GET('/api/users/me'))
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null
    throw error
  }
}

/** true si el backend da el enlace por bueno (204), false si caducó o no existe (400). */
async function isLinkValid(call: Parameters<typeof unwrap>[0]): Promise<boolean> {
  try {
    await unwrap(call)
    return true
  } catch (error) {
    if (error instanceof ApiError && error.status === 400) return false
    throw error
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  // La cookie es httpOnly: la única forma de saber si hay sesión es preguntar al backend.
  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    staleTime: Infinity,
    retry: false,
  })

  const config = useQuery({
    queryKey: authConfigQueryKey,
    queryFn: () => unwrap(api.GET('/api/auth/config')),
    staleTime: Infinity,
  })

  /** Fija el usuario de la sesión (o null) y, al cerrarla, borra los datos del anterior. */
  const setSessionUser = useCallback(
    (user: User | null) => {
      queryClient.setQueryData(meQueryKey, user)
      if (user === null) {
        const keep = new Set<unknown>([meQueryKey[0], authConfigQueryKey[0]])
        queryClient.removeQueries({ predicate: (q) => !keep.has(q.queryKey[0]) })
      }
    },
    [queryClient],
  )

  // Sesión caducada o revocada: el backend responde 401 → pantalla de login.
  useEffect(() => {
    setUnauthorizedHandler(() => setSessionUser(null))
    return () => setUnauthorizedHandler(null)
  }, [setSessionUser])

  const login = useCallback(
    async (email: string, password: string) => {
      setSessionUser(await unwrap(api.POST('/api/auth/login', { body: { email, password } })))
    },
    [setSessionUser],
  )

  const register = useCallback(
    async (data: RegisterInput) => {
      // Sin sesión: primero hay que confirmar el email con el enlace del correo.
      await unwrap(api.POST('/api/auth/register', { body: data }))
    },
    [],
  )

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      setSessionUser(await unwrap(api.POST('/api/auth/google', { body: { credential } })))
    },
    [setSessionUser],
  )

  const logout = useCallback(() => {
    // Se sale en la interfaz al momento; el backend borra la sesión y la cookie.
    setSessionUser(null)
    void api.POST('/api/auth/logout')
  }, [setSessionUser])

  const requestPasswordReset = useCallback(async (email: string) => {
    await unwrap(api.POST('/api/auth/forgot-password', { body: { email } }))
  }, [])

  const resetPassword = useCallback(
    async (token: string, password: string) => {
      await unwrap(api.POST('/api/auth/reset-password', { body: { token, password } }))
      // El backend cerró todas las sesiones, también la de este navegador si la había.
      setSessionUser(null)
    },
    [setSessionUser],
  )

  const verifyEmail = useCallback(
    async (token: string) => {
      setSessionUser(await unwrap(api.POST('/api/auth/verify-email', { body: { token } })))
    },
    [setSessionUser],
  )

  const resendVerification = useCallback(async (email: string) => {
    await unwrap(api.POST('/api/auth/resend-verification', { body: { email } }))
  }, [])

  const isVerificationLinkValid = useCallback(
    (token: string) => isLinkValid(api.POST('/api/auth/verify-email/validate', { body: { token } })),
    [],
  )

  const isResetLinkValid = useCallback(
    (token: string) =>
      isLinkValid(api.POST('/api/auth/reset-password/validate', { body: { token } })),
    [],
  )

  const status: AuthStatus = me.isPending ? 'loading' : me.data ? 'authenticated' : 'anonymous'

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user: me.data ?? null,
      login,
      register,
      loginWithGoogle,
      googleClientId: config.data?.google_client_id ?? null,
      logout,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerification,
      isVerificationLinkValid,
      isResetLinkValid,
    }),
    [
      status,
      me.data,
      login,
      register,
      loginWithGoogle,
      config.data,
      logout,
      requestPasswordReset,
      resetPassword,
      verifyEmail,
      resendVerification,
      isVerificationLinkValid,
      isResetLinkValid,
    ],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
