import { describe, it, expect } from 'vitest';
import {
  resolveCustomerType,
  resolveFormAndGuidelineForCustomerType
} from '../lib/helpdeskQueue';
import type { EvaluationForm, AIEvaluationGuideline } from '../types';

describe('Zendesk Organization / Customer Type Resolution', () => {
  const mockForms: EvaluationForm[] = [
    {
      id: 'form-cliente-final',
      title: 'Monitoria cliente final',
      description: 'Ficha para clientes finais',
      team_id: 'team-1',
      active: true,
      createdBy: 'admin',
      created_at: new Date().toISOString(),
      sections: []
    },
    {
      id: 'form-revenda',
      title: 'Ficha de Monitoria Revenda',
      description: 'Ficha para revendedores e parceiros',
      team_id: 'team-1',
      active: true,
      createdBy: 'admin',
      created_at: new Date().toISOString(),
      sections: []
    }
  ];

  const mockGuidelines: AIEvaluationGuideline[] = [
    {
      id: 'guide-cliente-final',
      title: 'Manual de atendimento Webposto Cliente Final',
      content: 'Regras de empatia e procedimentos para cliente final.',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    },
    {
      id: 'guide-revenda',
      title: 'Manual de atendimento Webposto Revenda',
      content: 'Regras de procedimentos técnicos para revenda.',
      active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  ];

  describe('resolveCustomerType', () => {
    it('should identify cliente_final from ticket tags', () => {
      expect(resolveCustomerType(['cliente_final'], [])).toBe('cliente_final');
      expect(resolveCustomerType(['CLIENTE_FINAL', 'suporte'], [])).toBe('cliente_final');
      expect(resolveCustomerType(['cliente-final'], [])).toBe('cliente_final');
    });

    it('should identify cliente_final from organization tags', () => {
      expect(resolveCustomerType(['pdv'], ['cliente_final'])).toBe('cliente_final');
    });

    it('should identify revenda from tags', () => {
      expect(resolveCustomerType(['revenda'], [])).toBe('revenda');
      expect(resolveCustomerType([], ['parceiro_revenda'])).toBe('revenda');
    });

    it('should default to cliente_final when no specific tag matches', () => {
      expect(resolveCustomerType(['nfe_erro'], ['posto_ipiranga'])).toBe('cliente_final');
      expect(resolveCustomerType([], [])).toBe('cliente_final');
    });
  });

  describe('resolveFormAndGuidelineForCustomerType', () => {
    it('should automatically resolve Form and Manual for cliente_final', () => {
      const result = resolveFormAndGuidelineForCustomerType('cliente_final', mockForms, mockGuidelines);
      expect(result.form?.id).toBe('form-cliente-final');
      expect(result.form?.title).toBe('Monitoria cliente final');
      expect(result.guideline?.id).toBe('guide-cliente-final');
      expect(result.guideline?.title).toBe('Manual de atendimento Webposto Cliente Final');
    });

    it('should automatically resolve Form and Manual for revenda', () => {
      const result = resolveFormAndGuidelineForCustomerType('revenda', mockForms, mockGuidelines);
      expect(result.form?.id).toBe('form-revenda');
      expect(result.form?.title).toBe('Ficha de Monitoria Revenda');
      expect(result.guideline?.id).toBe('guide-revenda');
      expect(result.guideline?.title).toBe('Manual de atendimento Webposto Revenda');
    });

    it('should safely fallback to first active item if titles do not match pattern', () => {
      const genericForms: EvaluationForm[] = [
        {
          id: 'generic-form',
          title: 'Formulário Geral',
          description: '',
          team_id: 'team-1',
          active: true,
          createdBy: 'admin',
          created_at: new Date().toISOString(),
          sections: []
        }
      ];
      const genericGuides: AIEvaluationGuideline[] = [
        {
          id: 'generic-guide',
          title: 'Guia Básico',
          content: '',
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];

      const result = resolveFormAndGuidelineForCustomerType('cliente_final', genericForms, genericGuides);
      expect(result.form?.id).toBe('generic-form');
      expect(result.guideline?.id).toBe('generic-guide');
    });
  });
});
