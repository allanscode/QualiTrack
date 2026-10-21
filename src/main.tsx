import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { initSentry } from './lib/sentry.ts';
import { LazyMotion, domAnimation } from 'motion/react';
import { isMockMode } from './lib/supabase.ts';
import { recoverFromChunkLoadError } from './utils/chunkRecovery.ts';

// Initialize Sentry early
initSentry();

// Auto-recuperação de chunks desatualizados após novos deploys na nuvem
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  const preloadError = (event as Event & { payload?: unknown }).payload;
  recoverFromChunkLoadError(preloadError ?? new TypeError('Failed to fetch dynamically imported module'));
});

// Production guard: warn if running in mock mode
if (import.meta.env.PROD && isMockMode) {
  console.error(
    '[QualidadeWP] MOCK MODE ATIVO EM PRODUÇÃO! ' +
    'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no ambiente de produção.'
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <LazyMotion features={domAnimation}>
        <App />
      </LazyMotion>
    </ErrorBoundary>
  </StrictMode>,
);
