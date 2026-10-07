import { describe, expect, it } from 'vitest';
import { getAuditorEvaluationVolumes, sortAuditorEvaluationVolumes } from './auditorEvaluationVolume';

describe('historical monitor production',()=>{
  it('counts saved records once regardless of score/status, excluding inactive rows',()=>{
    const rows=[
      {id:'a',evaluator_id:'monitor',score:0,status:'concluida'},
      {id:'a',evaluator_id:'monitor',score:0,status:'concluida'},
      {id:'b',evaluator_id:'monitor',score:null,status:'pendente_revisao'},
      {id:'c',evaluator_id:'monitor',active:false},
      {id:'',evaluator_id:'monitor'},
    ];
    expect(getAuditorEvaluationVolumes(rows,[{id:'monitor',name:'Gabriel'}])).toEqual([{id:'monitor',name:'Gabriel',manual:2,automatic:0,total:2}]);
  });
  it('preserves legacy auditor names and keeps different IDs with the same name separate',()=>{
    const result=getAuditorEvaluationVolumes([
      {id:'1',evaluator_id:'first',evaluator_name:'Ana'},
      {id:'2',evaluator_id:'second',evaluator_name:'Ana'},
      {id:'3',evaluator_name:' Antigo '},{id:'4',evaluator_name:'antigo'},{id:'5'},
    ],[]);
    expect(result).toHaveLength(4);
    expect(result.find(row=>row.id==='legacy:antigo')).toMatchObject({total:2,name:'Antigo'});
    expect(result.find(row=>row.id==='unknown')).toMatchObject({total:1});
  });
  it('uses only received filtered rows and sorts deterministic ties without changing the input',()=>{
    const values=[{id:'b',name:'Bruno',manual:2,automatic:0,total:2},{id:'a',name:'Ana',manual:2,automatic:0,total:2},{id:'c',name:'Caio',manual:1,automatic:0,total:1}];
    expect(sortAuditorEvaluationVolumes(values).map(row=>row.id)).toEqual(['a','b','c']);
    expect(sortAuditorEvaluationVolumes(values,true).map(row=>row.id)).toEqual(['c','a','b']);
    expect(values[0].id).toBe('b');
    expect(getAuditorEvaluationVolumes([{id:'visible',evaluator_id:'a'}],[{id:'a',name:'Ana'},{id:'hidden',name:'Oculto'}])).toHaveLength(1);
  });
  it('separates AI-created forms from human forms concluded automatically by SLA',()=>{
    const rows=[
      {id:'ai1',evaluator_id:'monitor',form_snapshot:{automation:'positive_csat'}},
      {id:'ai2',evaluator_id:'monitor',form_snapshot:{ai_evaluation:{automatic_positive:true}}},
      {id:'child',evaluator_id:'monitor',form_snapshot:{automation:'child_ticket'}},
      {id:'sla',evaluator_id:'monitor',resolution_type:'automatic'},
    ] as unknown as Parameters<typeof getAuditorEvaluationVolumes>[0];
    expect(getAuditorEvaluationVolumes(rows,[])[0]).toMatchObject({manual:1,automatic:3,total:4});
  });
});
