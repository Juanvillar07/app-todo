import type { Priority } from './queries'

// De más a menos urgente; el color se reserva para dar significado (ver CLAUDE.md).
export const PRIORITIES: { value: Priority; label: string; className: string; dot: string }[] = [
  {
    value: 'urgent',
    label: 'Urgente',
    className: 'bg-red-500/10 text-red-600 dark:text-red-400',
    dot: 'bg-red-500',
  },
  {
    value: 'high',
    label: 'Alta',
    className: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',
    dot: 'bg-orange-500',
  },
  {
    value: 'medium',
    label: 'Media',
    className: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    dot: 'bg-blue-500',
  },
  {
    value: 'low',
    label: 'Baja',
    className: 'bg-muted text-muted-foreground',
    dot: 'bg-muted-foreground/50',
  },
]

export const priorityMeta = (value: Priority) => PRIORITIES.find((p) => p.value === value)!
