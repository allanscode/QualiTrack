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
  // Worker via CDN oficial do pdfjs, compatível com a versão instalada.
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.mjs`;

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
      .upload(path, params.file, { contentType: params.file.type || 'application/pdf' });

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
