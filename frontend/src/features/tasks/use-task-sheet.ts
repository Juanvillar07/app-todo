import { useCallback } from 'react'
import { useSearchParams } from 'react-router'

/**
 * El Sheet de tarea se controla con la URL (?task=<id> o ?task=new&task_status=<id>),
 * así funciona igual en el tablero y en la lista, y el enlace se puede compartir.
 */
export function useTaskSheet() {
  const [params, setParams] = useSearchParams()
  const task = params.get('task')

  const update = useCallback(
    (fn: (next: URLSearchParams) => void) =>
      setParams((prev) => {
        const next = new URLSearchParams(prev)
        fn(next)
        return next
      }),
    [setParams],
  )

  const openTask = useCallback((id: string) => update((p) => p.set('task', id)), [update])

  const openNew = useCallback(
    (statusId?: string) =>
      update((p) => {
        p.set('task', 'new')
        if (statusId) p.set('task_status', statusId)
        else p.delete('task_status')
      }),
    [update],
  )

  const close = useCallback(
    () =>
      update((p) => {
        p.delete('task')
        p.delete('task_status')
      }),
    [update],
  )

  return {
    isOpen: task !== null,
    isNew: task === 'new',
    taskId: task && task !== 'new' ? task : null,
    initialStatusId: params.get('task_status'),
    openTask,
    openNew,
    close,
  }
}
