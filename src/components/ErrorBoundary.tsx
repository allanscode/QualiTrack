import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-surface-bg text-brand-primary p-6">
          <div className="bg-surface-card p-8 rounded-2xl shadow-premium max-w-md w-full text-center border border-functional-error/20">
            <div className="w-16 h-16 bg-functional-error/10 text-functional-error rounded-full flex items-center justify-center mx-auto mb-6">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"></circle>
                <line x1="12" y1="8" x2="12" y2="12"></line>
                <line x1="12" y1="16" x2="12.01" y2="16"></line>
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-4">Ops! Algo deu errado.</h2>
            <p className="text-brand-muted mb-6">
              Desculpe, ocorreu um erro inesperado. Nossa equipe técnica já foi notificada (no console).
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-brand-accent hover:bg-brand-accent/90 text-white font-medium py-3 px-4 rounded-xl transition-colors"
            >
              Recarregar página
            </button>
            {this.state.error && (
              <div className="mt-6 p-4 bg-black/5 dark:bg-white/5 rounded-xl text-left overflow-auto max-h-32 text-xs font-mono text-brand-muted">
                {this.state.error.toString()}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
