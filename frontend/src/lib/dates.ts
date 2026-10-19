// Las fechas límite llegan como "YYYY-MM-DD" (sin hora): se tratan como fechas locales.

function parseDate(value: string): Date {
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function startOfToday(): Date {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

const DAY = 24 * 60 * 60 * 1000

/** "Hoy", "Mañana", "Ayer", "18 oct" o "18 oct 2027" si no es de este año. */
export function formatDueDate(value: string): string {
  const date = parseDate(value)
  const diff = Math.round((date.getTime() - startOfToday().getTime()) / DAY)
  if (diff === 0) return 'Hoy'
  if (diff === 1) return 'Mañana'
  if (diff === -1) return 'Ayer'
  const sameYear = date.getFullYear() === new Date().getFullYear()
  return new Intl.DateTimeFormat('es', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
    .format(date)
    .replace('.', '')
}

export function isOverdue(value: string): boolean {
  return parseDate(value) < startOfToday()
}
