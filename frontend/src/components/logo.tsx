import { cn } from '@/lib/utils'

export function Logo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 font-semibold tracking-tight', className)}>
      <span className="size-4 rounded-[5px] bg-primary" aria-hidden />
      Tareas
    </div>
  )
}
