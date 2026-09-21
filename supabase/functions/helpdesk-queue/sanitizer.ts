/**
 * Sanitizador e normalizador de transcrições de tickets do Helpdesk / Zendesk.
 * 
 * 1. Decompõe comentários consolidados de chat (onde todo o diálogo vem num único bloco
 *    com linhas no formato `(HH:MM:SS) Autor: Mensagem`) em falas individuais de
 *    Cliente, Atendente e Sistema/Bot.
 * 2. Remove ruídos repetitivos (assinaturas corporativas, disclaimers legais,
 *    cabeçalhos de resposta em cascata de e-mail e artefatos de imagem) antes
 *    do envio para os modelos de IA (Gemini / OpenRouter).
 * 3. Rotula adequadamente quem falou o quê ([CLIENTE], [ATENDENTE], [SISTEMA]),
 *    prevenindo que a IA confunda mensagens de erro coladas pelo cliente como falhas do analista.
 */

export function isChatTranscript(text?: string): boolean {
  if (!text || typeof text !== 'string') return false;

  // Regex que busca pelo menos 2 ocorrências de padrões de mensagens de chat
  const chatLineRegex = /(?:^|\n)\s*(?:(?:\(|\[)\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\)\]]\s*[^:\n]+?:|[^:\n\(\[]+?\s*(?:\(|\[)\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?[\)\]]:)/g;
  const matches = text.match(chatLineRegex);
  return matches !== null && matches.length >= 2;
}

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

  // 2. Se temos o nome do cliente / solicitante identificado, confirma se é o cliente
  if (customerName) {
    const lowerCust = customerName.toLowerCase().trim();
    if (lower && (lower.includes(lowerCust) || lowerCust.includes(lower))) {
      return 'end_user';
    }
  }

  // 3. Se o nome contém termos de equipe técnica/suporte da WebPosto
  if (
    lower.includes('suporte') ||
    lower.includes('webposto') ||
    lower.includes('atendente') ||
    lower.includes('analista') ||
    lower.includes('técnico') ||
    lower.includes('tecnico') ||
    lower.includes('especialista') ||
    lower.includes('moderador') ||
    lower.includes('qualidade') ||
    lower.includes('atendimento')
  ) {
    return 'agent';
  }

  // 4. Se temos o nome do atendente principal atribuído ao ticket
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

  // 5. Caso padrão para clientes / solicitantes
  return 'end_user';
}

export interface ParsedChatMessage {
  id: string | number;
  author_name: string;
  author_role: 'agent' | 'end_user' | 'system';
  created_at: string;
  body: string;
  is_public: boolean;
}

export function parseZendeskChatTranscript(
  rawBody: string,
  options: {
    parentDate?: string;
    parentId?: string | number;
    agentName?: string;
    isPublic?: boolean;
  } = {}
): ParsedChatMessage[] {
  if (!rawBody || typeof rawBody !== 'string') return [];

  const {
    parentDate = new Date().toISOString(),
    parentId = 'chat',
    agentName = '',
    isPublic = true
  } = options;

  const chatLineRegex = /^(?:(?:\(|\[)(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\)\]]\s*([^:\n]+?)|([^:\n\(\[]+?)\s*(?:\(|\[)(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AP]M)?)[\)\]]):\s*(.*)$/;

  const lines = rawBody.replace(/\r\n/g, '\n').split('\n');
  const messages: ParsedChatMessage[] = [];
  let currentMsg: {
    time: string;
    author: string;
    bodyLines: string[];
  } | null = null;

  const baseDate = parentDate.slice(0, 10);

  function finalizeCurrent() {
    if (!currentMsg) return;
    const body = currentMsg.bodyLines.join('\n').trim();
    if (body) {
      const role = determineParticipantRole(currentMsg.author, agentName);

      let isoTime = parentDate;
      if (currentMsg.time) {
        let timeStr = currentMsg.time.trim();
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
          timeStr += ':00';
        }
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

export function sanitizeMessageBody(rawBody: string): string {
  if (!rawBody || typeof rawBody !== 'string') return '';

  let text = rawBody;

  // Normaliza quebras de linha primeiro
  text = text.replace(/\r\n/g, '\n');

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

  // 5. Compactação inteligente de logs e stack traces técnicos volumosos
  // (Previne estourar cota de tokens e elimina timeouts da IA em chamados com dumps extensos de erro)
  if (text.length > 1200) {
    const hasHeavyLog = /(?:\[FireDAC\]|Traceback|Exception in thread|CREATE TABLE|ALTER TABLE|SELECT\s+.*?FROM|INSERT\s+INTO)/i.test(text);
    if (hasHeavyLog) {
      const head = text.slice(0, 450);
      const tail = text.slice(-350);
      text = `${head}\n\n[...trecho técnico intermediário de log/stack trace resumido para agilizar avaliação...]\n\n${tail}`;
    }
  }

  // 6. Remove excesso de espaços em branco e quebras consecutivas
  text = text
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text;
}

export function sanitizeDialogue(
  messages: Array<{ author_role?: string; author_name?: string; body?: string; created_at?: string; is_public?: boolean }>,
  agentName?: string
): string {
  if (!messages || !Array.isArray(messages)) return '';

  // Expande comentários de chat se houver algum bloco não decomposto
  const expandedMessages: Array<{ author_role?: string; author_name?: string; body?: string }> = [];

  for (const m of messages) {
    const body = m.body || '';
    if (isChatTranscript(body)) {
      const parsed = parseZendeskChatTranscript(body, {
        parentDate: m.created_at,
        agentName,
        isPublic: m.is_public !== false
      });
      if (parsed.length > 0) {
        expandedMessages.push(...parsed);
        continue;
      }
    }
    expandedMessages.push(m);
  }

  return expandedMessages
    .map(m => {
      const author = (m.author_name || '').trim();
      const isBot = m.author_role === 'system' || author.toLowerCase().includes('ia webposto');
      const isAgent = m.author_role === 'agent' && !isBot;
      const isClient = m.author_role === 'end_user' && !isBot;

      let roleLabel = 'SISTEMA';
      if (isBot) {
        roleLabel = 'BOT - IA webPosto';
      } else if (isAgent) {
        roleLabel = author ? `ATENDENTE: ${author}` : 'ATENDENTE';
      } else if (isClient) {
        roleLabel = author ? `CLIENTE: ${author}` : 'CLIENTE';
      }

      const cleanBody = sanitizeMessageBody(m.body || '');
      if (!cleanBody) return null;
      return `[${roleLabel}] ${cleanBody}`;
    })
    .filter(Boolean)
    .join('\n\n');
}
