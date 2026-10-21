import React from 'react';
export function PageSkeleton({ dashboard = false }: { dashboard?: boolean }) {
  const block = dashboard ? 'dashboard-skeleton-block rounded-lg bg-brand-muted/15' : 'rounded-lg bg-brand-muted/15 motion-safe:animate-pulse';
  return (
    <div role="status" aria-label={dashboard ? 'Carregando dashboard' : 'Carregando página'} className="space-y-6">
      <span className="sr-only">Carregando dados…</span>
      {dashboard && <div className="space-y-2.5 text-brand-muted">
        <span className="text-sm font-medium">Carregando indicadores do dashboard…</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
          <div className="dashboard-progress-indicator h-full w-1/3 rounded-full bg-brand-accent" />
        </div>
      </div>}
      <div aria-hidden="true" className="space-y-6">
        <div className="flex flex-wrap gap-3 rounded-2xl border border-surface-border bg-surface-card p-5">
          {[0, 1, 2, 3].map(i => <div key={i} className={`${block} h-10 w-32 ${dashboard ? 'dashboard-skeleton-card' : ''}`} style={dashboard ? { animationDelay: `${i * 70}ms` } : undefined} />)}
        </div>
        {dashboard && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <div key={i} className={`rounded-2xl border border-surface-border bg-surface-card p-5 space-y-5 ${dashboard ? 'dashboard-skeleton-card' : ''}`} style={dashboard ? { animationDelay: `${i * 75}ms` } : undefined}>
            <div className={`${block} h-4 w-2/3`} />
            <div className={`${block} h-8 w-1/2`} />
          </div>)}
        </div>}
        <div className={`grid gap-4 ${dashboard ? 'lg:grid-cols-2' : ''}`}>
          {Array.from({ length: dashboard ? 2 : 5 }, (_, i) => <div key={i} className={`rounded-2xl border border-surface-border bg-surface-card p-5 ${dashboard ? 'h-64 dashboard-skeleton-card' : 'h-20'}`} style={dashboard ? { animationDelay: `${i * 90}ms` } : undefined}>
            <div className={`${block} h-4 w-1/3`} />
            {dashboard && <div className={`${block} mt-6 h-36 w-full`} />}
          </div>)}
        </div>
      </div>
    </div>
  );
}
