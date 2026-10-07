import { describe, expect, it } from 'vitest';
import { childViewConditionsWithAuditExclusion, hasPublishedChildMacro, hasPublishedChildMacroForMonitoria, hasPublishedInvalidChildMacro } from './child-view';

describe('exclusão de filhos avaliados na view do Zendesk', () => {
  it('preserva as condições existentes e acrescenta a exclusão em all', () => {
    const view = { conditions: {
      all: [{ field: 'status', operator: 'is', value: 'solved' }],
      any: [{ field: 'current_tags', operator: 'includes', value: 'ticket_filho' }],
    } };
    const next = childViewConditionsWithAuditExclusion(view);
    expect(next?.all).toEqual([
      view.conditions.all[0],
      { field: 'current_tags', operator: 'not_includes', value: 'qwp_filho_avaliado' },
    ]);
    expect(next?.any).toEqual(view.conditions.any);
    expect(view.conditions.all).toHaveLength(1);
  });

  it('não altera uma view que já exclui a tag', () => {
    expect(childViewConditionsWithAuditExclusion({ conditions: {
      all: [{ field: 'current_tags', operator: 'not_includes', value: 'qwp_filho_avaliado' }], any: [],
    } })).toBeNull();
  });

  it('adiciona a exclusão quando a view só tem condições em any', () => {
    expect(childViewConditionsWithAuditExclusion({ conditions: {
      all: [], any: [{ field: 'status', operator: 'is', value: 'solved' }],
    } })?.all).toEqual([
      { field: 'current_tags', operator: 'not_includes', value: 'qwp_filho_avaliado' },
    ]);
  });

  it('reconhece a macro antiga para não postar outro comentário', () => {
    expect(hasPublishedChildMacro([{ body: 'Outro comentário' }, { body: '[QualidadeWP · Chamado filho VÁLIDO]\n\nParecer' }])).toBe(true);
    expect(hasPublishedChildMacro([{ body: 'Outro comentário' }])).toBe(false);
  });

  it('distingue a nota válida da monitoria atual do antigo parecer inválido', () => {
    const invalid = { body: '[QualidadeWP · Chamado filho INVÁLIDO]\n\nParecer antigo' };
    const current = { body: '[QualidadeWP · Chamado filho VÁLIDO]\n\nRegistro do Auditor da monitoria #m1:\nRetificação' };
    expect(hasPublishedInvalidChildMacro([invalid])).toBe(true);
    expect(hasPublishedChildMacroForMonitoria([invalid], 'm1')).toBe(false);
    expect(hasPublishedChildMacroForMonitoria([invalid, current], 'm1')).toBe(true);
    expect(hasPublishedChildMacroForMonitoria([invalid, current], 'm2')).toBe(false);
  });
});
