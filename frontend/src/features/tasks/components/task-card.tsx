import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { TextIcon } from 'lucide-react'
import type { KeyboardEvent } from 'react'
import { cn } from '@/lib/utils'
import type { Task } from '../queries'
import { DueDate, PriorityBadge } from './task-meta'

export function TaskCardContent({
  task,
  done,
  className,
}: {
  task: Task
  done: boolean
  className?: string
}) {
  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3 text-sm transition-colors hover:border-foreground/20',
        className,
      )}
    >
      <p className={cn('leading-snug break-words', done && 'text-muted-foreground')}>{task.title}</p>
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <PriorityBadge priority={task.priority} />
        {task.due_date && <DueDate value={task.due_date} done={done} />}
        {task.description && (
          <TextIcon className="size-3 text-muted-foreground" aria-label="Tiene descripción" />
        )}
      </div>
    </div>
  )
}

export function SortableTaskCard({
  task,
  done,
  onOpen,
}: {
  task: Task
  done: boolean
  onOpen: (id: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // Enter abre la tarea; Espacio la levanta para moverla con las flechas.
    if (event.key === 'Enter') onOpen(task.id)
    else listeners?.onKeyDown?.(event)
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(task.id)}
      aria-label={`${task.title}. Enter para abrir, Espacio para mover.`}
      className={cn(
        'cursor-grab rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing',
        isDragging && 'opacity-40',
      )}
    >
      <TaskCardContent task={task} done={done} />
    </div>
  )
}
