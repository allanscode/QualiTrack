import { Bot } from 'lucide-react';

export type QueueAIProgressStep = 1 | 2 | 3;

const labels: Record<QueueAIProgressStep, string> = {
  1: 'Etapa 1/3 · Buscando conversa',
  2: 'Etapa 2/3 · Analisando com IA...',
  3: 'Etapa 3/3 · Finalizando',
};

export default function QueueAIProgress({ step, waiting = false }: { step: QueueAIProgressStep; waiting?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" role="status" aria-live="polite">
      <Bot aria-hidden="true" className={`h-3.5 w-3.5 shrink-0 ${waiting ? '' : 'animate-spin'}`} />
      <span className="min-w-0 text-left leading-tight">{waiting ? 'Etapa 2/3 · Nova tentativa agendada' : labels[step]}</span>
    </span>
  );
}
