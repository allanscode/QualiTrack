import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import MonitoriaDetails from '../../../src/components/MonitoriaDetails';
import type { Monitoria, User } from '../../../src/types';

const params = new URLSearchParams(window.location.search);
if (params.get('theme') === 'dark') document.documentElement.classList.add('dark');
const user = { id: 'admin-1', name: 'Admin', role: 'admin' } as User;
const auditor = { id: 'auditor-1', name: 'Maria Auditora', role: 'qualidade' } as User;
const reviewer = { id: 'victor-1', name: 'Victor Ellyan Aguiar', role: 'suporte' } as User;
const manager = { id: 'manager-1', name: 'Gestor PJ Bruno', role: 'gestor_suporte' } as User;
const isPj = params.get('pj') === '1';
const monitoria = {
  id: 'monitoria-1', display_id: 6, ticket_id: '99022', status: 'pendente_revisao', score: 50,
  evaluator_id: auditor.id, evaluated_id: 'agent-1', evaluator_name: auditor.name,
  evaluated_name: 'Joao Suporte', team_name: 'Equipe Alpha', created_at: '2026-09-25T15:05:00Z', updated_at: '2026-09-25T15:55:00Z',
  evaluator_note: 'Monitoria com nota 50% (< 75%). Requer Acao Corretiva do Gestor de Suporte conforme regra WQ-22.',
  corrective_action: 'Feedback individual aplicado e alinhamento de conduta realizado.',
  history: [{ action: 'Criacao de Monitoria', by_id: auditor.id, by_name: auditor.name, at: '2026-09-25T15:05:00Z' }],
} as Monitoria;
if (params.get('timeline') === 'long') {
  monitoria.status = 'contestacao_negada';
  monitoria.created_at = '2026-10-06T11:17:00Z';
  monitoria.updated_at = '2026-10-06T17:15:00Z';
  monitoria.history = [
    { action: 'Monitoria Criada', by_id: auditor.id, by_name: auditor.name, at: '2026-10-06T11:17:00Z' },
    { action: 'Contestação do Gestor de Atendimento', by_id: manager.id, by_name: manager.name, at: '2026-10-06T16:47:00Z', note: 'Com certeza pode melhorar nessa questão de chamar o cliente de 10 em 10 minutos. Ele chamou de outra forma e o cliente sumiu e não respondeu a uma pergunta importante. A parte técnica e a investigação com as informações que o cliente passou foram cumpridas. O cliente deu nota baixa, pois o chamado foi fechado. Mas é aquela questão de ter que segurar a fila quando temos outros clientes esperando.' },
    { action: 'Reavaliação da Qualidade', by_id: auditor.id, by_name: auditor.name, at: '2026-10-06T17:15:00Z', note: 'Entendo o ponto apresentado e reconheço que houve investigação técnica com base nas informações encaminhadas pelo cliente. Entretanto, a avaliação considera separadamente os critérios técnicos e procedimentais. Conforme o item do manual, o cliente deve receber uma atualização a cada 10 minutos, sendo admitido o intervalo máximo de 20 minutos quando o operador estiver em atuação técnica previamente informada. Nesse atendimento houve um intervalo de 30 minutos entre as mensagens, sem aviso prévio.' },
  ];
}
if (isPj) {
  Object.assign(monitoria, {
    team_id: 'pj-bruno', team_name: 'PJ Bruno', pj_review_required: true,
    status: params.get('stage') === 'reviewed' ? 'aguardando_gestor_qualidade' : 'aguardando_revisao_pj',
    pj_reviewer_id: reviewer.id, pj_review_kind: 'contestation',
    pj_review_decision: params.get('stage') === 'reviewed' ? 'rejected' : null,
    pj_review_note: params.get('stage') === 'reviewed' ? 'O parecer precisa de correção antes da decisão final.' : null,
  });
}
if (params.get('stage') === 'manager') {
  monitoria.status = 'pendente_revisao';
  monitoria.score = 92;
}
createRoot(document.getElementById('root')!).render(
  <main className="min-h-screen bg-surface-bg p-3 sm:p-6">
    <section role="dialog" aria-modal="true" aria-labelledby="fixture-title" className="mx-auto w-full max-w-4xl rounded-3xl border border-surface-border bg-surface-card p-4 shadow-premium sm:p-6">
      <h1 id="fixture-title" className="mb-4 text-lg font-black text-brand-primary">Monitoria #6 ? Ticket 99022</h1>
      <MonitoriaDetails monitoria={monitoria} user={params.get('stage') === 'manager' ? manager
        : isPj && params.get('stage') !== 'reviewed' ? reviewer : user}
        users={[user, auditor, reviewer, manager]} teams={isPj ? [{ id: 'pj-bruno', name: 'PJ Bruno', active: true, requires_pj_review: true }] : []}
        onView={() => {}} onAction={() => {}} />
    </section>
  </main>
);
