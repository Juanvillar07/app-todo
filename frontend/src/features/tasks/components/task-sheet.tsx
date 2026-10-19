import { zodResolver } from '@hookform/resolvers/zod'
import { Trash2Icon } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { PRIORITIES } from '../priority'
import { type TaskFormValues, taskSchema } from '../schemas'
import {
  type Task,
  type TaskStatus,
  useCreateTask,
  useDeleteTask,
  useStatuses,
  useTask,
  useUpdateTask,
} from '../queries'
import { useTaskSheet } from '../use-task-sheet'
import { Markdown } from './markdown'
import { PriorityLabel, StatusDot } from './task-meta'


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

  return (
    <Sheet open={sheet.isOpen} onOpenChange={(open) => !open && sheet.close()}>
      <SheetContent className="w-full gap-0 data-[side=right]:sm:max-w-xl">
        <SheetTitle className="sr-only">{sheet.isNew ? 'Nueva tarea' : 'Editar tarea'}</SheetTitle>
        <SheetDescription className="sr-only">
          Título, estado, prioridad, fecha límite y descripción de la tarea.
        </SheetDescription>
        {task.isError ? (
          <p className="p-6 text-sm text-muted-foreground">Esta tarea no existe o fue eliminada.</p>
        ) : ready ? (
          <TaskForm
            // Re-monta el formulario al cambiar de tarea para partir de sus valores.
            key={sheet.taskId ?? `new-${defaultStatus.id}`}
            task={sheet.isNew ? undefined : task.data}
            statuses={statuses.data}
            defaultValues={toFormValues(sheet.isNew ? undefined : task.data, defaultStatus.id)}
            onDone={sheet.close}
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
  )
}

function TaskForm({
  task,
  statuses,
  defaultValues,
  onDone,
}: {
  task?: Task
  statuses: TaskStatus[]
  defaultValues: TaskFormValues
  onDone: () => void
}) {
  const create = useCreateTask()
  const update = useUpdateTask()
  const remove = useDeleteTask()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskSchema),
    defaultValues,
  })
  const { errors, isSubmitting } = form.formState

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
    onDone()
  })

  const onDelete = async () => {
    if (!task) return
    await remove.mutateAsync(task.id)
    toast.success('Tarea eliminada')
    onDone()
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
            <AlertDialogDescription>Esta acción no se puede deshacer.</AlertDialogDescription>
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
