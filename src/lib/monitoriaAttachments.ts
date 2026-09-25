import { supabase, isMockMode } from './supabase';
import type { ActionAttachment } from '../types';

export const ATTACHMENTS_BUCKET = 'monitoria-attachments';
export const MAX_ATTACHMENT_SIZE_BYTES = 15 * 1024 * 1024; // 15MB

export const ALLOWED_ATTACHMENT_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'audio/mpeg',
  'audio/wav',
  'audio/ogg',
];

export function validateAttachmentFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    return { valid: false, error: 'O arquivo excede o limite máximo permitido de 15MB.' };
  }
  if (ALLOWED_ATTACHMENT_MIME_TYPES.length > 0 && !ALLOWED_ATTACHMENT_MIME_TYPES.includes(file.type)) {
    // Permite tipos comuns mesmo se o SO não inferir mime type perfeitamente
    const ext = file.name.split('.').pop()?.toLowerCase();
    const commonExtensions = ['png', 'jpg', 'jpeg', 'webp', 'pdf', 'txt', 'docx', 'mp3', 'wav', 'ogg'];
    if (!ext || !commonExtensions.includes(ext)) {
      return { valid: false, error: 'Formato de arquivo não suportado. Formatos aceitos: imagens, PDF, DOCX, TXT e áudio.' };
    }
  }
  return { valid: true };
}

/**
 * Faz upload de um anexo para o bucket privado `monitoria-attachments`.
 * Em modo mock/dev sem supabase, simula o upload criando um registro local.
 */
export async function uploadActionAttachment(
  file: File,
  monitoriaId: string
): Promise<ActionAttachment> {
  const validation = validateAttachmentFile(file);
  if (!validation.valid) {
    throw new Error(validation.error || 'Arquivo inválido.');
  }

  const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `monitorias/${monitoriaId}/${Date.now()}-${cleanName}`;

  if (isMockMode || !supabase) {
    return {
      name: file.name,
      path,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
      uploaded_at: new Date().toISOString(),
      url: URL.createObjectURL(file),
    };
  }

  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(path, file, { upsert: false });

  if (uploadError) {
    console.error('[Attachments] Erro no upload:', uploadError);
    throw new Error(`Falha ao fazer upload do anexo: ${uploadError.message}`);
  }

  return {
    name: file.name,
    path,
    size: file.size,
    mime_type: file.type || 'application/octet-stream',
    uploaded_at: new Date().toISOString(),
  };
}

/**
 * Gera URL assinada de curta duração (5 minutos) para download seguro do anexo privado.
 */
export async function getAttachmentDownloadUrl(path: string): Promise<string> {
  if (isMockMode || !supabase) {
    return '#demo-attachment';
  }

  const { data, error } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .createSignedUrl(path, 300); // 300 segundos = 5 minutos

  if (error || !data?.signedUrl) {
    console.error('[Attachments] Erro ao criar URL assinada:', error);
    throw new Error('Não foi possível gerar link para download do anexo.');
  }

  return data.signedUrl;
}
