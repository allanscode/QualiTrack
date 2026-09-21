import { supabase, isMockMode } from './supabase';
import { AIEvaluationGuideline } from '../types';

export const AI_GUIDELINES_BUCKET = 'ai-guidelines';

/**
 * Extrai o texto de um PDF inteiramente no navegador (pdfjs), sem enviar o
 * binário para nenhum servidor. É esse texto que efetivamente alimenta o
 * prompt da IA — a Edge Function nunca lê o PDF em si.
 */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  // Worker empacotado localmente pelo Vite (?url vira um asset same-origin)
  // — o CSP do site restringe worker-src a 'self' e blob:, então um worker
  // carregado de CDN externo (cdnjs etc.) é bloqueado silenciosamente pelo
  // navegador, e getDocument() falha com "Falha ao ler o arquivo".
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

  const buffer = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buffer }).promise;

  const pages: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
    pages.push(pageText);
  }

  return pages.join('\n\n').trim();
}

/** Extensões de arquivo de texto puro aceitas (.md, .txt, etc.). */
export const PLAIN_TEXT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv'];

export function isPlainTextFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return PLAIN_TEXT_EXTENSIONS.some(ext => name.endsWith(ext))
    || file.type.startsWith('text/');
}

/** Lê um arquivo de texto puro (.txt, .md, .csv etc.) diretamente como string. */
export async function extractPlainText(file: File): Promise<string> {
  return (await file.text()).trim();
}

/** Extensões aceitas para documentos do Word. */
export const DOCX_EXTENSIONS = ['.docx'];

export function isDocxFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return DOCX_EXTENSIONS.some(ext => name.endsWith(ext))
    || file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

/** Extrai texto formatado em Markdown a partir de um documento Word (.docx) no navegador. */
export async function extractDocxText(file: File): Promise<string> {
  const mammothModule = await import('mammoth');
  const mammoth = (mammothModule as any).default || mammothModule;
  const buffer = await file.arrayBuffer();
  const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer });
  return (result.value || '').trim();
}

/** Verifica se o arquivo é suportado para manuais (.md, .docx, .pdf, .txt, .markdown). */
export function isSupportedGuidelineFile(file: File): boolean {
  const name = file.name.toLowerCase();
  return file.type === 'application/pdf'
    || name.endsWith('.pdf')
    || isDocxFile(file)
    || isPlainTextFile(file);
}

/** Extrai o conteúdo formatado em texto/Markdown de qualquer arquivo suportado (.md, .docx, .pdf, .txt). */
export async function extractGuidelineFileContent(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (file.type === 'application/pdf' || name.endsWith('.pdf')) {
    return await extractPdfText(file);
  }
  if (isDocxFile(file)) {
    return await extractDocxText(file);
  }
  if (isPlainTextFile(file)) {
    return await extractPlainText(file);
  }
  throw new Error('Formato não suportado. Por favor, envie um arquivo .md, .docx, .pdf ou .txt.');
}

export const DEFAULT_CHILD_TICKET_GUIDELINE: AIEvaluationGuideline = {
  id: 'guideline-child-tickets-pop-v1',
  title: 'Manual de Chamados Filhos — POP v1.1',
  content: `# Manual Operacional de Chamados Filhos — POP v1.1

## 1. Visão Geral e Objetivo
Este manual normatiza a criação e governança de chamados filhos (Side Conversations) abertos a partir de tickets do Zendesk na operação WebPosto. A conformidade de abertura é auditada automaticamente pelo QualiTrack através de 4 critérios mandatórios.

## 2. Os 4 Tipos de Chamados Filhos (Macros Homologadas)
1. **Nova Demanda (Geral / Mais Pagamentos):**
   - Utilizado para reportar bugs, novas funcionalidades ou solicitações de melhoria para a fábrica de software.
   - Direcionamento: O campo "Para" deve ser atribuído a **si mesmo** (ao próprio analista solicitante) para acompanhamento da resolução.
   - Tags obrigatórias: \`existe_ticket_filho\`, \`existe_nova_demanda\` (ou \`maispag_nova_demanda\`).

2. **Enviar para Análise Técnica (N2 / Fábrica):**
   - Utilizado para escalonamento técnico em segundo nível (Cliente Final, Revenda, Fiscal, Contábil, Correções, Desenvolvimento).
   - Direcionamento: O campo "Para" deve ser direcionado ao **Grupo Especialista correspondente** (ex: "Análise Técnica Fiscal", "Análise Técnica Revenda", etc.).
   - Regra estrita: **NUNCA** pode ser atribuído a uma pessoa física/analista específico.
   - Tags obrigatórias: \`transferencia_analise\` ou variantes por setor (\`transferencia_analise_fiscal\`, etc.).

3. **Apoio Análise Técnica:**
   - Utilizado quando é solicitada consultoria ou apoio pontual de um especialista técnico N2 sem transferir a titularidade do chamado.
   - Direcionamento: O campo "Para" deve ser atribuído **nominalmente ao Analista Técnico N2** que prestou a consultoria.

4. **Produtividade:**
   - Utilizado para registro de atividades internas, homologações ou tarefas complementares de suporte.
   - Tags: \`filho_produtividade\`, \`produtividade\`.

## 3. As 4 Regras de Ouro da Auditoria de Qualidade
- **Regra 1: Preservação do Assunto (Inalterabilidade):**
  O assunto gerado pela macro não pode ser descaracterizado. O prefixo "Ticket " e o número do ticket pai (ex: "Nova Demanda do #169238" ou "Ticket Nova Demanda do #169238") são totalmente válidos e conformes. Apenas reprova se houver texto livre desconexo da macro.
- **Regra 2: Preservação do Texto da Macro com Enriquecimento:**
  O texto-base da macro deve ser mantido e enriquecido obrigatoriamente com dados técnicos (versão, logs, AnyDesk, descrição da falha e testes já realizados).
- **Regra 3: Direcionamento Correto ("Para"):**
  Conformidade entre o tipo de macro e o destino (Grupo técnico para Análise Técnica; Próprio Analista para Nova Demanda; Analista N2 para Apoio Técnico).
- **Regra 4: Governança de Tags:**
  Preservação das tags injetadas pela automação para correto funcionamento dos relatórios e gatilhos do Zendesk.
`,
  file_name: 'Manual_Chamados_Filhos_POP_v1.1.md',
  file_path: '',
  active: true,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-18T00:00:00Z',
};

export async function fetchAIGuidelines(): Promise<AIEvaluationGuideline[]> {
  if (isMockMode || !supabase) return [DEFAULT_CHILD_TICKET_GUIDELINE];

  const { data, error } = await supabase
    .from('ai_evaluation_guidelines')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[AIGuidelines] Erro ao carregar manuais:', error.message);
    return [DEFAULT_CHILD_TICKET_GUIDELINE];
  }

  const list = (data || []) as AIEvaluationGuideline[];
  const hasChildGuideline = list.some(g =>
    g.title?.toLowerCase().includes('filho') || g.id === DEFAULT_CHILD_TICKET_GUIDELINE.id
  );

  if (!hasChildGuideline) {
    return [DEFAULT_CHILD_TICKET_GUIDELINE, ...list];
  }

  return list;
}

export async function saveAIGuideline(params: {
  title: string;
  content: string;
  file?: File;
  createdBy?: string;
}): Promise<AIEvaluationGuideline> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível salvar manuais em modo mock/offline.');
  }

  let file_path: string | undefined;
  let file_name: string | undefined;

  if (params.file) {
    const ext = params.file.name.split('.').pop() || 'pdf';
    const path = `${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await supabase.storage
      .from(AI_GUIDELINES_BUCKET)
      .upload(path, params.file, { contentType: params.file.type || 'text/plain' });

    if (uploadError) {
      throw new Error(`Falha ao enviar o PDF: ${uploadError.message}`);
    }

    file_path = path;
    file_name = params.file.name;
  }

  const { data, error } = await supabase
    .from('ai_evaluation_guidelines')
    .insert({
      title: params.title,
      content: params.content,
      file_path,
      file_name,
      active: true,
      created_by: params.createdBy,
    })
    .select('*')
    .single();

  if (error) {
    throw new Error(`Falha ao salvar o manual: ${error.message}`);
  }

  return data as AIEvaluationGuideline;
}

/**
 * Edita diretamente um manual (usado quando o próprio Administrador faz a alteração).
 * Registra a versão anterior no histórico para rastreabilidade completa.
 */
export async function updateAIGuideline(
  id: string,
  params: { title: string; content: string },
  guideline?: AIEvaluationGuideline,
  user?: { id?: string; name?: string; role?: string }
): Promise<void> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível editar manuais em modo mock/offline.');
  }

  const currentVersion = guideline?.version || 1;
  const currentHistory = guideline?.history || [];

  const newHistoryEntry = guideline ? [{
    version: currentVersion,
    title: guideline.title,
    content: guideline.content,
    modified_by_id: user?.id,
    modified_by_name: user?.name || 'Administrador',
    modified_by_role: user?.role || 'admin',
    created_at: new Date().toISOString(),
    status: 'approved' as const
  }, ...currentHistory] : currentHistory;

  const { error } = await supabase
    .from('ai_evaluation_guidelines')
    .update({
      title: params.title,
      content: params.content,
      version: currentVersion + 1,
      status: 'approved',
      history: newHistoryEntry,
      pending_title: null,
      pending_content: null,
      pending_modified_by_name: null,
      pending_modified_by_role: null,
      pending_modified_at: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) throw new Error(`Falha ao editar o manual: ${error.message}`);
}

/**
 * Submete proposta de alteração (usado por Monitores ou Gestores de Qualidade).
 * Mantém o manual oficial ativo inalterado para a IA e coloca a proposta como 'pending_approval'
 * para verificação pelo Administrador.
 */
export async function proposeGuidelineUpdate(
  guideline: AIEvaluationGuideline,
  params: { title: string; content: string },
  user: { id?: string; name?: string; role?: string }
): Promise<void> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível propor alterações em modo mock/offline.');
  }

  const currentHistory = guideline.history || [];
  const proposedVersion = (guideline.version || 1) + 1;

  const pendingHistoryEntry = {
    version: proposedVersion,
    title: params.title,
    content: params.content,
    modified_by_id: user.id,
    modified_by_name: user.name || 'Monitor de Qualidade',
    modified_by_role: user.role || 'qualidade',
    created_at: new Date().toISOString(),
    status: 'pending_approval' as const
  };

  const { error } = await supabase
    .from('ai_evaluation_guidelines')
    .update({
      status: 'pending_approval',
      pending_title: params.title,
      pending_content: params.content,
      pending_modified_by_name: user.name || 'Monitor de Qualidade',
      pending_modified_by_role: user.role || 'qualidade',
      pending_modified_at: new Date().toISOString(),
      history: [pendingHistoryEntry, ...currentHistory],
      updated_at: new Date().toISOString()
    })
    .eq('id', guideline.id);

  if (error) throw new Error(`Falha ao submeter proposta de alteração: ${error.message}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qualitrack:guideline_event', {
        detail: {
          type: 'proposed',
          guidelineId: guideline.id,
          title: params.title || guideline.title,
          proposerName: user.name || 'Monitor de Qualidade',
          proposerRole: user.role || 'qualidade',
          version: proposedVersion,
          timestamp: pendingHistoryEntry.created_at
        }
      })
    );
  }
}

/**
 * Aprova alteração pendente (exclusivo para Administradores).
 * Promove o conteúdo proposto para o manual oficial utilizado pela IA e incrementa a versão.
 */
export async function approveGuidelineUpdate(
  guideline: AIEvaluationGuideline,
  adminUser: { id?: string; name?: string }
): Promise<void> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível aprovar alterações em modo mock/offline.');
  }

  if (!guideline.pending_content) {
    throw new Error('Não há alteração pendente para aprovação.');
  }

  const newVersion = (guideline.version || 1) + 1;
  const currentHistory = guideline.history || [];

  // Atualiza a entrada do histórico correspondente para 'approved'
  const updatedHistory = currentHistory.map(entry => {
    if (entry.status === 'pending_approval') {
      return { ...entry, status: 'approved' as const, approved_by_name: adminUser.name };
    }
    return entry;
  });

  const { error } = await supabase
    .from('ai_evaluation_guidelines')
    .update({
      title: guideline.pending_title || guideline.title,
      content: guideline.pending_content,
      version: newVersion,
      status: 'approved',
      pending_title: null,
      pending_content: null,
      pending_modified_by_name: null,
      pending_modified_by_role: null,
      pending_modified_at: null,
      history: updatedHistory,
      updated_at: new Date().toISOString()
    })
    .eq('id', guideline.id);

  if (error) throw new Error(`Falha ao aprovar alteração do manual: ${error.message}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qualitrack:guideline_event', {
        detail: {
          type: 'approved',
          guidelineId: guideline.id,
          title: guideline.pending_title || guideline.title,
          approverName: adminUser.name || 'Administrador',
          version: newVersion,
          timestamp: new Date().toISOString()
        }
      })
    );
  }
}

/**
 * Rejeita alteração pendente (exclusivo para Administradores).
 * Descarta o conteúdo proposto, mantém o manual atual ativo e registra a rejeição no histórico.
 */
export async function rejectGuidelineUpdate(
  guideline: AIEvaluationGuideline,
  reason: string = 'Alteração rejeitada pelo Administrador'
): Promise<void> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível rejeitar alterações em modo mock/offline.');
  }

  const currentHistory = guideline.history || [];
  const updatedHistory = currentHistory.map(entry => {
    if (entry.status === 'pending_approval') {
      return { ...entry, status: 'rejected' as const, rejection_reason: reason };
    }
    return entry;
  });

  const { error } = await supabase
    .from('ai_evaluation_guidelines')
    .update({
      status: 'approved',
      pending_title: null,
      pending_content: null,
      pending_modified_by_name: null,
      pending_modified_by_role: null,
      pending_modified_at: null,
      history: updatedHistory,
      updated_at: new Date().toISOString()
    })
    .eq('id', guideline.id);

  if (error) throw new Error(`Falha ao rejeitar alteração do manual: ${error.message}`);

  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('qualitrack:guideline_event', {
        detail: {
          type: 'rejected',
          guidelineId: guideline.id,
          title: guideline.title,
          reason,
          timestamp: new Date().toISOString()
        }
      })
    );
  }
}

export async function toggleAIGuidelineActive(id: string, active: boolean): Promise<void> {
  if (isMockMode || !supabase) return;
  const { error } = await supabase.from('ai_evaluation_guidelines').update({ active }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteAIGuideline(guideline: AIEvaluationGuideline): Promise<void> {
  if (isMockMode || !supabase) return;

  if (guideline.file_path) {
    await supabase.storage.from(AI_GUIDELINES_BUCKET).remove([guideline.file_path]);
  }

  const { error } = await supabase.from('ai_evaluation_guidelines').delete().eq('id', guideline.id);
  if (error) throw new Error(error.message);
}

export async function downloadAIGuidelineFile(filePath: string): Promise<string> {
  if (isMockMode || !supabase) throw new Error('Indisponível em modo mock/offline.');
  const { data, error } = await supabase.storage.from(AI_GUIDELINES_BUCKET).createSignedUrl(filePath, 60);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Falha ao gerar link de download.');
  return data.signedUrl;
}
