import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import QueueAIProgress, { QueueAIProgressStep } from '../../../src/components/QueueAIProgress';

function Harness() {
  const [active, setActive] = useState<string | null>(null);
  const [step, setStep] = useState<QueueAIProgressStep>(1);
  return <main className="min-h-screen bg-surface-bg p-4 text-brand-primary sm:p-8">
    <div className="mx-auto grid max-w-5xl gap-4 md:grid-cols-2">
      {['170882', '170896'].map(id => <article key={id} data-testid={`ticket-${id}`} className="min-w-0 rounded-2xl border border-surface-border bg-surface-card p-5 shadow-premium">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-semibold">Ticket #{id}</h1>
          <button type="button" disabled={active !== null} onClick={() => { setActive(id); setStep(1); }} className="min-w-0 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-80">
            {active === id ? <QueueAIProgress step={step} /> : 'Conferir com IA'}
          </button>
        </div>
      </article>)}
    </div>
    <div className="sr-only">
      <button data-testid="stage-2" onClick={() => setStep(2)}>stage 2</button>
      <button data-testid="stage-3" onClick={() => setStep(3)}>stage 3</button>
    </div>
  </main>;
}

createRoot(document.getElementById('root')!).render(<Harness />);
