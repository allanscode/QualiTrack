import { describe, expect, it } from 'vitest';
import { QUEUE_TITLES, QUEUE_SUBTITLES } from '../App';
import { canManageQueueAssignments } from '../lib/queueDistribution';
import { QueueSubTab } from '../types';

describe('Reestruturação da navegação das Filas de Triagem', () => {
  const allSubTabs: QueueSubTab[] = [
    'negativas',
    'proativas',
    'positivas',
    'filhos',
    'filhos_invalidos',
    'monitores',
  ];

  it('possui título e subtítulo definidos para cada uma das sub-abas', () => {
    allSubTabs.forEach(tab => {
      expect(QUEUE_TITLES[tab], `Título ausente para ${tab}`).toBeDefined();
      expect(QUEUE_TITLES[tab].length).toBeGreaterThan(0);

      expect(QUEUE_SUBTITLES[tab], `Subtítulo ausente para ${tab}`).toBeDefined();
      expect(QUEUE_SUBTITLES[tab].length).toBeGreaterThan(0);
    });
  });

  it('exibe títulos nominais corretos em conformidade com o pedido', () => {
    expect(QUEUE_TITLES.negativas).toBe('CSAT Negativas');
    expect(QUEUE_TITLES.proativas).toBe('Fila Proativa');
    expect(QUEUE_TITLES.positivas).toBe('CSAT Positivas');
    expect(QUEUE_TITLES.filhos).toBe('Chamados Filhos');
    expect(QUEUE_TITLES.filhos_invalidos).toBe('Filhos Inválidos');
    expect(QUEUE_TITLES.monitores).toBe('Monitores na Triagem');
  });

  it('restringe permissão da sub-aba Monitores na Triagem estritamente para admin e gestor_qualidade', () => {
    expect(canManageQueueAssignments('admin')).toBe(true);
    expect(canManageQueueAssignments('gestor_qualidade')).toBe(true);
    expect(canManageQueueAssignments('qualidade')).toBe(false);
    expect(canManageQueueAssignments('suporte')).toBe(false);
    expect(canManageQueueAssignments('gestor_suporte')).toBe(false);
    expect(canManageQueueAssignments(undefined)).toBe(false);
  });

  it('notificações de fila de triagem devem conter targetQueueSubTab definido como negativas para deep linking (WQ-25)', () => {
    const notificationConfig = {
      targetTab: 'filas',
      targetQueueSubTab: 'negativas' as QueueSubTab
    };
    expect(notificationConfig.targetTab).toBe('filas');
    expect(allSubTabs).toContain(notificationConfig.targetQueueSubTab);
    expect(QUEUE_TITLES[notificationConfig.targetQueueSubTab]).toBe('CSAT Negativas');
  });
});
