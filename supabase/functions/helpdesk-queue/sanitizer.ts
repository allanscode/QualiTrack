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

export type ZendeskParticipantRole = 'agent' | 'end_user' | 'system';

function displayTranscriptSpeakerName(name: string): string {
  return name.trim().replace(/\s+carregou\s*$/iu, '').replace(/\s+/g, ' ');
}

export function normalizeTranscriptSpeakerName(name: string): string {
  // Zendesk Chat appends an upload action to the speaker on attachment lines.
  return displayTranscriptSpeakerName(name).toLocaleLowerCase('pt-BR');
}

export function zendeskParticipantRole(role: unknown): ZendeskParticipantRole | null {
  if (role === 'agent' || role === 'admin') return 'agent';
  if (role === 'end-user' || role === 'end_user' || role === 'user') return 'end_user';
  if (role === 'bot' || role === 'system') return 'system';
  return null;
}

export function buildZendeskParticipantRoles(
  users: Array<{ name?: string; role?: string }>,
): Map<string, ZendeskParticipantRole | null> {
  const roles = new Map<string, ZendeskParticipantRole | null>();
  for (const user of users) {
    const name = normalizeTranscriptSpeakerName(user.name || '');
    const role = zendeskParticipantRole(user.role);
    if (!name || !role) continue;
    if (roles.has(name) && roles.get(name) !== role) roles.set(name, null);
    else if (!roles.has(name)) roles.set(name, role);
  }
  return roles;
}

export interface ParsedChatMessage {
  id: string | number;
  author_name: string;
  author_role: 'unknown';
  created_at: string;
  body: string;
  is_public: boolean;
}

export function classifyTranscriptMessage(
  message: ParsedChatMessage,
  roles: Map<string, ZendeskParticipantRole | null>,
): Omit<ParsedChatMessage, 'author_role'> & { author_role: ZendeskParticipantRole | 'unknown' } {
  return {
    ...message,
    author_role: roles.get(normalizeTranscriptSpeakerName(message.author_name)) || 'unknown',
  };
}

export function parseZendeskChatTranscript(
  rawBody: string,
  options: {
    parentDate?: string;
    parentId?: string | number;
    isPublic?: boolean;
  } = {}
): ParsedChatMessage[] {
  if (!rawBody || typeof rawBody !== 'string') return [];

  const {
    parentDate = '',
    parentId = 'chat',
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
      let isoTime = parentDate;
      if (currentMsg.time) {
        let timeStr = currentMsg.time.trim();
        if (/^\d{1,2}:\d{2}$/.test(timeStr)) {
          timeStr += ':00';
        }
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
      const author = displayTranscriptSpeakerName(match[2] || match[3] || '');
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

  // Redige identificadores e segredos que não são necessários para avaliar
  // qualidade. O texto original continua apenas no Zendesk.
  text = text.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[E-MAIL]');
  text = text.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]');
  text = text.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]');
  text = text.replace(/\b(?:\+?55\s*)?\(?\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, '[TELEFONE]');
  text = text.replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');
  text = text.replace(/\b(senha|password|token|api[_ -]?key|chave de acesso)\s*[:=]\s*\S+/gi, '$1: [SEGREDO]');
  text = text.replace(/([?&](?:token|api[_-]?key|password|senha|secret)=)[^&#\s]+/gi, '$1[SEGREDO]');

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
): string {
  if (!messages || !Array.isArray(messages)) return '';

  // Expande comentários de chat se houver algum bloco não decomposto
  const expandedMessages: Array<{ author_role?: string; author_name?: string; body?: string; is_public?: boolean }> = [];

  for (const m of messages) {
    const body = m.body || '';
    if (isChatTranscript(body)) {
      const parsed = parseZendeskChatTranscript(body, {
        parentDate: m.created_at,
        isPublic: m.is_public !== false
      });
      if (parsed.length > 0) {
        expandedMessages.push(...parsed);
        continue;
      }
    }
    expandedMessages.push(m);
  }

  const participantAliases = new Map<string, string>();
  const participantCounts = new Map<string, number>();
  return expandedMessages
    .map(m => {
      const author = (m.author_name || '').trim();
      const role = m.is_public === false ? 'NOTA INTERNA'
        : m.author_role === 'agent' || m.author_role === 'admin' ? 'ATENDENTE'
        : m.author_role === 'end_user' ? 'CLIENTE'
        : m.author_role === 'system' ? 'SISTEMA' : 'PARTICIPANTE';
      const aliasKey = `${role}:${normalizeTranscriptSpeakerName(author)}`;
      if (!participantAliases.has(aliasKey)) {
        const next = (participantCounts.get(role) || 0) + 1;
        participantCounts.set(role, next);
        participantAliases.set(aliasKey, `${role} ${next}`);
      }
      const roleLabel = role === 'SISTEMA' ? 'SISTEMA' : participantAliases.get(aliasKey)!;

      const cleanBody = sanitizeMessageBody(m.body || '');
      if (!cleanBody) return null;
      return `[${roleLabel}] ${cleanBody}`;
    })
    .filter(Boolean)
    .join('\n\n');
}
