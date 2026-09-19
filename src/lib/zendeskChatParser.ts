import { TicketCommentMessage } from '../types';

/**
 * Detecta se uma mensagem de comentário é, na verdade, uma transcrição
 * consolidada de chat do Zendesk (onde o chat inteiro foi gravado num único comentário).
 * 
 * Padrões comuns do Zendesk Chat / Messaging:
 * - `(HH:MM:SS) Nome: Texto`
 * - `(HH:MM) Nome: Texto`
 * - `[HH:MM:SS] Nome: Texto`
 * - `Nome (HH:MM:SS): Texto`
 */
export function isChatTranscript(text?: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // Regex que busca pelo menos 2 ocorrências de padrões de mensagens de chat
  const chatLineRegex = /(?:^|\n)\s*(?:(?:\(|\[)\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\)\]]\s*[^:\n]+?:|[^:\n\(\[]+?\s*(?:\(|\[)\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\)\]]:)/g;
  const matches = text.match(chatLineRegex);
  return matches !== null && matches.length >= 2;
}

interface ParseChatOptions {
  parentDate?: string;
  parentId?: string | number;
  agentName?: string;
  isPublic?: boolean;
}

/**
 * Determina o papel de um participante do chat pelo nome e contexto.
 */
export function determineParticipantRole(
  authorName: string,
  agentName?: string
): 'agent' | 'end_user' | 'system' {
  const lower = (authorName || '').toLowerCase().trim();

  // 1. Bots e mensagens automáticas do sistema
  if (
    lower.includes('ia ') ||
    lower.includes('bot') ||
    lower.includes('system') ||
    lower.includes('sistema') ||
    lower.startsWith('ia ') ||
    lower === 'ia webposto' ||
    lower === 'workflow' ||
    lower.includes('zendesk')
  ) {
    return 'system';
  }

  // 2. Se temos o nome do atendente atribuído ao ticket
  if (agentName) {
    const lowerAgent = agentName.toLowerCase().trim();
    const agentParts = lowerAgent.split(/\s+/).filter(Boolean);

    // Bate com nome completo ou primeiro + último nome
    if (
      lower.includes(lowerAgent) ||
      (agentParts.length >= 2 && lower.includes(agentParts[0]) && lower.includes(agentParts[agentParts.length - 1]))
    ) {
      return 'agent';
    }
  }

  // 3. Caso padrão para clientes / solicitantes
  return 'end_user';
}

/**
 * Decompõe um bloco de transcrição consolidado de chat do Zendesk
 * em comentários individuais com timestamps, autores e papéis corretos.
 */
export function parseZendeskChatTranscript(
  rawBody: string,
  options: ParseChatOptions = {}
): TicketCommentMessage[] {
  if (!rawBody || typeof rawBody !== 'string') return [];

  const {
    parentDate = new Date().toISOString(),
    parentId = 'chat',
    agentName = '',
    isPublic = true
  } = options;

  // Regex para capturar linhas de início de fala:
  // 1) (14:15:00) Nome: Mensagem
  // 2) [14:15:00] Nome: Mensagem
  // 3) Nome (14:15:00): Mensagem
  const chatLineRegex = /^(?:(?:\(|\[)(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\)\]]\s*([^:\n]+?)|([^:\n\(\[]+?)\s*(?:\(|\[)(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\)\]]):\s*(.*)$/;

  const lines = rawBody.replace(/\r\n/g, '\n').split('\n');
  const messages: TicketCommentMessage[] = [];
  let currentMsg: {
    time: string;
    author: string;
    bodyLines: string[];
  } | null = null;

  // Extrai data base de parentDate (ex.: "2026-09-08")
  const baseDate = parentDate.slice(0, 10);

  function finalizeCurrent() {
    if (!currentMsg) return;
    const body = currentMsg.bodyLines.join('\n').trim();
    if (body) {
      const role = determineParticipantRole(currentMsg.author, agentName);
      
      // Constrói timestamp ISO combinando data do ticket com hora do chat
      let isoTime = parentDate;
      if (currentMsg.time) {
        let timeStr = currentMsg.time.trim();
        // Se estiver no formato HH:MM sem segundos, completa
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
          timeStr += ':00';
        }
        // Se contiver segundos HH:MM:SS
        if (/^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
          isoTime = `${baseDate}T${timeStr.padStart(8, '0')}Z`;
        }
      }

      messages.push({
        id: `${parentId}_${messages.length + 1}`,
        author_name: currentMsg.author,
        author_role: role,
        created_at: isoTime,
        body,
        is_public: isPublic
      });
    }
    currentMsg = null;
  }

  for (const line of lines) {
    const match = line.match(chatLineRegex);
    if (match) {
      finalizeCurrent();
      const time = match[1] || match[4] || '';
      const author = (match[2] || match[3] || '').trim();
      const initialText = match[5] || '';
      currentMsg = {
        time,
        author,
        bodyLines: [initialText]
      };
    } else {
      if (currentMsg) {
        currentMsg.bodyLines.push(line);
      }
    }
  }
  finalizeCurrent();

  return messages;
}

/**
 * Normaliza um array de mensagens de diálogo do ticket:
 * - Se algum comentário contiver transcrição de chat, expande em mensagens individuais.
 * - Ajusta papéis de autores ausentes ou ambíguos.
 * - Ordena cronologicamente por `created_at`.
 */
export function normalizeTicketDialogue(
  comments: TicketCommentMessage[],
  agentName?: string
): TicketCommentMessage[] {
  if (!Array.isArray(comments) || comments.length === 0) return [];

  const normalized: TicketCommentMessage[] = [];

  for (const comment of comments) {
    const body = comment.body || '';

    // Se o comentário é uma transcrição inteira de chat consolidada:
    if (isChatTranscript(body)) {
      const chatMessages = parseZendeskChatTranscript(body, {
        parentDate: comment.created_at || new Date().toISOString(),
        parentId: comment.id || 'chat',
        agentName,
        isPublic: comment.is_public !== false
      });

      if (chatMessages.length > 0) {
        normalized.push(...chatMessages);
        continue;
      }
    }

    // Comentário normal do ticket (não chat consolidado)
    let role = comment.author_role;
    const authorName = comment.author_name || '';

    // Se o papel não veio definido ou veio genericamente como 'agent':
    if (!role || role === 'agent') {
      const detectedRole = determineParticipantRole(authorName, agentName);
      // Se detectou como bot ou se era uma nota de sistema
      if (detectedRole === 'system') {
        role = 'system';
      } else if (!comment.is_public) {
        role = 'system';
      } else if (detectedRole === 'end_user' && (!comment.author_role || comment.author_role === 'agent')) {
        // Se o nome do autor não bate com o agente do ticket, pode ser o cliente
        role = 'end_user';
      }
    }

    normalized.push({
      ...comment,
      author_name: authorName || (role === 'end_user' ? 'Cliente' : role === 'system' ? 'Sistema' : 'Atendente'),
      author_role: role || (comment.is_public ? 'agent' : 'system')
    });
  }

  // Ordena cronologicamente para exibição consistente
  return normalized.sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    return tA - tB;
  });
}
