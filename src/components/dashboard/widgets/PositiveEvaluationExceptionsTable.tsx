import { useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, ExternalLink, Search } from 'lucide-react';
import type { EvaluationForm, Monitoria, User } from '../../../types';
import { getPositiveEvaluationExceptions, type PositiveExceptionKind } from '../../../lib/positiveEvaluationExceptions';
import { getStatusConfig } from '../../../lib/statusHelper';
import { formatTicketDateTime } from '../../../lib/ticketDateTime';
import { DashboardTile } from '../DashboardTileLayout';
import Card from '../../ui/Card';
import Badge from '../../ui/Badge';
import Button from '../../ui/Button';

type Props={monitorias:Monitoria[];forms:EvaluationForm[];users:User[];kind:PositiveExceptionKind;profile:'admin'|'gestor_qualidade';isCustomizing?:boolean};
const previewForm={id:'positive-preview',sections:[],critical_errors:[{id:'failure',text:'Descumprimento de procedimento obrigatório'}]} as unknown as EvaluationForm;
const previewRows=[
  {id:'example-1',ticket_id:'180001',evaluated_name:'Agente exemplo A',score:60,satisfaction_result:'Positiva',status:'pendente_revisao',created_at:'2026-10-07T12:00:00Z'},
  {id:'example-2',ticket_id:'180002',evaluated_name:'Agente exemplo B',score:0,satisfaction_result:'Positiva',status:'em_contestacao',created_at:'2026-10-07T11:00:00Z',selected_critical_errors:['failure'],form_snapshot:previewForm},
] as unknown as Monitoria[];

export default function PositiveEvaluationExceptionsTable({monitorias,forms,users,kind,profile,isCustomizing=false}:Props) {
  const [search,setSearch]=useState('');
  const [page,setPage]=useState(0);
  const critical=kind==='critical_zero';
  const title=critical?'CSAT positivo · zero por erro crítico':'CSAT positivo · nota abaixo de 75%';
  const rows=useMemo(()=>getPositiveEvaluationExceptions(isCustomizing?previewRows:monitorias,isCustomizing?[previewForm]:forms,users,kind),[isCustomizing,monitorias,forms,users,kind]);
  const query=search.trim().toLocaleLowerCase('pt-BR');
  const filtered=rows.filter(row=>!query || [row.monitoria.ticket_id,row.agentName,...row.criticalReasons.map(reason=>reason.label)]
    .some(value=>value?.toLocaleLowerCase('pt-BR').includes(query)));
  const pages=Math.max(1,Math.ceil(filtered.length/10));
  const currentPage=Math.min(page,pages-1);
  const visible=filtered.slice(currentPage*10,currentPage*10+10);
  const tickets=new Set(filtered.map(row=>row.monitoria.ticket_id?.trim()).filter(Boolean)).size;
  const Icon=critical?AlertOctagon:AlertTriangle;

  return <DashboardTile type={critical?'PositiveCriticalZeroTable':'PositiveLowScoreTable'} title={title} profile={profile}>
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <Icon className={`size-5 shrink-0 ${critical?'text-functional-error':'text-functional-warning'}`} aria-hidden="true" />
          <div><h3 className="text-sm font-black text-brand-primary">{title}</h3>
            <p className="text-xs text-brand-muted">{isCustomizing?'Prévia ilustrativa · ':''}{tickets} {tickets===1?'ticket':'tickets'} · {filtered.length} {filtered.length===1?'monitoria salva':'monitorias salvas'} nos filtros atuais</p></div>
        </div>
        <label className="relative w-full sm:w-56"><span className="sr-only">{critical?'Buscar positiva zerada':'Buscar positiva abaixo de 75%'}</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
          <input value={search} onChange={event=>{setSearch(event.target.value);setPage(0);}} placeholder="Ticket, agente ou erro"
            className="h-9 w-full rounded-lg border border-surface-border bg-surface-card pl-9 pr-3 text-sm text-brand-primary placeholder:text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent" />
        </label>
      </div>
      <p className="px-5 py-2 text-xs text-brand-muted sm:hidden">Deslize a tabela para ver os detalhes da monitoria.</p>
      <div className="max-h-[520px] overflow-auto custom-scrollbar">
        <table className="w-full min-w-[760px] text-left text-xs" aria-label={title}>
          <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
            {['Ticket / Agente','Nota','Erro crítico registrado','Situação','Criada em','Ação'].map(label=><th scope="col" key={label} className="px-4 py-3 font-bold">{label}</th>)}
          </tr></thead>
          <tbody>{visible.map(row=>{
            const monitoria=row.monitoria;
            const status=getStatusConfig(monitoria.status);
            return <tr key={monitoria.id} className="border-t border-surface-border align-top hover:bg-surface-subtle">
              <th scope="row" className="px-4 py-3 font-semibold text-brand-primary">#{monitoria.ticket_id || 'Sem ticket'}<span className="mt-1 block font-normal text-brand-muted">{row.agentName}</span></th>
              <td className="px-4 py-3 font-bold tabular-nums text-functional-error">{monitoria.score.toLocaleString('pt-BR',{maximumFractionDigits:2})}%</td>
              <td className="min-w-56 max-w-80 px-4 py-3 text-brand-primary">{row.criticalReasons.length
                ? <ul className="space-y-2">{row.criticalReasons.map(reason=><li key={reason.id}>{reason.label}{reason.observation&&<span className="mt-1 block line-clamp-3 text-brand-muted" title={reason.observation}>{reason.observation}</span>}</li>)}</ul>
                : <span className="text-brand-muted">Sem erro crítico registrado</span>}</td>
              <td className="px-4 py-3"><Badge variant={status.variant} size="xs">{status.label}</Badge></td>
              <td className="whitespace-nowrap px-4 py-3 text-brand-muted">{formatTicketDateTime(monitoria.created_at)}</td>
              <td className="px-4 py-3"><Button size="sm" variant="outline" disabled={isCustomizing}
                aria-label={`Ver monitoria do ticket ${monitoria.ticket_id}`}
                onClick={()=>window.dispatchEvent(new CustomEvent('qualitrack:focus_monitoria',{detail:{monitoriaId:monitoria.id,ticketId:monitoria.ticket_id}}))}
                icon={<ExternalLink className="size-3.5" />}>Ver monitoria</Button></td>
            </tr>;
          })}</tbody>
        </table>
        {!visible.length&&<p className="px-5 py-8 text-center text-sm text-brand-muted">{critical?'Nenhuma positiva zerada por erro crítico encontrada.':'Nenhuma positiva com nota abaixo de 75% encontrada.'}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-border px-5 py-3">
        <p className="max-w-2xl text-xs text-brand-muted">{critical?'Subconjunto do painel abaixo de 75%: nota zero com erro crítico registrado.':'Pesquisa do cliente positiva com nota da monitoria inferior a 75%.'} Somente fichas salvas; rascunhos de IA não entram.</p>
        {pages>1&&<div className="flex items-center gap-2 text-xs text-brand-muted">
          <Button size="sm" variant="ghost" disabled={currentPage===0} onClick={()=>setPage(currentPage-1)}>Anterior</Button>
          <span aria-live="polite">{currentPage+1} / {pages}</span>
          <Button size="sm" variant="ghost" disabled={currentPage===pages-1} onClick={()=>setPage(currentPage+1)}>Próxima</Button>
        </div>}
      </div>
    </Card>
  </DashboardTile>;
}
