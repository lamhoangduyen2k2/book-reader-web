import { z } from 'zod'

export const createBookSchema = z.object({
    title: z.string().trim().min(1).max(180),
    author: z.string().trim().min(1).max(120),
    visibility: z.enum(['private', 'public']).default('private')
})