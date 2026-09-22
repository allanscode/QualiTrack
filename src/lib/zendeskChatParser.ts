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
  customerName?: string;
  isPublic?: boolean;
}

/**
 * Determina o papel de um participante do chat pelo nome e contexto.
 * Regra estrita: apenas "IA webPosto" é classificado como robô/bot.
 * Qualquer outro agente ou analista em casos de transferência deve ser identificado como atendente.
 */
export function determineParticipantRole(
  authorName: string,
  agentName?: string,
  customerName?: string
): 'agent' | 'end_user' | 'system' {
  const lower = (authorName || '').toLowerCase().trim();

  // 1. Robô de autoatendimento da WebPosto: estritamente "IA webPosto"
  if (
    lower === 'ia webposto' ||
    lower.startsWith('ia webposto') ||
    lower.includes('ia webposto') ||
    lower === 'workflow' ||
    lower === 'sistema' ||
    lower === 'system'
  ) {
    return 'system';
  }

  // 2. Se temos o nome do atendente real (atribuído ao ticket no Zendesk),
  // confirma se é ele — checagem de identidade, tem prioridade sobre
  // palavras-chave genéricas (abaixo), que podem coincidir com o nome da
  // própria equipe do cliente (ex.: um cliente que assina o chat como
  // "Suporte <Empresa>" não é o nosso atendente).
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

  // 3. Se temos o nome do cliente / solicitante identificado, confirma se é o cliente
  if (customerName) {
    const lowerCust = customerName.toLowerCase().trim();
    if (lower && (lower.includes(lowerCust) || lowerCust.includes(lower))) {
      return 'end_user';
    }
  }

  // 4. Se o nome contém termos específicos da equipe interna da WebPosto.
  // "suporte" e "atendimento" foram removidos daqui: são termos genéricos
  // demais — o time de suporte de um cliente/revenda também costuma se
  // identificar no chat como "Suporte <Nome da Empresa>", o que fazia o
  // cliente ser rotulado como atendente da WebPosto por engano.
  if (
    lower.includes('webposto') ||
    lower.includes('atendente') ||
    lower.includes('analista') ||
    lower.includes('técnico') ||
    lower.includes('tecnico') ||
    lower.includes('especialista') ||
    lower.includes('moderador') ||
    lower.includes('qualidade')
  ) {
    return 'agent';
  }

  // 5. Caso padrão para clientes / solicitantes
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
    customerName = '',
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
      const role = determineParticipantRole(currentMsg.author, agentName, customerName);
      
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
  agentName?: string,
  customerName?: string
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
        customerName,
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

    if (comment.is_public === false) {
      role = role === 'agent' ? 'agent' : 'system';
    } else if (!role) {
      role = determineParticipantRole(authorName, agentName, customerName);
    } else if (role === 'end_user') {
      const detectedRole = determineParticipantRole(authorName, agentName, customerName);
      if (detectedRole === 'agent') {
        role = 'agent';
      } else if (detectedRole === 'system') {
        role = 'system';
      }
    } else if (role === 'agent') {
      const detectedRole = determineParticipantRole(authorName, agentName, customerName);
      if (detectedRole === 'system') {
        role = 'system';
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
