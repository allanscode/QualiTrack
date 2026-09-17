import { describe, it, expect } from 'vitest';
import { sanitizeMessageBody, sanitizeDialogue } from '../../supabase/functions/helpdesk-queue/sanitizer';

describe('Sanitizador de Diálogos Helpdesk / Zendesk', () => {
  it('remove assinaturas e despedidas repetitivas', () => {
    const raw = `Olá João, verificamos sua solicitação e o PDV foi reiniciado com sucesso.
    
Atenciosamente,
Carlos Silva - Suporte WebPosto
Telefone: (11) 99999-9999`;

    const cleaned = sanitizeMessageBody(raw);
    expect(cleaned).toContain('PDV foi reiniciado com sucesso');
    expect(cleaned).not.toContain('Atenciosamente');
    expect(cleaned).not.toContain('Carlos Silva - Suporte');
  });

  it('remove avisos legais de confidencialidade', () => {
    const raw = `Seu chamado foi atualizado com sucesso.
    
Esta mensagem e seus anexos são confidenciais e destinados exclusivamente ao destinatário.`;

    const cleaned = sanitizeMessageBody(raw);
    expect(cleaned).toContain('Seu chamado foi atualizado com sucesso');
    expect(cleaned).not.toContain('Esta mensagem e seus anexos são confidenciais');
  });

  it('remove citações de e-mail e threads encadeadas com >', () => {
    const raw = `Entendido, vou aplicar o procedimento.
> Em qui., 17 de set. de 2026 às 10:00, Cliente <cliente@empresa.com> escreveu:
> Por favor verifiquem se a nota foi autorizada na SEFAZ.`;

    const cleaned = sanitizeMessageBody(raw);
    expect(cleaned).toContain('Entendido, vou aplicar o procedimento.');
    expect(cleaned).not.toContain('Por favor verifiquem se a nota foi autorizada');
  });

  it('remove artefatos de imagem inline', () => {
    const raw = `Segue o print do erro [image: screenshot1.png] que apareceu na tela.`;
    const cleaned = sanitizeMessageBody(raw);
    expect(cleaned).toBe('Segue o print do erro  que apareceu na tela.');
  });

  it('higieniza todo o array de mensagens e formata com papéis', () => {
    const messages = [
      { author_role: 'end_user', author_name: 'Maria', body: 'Meu fechamento de caixa travou.' },
      { author_role: 'agent', author_name: 'Lucas', body: 'Olá Maria, estou abrindo o chamado.\n\nCordialmente,\nLucas' }
    ];

    const dialogue = sanitizeDialogue(messages);
    expect(dialogue).toContain('[CLIENTE] Maria: Meu fechamento de caixa travou.');
    expect(dialogue).toContain('[ATENDENTE] Lucas: Olá Maria, estou abrindo o chamado.');
    expect(dialogue).not.toContain('Cordialmente');
  });
});
