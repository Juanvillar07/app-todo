import { z } from 'zod'

export const taskSchema = z.object({
  title: z.string().trim().min(1, 'Escribe un título').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(50_000, 'Descripción demasiado larga'),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  status_id: z.string().min(1, 'Elige un estado'),
  due_date: z.string(),
})
export type TaskFormValues = z.infer<typeof taskSchema>
