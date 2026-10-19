import { describe, expect, it } from 'vitest'
import { taskSchema } from './schemas'

const valid = { title: 'Algo', description: '', priority: 'medium', status_id: 's1', due_date: '' }

describe('taskSchema', () => {
  it('acepta una tarea mínima y recorta el título', () => {
    expect(taskSchema.parse({ ...valid, title: '  Algo  ' }).title).toBe('Algo')
  })

  it('exige título y lo limita a 200 caracteres', () => {
    expect(taskSchema.safeParse({ ...valid, title: '   ' }).success).toBe(false)
    expect(taskSchema.safeParse({ ...valid, title: 'x'.repeat(201) }).success).toBe(false)
  })

  it('solo acepta prioridades conocidas', () => {
    expect(taskSchema.safeParse({ ...valid, priority: 'critica' }).success).toBe(false)
  })
})
