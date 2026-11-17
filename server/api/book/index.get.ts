import { serverSupabaseClient } from "#supabase/server"
import { type BookDto } from "~/shared/types/book"

export default defineEventHandler(async (event): Promise<BookDto[]> => {
    // Dùng cookie/session của request để RLS sẽ lọc bản ghi.
    const supabase = await serverSupabaseClient(event)
    const { data, error } = await supabase.from('books')
                            .select('id, title, author, owner_id, visibility, created_at')
                            .order('created_at', { ascending: false })
                            .limit(50)
    
    if (error) {
        console.error('[GET /api/books]', error.message)
        throw createError({ statusCode: 500, statusMessage: 'Cannot load books' })
    }

    return (data ?? []) as BookDto[]
})