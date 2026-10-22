import type { ReactNode } from 'react'
import { Logo } from '@/components/logo'

export function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <main className="relative isolate flex min-h-svh items-center justify-center overflow-hidden bg-canvas px-4 py-12">
      {/* Banda diagonal suave del color de acento, guiño a Stripe. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 -z-10 h-[55svh] origin-top-left -skew-y-6 bg-linear-to-br from-primary/25 via-primary/10 to-transparent"
      />
      <div className="w-full max-w-sm">
        <Logo className="mb-8 px-1" />
        <div className="rounded-xl border bg-card p-8 shadow-sm">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
        {footer && <p className="mt-6 px-1 text-sm text-muted-foreground">{footer}</p>}
      </div>
    </main>
  )
}
