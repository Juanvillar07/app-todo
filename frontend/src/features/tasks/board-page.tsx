import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  type DragOverEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { PlusIcon } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ErrorState } from '@/components/error-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { SortableTaskCard, TaskCardContent } from './components/task-card'
import { StatusDot } from './components/task-meta'
import { BOARD_LIMIT, type Task, type TaskStatus, useBoardTasks, useMoveTask, useStatuses } from './queries'
import { useTaskSheet } from './use-task-sheet'

type Columns = Record<string, string[]> // statusId -> ids de tareas en orden

const COLUMN_PREFIX = 'column:'

function groupByStatus(statuses: TaskStatus[], tasks: Task[]): Columns {
  const columns: Columns = Object.fromEntries(statuses.map((s) => [s.id, []]))
  for (const task of [...tasks].sort((a, b) => a.position - b.position)) {
    columns[task.status_id]?.push(task.id)
  }
  return columns
}

export function BoardPage() {
  const statuses = useStatuses()
  const board = useBoardTasks()
  const moveTask = useMoveTask()
  const sheet = useTaskSheet()

  // Mientras se arrastra, el orden vive en estado local; al soltar se aplica en la caché.
  const [dragColumns, setDragColumns] = useState<Columns | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)

  const sortedStatuses = useMemo(
    () => [...(statuses.data ?? [])].sort((a, b) => a.position - b.position),
    [statuses.data],
  )
  const tasksById = useMemo(
    () => new Map((board.data?.items ?? []).map((t) => [t.id, t])),
    [board.data],
  )
  const serverColumns = useMemo(
    () => groupByStatus(sortedStatuses, board.data?.items ?? []),
    [sortedStatuses, board.data],
  )
  const columns = dragColumns ?? serverColumns
  const doneStatusIds = new Set(sortedStatuses.filter((s) => s.is_done).map((s) => s.id))

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ['Space'], cancel: ['Escape'], end: ['Space', 'Enter'] },
    }),
  )

  const findColumn = (id: string, cols: Columns) =>
    id.startsWith(COLUMN_PREFIX)
      ? id.slice(COLUMN_PREFIX.length)
      : Object.keys(cols).find((statusId) => cols[statusId].includes(id))

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragColumns(serverColumns)
  }

  // Al pasar a otra columna, la tarjeta se mueve ahí para que se vea el hueco.
  const onDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    setDragColumns((cols) => {
      if (!cols) return cols
      const from = findColumn(String(active.id), cols)
      const to = findColumn(String(over.id), cols)
      if (!from || !to || from === to) return cols
      const target = cols[to]
      const overIndex = target.indexOf(String(over.id))
      const index = overIndex === -1 ? target.length : overIndex
      return {
        ...cols,
        [from]: cols[from].filter((id) => id !== active.id),
        [to]: [...target.slice(0, index), String(active.id), ...target.slice(index)],
      }
    })
  }

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const cols = dragColumns
    setActiveId(null)
    setDragColumns(null)
    if (!over || !cols) return

    const id = String(active.id)
    const statusId = findColumn(id, cols)
    if (!statusId) return
    let ids = cols[statusId]
    const overIndex = ids.indexOf(String(over.id))
    if (overIndex !== -1) ids = arrayMove(ids, ids.indexOf(id), overIndex)
    const position = ids.indexOf(id)

    const original = tasksById.get(id)
    if (original && (original.status_id !== statusId || original.position !== position)) {
      moveTask(id, statusId, position)
    }
  }

  const activeTask = activeId ? tasksById.get(activeId) : undefined
  const loading = statuses.isPending || board.isPending
  const loadError = statuses.error ?? board.error

  return (
    <>
      <PageHeader
        title="Tablero"
        description="Arrastra las tareas entre columnas para cambiar su estado."
        actions={
          <Button size="sm" onClick={() => sheet.openNew()}>
            <PlusIcon />
            Nueva tarea
          </Button>
        }
      />

      {loadError ? (
        <ErrorState
          title="No se pudo cargar el tablero"
          error={loadError}
          onRetry={() => {
            void statuses.refetch()
            void board.refetch()
          }}
          retrying={statuses.isFetching || board.isFetching}
        />
      ) : loading ? (
        <div className="flex gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i} className="w-72 shrink-0 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ))}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            setActiveId(null)
            setDragColumns(null)
          }}
        >
          <div className="-mx-4 flex gap-6 overflow-x-auto px-4 pb-4 md:-mx-10 md:px-10">
            {sortedStatuses.map((status) => (
              <BoardColumn
                key={status.id}
                status={status}
                taskIds={columns[status.id] ?? []}
                tasksById={tasksById}
                onAdd={() => sheet.openNew(status.id)}
                onOpen={sheet.openTask}
              />
            ))}
          </div>
          <DragOverlay>
            {activeTask && (
              <TaskCardContent
                task={activeTask}
                done={doneStatusIds.has(activeTask.status_id)}
                className="rotate-1 cursor-grabbing shadow-md"
              />
            )}
          </DragOverlay>
        </DndContext>
      )}

      {board.data && board.data.total > BOARD_LIMIT && (
        <p className="mt-4 text-xs text-muted-foreground">
          Mostrando {BOARD_LIMIT} de {board.data.total} tareas. Usa la vista Lista para ver todas.
        </p>
      )}
    </>
  )
}

function BoardColumn({
  status,
  taskIds,
  tasksById,
  onAdd,
  onOpen,
}: {
  status: TaskStatus
  taskIds: string[]
  tasksById: Map<string, Task>
  onAdd: () => void
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: COLUMN_PREFIX + status.id })

  return (
    <section className="group/column flex w-72 shrink-0 flex-col" aria-label={status.name}>
      <header className="mb-3 flex items-center gap-2 px-1">
        <StatusDot color={status.color} />
        <h2 className="text-sm font-medium">{status.name}</h2>
        <span className="text-xs text-muted-foreground tabular-nums">{taskIds.length}</span>
        <Button
          variant="ghost"
          size="icon-xs"
          className="ml-auto opacity-0 group-hover/column:opacity-100 focus-visible:opacity-100"
          onClick={onAdd}
          aria-label={`Nueva tarea en ${status.name}`}
        >
          <PlusIcon />
        </Button>
      </header>

      <SortableContext items={taskIds} strategy={verticalListSortingStrategy}>
        <div
          ref={setNodeRef}
          className={cn(
            'flex min-h-32 flex-1 flex-col gap-2 rounded-lg transition-colors',
            isOver && taskIds.length === 0 && 'bg-muted/50',
          )}
        >
          {taskIds.map((id) => {
            const task = tasksById.get(id)
            return task ? (
              <SortableTaskCard key={id} task={task} done={status.is_done} onOpen={onOpen} />
            ) : null
          })}
          {taskIds.length === 0 && (
            <button
              type="button"
              onClick={onAdd}
              className="rounded-lg border border-dashed px-3 py-6 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              Sin tareas
            </button>
          )}
        </div>
      </SortableContext>
    </section>
  )
}
