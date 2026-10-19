import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatDueDate, isOverdue } from './dates'

describe('fechas límite', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 18, 15, 30)) // 18 oct 2026, 15:30 local
  })
  afterEach(() => vi.useRealTimers())

  it('usa palabras para fechas cercanas', () => {
    expect(formatDueDate('2026-10-18')).toBe('Hoy')
    expect(formatDueDate('2026-10-19')).toBe('Mañana')
    expect(formatDueDate('2026-10-17')).toBe('Ayer')
  })

  it('muestra día y mes, y el año solo si es otro', () => {
    expect(formatDueDate('2026-12-03')).toMatch(/^3 dic/)
    expect(formatDueDate('2027-01-05')).toMatch(/2027/)
  })

  it('una fecha está vencida desde el día siguiente', () => {
    expect(isOverdue('2026-10-17')).toBe(true)
    expect(isOverdue('2026-10-18')).toBe(false)
    expect(isOverdue('2026-10-25')).toBe(false)
  })
})
