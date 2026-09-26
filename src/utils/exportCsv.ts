import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Monitoria, User, Team } from '../types';
import { getStatusConfig } from '../lib/statusHelper';

/**
 * Exporta uma lista de monitorias para formato CSV compatível diretamente com o Microsoft Excel (padrão Brasil).
 * Utiliza delimitador ponto-e-vírgula (;) e BOM UTF-8 (\uFEFF) para garantir acentuação correta.
 */
export function exportMonitoriasToCsv(
  monitorias: Monitoria[],
  filenamePrefix = 'monitorias_qualitrack',
  users: User[] = [],
  teams: Team[] = []
) {
  if (!monitorias || monitorias.length === 0) return false;

  const escapeCell = (val: any): string => {
    if (val === null || val === undefined) return '';
    const str = String(val).replace(/"/g, '""').replace(/[\r\n]+/g, ' ');
    return `"${str}"`;
  };

  const getAgentName = (m: Monitoria) => {
    if (m.evaluated_name) return m.evaluated_name;
    const found = users.find(u => u.id === m.evaluated_id);
    return found ? found.name : 'Atendente';
  };

  const getAuditorName = (m: Monitoria) => {
    if (m.evaluator_name) return m.evaluator_name;
    const found = users.find(u => u.id === m.evaluator_id);
    return found ? found.name : 'Auditor';
  };

  const getTeamName = (m: Monitoria) => {
    if (m.team_name) return m.team_name;
    const found = teams.find(t => t.id === m.team_id);
    return found ? found.name : 'N/A';
  };

  const headers = [
    'Protocolo',
    'Ticket',
    'Canal',
    'Data do Ticket',
    'Data da Avaliação',
    'Atendente',
    'Equipe',
    'Auditor',
    'Nota (%)',
    'Status',
    'Resolução',
    'Prazo Limite',
    'Ação Corretiva',
    'Justificativa Contestação',
  ];

  const rows = monitorias.map(m => {
    const cfg = getStatusConfig(m.status);
    const scoreText = m.score !== undefined && m.score !== null ? `${m.score}%` : 'N/A';
    const ticketDate = m.ticket_date ? format(new Date(m.ticket_date), 'dd/MM/yyyy', { locale: ptBR }) : '';
    const evalDate = m.created_at ? format(new Date(m.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '';
    const deadline = m.action_deadline_at ? format(new Date(m.action_deadline_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '';

    return [
      escapeCell(m.display_id || m.id.slice(0, 6)),
      escapeCell(m.ticket_id || ''),
      escapeCell(m.channel || 'Chat'),
      escapeCell(ticketDate),
      escapeCell(evalDate),
      escapeCell(getAgentName(m)),
      escapeCell(getTeamName(m)),
      escapeCell(getAuditorName(m)),
      escapeCell(scoreText),
      escapeCell(cfg.shortLabel || m.status),
      escapeCell(m.resolution_type === 'automatic' ? 'Automática' : 'Humana'),
      escapeCell(deadline),
      escapeCell(m.corrective_action || ''),
      escapeCell(m.contestation_reason || ''),
    ].join(';');
  });

  const csvContent = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const timestamp = format(new Date(), 'yyyy-MM-dd_HHmm');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return true;
}
