import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api'
import { fakeAuth, renderRoutes } from '@/test/render'
import { LoginPage } from './login-page'
import { RegisterPage } from './register-page'

const routes = [
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: <p>inicio</p> },
  { path: '/list', element: <p>lista</p> },
]

describe('LoginPage', () => {
  it('valida los campos antes de enviar', async () => {
    const auth = fakeAuth()
    renderRoutes(routes, '/login', auth)
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByText('Introduce un email válido')).toBeInTheDocument()
    expect(screen.getByText('Introduce tu contraseña')).toBeInTheDocument()
    expect(auth.login).not.toHaveBeenCalled()
  })

  it('inicia sesión y vuelve a la ruta de origen', async () => {
    const auth = fakeAuth()
    const router = renderRoutes(routes, '/login', auth)
    await router.navigate('/login', { state: { from: '/list' } })

    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(auth.login).toHaveBeenCalledWith('ana@example.com', 'secreto123')
    expect(await screen.findByText('lista')).toBeInTheDocument()
  })

  it('muestra y oculta la contraseña', async () => {
    renderRoutes(routes, '/login', fakeAuth())
    const password = screen.getByLabelText('Contraseña')
    expect(password).toHaveAttribute('type', 'password')

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }))
    expect(password).toHaveAttribute('type', 'text')

    await userEvent.click(screen.getByRole('button', { name: 'Ocultar contraseña' }))
    expect(password).toHaveAttribute('type', 'password')
  })

  it('con el email sin confirmar ofrece reenviar el enlace', async () => {
    const auth = fakeAuth({
      login: vi.fn().mockRejectedValue(new ApiError(403, 'Confirma tu email para entrar')),
    })
    renderRoutes(routes, '/login', auth)
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('heading', { name: 'Confirma tu email' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }))
    expect(auth.resendVerification).toHaveBeenCalledWith('ana@example.com')
  })

  it('muestra el error del servidor', async () => {
    const auth = fakeAuth({
      login: vi.fn().mockRejectedValue(new ApiError(401, 'Email o contraseña incorrectos')),
    })
    renderRoutes(routes, '/login', auth)
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'mala')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Email o contraseña incorrectos')
  })
})

describe('RegisterPage', () => {
  it('exige una contraseña de al menos 8 caracteres', async () => {
    const auth = fakeAuth()
    renderRoutes(routes, '/register', auth)
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'corta')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(await screen.findByText('Mínimo 8 caracteres')).toBeInTheDocument()
    expect(auth.register).not.toHaveBeenCalled()
  })

  it('registra con nombre vacío como null y pide confirmar el email', async () => {
    const auth = fakeAuth()
    renderRoutes(routes, '/register', auth)
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com')
    await userEvent.type(screen.getByLabelText('Contraseña'), 'secreto123')
    await userEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))
    expect(auth.register).toHaveBeenCalledWith({
      email: 'ana@example.com',
      password: 'secreto123',
      full_name: null,
    })
    // Sin sesión hasta confirmar: se queda en "Revisa tu correo" y puede reenviar el enlace.
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument()
    expect(screen.queryByText('inicio')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }))
    expect(auth.resendVerification).toHaveBeenCalledWith('ana@example.com')
    expect(await screen.findByRole('button', { name: 'Enlace reenviado' })).toBeDisabled()
  })
})
