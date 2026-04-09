// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: false },
  devServer: {
      port: 3000,
  },
    modules: ['@pinia/nuxt'],
    css: [
        // '/assets/css/common.css',
        '/assets/css/common.css',
    ],
    plugins: [
        '~/plugins/axios.js'
    ],
    app: {
        // pageTransition: { name: 'page', mode: 'out-in' },
        head: {
            title: '에코그린티엠(ver3)',
            meta: [
                { name: 'description', content: '에코그린티엠(ver3) ERP 시스템' }
            ],
            link: [
                {
                    rel: 'stylesheet',
                    href: 'https://cdn.jsdelivr.net/npm/@mdi/font@7.4.47/css/materialdesignicons.min.css'
                },
            ]
        },
        pageTransition: false,
        keepalive: true,
    },
    runtimeConfig: {
        public: {
            apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:3001'
        }
    },
    nitro: {
        routeRules: {
            '/api/**': {
                proxy: 'http://211.45.175.235:3001/**'
            }
        }
    },
    vite: {
        server: {
            proxy: {
                "/api": {
                    target: 'http://localhost:3001',
                    changeOrigin: true,
                    rewrite: (path) => path.replace(/^\/api/, ''), // 이제 에러 안 납니다!
                }
            }
        }
    }
})
