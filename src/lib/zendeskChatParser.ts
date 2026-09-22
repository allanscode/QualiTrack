import { TicketCommentMessage } from '../types';

export type DialogueCategory = 'end_user' | 'agent' | 'system' | 'internal' | 'unknown';

export function getDialogueCategory(message: TicketCommentMessage): DialogueCategory {
  if (message.is_public === false) return 'internal';
  if (message.author_role === 'end_user') return 'end_user';
  if (message.author_role === 'agent' || message.author_role === 'admin') return 'agent';
  if (message.author_role === 'system') return 'system';
  return 'unknown';
}

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
  isPublic?: boolean;
}

/**
 * Decompõe um bloco de transcrição consolidado de chat do Zendesk
 * em comentários individuais. O papel deve vir da API, nunca do nome.
 */
export function parseZendeskChatTranscript(
  rawBody: string,
  options: ParseChatOptions = {}
): TicketCommentMessage[] {
  if (!rawBody || typeof rawBody !== 'string') return [];

  const {
    parentDate = '',
    parentId = 'chat',
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
      // Constrói timestamp ISO combinando data do ticket com hora do chat
      let isoTime = parentDate;
      if (currentMsg.time) {
        let timeStr = currentMsg.time.trim();
        // Se estiver no formato HH:MM sem segundos, completa
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
          timeStr += ':00';
        }
        // Se contiver segundos HH:MM:SS
        if (baseDate && /^\d{1,2}:\d{2}:\d{2}$/.test(timeStr)) {
          isoTime = `${baseDate}T${timeStr.padStart(8, '0')}Z`;
        }
      }

      messages.push({
        id: `${parentId}_${messages.length + 1}`,
        author_name: currentMsg.author,
        author_role: 'unknown',
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
      const author = (match[2] || match[3] || '').trim().replace(/\s+carregou\s*$/iu, '');
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
  _agentName?: string,
  _customerName?: string
): TicketCommentMessage[] {
  if (!Array.isArray(comments) || comments.length === 0) return [];

  const normalized: TicketCommentMessage[] = [];

  for (const comment of comments) {
    const body = comment.body || '';

    // Se o comentário é uma transcrição inteira de chat consolidada:
    if (isChatTranscript(body)) {
      const chatMessages = parseZendeskChatTranscript(body, {
        parentDate: comment.created_at,
        parentId: comment.id || 'chat',
        isPublic: comment.is_public !== false
      });

      if (chatMessages.length > 0) {
        normalized.push(...chatMessages);
        continue;
      }
    }

    // Comentário normal do ticket (não chat consolidado): preservar o role da API.
    const role = comment.author_role || 'unknown';
    const authorName = comment.author_name || '';

    normalized.push({
      ...comment,
      author_name: authorName || (role === 'end_user' ? 'Cliente' : role === 'system' ? 'Sistema' : role === 'agent' ? 'Atendente' : 'Autor não identificado'),
      author_role: role
    });
  }

  // Ordena cronologicamente para exibição consistente
  return normalized.sort((a, b) => {
    const tA = new Date(a.created_at || 0).getTime();
    const tB = new Date(b.created_at || 0).getTime();
    return tA - tB;
  });
}
