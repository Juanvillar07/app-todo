import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

// La misma clave la lee el script de index.html para evitar el parpadeo al cargar.
export const THEME_KEY = 'todo.theme'

export type ThemeContextValue = {
  theme: Theme
  resolvedTheme: 'light' | 'dark'
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
