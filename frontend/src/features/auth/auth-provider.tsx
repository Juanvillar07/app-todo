import { useQuery, useQueryClient } from '@tanstack/react-query'
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react'
import { api, setUnauthorizedHandler, tokenStore, unwrap } from '@/lib/api'
import {
  AuthContext,
  type AuthContextValue,
  type AuthStatus,
  meQueryKey,
  type RegisterInput,
} from './auth-context'

const fetchMe = () => unwrap(api.GET('/api/users/me'))

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [token, setToken] = useState(tokenStore.get)

  const me = useQuery({
    queryKey: meQueryKey,
    queryFn: fetchMe,
    enabled: token !== null,
    staleTime: Infinity,
    retry: false,
  })

  const logout = useCallback(() => {
    tokenStore.clear()
    setToken(null)
    queryClient.clear()
  }, [queryClient])

  useEffect(() => {
    setUnauthorizedHandler(logout)
    return () => setUnauthorizedHandler(null)
  }, [logout])

  const login = useCallback(
    async (email: string, password: string) => {
      const { access_token } = await unwrap(
        api.POST('/api/auth/login', {
          body: { username: email, password, scope: '' },
          bodySerializer: (body) => new URLSearchParams(body as Record<string, string>),
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        }),
      )
      tokenStore.set(access_token)
      try {
        await queryClient.fetchQuery({ queryKey: meQueryKey, queryFn: fetchMe })
      } catch (error) {
        tokenStore.clear()
        throw error
      }
      setToken(access_token)
    },
    [queryClient],
  )

  const register = useCallback(
    async (data: RegisterInput) => {
      await unwrap(api.POST('/api/auth/register', { body: data }))
      await login(data.email, data.password)
    },
    [login],
  )

  // Un token expirado provoca 401 → el middleware de la API llama a logout().
  const status: AuthStatus =
    token === null || me.isError ? 'anonymous' : me.data ? 'authenticated' : 'loading'

  const value = useMemo<AuthContextValue>(
    () => ({ status, user: me.data ?? null, login, register, logout }),
    [status, me.data, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
