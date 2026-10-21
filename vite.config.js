import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { publicPagesPlugin } from './scripts/public-pages.mjs'

// https://vite.dev/config/
export default defineConfig({
  // @iarna/toml references Node's global for Date, BigInt and optional Buffer.
  define: { global: 'globalThis' },
  plugins: [
    react(),
    publicPagesPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { navigateFallbackDenylist: [/^\/api(?:\/|$)/] },
      manifest: {
        name: 'FlareTools',
        short_name: 'FlareTools',
        description: '现代化、注重隐私的开发者工具箱，支持本地纯前端处理与按需跨设备传递。',
        lang: 'zh-CN',
        start_url: '/',
        display: 'standalone',
        theme_color: '#f5f3ec',
        background_color: '#f5f3ec',
        icons: [
          {
            src: '/favicon.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: '/favicon.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      }
    })
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
        configure(proxy) {
          const rewriteOrigin = (proxyRequest) => proxyRequest.setHeader('Origin', 'http://127.0.0.1:8787');
          proxy.on('proxyReq', rewriteOrigin);
          proxy.on('proxyReqWs', rewriteOrigin);
        },
      }
    }
  }
})
