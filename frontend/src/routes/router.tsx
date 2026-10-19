import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/app-layout'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { BoardPage, ListPage, StatusesPage } from '@/features/tasks/pages'
import { ProtectedRoute, PublicOnlyRoute } from './guards'

export const routes: RouteObject[] = [
  {
    element: <PublicOnlyRoute />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <BoardPage /> },
          { path: '/list', element: <ListPage /> },
          { path: '/statuses', element: <StatusesPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
]

export const router = createBrowserRouter(routes)
