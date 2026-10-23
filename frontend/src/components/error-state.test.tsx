import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ErrorState } from './error-state'

describe('ErrorState', () => {
  it('muestra el error y "Reintentar" vuelve a pedir los datos', async () => {
    const onRetry = vi.fn()
    render(
      <ErrorState
        title="No se pudieron cargar tus tareas"
        error={new Error('No se pudo conectar con el servidor')}
        onRetry={onRetry}
      />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron cargar tus tareas')
    expect(screen.getByText('No se pudo conectar con el servidor')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('mientras reintenta, el botón se desactiva', () => {
    render(<ErrorState onRetry={() => {}} retrying />)
    expect(screen.getByRole('button', { name: 'Reintentando…' })).toBeDisabled()
  })
})
