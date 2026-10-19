import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
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
import { DueDate, PriorityBadge, PriorityLabel, StatusDot } from './components/task-meta'
import { PRIORITIES } from './priority'
import { type Priority, type TaskListParams, type TaskSort, useStatuses, useTaskList } from './queries'
import { useTaskSheet } from './use-task-sheet'

const PAGE_SIZE = 25
const ALL = 'all'

const SORTS: { value: TaskSort; label: string }[] = [
  { value: '-created_at', label: 'Más recientes' },
  { value: '-updated_at', label: 'Actualizadas' },
  { value: 'due_date', label: 'Fecha límite' },
  { value: '-priority', label: 'Prioridad' },
  { value: 'title', label: 'Título' },
]
const DEFAULT_SORT: TaskSort = '-created_at'

const FILTER_KEYS = ['q', 'status', 'priority', 'sort', 'page'] as const

export function ListPage() {
  const [params, setParams] = useSearchParams()
  const sheet = useTaskSheet()
  const statuses = useStatuses()

  const q = params.get('q') ?? ''
  const statusId = params.get('status') ?? ALL
  const priority = (params.get('priority') ?? ALL) as Priority | typeof ALL
  const sortParam = params.get('sort') as TaskSort | null
  const sort = SORTS.some((s) => s.value === sortParam) ? sortParam! : DEFAULT_SORT
  const page = Math.max(1, Number(params.get('page')) || 1)

  // Cambiar un filtro vuelve a la primera página; el resto de parámetros (p. ej. ?task=) se mantiene.
  const setFilter = (key: string, value: string | null) =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      if (value === null || value === '' || value === ALL) next.delete(key)
      else next.set(key, value)
      if (key !== 'page') next.delete('page')
      return next
    })

  const clearFilters = () =>
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const key of FILTER_KEYS) next.delete(key)
      return next
    })

  // La búsqueda se aplica al dejar de escribir.
  const [search, setSearch] = useState(q)
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const onSearch = (value: string) => {
    setSearch(value)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => setFilter('q', value.trim()), 300)
  }
  useEffect(() => () => clearTimeout(searchTimer.current), [])

  const query: TaskListParams = {
    sort,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    ...(q ? { q } : {}),
    ...(statusId !== ALL ? { status_id: statusId } : {}),
    ...(priority !== ALL ? { priority: [priority] } : {}),
  }
  const tasks = useTaskList(query)
  const statusById = new Map((statuses.data ?? []).map((s) => [s.id, s]))
  const hasFilters = Boolean(q || statusId !== ALL || priority !== ALL)
  const total = tasks.data?.total ?? 0
  const from = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1
  const to = Math.min(page * PAGE_SIZE, total)

  return (
    <>
      <PageHeader
        title="Lista"
        description="Busca, filtra y ordena todas tus tareas."
        actions={
          <Button size="sm" onClick={() => sheet.openNew()}>
            <PlusIcon />
            Nueva tarea
          </Button>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-64">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar"
            aria-label="Buscar tareas"
            className="pl-8"
          />
        </div>

        <Select value={statusId} onValueChange={(v) => setFilter('status', v)}>
          <SelectTrigger className="w-40" aria-label="Filtrar por estado">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos los estados</SelectItem>
            {statuses.data?.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                <span className="flex items-center gap-2">
                  <StatusDot color={s.color} />
                  {s.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={priority} onValueChange={(v) => setFilter('priority', v)}>
          <SelectTrigger className="w-44" aria-label="Filtrar por prioridad">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Cualquier prioridad</SelectItem>
            {PRIORITIES.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <PriorityLabel priority={p.value} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => setFilter('sort', v === DEFAULT_SORT ? null : v)}>
          <SelectTrigger className="w-40 sm:ml-auto" aria-label="Ordenar">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {tasks.isPending ? (
        <div className="space-y-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full" />
          ))}
        </div>
      ) : total === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {hasFilters ? (
            <>
              Ninguna tarea coincide con los filtros.{' '}
              <button
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  clearTimeout(searchTimer.current)
                  setSearch('')
                  clearFilters()
                }}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              Aún no tienes tareas.{' '}
              <button
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => sheet.openNew()}
              >
                Crea la primera
              </button>
            </>
          )}
        </div>
      ) : (
        <>
          <ul
            className={cn('divide-y border-y', tasks.isPlaceholderData && 'opacity-60')}
            aria-label="Tareas"
          >
            {tasks.data?.items.map((task) => {
              const status = statusById.get(task.status_id)
              return (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => sheet.openTask(task.id)}
                    className="grid w-full grid-cols-[1fr_auto] items-center gap-4 px-2 py-3 text-left text-sm transition-colors hover:bg-muted/50 sm:grid-cols-[1fr_9rem_5rem_5.5rem]"
                  >
                    <span
                      className={cn(
                        'truncate',
                        status?.is_done &&
                          'text-muted-foreground line-through decoration-muted-foreground/50',
                      )}
                    >
                      {task.title}
                    </span>
                    <span className="hidden items-center gap-2 truncate text-muted-foreground sm:flex">
                      {status && <StatusDot color={status.color} />}
                      <span className="truncate">{status?.name}</span>
                    </span>
                    <span className="hidden sm:block">
                      <PriorityBadge priority={task.priority} />
                    </span>
                    <span className="text-right">
                      {task.due_date ? (
                        <DueDate value={task.due_date} done={status?.is_done} />
                      ) : (
                        <span className="text-xs text-muted-foreground/50">—</span>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>

          <div className="mt-4 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span className="tabular-nums">
              {from}–{to} de {total}
            </span>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={page <= 1}
              onClick={() => setFilter('page', String(page - 1))}
              aria-label="Página anterior"
            >
              <ChevronLeftIcon />
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={to >= total}
              onClick={() => setFilter('page', String(page + 1))}
              aria-label="Página siguiente"
            >
              <ChevronRightIcon />
            </Button>
          </div>
        </>
      )}
    </>
  )
}
