import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './api-schema'

// Tipos generados del OpenAPI del backend (`npm run gen:api` con el backend en marcha).
export type Schemas = components['schemas']
export type User = Schemas['UserPublic']

// --- Token ---
// Se guarda en memoria y en localStorage (proyecto de prueba; ver "Recomendaciones" en docs/PLAN.md).

const TOKEN_KEY = 'todo.token'

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

let token: string | null = readStoredToken()

export const tokenStore = {
  get: () => token,
  set(value: string) {
    token = value
    try {
      localStorage.setItem(TOKEN_KEY, value)
    } catch {
      // sin almacenamiento persistente: el token vive solo en memoria
    }
  },
  clear() {
    token = null
    try {
      localStorage.removeItem(TOKEN_KEY)
    } catch {
      // nada que limpiar
    }
  },
}

// Lo registra la sesión para cerrar sesión cuando el backend responde 401.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

const authMiddleware: Middleware = {
  onRequest({ request }) {
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
  onResponse({ request, response }) {
    const isLogin = new URL(request.url).pathname.endsWith('/auth/login')
    if (response.status === 401 && token && !isLogin) onUnauthorized?.()
    return response
  },
}

// Mismo origen siempre: Vite hace proxy de /api en local y CloudFront en producción.
export const api = createClient<paths>({ baseUrl: globalThis.location?.origin ?? '' })
api.use(authMiddleware)

// --- Errores ---

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type ErrorBody = { detail?: string | Array<{ msg?: string }> } | undefined

function messageFrom(body: unknown, fallback: string): string {
  const detail = (body as ErrorBody)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return detail[0].msg
  return fallback
}

/** Devuelve `data` o lanza ApiError con el mensaje del backend. */
export async function unwrap<T>(
  call: Promise<{ data?: T; error?: unknown; response: Response }>,
): Promise<T> {
  let result: Awaited<typeof call>
  try {
    result = await call
  } catch {
    throw new ApiError(0, 'No se pudo conectar con el servidor')
  }
  const { data, error, response } = result
  if (error !== undefined || !response.ok) {
    throw new ApiError(response.status, messageFrom(error, 'Algo salió mal. Inténtalo de nuevo.'))
  }
  return data as T
}
