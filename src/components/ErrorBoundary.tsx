import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Sentry } from '../lib/sentry';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import Button from './ui/Button';
import Card from './ui/Card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    
    // Send to Sentry
    if (typeof window !== 'undefined') {
      import('../lib/sentry').then(({ captureException }) => {
        captureException(error, { componentStack: errorInfo.componentStack });
      });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  private handleGoHome = (): void => {
    window.location.href = '/';
  };

  public render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-surface-bg p-4">
          <Card className="max-w-md w-full shadow-2xl border border-surface-border">
            <div className="p-8 text-center space-y-6">
              <div className="w-16 h-16 rounded-2xl bg-error/10 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-8 h-8 text-error" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-black text-brand-primary uppercase tracking-tight">
                  Ops! Algo deu errado
                </h2>
                <p className="text-brand-muted text-sm">
                  Ocorreu um erro inesperado. Nossa equipe foi notificada automaticamente.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 pt-4">
                <Button
                  onClick={this.handleRetry}
                  className="flex-1"
                  icon={<RefreshCw className="w-4 h-4" />}
                >
                  Tentar Novamente
                </Button>
                <Button
                  variant="ghost"
                  onClick={this.handleGoHome}
                  className="flex-1"
                  icon={<Home className="w-4 h-4" />}
                >
                  Ir para Início
                </Button>
              </div>
              <details className="text-left mt-4">
                <summary className="text-xs text-brand-muted/60 cursor-pointer">
                  Detalhes técnicos (para suporte)
                </summary>
                <pre className="mt-2 p-3 bg-surface-bg border border-surface-border rounded-lg text-[10px] overflow-auto max-h-40 text-error">
                  {this.state.error?.message}
                  {this.state.error?.stack && `\n\n${this.state.error.stack}`}
                </pre>
              </details>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;