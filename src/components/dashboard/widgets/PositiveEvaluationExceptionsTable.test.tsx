import { fireEvent,render,screen,within } from '@testing-library/react';
import { describe,expect,it,vi } from 'vitest';
import type { Monitoria,EvaluationForm } from '../../../types';
import { DASHBOARD_WIDGETS } from '../../../lib/dashboardLayout';
import PositiveEvaluationExceptionsTable from './PositiveEvaluationExceptionsTable';

vi.mock('../DashboardTileLayout',()=>({DashboardTile:({children}:{children:React.ReactNode})=>children}));
const form={id:'form',sections:[],critical_errors:[{id:'error',text:'Procedimento obrigatório descumprido'}]} as unknown as EvaluationForm;
const low={id:'saved-low',ticket_id:'123',evaluated_name:'Ana',score:60,satisfaction_result:'Positiva',status:'pendente_revisao',created_at:'2026-10-07T12:00:00Z'} as Monitoria;
const zero={...low,id:'saved-zero',ticket_id:'456',evaluated_name:'Bruno',score:0,selected_critical_errors:['error'],form_snapshot:form} as Monitoria;

describe('positive exception panels',()=>{
  it('lists saved low scores and opens the existing monitoria without external publication',()=>{
    const spy=vi.fn();window.addEventListener('qualitrack:focus_monitoria',spy);
    render(<PositiveEvaluationExceptionsTable monitorias={[low,zero]} forms={[form]} users={[]} kind="below_threshold" profile="admin" />);
    expect(screen.getByText('2 tickets · 2 monitorias salvas nos filtros atuais')).toBeInTheDocument();
    expect(screen.getAllByText('Aguardando Suporte')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button',{name:'Ver monitoria do ticket 123'}));
    expect(spy.mock.calls[0][0].detail).toEqual({monitoriaId:'saved-low',ticketId:'123'});
    window.removeEventListener('qualitrack:focus_monitoria',spy);
  });
  it('separates critical zero from unrelated zero and searches by critical reason',()=>{
    render(<PositiveEvaluationExceptionsTable monitorias={[low,zero,{...low,id:'unrelated',ticket_id:'789',score:0}]} forms={[form]} users={[]} kind="critical_zero" profile="gestor_qualidade" />);
    expect(screen.getByText('1 ticket · 1 monitoria salva nos filtros atuais')).toBeInTheDocument();
    expect(screen.queryByText('#789')).not.toBeInTheDocument();
    expect(screen.getByText('Procedimento obrigatório descumprido')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar positiva zerada'}),{target:{value:'outro'}});
    expect(screen.getByText('Nenhuma positiva zerada por erro crítico encontrada.')).toBeInTheDocument();
  });
  it('paginates and recomputes when filtered dashboard records change; catalog restricts both panels',()=>{
    const many=Array.from({length:11},(_,index)=>({...low,id:`id-${index}`,ticket_id:`18${index}`}));
    const {rerender}=render(<PositiveEvaluationExceptionsTable monitorias={many} forms={[]} users={[]} kind="below_threshold" profile="admin" />);
    const table=screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button',{name:'Próxima'}));
    expect(within(table).getAllByRole('row')).toHaveLength(2);
    rerender(<PositiveEvaluationExceptionsTable monitorias={[]} forms={[]} users={[]} kind="below_threshold" profile="admin" />);
    expect(screen.getByText('Nenhuma positiva com nota abaixo de 75% encontrada.')).toBeInTheDocument();
    for (const role of ['admin','gestor_qualidade'] as const) expect(DASHBOARD_WIDGETS[role].filter(widget=>widget.type.startsWith('Positive')).length).toBe(2);
    for (const role of ['qualidade','suporte','gestor_suporte'] as const) expect(DASHBOARD_WIDGETS[role].some(widget=>widget.type.startsWith('Positive'))).toBe(false);
  });
});
