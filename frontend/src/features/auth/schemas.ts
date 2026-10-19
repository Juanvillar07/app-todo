import { z } from 'zod'

export const loginSchema = z.object({
  email: z.email('Introduce un email válido'),
  password: z.string().min(1, 'Introduce tu contraseña'),
})
export type LoginValues = z.infer<typeof loginSchema>

export const registerSchema = z.object({
  full_name: z.string().trim().max(255),
  email: z.email('Introduce un email válido'),
  password: z
    .string()
    .min(8, 'Mínimo 8 caracteres')
    .max(128, 'Máximo 128 caracteres'),
})
export type RegisterValues = z.infer<typeof registerSchema>
