import { describe, expect, it } from 'vitest'
import { applyMove, type Task } from './queries'

const task = (id: string, status_id: string, position: number): Task => ({
  id,
  status_id,
  position,
  title: id,
  description: null,
  priority: 'medium',
  due_date: null,
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
})

const column = (tasks: Task[], statusId: string) =>
  tasks
    .filter((t) => t.status_id === statusId)
    .sort((a, b) => a.position - b.position)
    .map((t) => `${t.id}:${t.position}`)

const board = [task('a', 'todo', 0), task('b', 'todo', 1), task('c', 'todo', 2), task('x', 'done', 0)]

describe('applyMove', () => {
  it('reordena dentro de la misma columna', () => {
    const result = applyMove(board, 'a', 'todo', 2)
    expect(column(result, 'todo')).toEqual(['b:0', 'c:1', 'a:2'])
    expect(column(result, 'done')).toEqual(['x:0'])
  })

  it('mueve a otra columna y renumera ambas', () => {
    const result = applyMove(board, 'b', 'done', 0)
    expect(column(result, 'todo')).toEqual(['a:0', 'c:1'])
    expect(column(result, 'done')).toEqual(['b:0', 'x:1'])
  })

  it('limita la posición al final de la columna', () => {
    expect(column(applyMove(board, 'a', 'done', 99), 'done')).toEqual(['x:0', 'a:1'])
  })

  it('mueve a una columna vacía', () => {
    expect(column(applyMove(board, 'c', 'doing', 0), 'doing')).toEqual(['c:0'])
  })

  it('no cambia nada si la tarea no existe', () => {
    expect(applyMove(board, 'zzz', 'done', 0)).toBe(board)
  })

  it('no muta la lista original', () => {
    applyMove(board, 'a', 'done', 0)
    expect(board[0]).toMatchObject({ status_id: 'todo', position: 0 })
  })
})
