import { ArrowRight, CheckCircle2, Clock3, XCircle } from 'lucide-react';
import { Monitoria, User } from '../types';

type Props = { monitoria: Monitoria; users: User[] };

export default function PjReviewFlow({ monitoria, users }: Props) {
  const { status, pj_review_kind: kind, pj_review_decision: decision } = monitoria;
  const reviewerName = users.find(user => user.id === monitoria.pj_reviewer_id)?.name || 'Victor Aguiar';
  const managerDone = Boolean(kind);
  const victorDone = Boolean(decision);
  const qualityActive = status === 'aguardando_gestor_qualidade' || status === 'reavaliacao_solicitada';
  const completed = ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(status);

  const steps = [
    {
      name: 'Gestor PJ',
      detail: managerDone ? (kind === 'contestation' ? 'Contestação enviada' : 'Aprovação enviada') : 'Aguardando parecer',
      state: managerDone ? 'done' : 'active',
    },
    {
      name: reviewerName,
      detail: decision === 'approved' ? 'Parecer aprovado' : decision === 'rejected' ? 'Parecer reprovado' : 'Aguardando decisão',
      state: decision === 'rejected' ? 'rejected' : victorDone ? 'done' : managerDone ? 'active' : 'waiting',
    },
    {
      name: 'Gestor da Qualidade',
      detail: completed ? 'Decisão final registrada' : status === 'reavaliacao_solicitada'
        ? 'Reavaliação solicitada' : qualityActive ? 'Decisão final pendente' : 'Aguardando Victor',
      state: completed ? 'done' : qualityActive ? 'active' : 'waiting',
    },
  ] as const;

  return (
    <section aria-label="Fluxo de aprovação PJ" className="rounded-2xl border border-surface-border bg-surface-subtle/60 p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="text-sm font-bold text-brand-primary">Fluxo de aprovação PJ</h3>
        <p className="text-xs text-brand-muted">Cada parecer fica registrado antes da decisão final.</p>
      </div>
      <ol className="grid gap-2 sm:grid-cols-3">
        {steps.map((step, index) => {
          const Icon = step.state === 'done' ? CheckCircle2 : step.state === 'rejected' ? XCircle : Clock3;
          const tone = step.state === 'done' ? 'text-success' : step.state === 'rejected' ? 'text-error'
            : step.state === 'active' ? 'text-brand-primary' : 'text-brand-muted';
          return (
            <li key={step.name} className="flex min-w-0 items-start gap-2 rounded-xl bg-surface-card px-3 py-3">
              <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-brand-primary">{step.name}</p>
                <p className={`mt-0.5 text-[11px] ${tone}`}>{step.detail}</p>
              </div>
              {index < steps.length - 1 && <ArrowRight className="mt-0.5 hidden size-3 shrink-0 text-brand-muted xl:block" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
      {decision && monitoria.pj_review_note && (
        <p className="mt-3 text-xs text-brand-primary">
          <span className="font-semibold">Justificativa de {reviewerName}:</span> {monitoria.pj_review_note}
        </p>
      )}
    </section>
  );
}
