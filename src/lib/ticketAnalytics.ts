import { TicketCommentMessage } from '../types';

/**
 * Sanitiza o corpo de uma mensagem removendo assinaturas corporativas,
 * disclaimers legais, cabeçalhos de resposta em cascata de e-mail e
 * artefatos de imagem/markdown.
 */
export function sanitizeMessageBody(rawBody: string): string {
  if (!rawBody || typeof rawBody !== 'string') return '';

  let text = rawBody.replace(/\r\n/g, '\n');

  // 1. Remove cabeçalhos de resposta de e-mail (threads encadeadas)
  text = text.replace(/^[>\s]*Em\s+[a-z]{3}\.?,?\s+\d+.*?escreveu:.*$/gmi, '');
  text = text.replace(/^[>\s]*On\s+[A-Za-z]+,?\s+[A-Za-z]+\s+\d+.*?wrote:.*$/gmi, '');
  text = text.replace(/^[>\s]*[-]{3,}\s*(Mensagem encaminhada|Forwarded message)\s*[-]{3,}.*$/gmi, '');
  text = text.replace(/^[>\s]*De:\s+.*?\n[>\s]*(Enviad[oa]|Date):\s+.*?\n[>\s]*Para:\s+.*$/gmi, '');

  // 2. Remove linhas de citação iniciadas por '>'
  text = text
    .split('\n')
    .filter(line => !line.trim().startsWith('>'))
    .join('\n');

  // 3. Remove artefatos de imagens inline e tags markdown pesadas
  text = text.replace(/\[image:\s*.*?\]/gi, '');
  text = text.replace(/!\[.*?\]\(.*?\)/g, '');
  text = text.replace(/\[cid:.*?\]/gi, '');

  // 4. Remove blocos de assinatura e avisos de confidencialidade
  const signatureTriggers = [
    /(?:^|\n)\s*--+\s*(?:\n|$)/,
    /(?:^|\n)\s*(?:Atenciosamente|Cordialmente|Abraços|Att\.?,?|Grato,?|Obrigad[oa],?)\b/i,
    /(?:^|\n)\s*Esta mensagem (?:e seus anexos )?(?:é|são|contém) confidencia[a-z]*/i,
    /(?:^|\n)\s*This email and any attachments are confidential/i,
    /(?:^|\n)\s*Aviso de Confidencialidade:/i,
  ];

  for (const trigger of signatureTriggers) {
    const match = text.search(trigger);
    if (match !== -1) {
      text = text.slice(0, match);
      break;
    }
  }

  // 5. Remove excesso de espaços em branco e quebras consecutivas
  return text.replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Formata milissegundos em uma string legível (ex: "3m 22s" ou "1h 15m")
 */
export function formatDurationMs(ms: number): string {
  if (ms <= 0 || isNaN(ms)) return '0s';
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export interface TimelineMessageItem {
  id: number | string;
  authorName: string;
  authorRole: string;
  createdAt: string;
  timestamp: number;
  rawBody: string;
  sanitizedBody: string;
  isPublic: boolean;
  deltaFromPrevMs: number;
  deltaFormatted?: string;
  isLongPause: boolean; // intervalo > 7 minutos
}

export interface TicketTimelineAnalytics {
  items: TimelineMessageItem[];
  metrics: {
    firstResponseTimeMs: number | null;
    firstResponseFormatted: string;
    totalDurationMs: number;
    totalDurationFormatted: string;
    maxWaitTimeMs: number;
    maxWaitTimeFormatted: string;
    agentMessagesCount: number;
    clientMessagesCount: number;
    internalNotesCount: number;
    totalMessagesCount: number;
  };
}

/**
 * Processa a lista de mensagens de um ticket, higienizando o conteúdo
 * e calculando os indicadores de SLA e tempo de resposta.
 */
export function computeTicketTimeline(messages: TicketCommentMessage[]): TicketTimelineAnalytics {
  if (!messages || messages.length === 0) {
    return {
      items: [],
      metrics: {
        firstResponseTimeMs: null,
        firstResponseFormatted: 'N/A',
        totalDurationMs: 0,
        totalDurationFormatted: '0s',
        maxWaitTimeMs: 0,
        maxWaitTimeFormatted: '0s',
        agentMessagesCount: 0,
        clientMessagesCount: 0,
        internalNotesCount: 0,
        totalMessagesCount: 0,
      }
    };
  }

  // Ordena cronologicamente crescente
  const sorted = [...messages].sort((a, b) => {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  let firstClientMsgTime: number | null = null;
  let firstAgentResponseTime: number | null = null;
  let maxWaitMs = 0;
  let agentCount = 0;
  let clientCount = 0;
  let internalCount = 0;

  const items: TimelineMessageItem[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const msg = sorted[i];
    const time = new Date(msg.created_at).getTime();
    const prevTime = i > 0 ? new Date(sorted[i - 1].created_at).getTime() : time;
    const deltaMs = i > 0 ? Math.max(0, time - prevTime) : 0;

    const role = msg.author_role;
    if (role === 'agent') agentCount++;
    else if (role === 'end_user') clientCount++;
    if (!msg.is_public) internalCount++;

    // Identifica tempo da primeira resposta
    if (role === 'end_user' && firstClientMsgTime === null) {
      firstClientMsgTime = time;
    } else if (role === 'agent' && firstClientMsgTime !== null && firstAgentResponseTime === null && msg.is_public) {
      firstAgentResponseTime = time;
    }

    // Identifica maiores intervalos após mensagens do cliente
    if (i > 0 && sorted[i - 1].author_role === 'end_user' && role === 'agent') {
      if (deltaMs > maxWaitMs) maxWaitMs = deltaMs;
    }

    // Pausa prolongada se intervalo for superior a 7 minutos (420.000 ms)
    const isLongPause = i > 0 && deltaMs >= 7 * 60 * 1000 && role === 'agent' && sorted[i - 1].author_role === 'end_user';

    items.push({
      id: msg.id,
      authorName: msg.author_name,
      authorRole: msg.author_role,
      createdAt: msg.created_at,
      timestamp: time,
      rawBody: msg.body || '',
      sanitizedBody: sanitizeMessageBody(msg.body || ''),
      isPublic: msg.is_public,
      deltaFromPrevMs: deltaMs,
      deltaFormatted: i > 0 && deltaMs > 0 ? `+${formatDurationMs(deltaMs)}` : undefined,
      isLongPause
    });
  }

  const startTime = items[0].timestamp;
  const endTime = items[items.length - 1].timestamp;
  const totalDurationMs = Math.max(0, endTime - startTime);

  let frtMs: number | null = null;
  if (firstClientMsgTime !== null && firstAgentResponseTime !== null && firstAgentResponseTime >= firstClientMsgTime) {
    frtMs = firstAgentResponseTime - firstClientMsgTime;
  }

  return {
    items,
    metrics: {
      firstResponseTimeMs: frtMs,
      firstResponseFormatted: frtMs !== null ? formatDurationMs(frtMs) : 'N/A',
      totalDurationMs,
      totalDurationFormatted: formatDurationMs(totalDurationMs),
      maxWaitTimeMs: maxWaitMs,
      maxWaitTimeFormatted: maxWaitMs > 0 ? formatDurationMs(maxWaitMs) : 'Nenhum atraso',
      agentMessagesCount: agentCount,
      clientMessagesCount: clientCount,
      internalNotesCount: internalCount,
      totalMessagesCount: items.length,
    }
  };
}
