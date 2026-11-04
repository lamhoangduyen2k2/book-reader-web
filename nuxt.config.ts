// https://nuxt.com/docs/api/configuration/nuxt-config
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2025-07-01',
  css: ['~/assets/css/tailwind.css'],
  vite: { plugins: [tailwindcss()] },
  modules: ['shadcn-nuxt', '@nuxtjs/supabase'],
  shadcn: {
    prefix: '',
    componentDir: './components/ui',
  },
  supabase: {
    redirect: false,    // Tự viết route middleware để hiểu auth
    useSsrCookies: true,
    types: false,      // M1: tạo type DTO thủ công; về sau sẽ gen Supabase DB types
  },
})
