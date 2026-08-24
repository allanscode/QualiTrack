import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.tsx'],
    // `supabase/functions/**` entra aqui para que a lógica pura das Edge
    // Functions (ex.: montagem do HTML do comentário do helpdesk) seja
    // coberta pelo `npm test`. Só arquivos sem import de runtime Deno são
    // testáveis assim — é por isso que essa lógica fica separada do index.ts.
    include: ['src/**/*.test.{ts,tsx}', 'supabase/functions/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.d.ts', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
