import React from 'react';
import { clearChunkRecoveryCooldown, recoverFromChunkLoadError } from './chunkRecovery';

/** Loads lazy routes and refreshes an open tab if it references a retired asset hash. */
export function lazyWithRetry<T extends React.ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
): React.LazyExoticComponent<T> {
  return React.lazy(async () => {
    try {
      const component = await componentImport();
      clearChunkRecoveryCooldown();
      return component;
    } catch (error: unknown) {
      if (recoverFromChunkLoadError(error)) {
        return new Promise<{ default: T }>(() => {});
      }
      throw error;
    }
  });
}
