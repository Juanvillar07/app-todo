import { GoogleLogin, GoogleOAuthProvider } from '@react-oauth/google'
import { useLayoutEffect, useRef, useState } from 'react'
import { useTheme } from '@/components/theme-context'
import { useAuth } from './auth-context'

type Props = {
  onSuccess: () => void
  onError: (message: string) => void
}

const GENERIC_ERROR = 'No se pudo iniciar sesión con Google'

/**
 * Botón oficial "Continuar con Google" (Google Identity Services) y separador "o".
 * Google devuelve un ID token firmado que el backend verifica; no hay redirecciones.
 * No se muestra si el backend no tiene configurado GOOGLE_CLIENT_ID.
 */
export function GoogleSignIn(props: Props) {
  const { googleClientId } = useAuth()
  if (!googleClientId) return null
  return <GoogleSignInButton clientId={googleClientId} {...props} />
}

function GoogleSignInButton({ clientId, onSuccess, onError }: Props & { clientId: string }) {
  const { loginWithGoogle } = useAuth()
  const { resolvedTheme } = useTheme()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState<number>()

  // El botón de Google es un iframe con ancho fijo en px (máx. 400): se ajusta al contenedor.
  useLayoutEffect(() => {
    if (container.current) setWidth(Math.min(400, Math.floor(container.current.offsetWidth)))
  }, [])

  const handleCredential = async (credential: string | undefined) => {
    if (!credential) return onError(GENERIC_ERROR)
    try {
      await loginWithGoogle(credential)
      onSuccess()
    } catch (error) {
      onError((error as Error).message)
    }
  }

  return (
    <div className="mb-6">
      <div ref={container} className="flex min-h-10 justify-center" data-testid="google-sign-in">
        {width !== undefined && (
          <GoogleOAuthProvider clientId={clientId} locale="es">
            <GoogleLogin
              onSuccess={({ credential }) => void handleCredential(credential)}
              onError={() => onError(GENERIC_ERROR)}
              text="continue_with"
              theme={resolvedTheme === 'dark' ? 'filled_black' : 'outline'}
              size="large"
              shape="rectangular"
              logo_alignment="center"
              width={width}
            />
          </GoogleOAuthProvider>
        )}
      </div>
      <div className="mt-6 flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />o<span className="h-px flex-1 bg-border" />
      </div>
    </div>
  )
}
