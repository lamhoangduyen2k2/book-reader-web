import { serverSupabaseClient } from "#supabase/server"

export async function requireUser(event: Parameters<typeof serverSupabaseClient>[0]) {
    const sb = await serverSupabaseClient(event);
    const { data, error } = await sb.auth.getUser();

    if (error) {
        if (error.name === 'AuthSessionMissingError' || error.code === '400' || error.code === '401' || error.code === '403') {
            throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
        }
        throw createError({ statusCode: 503, statusMessage: 'Authentication unavailable' });
    };

    if (!data.user) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' });
    return data.user;
}  