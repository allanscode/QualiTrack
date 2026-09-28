import { useState } from 'react';
import { ArrowDown, ArrowUp, GripVertical, Plus, RotateCcw, EyeOff, LayoutGrid, FileText, BrainCircuit } from 'lucide-react';
import { toast } from 'sonner';
import { useQualityConfig } from '../../lib/useQualityConfig';
import { orderedWidgets } from '../../lib/dashboardLayout';
import type { DashboardRole, DashboardRoleLayout, DashboardWidgetDefinition } from '../../lib/dashboardLayout';

const ACTIONS = [
  { id: 'root_cause', label: 'Diagnóstico de Causa Raiz', icon: BrainCircuit },
  { id: 'executive_report', label: 'Relatório Executivo (PDF)', icon: FileText },
] as const;

function categoryLabel(item: DashboardWidgetDefinition): string {
  return item.category === 'card' ? 'Card' : item.category === 'table' ? 'Tabela' : 'Gráfico';
}

export default function DashboardLayoutControls({ role }: { role: DashboardRole }) {
  const { config, saveConfig } = useQualityConfig();
  const [saving, setSaving] = useState(false);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const layout: DashboardRoleLayout = config.dashboardLayouts?.[role] || { hidden: [], order: [] };
  const ordered = orderedWidgets(role, layout);
  const visible = ordered.filter(item => !layout.hidden.includes(item.id));
  const hidden = ordered.filter(item => layout.hidden.includes(item.id));
  const hiddenActions = config.dashboardHiddenActions?.[role] || [];

  const persistLayout = async (next: DashboardRoleLayout, message: string) => {
    setSaving(true);
    try {
      await saveConfig({ ...config, dashboardLayouts: { ...config.dashboardLayouts, [role]: next } });
      toast.success(message);
    } catch {
      toast.error('Não foi possível salvar a disposição. Tente novamente.');
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: string) => {
    if (saving) return;
    void persistLayout({ ...layout, hidden: [...layout.hidden, id] }, 'Item removido da visão deste cargo.');
  };

  const add = (id: string) => {
    if (saving) return;
    void persistLayout({ ...layout, hidden: layout.hidden.filter(item => item !== id) }, 'Item adicionado à visão deste cargo.');
  };

  const reorder = (sourceId: string, targetId: string) => {
    if (saving || sourceId === targetId) return;
    const ids = visible.map(item => item.id);
    const source = ids.indexOf(sourceId);
    const target = ids.indexOf(targetId);
    if (source < 0 || target < 0) return;
    ids.splice(source, 1);
    ids.splice(target, 0, sourceId);
    void persistLayout({ ...layout, order: [...ids, ...hidden.map(item => item.id)] }, 'Posição atualizada para este cargo.');
  };

  const move = (id: string, direction: -1 | 1) => {
    const index = visible.findIndex(item => item.id === id);
    const neighbor = visible[index + direction];
    if (neighbor) reorder(id, neighbor.id);
  };

  const resetOrder = () => {
    if (saving) return;
    void persistLayout({ ...layout, order: [] }, 'Ordem original restaurada.');
  };

  const toggleAction = async (id: string) => {
    if (saving) return;
    const next = hiddenActions.includes(id)
      ? hiddenActions.filter(action => action !== id)
      : [...hiddenActions, id];
    setSaving(true);
    try {
      await saveConfig({ ...config, dashboardHiddenActions: { ...config.dashboardHiddenActions, [role]: next } });
      toast.success(next.includes(id) ? 'Botão ocultado neste cargo.' : 'Botão exibido neste cargo.');
    } catch {
      toast.error('Não foi possível salvar a visibilidade do botão.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(280px,1fr)]">
        <section className="rounded-2xl border border-surface-border bg-surface-card p-4 sm:p-5 shadow-premium" aria-labelledby="visible-widgets-title">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="visible-widgets-title" className="text-sm font-black text-brand-primary">Na visão deste cargo</h2>
              <p className="mt-1 text-xs text-brand-muted">Arraste para mudar a posição ou use as setas. A prévia abaixo acompanha a ordem salva.</p>
            </div>
            {layout.order.length > 0 && (
              <button type="button" disabled={saving} onClick={resetOrder} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-brand-muted hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50">
                <RotateCcw className="size-4" /> Restaurar ordem
              </button>
            )}
          </div>
          <ol className="space-y-2">
            {visible.map((item, index) => (
              <li
                key={item.id}
                draggable={!saving}
                onDragStart={event => { event.dataTransfer.effectAllowed = 'move'; setDraggedId(item.id); }}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={event => event.preventDefault()}
                onDrop={event => { event.preventDefault(); if (draggedId) reorder(draggedId, item.id); setDraggedId(null); }}
                className={`flex items-center gap-2 rounded-xl border px-2.5 py-2 transition-colors ${draggedId === item.id ? 'border-brand-accent bg-brand-accent/10' : 'border-surface-border bg-surface-bg'}`}
              >
                <GripVertical className="size-4 shrink-0 text-brand-muted" aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold text-brand-primary" title={item.title}>{item.title}</span>
                <span className="hidden shrink-0 text-[10px] font-bold text-brand-muted sm:inline">{categoryLabel(item)}</span>
                <button type="button" disabled={saving || index === 0} onClick={() => move(item.id, -1)} aria-label={`Mover ${item.title} para cima`} className="rounded-lg p-1.5 text-brand-muted hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><ArrowUp className="size-4" /></button>
                <button type="button" disabled={saving || index === visible.length - 1} onClick={() => move(item.id, 1)} aria-label={`Mover ${item.title} para baixo`} className="rounded-lg p-1.5 text-brand-muted hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><ArrowDown className="size-4" /></button>
                <button type="button" disabled={saving} onClick={() => remove(item.id)} aria-label={`Remover ${item.title}`} className="rounded-lg p-1.5 text-functional-error hover:bg-functional-error/10 focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><EyeOff className="size-4" /></button>
              </li>
            ))}
          </ol>
          {visible.length === 0 && <p className="rounded-xl bg-surface-subtle p-4 text-xs text-brand-muted">Nenhum item visível. Use “Adicionar” para montar esta visão.</p>}
        </section>

        <div className="space-y-4">
          <section className="rounded-2xl border border-surface-border bg-surface-card p-4 sm:p-5 shadow-premium" aria-labelledby="available-widgets-title">
            <h2 id="available-widgets-title" className="text-sm font-black text-brand-primary">Disponíveis para adicionar</h2>
            <p className="mt-1 mb-4 text-xs text-brand-muted">Itens retirados da visão deste cargo.</p>
            {hidden.length === 0 ? (
              <p className="rounded-xl bg-surface-subtle p-3 text-xs text-brand-muted">Todos os cards e gráficos disponíveis estão visíveis.</p>
            ) : (
              <ul className="space-y-2">
                {hidden.map(item => (
                  <li key={item.id} className="flex items-center gap-2 rounded-xl border border-surface-border px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs font-semibold text-brand-primary" title={item.title}>{item.title}</span>
                    <button type="button" disabled={saving} onClick={() => add(item.id)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-bold text-brand-accent hover:bg-brand-accent/10 focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-50"><Plus className="size-4" /> Adicionar</button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-2xl border border-surface-border bg-surface-card p-4 sm:p-5 shadow-premium" aria-labelledby="dashboard-actions-title">
            <h2 id="dashboard-actions-title" className="flex items-center gap-2 text-sm font-black text-brand-primary"><LayoutGrid className="size-4 text-brand-accent" /> Botões do dashboard</h2>
            {role === 'suporte' ? (
              <p className="mt-3 text-xs text-brand-muted">Essas ações não estão disponíveis para o cargo de agente.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {ACTIONS.map(action => (
                  <label key={action.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-surface-border p-3">
                    <action.icon className="size-4 shrink-0 text-brand-accent" />
                    <span className="flex-1 text-xs font-semibold text-brand-primary">{action.label}</span>
                    <input type="checkbox" checked={!hiddenActions.includes(action.id)} disabled={saving} onChange={() => void toggleAction(action.id)} className="size-4 accent-[var(--color-brand-accent)]" aria-label={`Exibir ${action.label}`} />
                  </label>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
