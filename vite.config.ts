import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const cspHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'sha256-hbRGy/BJ5hOC+PEoxMZqDBJ/6o3pVdZo7RmgiIK7HSA='; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co ws://localhost:* ws://192.168.10.38:* http://localhost:* http://192.168.10.38:*;",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload'
};

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true' ? { host: '192.168.10.38' } : false,
      headers: cspHeaders
    },
    preview: {
      headers: cspHeaders
    },
  };
});
