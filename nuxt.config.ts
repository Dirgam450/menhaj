// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  css: ['~/assets/css/main.css'],
  modules: [
    '@vite-pwa/nuxt'
  ],
  pwa: {
    registerType: 'autoUpdate',
    manifest: {
      name: 'المنهاج الوهاج | نور العلم والهدى',
      short_name: 'المنهاج',
      description: 'منصة إسلامية تعليمية متخصصة في علوم القرآن الكريم والتفسير والبحث الذكي والفهرس الموضوعي.',
      theme_color: '#0d1117',
      background_color: '#0d1117',
      display: 'standalone',
      orientation: 'portrait',
      scope: '/',
      start_url: '/',
      icons: [
        {
          src: '/icon.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable'
        }
      ]
    },
    workbox: {
      navigateFallback: '/'
    },
    devOptions: {
      enabled: true,
      type: 'module'
    }
  },
  app: {
    head: {
      title: 'المنهاج الوهاج | نور العلم والهدى',
      meta: [
        { name: 'description', content: 'منصة إسلامية تعليمية متخصصة في علوم القرآن الكريم والتفسير والبحث الذكي والفهرس الموضوعي.' }
      ],
      link: [
        { rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css' }
      ],
      htmlAttrs: {
        dir: 'rtl',
        lang: 'ar'
      }
    }
  }
})
