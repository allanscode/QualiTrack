import React from 'react';
import { m, useReducedMotion } from 'motion/react';

export function PageSkeleton({ dashboard = false }: { dashboard?: boolean }) {
  const reduceMotion = useReducedMotion();
  const block = dashboard ? 'dashboard-skeleton-block rounded-lg bg-brand-muted/25' : 'rounded-lg bg-brand-muted/15 motion-safe:animate-pulse';
  const group = {
    hidden: {},
    show: { transition: { staggerChildren: reduceMotion ? 0 : 0.075, delayChildren: reduceMotion ? 0 : 0.04 } },
  };
  const item = {
    hidden: reduceMotion ? { opacity: 1 } : { opacity: 0, y: 10, scale: 0.99 },
    show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
  };
  return (
    <div role="status" aria-label={dashboard ? 'Carregando dashboard' : 'Carregando página'} className="space-y-6">
      <span className="sr-only">Carregando dados…</span>
      {dashboard && <div className="space-y-2.5 text-brand-muted">
        <span className="text-sm font-medium">Carregando indicadores do dashboard…</span>
        <div className="h-1 w-full overflow-hidden rounded-full bg-surface-subtle" aria-hidden="true">
          <div className="dashboard-progress-indicator h-full w-1/3 rounded-full bg-brand-accent" />
        </div>
      </div>}
      <m.div aria-hidden="true" className="space-y-6" variants={group} initial="hidden" animate="show">
        <m.div variants={item} className="qt-glass-card flex flex-wrap gap-3 p-5">
          {[0, 1, 2, 3].map(i => <div key={i} className={`${block} h-10 w-32`} />)}
        </m.div>
        {dashboard && <m.div variants={group} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }, (_, i) => <m.div variants={item} key={i} className="qt-glass-card p-5 space-y-5">
            <div className={`${block} h-4 w-2/3`} />
            <div className={`${block} h-8 w-1/2`} />
          </m.div>)}
        </m.div>}
        <m.div variants={group} className={`grid gap-4 ${dashboard ? 'lg:grid-cols-2' : ''}`}>
          {Array.from({ length: dashboard ? 2 : 5 }, (_, i) => <m.div variants={item} key={i} className={`qt-glass-card p-5 ${dashboard ? 'h-64' : 'h-20'}`}>
            <div className={`${block} h-4 w-1/3`} />
            {dashboard && <div className={`${block} mt-6 h-36 w-full`} />}
          </m.div>)}
        </m.div>
      </m.div>
    </div>
  );
}
