import { serverSupabaseClient } from '#supabase/server'
import { createBookSchema } from "~/server/modules/books/book.schema";
import { requireUser } from "~/server/utils/require-user"

export default defineEventHandler(async (event) => {
    const user = await requireUser(event);

    const payload = createBookSchema.safeParse(await readBody(event));
    if (!payload.success) {
        throw createError({ statusCode: 400, statusMessage: 'Invalid book data' })
    }

    const supabase = await serverSupabaseClient(event);

    if (payload.data.visibility === 'public') {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || profile?.role !== 'admin') {
      throw createError({ statusCode: 403, statusMessage: 'Admin required' })
    }
  }
})