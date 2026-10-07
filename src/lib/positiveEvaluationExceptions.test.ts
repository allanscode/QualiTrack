import { describe,expect,it } from 'vitest';
import type { EvaluationForm,Monitoria } from '../types';
import { getPositiveEvaluationExceptions } from './positiveEvaluationExceptions';

const form={id:'form',sections:[{questions:[{id:'critical-question',text:'Procedimento obrigatório',is_critical:true},{id:'regular',text:'Critério normal'}]}],critical_errors:[{id:'critical-error',text:'Erro independente'}]} as EvaluationForm;
const saved=(id:string,score:number,extra:Partial<Monitoria>={}):Monitoria=>({id,ticket_id:id,score,satisfaction_result:'Positiva',form_id:'form',answers:{},created_at:'2026-10-07T12:00:00Z',...extra} as Monitoria);

describe('positive CSAT exceptions in saved monitorias',()=>{
  it('respects the strict75 boundary, excludes inactive/nonpositive/invalid rows and deduplicates monitoria IDs',()=>{
    const rows=[saved('zero',0),saved('low',74.99),saved('limit',75),saved('great',100),saved('inactive',30,{active:false}),
      saved('negative',0,{satisfaction_result:'Negativa'}),saved('empty',0,{satisfaction_result:'Sem pesquisa'}),saved('invalid',NaN),saved('below-zero',-1),saved('low',74.99)];
    expect(getPositiveEvaluationExceptions(rows,[form],[],'below_threshold').map(row=>row.monitoria.id).sort()).toEqual(['low','zero']);
  });
  it('counts criticalzero only with recorded evidence, including standalone, section and savedAI flags',()=>{
    const aiForm={...form,ai_evaluation:{suggested_critical_errors:{'critical-error':true},suggested_observations:{'critical-error':'Trecho comprovado'}}};
    const rows=[saved('selected',0,{selected_critical_errors:['critical-error']}),saved('question',0,{answers:{'critical-question':'NAO'}}),
      saved('ai',0,{form_snapshot:aiForm}),saved('unrelated',0,{answers:{regular:'NAO'}}),saved('notzero',50,{selected_critical_errors:['critical-error']})];
    const exceptions=getPositiveEvaluationExceptions(rows,[form],[],'critical_zero');
    expect(exceptions.map(row=>row.monitoria.id).sort()).toEqual(['ai','question','selected']);
    expect(exceptions.find(row=>row.monitoria.id==='ai')?.criticalReasons).toEqual([{id:'critical-error',label:'Erro independente',observation:'Trecho comprovado'}]);
  });
  it('uses the frozen form instead of later rubric changes and does not treat falseAI flags as evidence',()=>{
    const historical={...form,sections:[{...form.sections[0],questions:[{...form.sections[0].questions[0],is_critical:false}]}],ai_evaluation:{suggested_critical_errors:{'critical-error':false}}};
    const rows=[saved('historical',0,{form_snapshot:historical,answers:{'critical-question':'NAO'}})];
    expect(getPositiveEvaluationExceptions(rows,[form],[],'critical_zero')).toEqual([]);
  });
  it('does not admit AI draft-shaped records even when their result is zero',()=>{
    const drafts=Array.from({length:5},(_,index)=>({id:`draft-${index}`,ticket_id:`18000${index}`,source_queue:'positivas',
      result:{score:0,suggested_critical_errors:{'critical-error':true}}})) as unknown as Monitoria[];
    expect(getPositiveEvaluationExceptions(drafts,[form],[],'below_threshold')).toEqual([]);
    expect(getPositiveEvaluationExceptions(drafts,[form],[],'critical_zero')).toEqual([]);
  });
});
