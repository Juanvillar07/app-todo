import createClient, { type Middleware } from 'openapi-fetch'
import type { components, paths } from './api-schema'

// Tipos generados del OpenAPI del backend (`npm run gen:api` con el backend en marcha).
export type Schemas = components['schemas']
export type User = Schemas['UserPublic']

// --- Sesión ---
// La sesión va en una cookie httpOnly que pone el backend: el navegador la envía sola en cada
// petición al mismo origen y JavaScript no puede leerla. Aquí no se guarda ningún token.

// Limpieza del token del sistema de login anterior (antes se guardaba en localStorage).
try {
  localStorage.removeItem('todo.token')
} catch {
  // sin almacenamiento: nada que limpiar
}

// Lo registra la sesión para pasar a "sin sesión" cuando el backend responde 401.
let onUnauthorized: (() => void) | null = null
export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler
}

const AUTH_ENDPOINTS = ['/api/auth/login', '/api/auth/register', '/api/auth/google']

const sessionMiddleware: Middleware = {
  onResponse({ request, response }) {
    // Un 401 de login/registro es "credenciales incorrectas", no "sesión caducada".
    const path = new URL(request.url).pathname
    if (response.status === 401 && !AUTH_ENDPOINTS.includes(path)) onUnauthorized?.()
    return response
  },
}

// Mismo origen siempre: Vite hace proxy de /api en local y CloudFront en producción.
export const api = createClient<paths>({ baseUrl: globalThis.location?.origin ?? '' })
api.use(sessionMiddleware)

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
