import { Outlet } from 'react-router'
import { TaskSheet } from './components/task-sheet'

/** Comparte el Sheet de tarea entre tablero, lista y estados (se abre con ?task=). */
export function TasksLayout() {
  return (
    <>
      <Outlet />
      <TaskSheet />
    </>
  )
}
