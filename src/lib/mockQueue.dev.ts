import type { AuditingQueueType, AuditingQueueTicket } from '../types';
export function getMockQueueTickets(type: AuditingQueueType, auditedIds: Set<string>): AuditingQueueTicket[] {
  const now = new Date();

  if (type === 'negativas') {
    return [
      {
        ticket_id: '900001',
        subject: 'Erro ao emitir NFC-e em contingência após atualização',
        requester_name: 'Posto Estrela do Sul (Carlos)',
        agent_name: 'Agente Demo',
        agent_email: 'agent@example.invalid',
        csat_status: 'bad',
        csat_comment: 'Demorou muito para responder e o sistema travou o caixa na hora do pico.',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 4).toISOString(),
        status: 'solved',
        url: 'https://example.invalid/agent/tickets/900001',
        already_audited: auditedIds.has('900001'),
        tags: ['cliente_final'],
        organization_name: 'Posto Estrela do Sul',
        organization_tags: ['cliente_final'],
      },
      {
        ticket_id: '900002',
        subject: 'Problema na integração TEF com PinPad',
        requester_name: 'Auto Posto Alvorada',
        agent_name: 'João Suporte (Auditado)',
        agent_email: 'suporte@teste.com',
        csat_status: 'bad',
        csat_comment: 'Atendente encerrou o chat antes de confirmar se a transação passou.',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 8).toISOString(),
        status: 'solved',
        url: 'https://example.invalid/agent/tickets/900002',
        already_audited: auditedIds.has('900002'),
        tags: ['cliente_final'],
        organization_name: 'Auto Posto Alvorada',
        organization_tags: ['cliente_final'],
      }
    ];
  }

  if (type === 'positivas') {
    return [
      {
        ticket_id: '900003',
        subject: 'Dúvida sobre cadastro de novos bicos de abastecimento',
        requester_name: 'Posto Pioneiro (Mariana)',
        agent_name: 'João Suporte (Auditado)',
        agent_email: 'suporte@teste.com',
        csat_status: 'good',
        csat_comment: 'Excelente atendimento! Muito paciente e explicou o passo a passo com clareza.',
        channel: 'WhatsApp',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 5).toISOString(),
        status: 'closed',
        url: 'https://example.invalid/agent/tickets/900003',
        already_audited: auditedIds.has('900003'),
        tags: ['cliente_final'],
        organization_name: 'Posto Pioneiro',
        organization_tags: ['cliente_final'],
      },
      {
        ticket_id: '900004',
        subject: 'Configuração de impressora de cupom não fiscal',
        requester_name: 'Posto Rota 101',
        agent_name: 'Agente Demo',
        agent_email: 'agent@example.invalid',
        csat_status: 'good',
        csat_comment: 'Resolvido em menos de 5 minutos, parabéns à equipe!',
        channel: 'Chat',
        ticket_date: new Date(now.getTime() - 1000 * 3600 * 12).toISOString(),
        status: 'closed',
        url: 'https://example.invalid/agent/tickets/900004',
        already_audited: auditedIds.has('900004'),
        tags: ['cliente_final'],
        organization_name: 'Posto Rota 101',
        organization_tags: ['cliente_final'],
      }
    ];
  }

  // Proativas (CSAT Vazio / Unrated)
  return [
    {
      ticket_id: '900005',
      subject: 'Ajuste no relatório de fechamento de caixa por operador',
      requester_name: 'Posto São Lucas',
      agent_name: 'João Suporte (Auditado)',
      agent_email: 'suporte@teste.com',
      csat_status: 'unrated',
      channel: 'Email',
      ticket_date: new Date(now.getTime() - 1000 * 3600 * 6).toISOString(),
      status: 'solved',
      url: 'https://example.invalid/agent/tickets/900005',
      already_audited: auditedIds.has('900005'),
      tags: ['cliente_final'],
      organization_name: 'Posto São Lucas',
      organization_tags: ['cliente_final'],
    },
    {
      ticket_id: '900006',
      subject: 'Reenvio de XML para contabilidade mês anterior',
      requester_name: 'Posto Central Park',
      agent_name: 'Agente Demo',
      agent_email: 'agent@example.invalid',
      csat_status: 'unrated',
      channel: 'WhatsApp',
      ticket_date: new Date(now.getTime() - 1000 * 3600 * 14).toISOString(),
      status: 'closed',
      url: 'https://example.invalid/agent/tickets/900006',
      already_audited: auditedIds.has('900006'),
      tags: ['cliente_final'],
      organization_name: 'Posto Central Park',
      organization_tags: ['cliente_final'],
    }
  ];
}

