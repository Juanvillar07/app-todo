import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2Icon } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { type Location, useBlocker } from 'react-router'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ErrorState } from '@/components/error-state'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ApiError } from '@/lib/api'
import { PRIORITIES } from '../priority'
import { type TaskFormValues, taskSchema } from '../schemas'
import {
  type Task,
  type TaskStatus,
  useCreateTask,
  useDeleteTask,
  useRestoreTask,
  useStatuses,
  useTask,
  useUpdateTask,
} from '../queries'
import { useTaskSheet } from '../use-task-sheet'
import { Markdown } from './markdown'
import { PriorityLabel, StatusDot } from './task-meta'

const taskParam = (location: Location) => new URLSearchParams(location.search).get('task')

function toFormValues(task: Task | undefined, statusId: string): TaskFormValues {
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'medium',
    status_id: task?.status_id ?? statusId,
    due_date: task?.due_date ?? '',
  }
}

export function TaskSheet() {
  const sheet = useTaskSheet()
  const statuses = useStatuses()
  const task = useTask(sheet.taskId)

  const defaultStatus =
    statuses.data?.find((s) => s.id === sheet.initialStatusId) ??
    statuses.data?.find((s) => s.is_default) ??
    statuses.data?.[0]

  const ready = statuses.data && defaultStatus && (sheet.isNew || task.data)

  // Cambios sin guardar. El Sheet se cierra cambiando la URL (Esc, clic fuera, Cancelar, botón
  // Atrás…), así que basta con bloquear esa navegación. El ref se lee en el momento de navegar:
  // al guardar o borrar se marca limpio justo antes de cerrar, sin esperar a un render.
  const dirtyRef = useRef(false)
  const [dirty, setDirty] = useState(false)
  const onDirtyChange = useCallback((value: boolean) => {
    dirtyRef.current = value
    setDirty(value)
  }, [])

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        taskParam(currentLocation) !== taskParam(nextLocation)),
  )

  // Cerrar la pestaña o recargar: el navegador pregunta.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  const notFound = task.error instanceof ApiError && task.error.status === 404

  return (
    <>
    <Sheet open={sheet.isOpen} onOpenChange={(open) => !open && sheet.close()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-xl">
        <SheetTitle className="sr-only">{sheet.isNew ? 'Nueva tarea' : 'Editar tarea'}</SheetTitle>
        <SheetDescription className="sr-only">
          Título, estado, prioridad, fecha límite y descripción de la tarea.
        </SheetDescription>
        {notFound ? (
          <p className="p-6 text-sm text-muted-foreground">Esta tarea no existe o fue eliminada.</p>
        ) : task.isError ? (
          <ErrorState
            title="No se pudo cargar la tarea"
            error={task.error}
            onRetry={() => void task.refetch()}
            retrying={task.isFetching}
            className="pt-24"
          />
        ) : ready ? (
          <TaskForm
            // Re-monta el formulario al cambiar de tarea para partir de sus valores.
            key={sheet.taskId ?? `new-${defaultStatus.id}`}
            task={sheet.isNew ? undefined : task.data}
            statuses={statuses.data}
            defaultValues={toFormValues(sheet.isNew ? undefined : task.data, defaultStatus.id)}
            onDone={sheet.close}
            onDirtyChange={onDirtyChange}
          />
        ) : (
          <div className="space-y-4 p-6 pt-14">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-40 w-full" />
          </div>
        )}
      </SheetContent>
    </Sheet>

      <AlertDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => !open && blocker.state === 'blocked' && blocker.reset()}
      >
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar los cambios?</AlertDialogTitle>
            <AlertDialogDescription>
              Tienes cambios sin guardar en esta tarea. Si sales, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>Seguir editando</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                onDirtyChange(false)
                blocker.proceed?.()
              }}
            >
              Descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function TaskForm({
  task,
  statuses,
  defaultValues,
  onDone,
  onDirtyChange,
}: {
  task?: Task
  statuses: TaskStatus[]
  defaultValues: TaskFormValues
  onDone: () => void
  onDirtyChange: (dirty: boolean) => void
}) {
  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const restore = useRestoreTask()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues,
  })
  const { errors, isSubmitting, isDirty } = form.formState

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])

  /** Cierra sin preguntar (tras guardar o borrar ya no hay nada que perder). */
  const finish = () => {
    onDirtyChange(false)
    onDone()
  }

  const onSubmit = form.handleSubmit(async (values) => {
    const body = {
      ...values,
      description: values.description.trim() ? values.description : null,
      due_date: values.due_date || null,
    }
    if (task) {
      await update.mutateAsync({ id: task.id, ...body })
      toast.success('Tarea guardada')
    } else {
      await create.mutateAsync(body)
      toast.success('Tarea creada')
    }
    finish()
  })

  const onDelete = () => {
    if (!task) return
    const { id } = task
    finish()
    // Desaparece al momento (optimista); si la API falla, vuelve y sale un error.
    remove
      .mutateAsync(id)
      .then(() =>
        toast('Tarea eliminada', {
          duration: 8000,
          action: { label: 'Deshacer', onClick: () => void restore(id) },
        }),
      )
      .catch(() => {})
  }

  return (
    <>
    <form onSubmit={(e) => void onSubmit(e).catch(() => {})} className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-6 overflow-y-auto px-6 pt-12 pb-6">
        <Field data-invalid={!!errors.title}>
          <FieldLabel htmlFor="task-title" className="sr-only">
            Título
          </FieldLabel>
          <Input
            id="task-title"
            placeholder="Título de la tarea"
            autoFocus={!task}
            autoComplete="off"
            aria-invalid={!!errors.title}
            className="h-auto border-none px-0 text-xl font-semibold shadow-none focus-visible:ring-0 md:text-xl dark:bg-transparent"
            {...form.register('title')}
          />
          <FieldError errors={[errors.title]} />
        </Field>

        <div className="grid grid-cols-[7rem_1fr] items-center gap-x-4 gap-y-2 text-sm">
          <label htmlFor="task-status" className="text-muted-foreground">
            Estado
          </label>
          <Controller
            control={form.control}
            name="status_id"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="task-status" size="sm" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="flex items-center gap-2">
                        <StatusDot color={s.color} />
                        {s.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <label htmlFor="task-priority" className="text-muted-foreground">
            Prioridad
          </label>
          <Controller
            control={form.control}
            name="priority"
            render={({ field }) => (
              <Select value={field.value} onValueChange={field.onChange}>
                <SelectTrigger id="task-priority" size="sm" className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      <PriorityLabel priority={p.value} />
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />

          <label htmlFor="task-due" className="text-muted-foreground">
            Fecha límite
          </label>
          <Input id="task-due" type="date" className="h-7 w-48" {...form.register('due_date')} />
        </div>

        <Controller
          control={form.control}
          name="description"
          render={({ field }) => (
            <Tabs defaultValue={task?.description ? 'preview' : 'write'} className="gap-3">
              <TabsList variant="line">
                <TabsTrigger value="write">Escribir</TabsTrigger>
                <TabsTrigger value="preview">Vista previa</TabsTrigger>
              </TabsList>
              <TabsContent value="write">
                <Textarea
                  {...field}
                  aria-label="Descripción"
                  placeholder="Añade detalles… admite Markdown"
                  className="min-h-56 resize-y font-mono text-sm"
                />
                <FieldError errors={[errors.description]} />
              </TabsContent>
              <TabsContent value="preview" className="min-h-56">
                {field.value.trim() ? (
                  <Markdown>{field.value}</Markdown>
                ) : (
                  <p className="text-sm text-muted-foreground">Sin descripción.</p>
                )}
              </TabsContent>
            </Tabs>
          )}
        />
      </div>

      <div className="flex items-center gap-2 border-t px-6 py-4">
        {task && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2Icon />
            Eliminar
          </Button>
        )}
        <div className="ml-auto flex gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : task ? 'Guardar' : 'Crear tarea'}
          </Button>
        </div>
      </div>
    </form>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar la tarea?</AlertDialogTitle>
            <AlertDialogDescription>Podrás deshacerlo durante unos segundos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
