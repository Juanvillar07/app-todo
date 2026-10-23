import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import { CheckIcon, GripVerticalIcon, MoreHorizontalIcon, PlusIcon } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { ErrorState } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field, FieldError } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { StatusDot } from './components/task-meta'
import {
  type TaskStatus,
  useCreateStatus,
  useDeleteStatus,
  useReorderStatuses,
  useStatuses,
  useUpdateStatus,
} from './queries'

// Paleta corta y apagada para que los estados no compitan con el contenido.
const STATUS_COLORS = [
  '#94a3b8',
  '#3b82f6',
  '#8b5cf6',
  '#14b8a6',
  '#22c55e',
  '#eab308',
  '#f97316',
  '#ef4444',
]

export function StatusesPage() {
  const statuses = useStatuses()
  const reorder = useReorderStatuses()
  const [deleting, setDeleting] = useState<TaskStatus | null>(null)

  const sorted = [...(statuses.data ?? [])].sort((a, b) => a.position - b.position)

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return
    const ids = sorted.map((s) => s.id)
    reorder.mutate(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))))
  }

  return (
    <div className="max-w-xl">
      <PageHeader
        title="Estados"
        description="Las columnas de tu tablero. Arrastra para cambiar el orden."
      />

      {statuses.isError ? (
        <ErrorState
          title="No se pudieron cargar tus estados"
          error={statuses.error}
          onRetry={() => void statuses.refetch()}
          retrying={statuses.isFetching}
        />
      ) : statuses.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={sorted.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <ul className="divide-y border-y" aria-label="Estados">
              {sorted.map((status) => (
                <StatusRow
                  key={status.id}
                  status={status}
                  canDelete={sorted.length > 1}
                  onDelete={() => setDeleting(status)}
                />
              ))}
            </ul>
          </SortableContext>
        </DndContext>
      )}

      <NewStatusForm />

      {deleting && (
        <DeleteStatusDialog
          status={deleting}
          others={sorted.filter((s) => s.id !== deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </div>
  )
}

function StatusRow({
  status,
  canDelete,
  onDelete,
}: {
  status: TaskStatus
  canDelete: boolean
  onDelete: () => void
}) {
  const update = useUpdateStatus()
  const [name, setName] = useState(status.name)
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: status.id })

  const saveName = () => {
    const trimmed = name.trim()
    if (!trimmed || trimmed === status.name) {
      setName(status.name)
      return
    }
    update.mutate({ id: status.id, name: trimmed }, { onError: () => setName(status.name) })
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/row flex items-center gap-2 bg-background py-1.5 pr-1',
        isDragging && 'relative z-10 opacity-80',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        className="cursor-grab rounded p-1 text-muted-foreground/50 hover:text-muted-foreground active:cursor-grabbing"
        aria-label={`Mover ${status.name}`}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="flex size-6 items-center justify-center rounded-md hover:bg-muted"
            aria-label={`Color de ${status.name}`}
          >
            <StatusDot color={status.color} className="size-2.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-auto">
          <div className="grid grid-cols-4 gap-1 p-1">
            {STATUS_COLORS.map((color) => (
              <DropdownMenuItem
                key={color}
                className="flex size-8 items-center justify-center p-0"
                onSelect={() => update.mutate({ id: status.id, color })}
                aria-label={color}
              >
                <span className="flex size-4 items-center justify-center rounded-full" style={{ backgroundColor: color }}>
                  {color === status.color && <CheckIcon className="size-3 text-white" />}
                </span>
              </DropdownMenuItem>
            ))}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={saveName}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur()
          if (e.key === 'Escape') {
            setName(status.name)
            e.currentTarget.blur()
          }
        }}
        maxLength={50}
        aria-label="Nombre del estado"
        className="h-8 flex-1 border-transparent bg-transparent px-1.5 shadow-none hover:border-input focus-visible:border-input dark:bg-transparent"
      />

      <div className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
        {status.is_default && <span>Por defecto</span>}
        {status.is_done && <span>Cierre</span>}
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
            aria-label={`Opciones de ${status.name}`}
          >
            <MoreHorizontalIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem
            disabled={status.is_default}
            onSelect={() => update.mutate({ id: status.id, is_default: true })}
          >
            Usar por defecto para tareas nuevas
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => update.mutate({ id: status.id, is_done: !status.is_done })}>
            {status.is_done ? 'Quitar marca de cierre' : 'Marcar como estado de cierre'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" disabled={!canDelete} onSelect={onDelete}>
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function DeleteStatusDialog({
  status,
  others,
  onClose,
}: {
  status: TaskStatus
  others: TaskStatus[]
  onClose: () => void
}) {
  const remove = useDeleteStatus()
  const [moveTo, setMoveTo] = useState((others.find((s) => s.is_default) ?? others[0]).id)

  const onConfirm = () =>
    remove.mutate({ id: status.id, moveTo }, { onSuccess: onClose })

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Eliminar «{status.name}»</DialogTitle>
          <DialogDescription>Sus tareas se moverán al estado que elijas.</DialogDescription>
        </DialogHeader>
        <Select value={moveTo} onValueChange={setMoveTo}>
          <SelectTrigger className="w-full" aria-label="Mover las tareas a">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {others.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <StatusDot color={s.color} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={remove.isPending}>
            Eliminar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const newStatusSchema = z.object({
  name: z.string().trim().min(1, 'Escribe un nombre').max(50, 'Máximo 50 caracteres'),
})

function NewStatusForm() {
  const create = useCreateStatus()
  const form = useForm<z.infer<typeof newStatusSchema>>({
    resolver: zodResolver(newStatusSchema),
    defaultValues: { name: '' },
  })
  const error = form.formState.errors.name

  const onSubmit = form.handleSubmit(async ({ name }) => {
    await create.mutateAsync({ name, color: STATUS_COLORS[1] })
    form.reset()
  })

  return (
    <form onSubmit={(e) => void onSubmit(e).catch(() => {})} className="mt-4">
      <Field data-invalid={!!error}>
        <div className="flex gap-2">
          <Input
            placeholder="Nuevo estado"
            aria-label="Nombre del nuevo estado"
            aria-invalid={!!error}
            maxLength={50}
            {...form.register('name')}
          />
          <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
            <PlusIcon />
            Añadir
          </Button>
        </div>
        <FieldError errors={[error]} />
      </Field>
    </form>
  )
}
