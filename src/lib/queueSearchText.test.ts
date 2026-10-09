import { describe, expect, it } from 'vitest';
import { matchesQueueSearchText } from './queueSearchText';

describe('busca textual da fila', () => {
  const ticket = { ticket_id: '181956', subject: 'Demonstrativo de Resultados', agent_name: 'Átila Lima Pereira' };

  it('mantém na tela o ticket encontrado pelo nome do agente sem exigir acentos', () => {
    expect(matchesQueueSearchText(ticket, 'atila lima')).toBe(true);
    expect(matchesQueueSearchText(ticket, '  ÁTILA   LIMA  ')).toBe(true);
    expect(matchesQueueSearchText(ticket, 'outro agente')).toBe(false);
  });
});
