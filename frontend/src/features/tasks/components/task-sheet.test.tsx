import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Toaster } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fakeAuth, renderRoutes } from '@/test/render'
import type { Task, TaskStatus } from '../queries'
import { TaskSheet } from './task-sheet'

const status: TaskStatus = {
  id: 's1',
  name: 'Por hacer',
  color: '#94a3b8',
  position: 0,
  is_default: true,
  is_done: false,
}

const task: Task = {
  id: 't1',
  status_id: 's1',
  title: 'Comprar pan',
  description: null,
  priority: 'medium',
  due_date: null,
  position: 0,
  created_at: '2026-10-22T00:00:00Z',
  updated_at: '2026-10-22T00:00:00Z',
}

// Los hooks de datos se sustituyen: aquí se prueba el comportamiento del Sheet, no la API.
const mocks = vi.hoisted(() => ({
  useTask: vi.fn(),
  remove: vi.fn(),
  restore: vi.fn(),
  update: vi.fn(),
}))

vi.mock('../queries', () => ({
  useStatuses: () => ({ data: [status] }),
  useTask: mocks.useTask,
  useCreateTask: () => ({ mutateAsync: vi.fn() }),
  useUpdateTask: () => ({ mutateAsync: mocks.update }),
  useDeleteTask: () => ({ mutateAsync: mocks.remove }),
  useRestoreTask: () => mocks.restore,
}))

function renderSheet(entry = '/?task=t1') {
  return renderRoutes(
    [
      {
        path: '/',
        element: (
          <>
            <TaskSheet />
            <Toaster />
          </>
        ),
      },
    ],
    entry,
    fakeAuth({ status: 'authenticated' }),
  )
}

beforeEach(() => {
  mocks.useTask.mockReturnValue({ data: task, isError: false, error: null })
  mocks.remove.mockResolvedValue(undefined)
  mocks.update.mockResolvedValue(task)
})

describe('Cambios sin guardar', () => {
  it('sin cambios, Cancelar cierra directamente', async () => {
    const router = renderSheet()
    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }))
    expect(router.state.location.search).toBe('')
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument()
  })

  it('con cambios pregunta antes de cerrar y "Seguir editando" conserva el texto', async () => {
    const router = renderSheet()
    const title = await screen.findByPlaceholderText('Título de la tarea')
    await userEvent.type(title, ' integral')

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByText('¿Descartar los cambios?')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    expect(router.state.location.search).toBe('?task=t1')
    expect(screen.getByPlaceholderText('Título de la tarea')).toHaveValue('Comprar pan integral')

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }))
    await waitFor(() => expect(router.state.location.search).toBe(''))
  })

  it('al guardar cierra sin preguntar', async () => {
    const router = renderSheet()
    await userEvent.type(await screen.findByPlaceholderText('Título de la tarea'), ' integral')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(mocks.update).toHaveBeenCalled()
    await waitFor(() => expect(router.state.location.search).toBe(''))
    expect(screen.queryByText('¿Descartar los cambios?')).not.toBeInTheDocument()
  })
})

describe('Borrar y deshacer', () => {
  it('tras borrar ofrece "Deshacer", que restaura la tarea', async () => {
    const router = renderSheet()
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }))

    expect(mocks.remove).toHaveBeenCalledWith('t1')
    await waitFor(() => expect(router.state.location.search).toBe(''))
    await userEvent.click(await screen.findByRole('button', { name: 'Deshacer' }))
    expect(mocks.restore).toHaveBeenCalledWith('t1')
  })
})

describe('Errores al cargar la tarea', () => {
  it('una tarea que no existe lo dice, sin botón de reintentar', async () => {
    mocks.useTask.mockReturnValue({
      data: undefined,
      isError: true,
      error: new ApiError(404, 'Tarea no encontrada'),
    })
    renderSheet()
    expect(await screen.findByText('Esta tarea no existe o fue eliminada.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument()
  })

  it('otro error muestra "Reintentar"', async () => {
    const refetch = vi.fn()
    mocks.useTask.mockReturnValue({
      data: undefined,
      isError: true,
      isFetching: false,
      error: new ApiError(0, 'No se pudo conectar con el servidor'),
      refetch,
    })
    renderSheet()
    expect(await screen.findByText('No se pudo cargar la tarea')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(refetch).toHaveBeenCalled()
  })
})
