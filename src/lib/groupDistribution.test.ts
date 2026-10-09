import { describe, expect, it } from 'vitest';
import type { Monitoria, Team } from '../types';
import { buildGroupDistribution } from './groupDistribution';
import { DASHBOARD_WIDGETS } from './dashboardLayout';

describe('buildGroupDistribution', () => {
  it('splits one management team by the originating ticket groups', () => {
    const teams = [
      { id: 'revenda', name: 'Revenda', kind: 'team' },
      { id: 'retaguarda', name: 'Revenda - Retaguarda', kind: 'group' },
      { id: 'tecnica', name: 'Análise Técnica Revenda', kind: 'group' },
    ] as Team[];
    const monitorias = [
      { team_id: 'revenda', ticket_group_team_id: 'retaguarda' },
      { team_id: 'revenda', ticket_group_team_id: 'retaguarda' },
      { team_id: 'revenda', ticket_group_team_id: 'tecnica' },
      { team_id: 'revenda', ticket_group_team_id: 'revenda' },
      { team_id: 'revenda' },
    ] as Monitoria[];

    expect(buildGroupDistribution(monitorias, teams, ['blue', 'red', 'gray'])).toEqual([
      { name: 'Revenda - Retaguarda', value: 2, color: 'blue' },
      { name: 'Grupo não informado', value: 2, color: 'red' },
      { name: 'Análise Técnica Revenda', value: 1, color: 'gray' },
    ]);
  });
});

describe('distribution widgets by role', () => {
  it('keeps team distribution for admin and uses group distribution for individual views', () => {
    expect(DASHBOARD_WIDGETS.admin.some(widget => widget.title === 'Distribuição por Equipe')).toBe(true);
    for (const role of ['gestor_qualidade', 'gestor_suporte', 'qualidade'] as const) {
      expect(DASHBOARD_WIDGETS[role].some(widget => widget.title === 'Distribuição por Equipe')).toBe(false);
      expect(DASHBOARD_WIDGETS[role].some(widget => widget.title === 'Distribuição por Grupo')).toBe(true);
    }
  });
});
