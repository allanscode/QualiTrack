import { useMemo, useState } from 'react';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, ClipboardCheck, Search } from 'lucide-react';
import type { Monitoria, User } from '../../../types';
import { getAuditorEvaluationVolumes, sortAuditorEvaluationVolumes } from '../../../lib/auditorEvaluationVolume';
import { DashboardTile } from '../DashboardTileLayout';
import Card from '../../ui/Card';
import Button from '../../ui/Button';

type Props = { monitorias: Monitoria[]; users: User[]; profile: 'admin' | 'gestor_qualidade' | 'qualidade'; isCustomizing?: boolean };
const preview = [{id:'example-a',name:'Monitor exemplo A',manual:16,automatic:2,total:18},{id:'example-b',name:'Monitor exemplo B',manual:12,automatic:0,total:12}];

export default function AuditorEvaluationVolumeTable({ monitorias,users,profile,isCustomizing=false }: Props) {
  const [ascending,setAscending]=useState(false);
  const [search,setSearch]=useState('');
  const volumes=useMemo(()=>isCustomizing ? (profile==='qualidade' ? preview.slice(0,1) : preview)
    : getAuditorEvaluationVolumes(monitorias,users),[monitorias,users,isCustomizing,profile]);
  const total=volumes.reduce((sum,row)=>sum+row.total,0);
  const automatic=volumes.reduce((sum,row)=>sum+row.automatic,0);
  const query=search.trim().toLocaleLowerCase('pt-BR');
  const visible=sortAuditorEvaluationVolumes(volumes,ascending).map((row,index)=>({...row,position:index+1}))
    .filter(row=>!query || row.name.toLocaleLowerCase('pt-BR').includes(query));

  return <DashboardTile type="AuditorEvaluationVolumeTable" title="Monitorias por Monitor" profile={profile}>
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-surface-border px-5 py-4">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="size-5 shrink-0 text-brand-accent" aria-hidden="true" />
          <div><h3 className="text-sm font-black text-brand-primary">Monitorias por Monitor</h3>
            <p className="text-xs text-brand-muted">{isCustomizing ? 'Prévia ilustrativa · ' : ''}{total} {total===1?'monitoria criada':'monitorias criadas'} nos filtros atuais</p></div>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label className="relative min-w-0 flex-1 sm:flex-none"><span className="sr-only">Buscar monitor</span>
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-muted" aria-hidden="true" />
            <input value={search} onChange={event=>setSearch(event.target.value)} placeholder="Nome do monitor"
              className="h-9 w-full rounded-lg border border-surface-border bg-surface-card pl-9 pr-3 text-sm text-brand-primary placeholder:text-brand-muted focus-visible:ring-2 focus-visible:ring-brand-accent sm:w-44" />
          </label>
          <Button type="button" variant="outline" size="sm" onClick={()=>setAscending(value=>!value)}
            aria-label={ascending?'Ordenar monitores do maior para o menor':'Ordenar monitores do menor para o maior'}
            icon={ascending?<ArrowUpNarrowWide className="size-4" />:<ArrowDownWideNarrow className="size-4" />}>
            {ascending?'Menor primeiro':'Maior primeiro'}
          </Button>
        </div>
      </div>
      <p className="px-5 py-2 text-xs text-brand-muted sm:hidden">Deslize a tabela para ver todas as quantidades.</p>
      <div className="max-h-[420px] overflow-auto custom-scrollbar">
        <table className="w-full min-w-[480px] text-left text-xs" aria-label="Quantidade de monitorias criadas por monitor">
          <thead className="sticky top-0 z-10 bg-surface-card text-brand-muted"><tr>
            <th scope="col" className="px-4 py-3 font-bold">Posição</th>
            <th scope="col" className="px-4 py-3 font-bold">Monitor</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Manuais</th>
            <th scope="col" className="px-4 py-3 text-right font-bold">Por IA</th>
            <th scope="col" aria-sort={ascending?'ascending':'descending'} className="px-4 py-3 text-right font-bold">Total</th>
          </tr></thead>
          <tbody>{visible.map(row=><tr key={row.id} className="border-t border-surface-border hover:bg-surface-subtle">
            <td className="px-4 py-3 tabular-nums text-brand-muted">{row.position}</td>
            <th scope="row" className="break-words px-4 py-3 font-semibold text-brand-primary">{row.name}</th>
            <td className="px-4 py-3 text-right tabular-nums text-brand-primary">{row.manual}</td>
            <td className="px-4 py-3 text-right tabular-nums text-brand-primary">{row.automatic}</td>
            <td className="px-4 py-3 text-right font-bold tabular-nums text-brand-primary">{row.total}</td>
          </tr>)}</tbody>
          <tfoot className="sticky bottom-0 z-10 border-t border-surface-border bg-surface-subtle font-bold text-brand-primary"><tr>
            <th colSpan={2} scope="row" className="px-4 py-3">Total geral nos filtros</th>
            <td className="px-4 py-3 text-right tabular-nums">{total-automatic}</td>
            <td className="px-4 py-3 text-right tabular-nums">{automatic}</td>
            <td className="px-4 py-3 text-right tabular-nums">{total}</td>
          </tr></tfoot>
        </table>
        {!visible.length && <p className="px-5 py-8 text-center text-sm text-brand-muted">Nenhuma monitoria encontrada. Ajuste os filtros ou a busca.</p>}
      </div>
      <p className="border-t border-surface-border px-5 py-3 text-xs text-brand-muted">Histórico de fichas criadas, incluindo as ainda em andamento. Por IA: criação automática atribuída ao monitor responsável. O período e os filtros do dashboard se aplicam. A busca por nome mantém o total geral.</p>
    </Card>
  </DashboardTile>;
}
