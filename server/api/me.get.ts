import { serverSupabaseClient } from "#supabase/server"
import { requireUser } from "../utils/require-user"

export default defineEventHandler(async (event) => {
    const user = await requireUser(event);

    const supabase = await serverSupabaseClient(event);
    const { data, error } = await supabase.from('profiles')
                                        .select('id, display_name, role')
                                        .eq('id', user.id)
                                        .single();
    
    if (error || !data) {
        throw createError({ statusCode: 500, statusMessage: 'Profile unavailable' });
    };

    return {
        id: user.id,
        email: user.email,
        profile: data
    }
})
