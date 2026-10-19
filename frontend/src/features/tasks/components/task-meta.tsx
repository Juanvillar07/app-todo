import { CalendarIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { formatDueDate, isOverdue } from '@/lib/dates'
import { cn } from '@/lib/utils'
import { priorityMeta } from '../priority'
import type { Priority } from '../queries'

export function PriorityBadge({ priority, className }: { priority: Priority; className?: string }) {
  const meta = priorityMeta(priority)
  return (
    <Badge className={cn('border-transparent font-normal', meta.className, className)}>
      {meta.label}
    </Badge>
  )
}

export function PriorityLabel({ priority }: { priority: Priority }) {
  const meta = priorityMeta(priority)
  return (
    <span className="flex items-center gap-2">
      <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
      {meta.label}
    </span>
  )
}

export function StatusDot({ color, className }: { color: string; className?: string }) {
  return (
    <span
      className={cn('inline-block size-2 shrink-0 rounded-full', className)}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  )
}

/** Fecha límite; en rojo si ya pasó y la tarea no está cerrada. */
export function DueDate({ value, done = false }: { value: string; done?: boolean }) {
  const overdue = !done && isOverdue(value)
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground',
        overdue && 'text-red-600 dark:text-red-400',
      )}
      title={overdue ? 'Vencida' : undefined}
    >
      <CalendarIcon className="size-3" />
      {formatDueDate(value)}
    </span>
  )
}
