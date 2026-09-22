import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import QueueAIProgress, { QueueAIProgressStep } from '../../../src/components/QueueAIProgress';

function Harness() {
  const [active, setActive] = useState<string | null>(null);
  const [step, setStep] = useState<QueueAIProgressStep>(1);
  const [waiting, setWaiting] = useState(false);
  return <main className="min-h-screen bg-surface-bg p-4 text-brand-primary sm:p-8">
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
      {['170882', '170896'].map(id => <article key={id} data-testid={`ticket-${id}`} className="min-w-0 rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold">Ticket #{id}</h1>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5">
            <button type="button" disabled={active !== null} onClick={() => { setActive(id); setStep(1); setWaiting(false); }} className="min-w-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-80">
              {active === id ? <QueueAIProgress step={step} waiting={waiting} /> : 'Conferir com IA'}
            </button>
            {active === id && <button type="button" onClick={() => setActive(null)} className="rounded-lg px-2 py-1.5 text-[11px] font-medium text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent/60">Interromper análise</button>}
          </div>
        </div>
      </article>)}
    </div>
    <div className="sr-only">
      <button data-testid="stage-2" onClick={() => setStep(2)}>stage 2</button>
      <button data-testid="stage-3" onClick={() => setStep(3)}>stage 3</button>
      <button data-testid="waiting" onClick={() => setWaiting(true)}>waiting</button>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
