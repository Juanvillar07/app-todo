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
  footer: ReactNode
}) {
  return (
    <main className="flex min-h-svh items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <Logo className="mb-10" />
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        <div className="mt-8">{children}</div>
        <p className="mt-8 text-sm text-muted-foreground">{footer}</p>
      </div>
    </main>
  )
}
