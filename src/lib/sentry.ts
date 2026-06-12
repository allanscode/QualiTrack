import * as Sentry from '@sentry/react';
import { browserTracingIntegration, replayIntegration } from '@sentry/browser';

export function initSentry() {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  
  if (!dsn) {
    console.log('[Sentry] DSN not configured, skipping initialization');
    return;
  }

  Sentry.init({
    dsn,
    integrations: [
      browserTracingIntegration(),
      replayIntegration({
        maskAllText: true,
        blockAllMedia: true,
      }),
    ],
    tracesSampleRate: 1.0,
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || 'unknown',
    beforeSend(event) {
      // Filter out known non-critical errors
      if (event.exception) {
        for (const exception of event.exception.values || []) {
          if (exception.type === 'ChunkLoadError' || exception.type === 'LoadingChunkFailed') {
            return null; // Ignore chunk load errors (often network issues)
          }
        }
      }
      return event;
    },
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'Non-Error promise rejection captured',
      'Network request failed',
      'ChunkLoadError',
      'LoadingChunkFailed',
    ],
  });

  console.log('[Sentry] Initialized successfully');
}

export { Sentry };

export function captureException(error: Error, context?: Record<string, any>) {
  Sentry.captureException(error, { extra: context });
}

export function captureMessage(message: string, level: Sentry.SeverityLevel = 'info', context?: Record<string, any>) {
  Sentry.captureMessage(message, { level, extra: context });
}

export function setUserContext(user: { id: string; email?: string; username?: string } | null) {
  Sentry.setUser(user);
}

export function addBreadcrumb(breadcrumb: Sentry.Breadcrumb) {
  Sentry.addBreadcrumb(breadcrumb);
}

export function startTransaction(name: string, op: string) {
  return Sentry.startSpan({ name, op }, () => {});
}

export function setTag(key: string, value: string) {
  Sentry.setTag(key, value);
}

export function setContext(key: string, context: Record<string, any>) {
  Sentry.setContext(key, context);
}