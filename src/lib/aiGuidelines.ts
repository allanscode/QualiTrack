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

/** Extensões de arquivo de texto puro aceitas além do PDF (lidas via File.text()). */
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

export async function fetchAIGuidelines(): Promise<AIEvaluationGuideline[]> {
  if (isMockMode || !supabase) return [];

  const { data, error } = await supabase
    .from('ai_evaluation_guidelines')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[AIGuidelines] Erro ao carregar manuais:', error.message);
    return [];
  }

  return (data || []) as AIEvaluationGuideline[];
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
 * Edita título e/ou conteúdo de um manual já cadastrado — útil pra ajustar
 * ou complementar o texto de contexto sem precisar recriar o registro (e
 * sem precisar reenviar o PDF, que fica como está).
 */
export async function updateAIGuideline(id: string, params: { title: string; content: string }): Promise<void> {
  if (isMockMode || !supabase) {
    throw new Error('Não é possível editar manuais em modo mock/offline.');
  }
  const { error } = await supabase
    .from('ai_evaluation_guidelines')
    .update({ title: params.title, content: params.content })
    .eq('id', id);
  if (error) throw new Error(`Falha ao editar o manual: ${error.message}`);
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
