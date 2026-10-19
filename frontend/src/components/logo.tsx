import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="size-2.5 rounded-full bg-foreground" aria-hidden />
      Tareas
    </div>
  )
}
