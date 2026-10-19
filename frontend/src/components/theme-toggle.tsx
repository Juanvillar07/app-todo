import { MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from '@/components/theme-context'
import { Button } from '@/components/ui/button'

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Usar tema claro' : 'Usar tema oscuro'}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}
