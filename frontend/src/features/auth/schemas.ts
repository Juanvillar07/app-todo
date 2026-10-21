import { z } from 'zod'

const email = z.email('Introduce un email válido')

// Mismas reglas que el backend para una contraseña nueva (registro y recuperación).
const newPassword = z.string().min(8, 'Mínimo 8 caracteres').max(128, 'Máximo 128 caracteres')

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Introduce tu contraseña'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  full_name: z.string().trim().max(255),
  email,
  password: newPassword,
})
export type RegisterValues = z.infer<typeof registerSchema>

export const forgotPasswordSchema = z.object({ email })
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>

export const resetPasswordSchema = z
  .object({ password: newPassword, confirm: z.string() })
  .refine((values) => values.password === values.confirm, {
    message: 'Las contraseñas no coinciden',
    path: ['confirm'],
  })
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>
