import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

const csp = "default-src 'self'; script-src 'self' 'sha256-89EsJ0gg8fA1Joh8OF4yrUg7+lme5ZrRRU6JRRnO0iM=' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=' 'sha256-dN0GWK6Ci/4pOCyKHcyOwmqaKlVRrq9ofFuvyJnWb8E='; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://*.supabase.co wss://*.supabase.co ";

const securityHeaders = {
  'Content-Security-Policy': csp,
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
    build: {
      // Enable tree-shaking
      minify: 'esbuild',
      cssCodeSplit: true,
      sourcemap: false,
      // Manual chunks for better caching
      rollupOptions: {
        output: {
          manualChunks: (id) => {
            // Vendor chunks
            if (id.includes('node_modules')) {
              // Casar pelo nome exato do pacote. O `id.includes('react')`
              // anterior capturava lucide-react, @tanstack/react-query,
              // react-window etc. junto do React core, produzindo
              // "Circular chunk: vendor-other -> vendor-react -> vendor-other"
              // e quebrando o bundle em runtime com
              // "Cannot set properties of undefined (setting 'Activity')".
              // vendor-react agora contém só react/react-dom/scheduler, que
              // não dependem de outros chunks — eliminando o ciclo.
              const p = id.replace(/\\/g, '/');
              if (/node_modules\/(react|react-dom|scheduler)\//.test(p)) return 'vendor-react';
              if (/node_modules\/react-router-dom\//.test(p)) return 'vendor-router';
              if (/node_modules\/(lucide-react|clsx|tailwind-merge|sonner)\//.test(p)) return 'vendor-ui';
              if (/node_modules\/recharts\//.test(p)) return 'vendor-charts';
              if (/node_modules\/(motion|framer-motion)\//.test(p)) return 'vendor-motion';
              if (/node_modules\/date-fns\//.test(p)) return 'vendor-utils';
              if (/node_modules\/@supabase\//.test(p)) return 'vendor-supabase';
              return 'vendor-other';
            }
            // Feature chunks
            if (id.includes('/src/components/dashboard/')) return 'features-dashboard';
            if (id.includes('/src/components/MonitoriaList.tsx') || id.includes('/src/components/MonitoriaForm.tsx')) return 'features-monitoria';
            if (id.includes('/src/components/AdminPanel.tsx') || id.includes('/src/components/AdminDashboardView.tsx')) return 'features-admin';
            if (id.includes('/src/components/QualityConfigManagement.tsx')) return 'features-quality';
          },
        },
      },
    },
    server: {
      host: '0.0.0.0',
      port: 3001,
      strictPort: true,
      hmr: process.env.DISABLE_HMR !== 'true' ? { host: 'localhost' } : false,
      headers: securityHeaders
    },
    preview: {
      headers: securityHeaders
    },
  };
});