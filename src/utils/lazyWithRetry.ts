import React from 'react';

/**
 * Utilitário para carregamento sob demanda (lazy) resiliente a novos deploys.
 * Quando uma nova versão é publicada na Vercel/servidor, os hashes dos arquivos .js
 * mudam. Se o usuário estiver com a aba aberta, uma navegação lazy para um módulo
 * pode falhar com "Failed to fetch dynamically imported module".
 * 
 * Este helper detecta o erro de chunk desatualizado e realiza um reload transparente
 * da página para buscar os novos hashes do index.html, com trava de sessionStorage
 * para evitar loops infinitos.
 */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    const pageHasAlreadyBeenRefreshed = sessionStorage.getItem('qualitrack_chunk_retry') === 'true';

    try {
      const component = await componentImport();
      // Sucesso: reseta a trava
      sessionStorage.removeItem('qualitrack_chunk_retry');
      return component;
    } catch (error: any) {
      const isChunkError =
        error?.message?.includes('Failed to fetch dynamically imported module') ||
        error?.message?.includes('dynamically imported module') ||
        error?.message?.includes('Loading chunk') ||
        error?.name === 'TypeError';

      if (isChunkError && !pageHasAlreadyBeenRefreshed) {
        console.warn('[QualiTrack] Módulo desatualizado detectado após novo deploy. Recarregando versão mais recente...');
        sessionStorage.setItem('qualitrack_chunk_retry', 'true');
        window.location.reload();
        return new Promise<{ default: T }>(() => {});
      }

      throw error;
    }
  });
}
