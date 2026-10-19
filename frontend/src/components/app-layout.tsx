import { KanbanIcon, ListIcon, LogOutIcon, MenuIcon, SlidersHorizontalIcon } from 'lucide-react'
import { useState } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Logo } from '@/components/logo'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { useAuth } from '@/features/auth/auth-context'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/', label: 'Tablero', icon: KanbanIcon, end: true },
  { to: '/list', label: 'Lista', icon: ListIcon, end: false },
  { to: '/statuses', label: 'Estados', icon: SlidersHorizontalIcon, end: false },
]

function Nav({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
              isActive && 'bg-muted font-medium text-foreground',
            )
          }
        >
          <Icon className="size-4" />
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function UserMenu() {
  const { user, logout } = useAuth()
  if (!user) return null
  const name = user.full_name || user.email

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left text-sm hover:bg-muted">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium uppercase">
            {name.charAt(0)}
          </span>
          <span className="truncate">{name}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-56">
        <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
          {user.email}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout}>
          <LogOutIcon />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col px-3 py-5">
      <Logo className="px-2.5" />
      <div className="mt-8 flex-1">
        <Nav onNavigate={onNavigate} />
      </div>
      <div className="flex items-center gap-1">
        <UserMenu />
        <ThemeToggle />
      </div>
    </div>
  )
}

export function AppLayout() {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex min-h-svh">
      <aside className="sticky top-0 hidden h-svh w-60 shrink-0 border-r md:block">
        <SidebarContent />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b px-4 py-3 md:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Abrir menú">
                <MenuIcon />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 p-0" showCloseButton={false}>
              <SheetTitle className="sr-only">Menú</SheetTitle>
              <SidebarContent onNavigate={() => setMobileOpen(false)} />
            </SheetContent>
          </Sheet>
          <Logo />
        </header>

        <main className="flex-1 px-4 py-8 md:px-10 md:py-10">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
