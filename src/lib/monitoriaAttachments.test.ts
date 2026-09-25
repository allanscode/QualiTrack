import { describe, it, expect } from 'vitest';
import {
  validateAttachmentFile,
  MAX_ATTACHMENT_SIZE_BYTES,
} from './monitoriaAttachments';

describe('monitoriaAttachments (WQ-22)', () => {
  it('deve aceitar arquivos válidos dentro do tamanho permitido', () => {
    const file = new File(['conteudo teste'], 'evidencia.pdf', { type: 'application/pdf' });
    const res = validateAttachmentFile(file);
    expect(res.valid).toBe(true);
    expect(res.error).toBeUndefined();
  });

  it('deve rejeitar arquivos acima de 15MB', () => {
    // Simula arquivo com tamanho maior que 15MB
    const bigFile = {
      name: 'grande.pdf',
      size: MAX_ATTACHMENT_SIZE_BYTES + 1024,
      type: 'application/pdf',
    } as unknown as File;

    const res = validateAttachmentFile(bigFile);
    expect(res.valid).toBe(false);
    expect(res.error).toContain('15MB');
  });

  it('deve aceitar formatos suportados (imagens, documentos, áudio)', () => {
    const img = new File(['img'], 'print.png', { type: 'image/png' });
    expect(validateAttachmentFile(img).valid).toBe(true);

    const doc = new File(['doc'], 'relatorio.docx', {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(validateAttachmentFile(doc).valid).toBe(true);

    const audio = new File(['audio'], 'ligacao.mp3', { type: 'audio/mpeg' });
    expect(validateAttachmentFile(audio).valid).toBe(true);
  });

  it('deve rejeitar extensões e tipos desconhecidos/perigosos', () => {
    const exe = new File(['malware'], 'setup.exe', { type: 'application/x-msdownload' });
    expect(validateAttachmentFile(exe).valid).toBe(false);
  });
});
