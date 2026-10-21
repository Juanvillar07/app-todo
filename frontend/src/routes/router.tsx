import { createBrowserRouter, Navigate, type RouteObject } from 'react-router'
import { AppLayout } from '@/components/app-layout'
import { ForgotPasswordPage } from '@/features/auth/forgot-password-page'
import { LoginPage } from '@/features/auth/login-page'
import { RegisterPage } from '@/features/auth/register-page'
import { ResetPasswordPage } from '@/features/auth/reset-password-page'
import { ProtectedRoute, PublicOnlyRoute } from './guards'
import { RouteError } from './route-error'

// Las pantallas de tareas se cargan bajo demanda (dnd-kit y Markdown no van en el bundle inicial).
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      {
        element: <PublicOnlyRoute />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
          { path: '/forgot-password', element: <ForgotPasswordPage /> },
        ],
      },
      // Enlace del correo: funciona con o sin sesión (al terminar, el backend las cierra todas).
      { path: '/reset-password', element: <ResetPasswordPage /> },
      {
        element: <ProtectedRoute />,
        children: [
          {
            element: <AppLayout />,
            children: [
              {
                lazy: () =>
                  import('@/features/tasks/tasks-layout').then((m) => ({ Component: m.TasksLayout })),
                children: [
                  {
                    path: '/',
                    lazy: () =>
                      import('@/features/tasks/board-page').then((m) => ({ Component: m.BoardPage })),
                  },
                  {
                    path: '/list',
                    lazy: () =>
                      import('@/features/tasks/list-page').then((m) => ({ Component: m.ListPage })),
                  },
                  {
                    path: '/statuses',
                    lazy: () =>
                      import('@/features/tasks/statuses-page').then((m) => ({
                        Component: m.StatusesPage,
                      })),
                  },
                ],
              },
            ],
          },
        ],
      },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

export const router = createBrowserRouter(routes)
