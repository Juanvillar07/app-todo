import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { toast } from 'sonner'
import { api, type Schemas, unwrap } from '@/lib/api'

export type Task = Schemas['TaskPublic']
export type TaskStatus = Schemas['StatusPublic']
export type Priority = Schemas['Priority']
export type TaskCreate = Schemas['TaskCreate']
export type TaskUpdate = Schemas['TaskUpdate']
export type StatusCreate = Schemas['StatusCreate']
export type StatusUpdate = Schemas['StatusUpdate']
export type TaskSort = NonNullable<TaskListParams['sort']>

export type TaskListParams = {
  status_id?: string
  priority?: Priority[]
  q?: string
  sort?:
    | 'position'
    | '-position'
    | 'created_at'
    | '-created_at'
    | 'updated_at'
    | '-updated_at'
    | 'due_date'
    | '-due_date'
    | 'priority'
    | '-priority'
    | 'title'
    | '-title'
  limit?: number
  offset?: number
}

// El tablero carga todas las tareas de una vez (máximo de la API: 200).
export const BOARD_LIMIT = 200

export const keys = {
  statuses: ['statuses'] as const,
  tasks: ['tasks'] as const,
  board: ['tasks', 'board'] as const,
  list: (params: TaskListParams) => ['tasks', 'list', params] as const,
  task: (id: string) => ['tasks', 'detail', id] as const,
}

const onError = (error: Error) => toast.error(error.message)

// --- Estados ---

export function useStatuses() {
  return useQuery({
    queryKey: keys.statuses,
    queryFn: () => unwrap(api.GET('/api/statuses')),
  })
}

export function useCreateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: StatusCreate) => unwrap(api.POST('/api/statuses', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.statuses }),
    onError,
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: StatusUpdate & { id: string }) =>
      unwrap(api.PATCH('/api/statuses/{status_id}', { params: { path: { status_id: id } }, body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.statuses }),
    onError,
  })
}

export function useDeleteStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, moveTo }: { id: string; moveTo?: string }) =>
      unwrap(
        api.DELETE('/api/statuses/{status_id}', {
          params: { path: { status_id: id }, query: moveTo ? { move_to: moveTo } : {} },
        }),
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: keys.statuses })
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError,
  })
}

export function useReorderStatuses() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => unwrap(api.PUT('/api/statuses/reorder', { body: { ids } })),
    // Optimista: la lista se reordena al soltar, sin esperar al servidor.
    onMutate: async (ids) => {
      await qc.cancelQueries({ queryKey: keys.statuses })
      const previous = qc.getQueryData<TaskStatus[]>(keys.statuses)
      if (previous) {
        const byId = new Map(previous.map((s) => [s.id, s]))
        qc.setQueryData(
          keys.statuses,
          ids.map((id, position) => ({ ...byId.get(id)!, position })),
        )
      }
      return { previous }
    },
    onError: (error, _ids, context) => {
      if (context?.previous) qc.setQueryData(keys.statuses, context.previous)
      onError(error)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.statuses }),
  })
}

// --- Tareas ---

async function fetchTasks(params: TaskListParams) {
  return unwrap(api.GET('/api/tasks', { params: { query: params } }))
}

export function useBoardTasks() {
  return useQuery({
    queryKey: keys.board,
    queryFn: () => fetchTasks({ sort: 'position', limit: BOARD_LIMIT }),
  })
}

export function useTaskList(params: TaskListParams) {
  return useQuery({
    queryKey: keys.list(params),
    queryFn: () => fetchTasks(params),
    placeholderData: keepPreviousData,
  })
}

export function useTask(id: string | null) {
  return useQuery({
    queryKey: keys.task(id ?? ''),
    queryFn: () =>
      unwrap(api.GET('/api/tasks/{task_id}', { params: { path: { task_id: id! } } })),
    enabled: id !== null,
  })
}

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TaskCreate) => unwrap(api.POST('/api/tasks', { body })),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.tasks }),
    onError,
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: TaskUpdate & { id: string }) =>
      unwrap(api.PATCH('/api/tasks/{task_id}', { params: { path: { task_id: id } }, body })),
    onSuccess: (task) => {
      qc.setQueryData(keys.task(task.id), task)
      qc.invalidateQueries({ queryKey: keys.tasks })
    },
    onError,
  })
}

type TaskPage = Schemas['TaskPage']

// Tablero y páginas de la lista (las cachés con forma TaskPage, no el detalle de una tarea).
const taskPages = {
  queryKey: keys.tasks,
  predicate: (q: { queryKey: readonly unknown[] }) =>
    q.queryKey[1] === 'board' || q.queryKey[1] === 'list',
}

/**
 * Borra una tarea (borrado suave en el backend, se puede deshacer con useRestoreTask). La quita
 * de la caché del tablero y de la lista al momento; si la API falla, la vuelve a poner.
 */
export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(api.DELETE('/api/tasks/{task_id}', { params: { path: { task_id: id } } })),
    onMutate: async (id) => {
      await qc.cancelQueries(taskPages)
      const snapshot = qc.getQueriesData<TaskPage>(taskPages)
      qc.setQueriesData<TaskPage>(taskPages, (page) =>
        page && page.items.some((t) => t.id === id)
          ? { ...page, items: page.items.filter((t) => t.id !== id), total: page.total - 1 }
          : page,
      )
      return { snapshot }
    },
    onError: (error, _id, context) => {
      context?.snapshot.forEach(([key, data]) => qc.setQueryData(key, data))
      onError(error)
    },
    onSuccess: (_data, id) => qc.removeQueries({ queryKey: keys.task(id) }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  })
}

/**
 * Deshace el borrado de una tarea. Es una función y no una mutación de componente: se llama
 * desde el toast "Deshacer", cuando el Sheet de la tarea ya se ha cerrado.
 */
export function useRestoreTask() {
  const qc = useQueryClient()
  return useCallback(
    async (id: string) => {
      try {
        await unwrap(
          api.POST('/api/tasks/{task_id}/restore', { params: { path: { task_id: id } } }),
        )
        toast.success('Tarea restaurada')
      } catch (error) {
        onError(error as Error)
      } finally {
        void qc.invalidateQueries({ queryKey: keys.tasks })
      }
    },
    [qc],
  )
}

/** Aplica un movimiento a la lista del tablero: cambia el estado y renumera ambas columnas. */
export function applyMove(tasks: Task[], taskId: string, statusId: string, index: number): Task[] {
  const moving = tasks.find((t) => t.id === taskId)
  if (!moving) return tasks
  const columnOf = (sid: string) =>
    tasks.filter((t) => t.status_id === sid && t.id !== taskId).sort((a, b) => a.position - b.position)

  const destination = columnOf(statusId)
  destination.splice(Math.min(index, destination.length), 0, { ...moving, status_id: statusId })
  const updated = new Map(destination.map((t, position) => [t.id, { ...t, position }]))
  if (moving.status_id !== statusId) {
    columnOf(moving.status_id).forEach((t, position) => updated.set(t.id, { ...t, position }))
  }
  return tasks.map((t) => updated.get(t.id) ?? t)
}

type MoveVars = { id: string; statusId: string; position: number; previous?: Schemas['TaskPage'] }

/**
 * Mueve una tarea en el tablero de forma optimista. La caché se actualiza de forma síncrona
 * (antes de la petición) para que la tarjeta no "salte" al soltarla; si la API falla, se revierte.
 */
export function useMoveTask() {
  const qc = useQueryClient()
  const { mutate } = useMutation({
    mutationFn: ({ id, statusId, position }: MoveVars) =>
      unwrap(
        api.PATCH('/api/tasks/{task_id}/move', {
          params: { path: { task_id: id } },
          body: { status_id: statusId, position },
        }),
      ),
    onError: (error, { previous }) => {
      if (previous) qc.setQueryData(keys.board, previous)
      onError(error)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.tasks }),
  })

  return useCallback(
    (id: string, statusId: string, position: number) => {
      void qc.cancelQueries({ queryKey: keys.board }, { revert: false })
      const previous = qc.getQueryData<Schemas['TaskPage']>(keys.board)
      if (previous) {
        qc.setQueryData(keys.board, {
          ...previous,
          items: applyMove(previous.items, id, statusId, position),
        })
      }
      mutate({ id, statusId, position, previous })
    },
    [qc, mutate],
  )
}
