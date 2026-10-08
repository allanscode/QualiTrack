import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPositiveAutomation, mergePositiveAutomation, positiveAutomationLabel, type PositiveAutomationItem } from './positiveAutomation';

vi.mock('./supabase',()=>({isMockMode:true,supabase:null}));
const row: PositiveAutomationItem = {
  ticket_id:'123',status:'blocked',last_error:'Confira o agente cadastrado.',
  ticket_snapshot:{ticket_id:'123',subject:'Positiva preservada',status:'closed',ticket_date:'2026-10-07',csat_status:'good'},
};

describe('durable positive automation queue',()=>{
  beforeEach(()=>localStorage.clear());
  it('retains pending/blocked items in mock mode after closure and omits completed items',async()=>{
    localStorage.setItem('qualitrack-positive-ai-queue',JSON.stringify([row,{...row,ticket_id:'456',status:'completed'}]));
    expect(await fetchPositiveAutomation()).toEqual([row]);
  });
  it('restores a captured ticket even when Zendesk returns no rows',()=>{
    expect(mergePositiveAutomation([], [row],new Set())).toEqual([expect.objectContaining({ticket_id:'123',status:'closed',
      positive_automation:{status:'blocked',last_error:'Confira o agente cadastrado.'}})]);
  });
  it('deduplicates a live ticket and keeps its newest UI metadata',()=>{
    const live={...row.ticket_snapshot,subject:'Assunto atualizado',positive_cap_reached:true};
    const result=mergePositiveAutomation([live],[row],new Set());
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({subject:'Assunto atualizado',positive_cap_reached:true,positive_automation:{status:'blocked'}});
  });
  it('does not resurrect a saved monitoria and drops completed automation after polling',()=>{
    expect(mergePositiveAutomation([], [row],new Set(['123']))).toEqual([]);
    const previous=mergePositiveAutomation([], [row],new Set());
    expect(mergePositiveAutomation(previous,[],new Set())).toEqual([]);
  });
  it('honors search and labels pending without inventing a low score',()=>{
    expect(mergePositiveAutomation([], [row],new Set(),'outro')).toEqual([]);
    expect(mergePositiveAutomation([], [row],new Set(),'preservada')).toHaveLength(1);
    expect(positiveAutomationLabel('blocked')).toBe('Automação aguardando conferência');
    expect(positiveAutomationLabel('pending')).toBe('Salvo · aguardando IA');
  });
  it('keeps child intake separate and restores a closed child review',async()=>{
    localStorage.setItem('qualitrack-child-ai-queue',JSON.stringify([row]));
    expect(await fetchPositiveAutomation()).toEqual([]);
    expect(await fetchPositiveAutomation('filhos')).toEqual([row]);
    const children=mergePositiveAutomation([], [row],new Set(),undefined,'filhos');
    expect(children[0]).toMatchObject({status:'closed',child_automation:{status:'blocked'}});
    expect(children[0].positive_automation).toBeUndefined();
    expect(mergePositiveAutomation(children,[],new Set(),undefined,'filhos')).toEqual([]);
  });
  it('keeps a child ticket awaiting review when it already has a monitoria',()=>{
    const underReview={...row.ticket_snapshot,already_audited:true,monitoria_status:'pendente_revisao' as const};
    expect(mergePositiveAutomation([underReview],[],new Set(['123']),undefined,'filhos'))
      .toEqual([underReview]);
    expect(mergePositiveAutomation([underReview],[],new Set(['123']),undefined,'positivas'))
      .toEqual([]);
  });
});
