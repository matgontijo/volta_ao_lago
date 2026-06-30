import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['torre.svg'],
      manifest: {
        name: 'Volta do Lago — Torre de Comando',
        short_name: 'Torre',
        description: 'Acompanhamento ao vivo da prova (mapa, equipes, frota, alertas).',
        theme_color: '#060a14',
        background_color: '#060a14',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          { src: 'torre.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
          { src: 'torre.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
    }),
  ],
  server: { port: 5174, host: true },
});
