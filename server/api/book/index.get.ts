import { serverSupabaseClient } from "#supabase/server"
import { requireUser } from "~/server/utils/require-user";
import type { BookDto } from "~/shared/types/book"

export default defineEventHandler(async (event): Promise<BookDto[]> => {
    // Dùng cookie/session của request; RLS sẽ lọc bản ghi.
    const supabase = await serverSupabaseClient(event);
    const scope = getQuery(event).scope ?? 'all';
    if (scope !== 'all' && scope !== 'public' && scope !== 'private') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid scope' });
    };

    let query = supabase.from('books').select('id, title, author, owner_id, visibility, created_at');
    
    if (scope !== 'all') query = query.eq('visibility', scope);
    if (scope === 'private') {
        const user = await requireUser(event)
        query = query.eq('owner_id', user.id)
    }

    const { data, error } = await query.order('created_at', { ascending: false })
                        .order('id', { ascending: false })
                        .limit(50);
    
    if (error) {
        console.error('[GET /api/books]', error.message);
        throw createError({ statusCode: 500, statusMessage: 'Cannot load books' })
    }

    return (data ?? []) as BookDto[]
})