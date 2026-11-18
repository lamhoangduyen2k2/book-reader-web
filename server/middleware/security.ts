export default defineEventHandler(event => {
    // Không cache HTML SSR hoặc API có session tại CDN/shared proxy.
    setHeader(event, 'Cache-Control', 'private, no-store');
    setHeader(event, 'X-Content-Type-Options', 'nosniff');

    const pathname = getRequestURL(event).pathname;
    if (!pathname.startsWith('/api/')) return
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(getMethod(event))) return

    const expected = process.env.APP_ORIGIN
    if (!expected) throw createError({ statusCode: 503, statusMessage: 'Origin policy not configured' });
    if (getHeader(event, 'origin') !== new URL(expected).origin) {
        throw createError({ statusCode: 403, statusMessage: 'Invalid request origin' })
    }
})