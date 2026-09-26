import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

const csp = "default-src 'self'; script-src 'self' https://challenges.cloudflare.com 'sha256-89EsJ0gg8fA1Joh8OF4yrUg7+lme5ZrRRU6JRRnO0iM=' 'sha256-Z2/iFzh9VMlVkEOar1f/oSHWwQk3ve1qk/C2WdsC4Xk=' 'sha256-dN0GWK6Ci/4pOCyKHcyOwmqaKlVRrq9ofFuvyJnWb8E='; frame-src https://challenges.cloudflare.com; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: https://*.supabase.co; connect-src 'self' https://challenges.cloudflare.com https://*.supabase.co wss://*.supabase.co ";

const securityHeaders = {
  'Content-Security-Policy': csp + "; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

export default defineConfig(({ command, mode, isPreview }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env };
  if (command === 'build') {
    const url = env.VITE_SUPABASE_URL;
    const key = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY;
    if (!url || !key || /placeholder|your-project/.test(url) || /your-anon/.test(key)) {
      throw new Error('Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY (ou VITE_SUPABASE_ANON_KEY) antes do build.');
    }
    if (new URL(url).protocol !== 'https:') throw new Error('Produção exige Supabase HTTPS.');
    if (!env.VITE_TURNSTILE_SITE_KEY) {
      env.VITE_TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
    }
    if (key.startsWith('eyJ')) {
      const payload = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      if (payload.role !== 'anon') throw new Error('O frontend aceita somente a chave anon/publicável.');
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: [
        { find: '@', replacement: path.resolve(__dirname, '.') },
        ...(command === 'serve' && !isPreview ? [
          { find: './mockDb', replacement: path.resolve(__dirname, 'src/lib/mockDb.dev.ts') },
          { find: './mockQueue', replacement: path.resolve(__dirname, 'src/lib/mockQueue.dev.ts') },
        ] : []),
      ],
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
              if (/node_modules\/(pdfjs-dist|mammoth)\//.test(p)) return 'vendor-doc-viewers';
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
      // React Refresh injects a development-only inline preamble; HMR uses WS.
      // Never use this development policy for deployed assets.
      headers: { ...securityHeaders, 'Content-Security-Policy': securityHeaders['Content-Security-Policy'].replace(/ 'sha256-[^']+'/g, '').replace("script-src 'self'", "script-src 'self' 'unsafe-inline'").replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*") }
    },
    preview: {
      headers: securityHeaders
    },
  };
});
