import { serverSupabaseClient, serverSupabaseUser } from "#supabase/server"

export default defineEventHandler(async (event) => {
    const user = await serverSupabaseUser(event)
    
    if (!user) {
        throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
    }

    const supabase = await serverSupabaseClient(event)
    const { data, error } = await supabase.from('profiles')
                .select('id, display_name, role')
                .eq('id', user.sub)
                .single()
    
    if (error || !data) {
        throw createError({ statusCode: 500, statusMessage: 'Profile unavailable' })
    }
    
    return { id: user.sub, email: user.email, profile: data }
})