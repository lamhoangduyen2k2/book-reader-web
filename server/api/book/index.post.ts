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

    const { data, error } = await supabase.from('books')
                                          .insert({
                                            title: payload.data.title,
                                            author: payload.data.author,
                                            visibility: payload.data.visibility,
                                            owner_id: user.id, //Chỉ được insert ở phía server (không để user nhập vào)
                                          })
                                          .select('id, title, author, owner_id, visibility, created_at')
                                          .single()
    
    if (error || !data) {
      console.error('[POST /api/books]', error?.message)
      throw createError({ statusCode: 500, statusMessage: 'Cannot create book' })
    }

    setResponseStatus(event, 201)
    return data
})