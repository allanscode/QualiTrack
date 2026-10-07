import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Monitoria } from '../../../types';
import { DASHBOARD_WIDGETS } from '../../../lib/dashboardLayout';
import AuditorEvaluationVolumeTable from './AuditorEvaluationVolumeTable';

vi.mock('../DashboardTileLayout',()=>({DashboardTile:({children}:{children:React.ReactNode})=>children}));
const data=[
  {id:'1',evaluator_id:'ana',evaluator_name:'Ana',score:0},
  {id:'2',evaluator_id:'bruno',evaluator_name:'Bruno',score:50},
  {id:'3',evaluator_id:'bruno',evaluator_name:'Bruno',form_snapshot:{automation:'positive_csat'}},
] as Monitoria[];

describe('AuditorEvaluationVolumeTable',()=>{
  it('shows historical production with AI creation separate and reversible count ordering',()=>{
    render(<AuditorEvaluationVolumeTable monitorias={data} users={[]} profile="admin" />);
    const table=screen.getByRole('table',{name:'Quantidade de monitorias criadas por monitor'});
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Bruno');
    expect(within(screen.getByRole('row',{name:/Bruno/})).getAllByRole('cell').map(cell=>cell.textContent)).toEqual(['1','1','1','2']);
    fireEvent.click(screen.getByRole('button',{name:'Ordenar monitores do menor para o maior'}));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Ana');
    expect(screen.getByText('3 monitorias criadas nos filtros atuais')).toBeInTheDocument();
  });
  it('retains the total during name search and recomputes it when dashboard-filtered records change',()=>{
    const {rerender}=render(<AuditorEvaluationVolumeTable monitorias={data} users={[]} profile="gestor_qualidade" />);
    fireEvent.change(screen.getByRole('textbox',{name:'Buscar monitor'}),{target:{value:'Ana'}});
    expect(screen.queryByText('Bruno')).not.toBeInTheDocument();
    expect(within(screen.getByRole('row',{name:/Total geral nos filtros/})).getAllByRole('cell').at(-1)).toHaveTextContent('3');
    rerender(<AuditorEvaluationVolumeTable monitorias={[data[0]]} users={[]} profile="gestor_qualidade" />);
    expect(screen.getByText('1 monitoria criada nos filtros atuais')).toBeInTheDocument();
  });
  it('has an empty state and never registers evaluator identity for support dashboards',()=>{
    render(<AuditorEvaluationVolumeTable monitorias={[]} users={[]} profile="qualidade" />);
    expect(screen.getByText(/Nenhuma monitoria encontrada/)).toBeInTheDocument();
    for (const role of ['suporte','gestor_suporte'] as const) {
      expect(DASHBOARD_WIDGETS[role].some(widget=>widget.type==='AuditorEvaluationVolumeTable')).toBe(false);
    }
    for (const role of ['qualidade','gestor_qualidade','admin'] as const) {
      expect(DASHBOARD_WIDGETS[role].some(widget=>widget.type==='AuditorEvaluationVolumeTable')).toBe(true);
    }
  });
});
