import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'

export type LinkState = 'checking' | 'valid' | 'invalid' | 'error'

/**
 * Token de un enlace del correo (?token=…): lo guarda, lo quita de la URL (historial, capturas,
 * enlaces compartidos) y pregunta al backend si sigue valiendo, sin gastarlo. Así la página dice
 * "Enlace no válido" nada más abrirse en vez de al enviar el formulario.
 */
export function useLinkToken(isValid: (token: string) => Promise<boolean>) {
  const [searchParams, setSearchParams] = useSearchParams()
  const [token] = useState(() => searchParams.get('token'))
  const [state, setState] = useState<LinkState>(token ? 'checking' : 'invalid')
  const [error, setError] = useState<string>()

  useEffect(() => {
    if (searchParams.has('token')) setSearchParams({}, { replace: true })
  }, [searchParams, setSearchParams])

  useEffect(() => {
    if (!token) return
    let cancelled = false
    isValid(token).then(
      (valid) => !cancelled && setState(valid ? 'valid' : 'invalid'),
      (err: Error) => {
        if (cancelled) return
        setError(err.message)
        setState('error')
      },
    )
    return () => {
      cancelled = true
    }
  }, [token, isValid])

  return { token, state, error }
}
