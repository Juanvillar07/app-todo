import { type ReactNode, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { THEME_KEY, type Theme, ThemeContext } from './theme-context'

const darkQuery = '(prefers-color-scheme: dark)'

function subscribeToSystem(callback: () => void) {
  const media = window.matchMedia(darkQuery)
  media.addEventListener('change', callback)
  return () => media.removeEventListener('change', callback)
}

const systemPrefersDark = () => window.matchMedia(darkQuery).matches

function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY)
    if (stored === 'light' || stored === 'dark') return stored
  } catch {
    // sin almacenamiento: usa el del sistema
  }
  return 'system'
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const prefersDark = useSyncExternalStore(subscribeToSystem, systemPrefersDark)
  const resolvedTheme = theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolvedTheme === 'dark')
    document.documentElement.style.colorScheme = resolvedTheme
  }, [resolvedTheme])

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    try {
      if (next === 'system') localStorage.removeItem(THEME_KEY)
      else localStorage.setItem(THEME_KEY, next)
    } catch {
      // el tema dura solo esta sesión
    }
  }, [])

  const value = useMemo(
    () => ({ theme, resolvedTheme, setTheme }) as const,
    [theme, resolvedTheme, setTheme],
  )
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}
