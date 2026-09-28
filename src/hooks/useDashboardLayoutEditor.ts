import { useState } from 'react';
import { toast } from 'sonner';
import { useQualityConfig } from '../lib/useQualityConfig';
import { orderedWidgets } from '../lib/dashboardLayout';
import type { DashboardRole, DashboardRoleLayout } from '../lib/dashboardLayout';

export function useDashboardLayoutEditor(role: DashboardRole) {
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
    if (saving || layout.hidden.includes(id)) return;
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

  return {
    role, layout, visible, hidden, hiddenActions, saving, draggedId, setDraggedId,
    remove, add, reorder, move, resetOrder, toggleAction,
  };
}

export type DashboardLayoutEditor = ReturnType<typeof useDashboardLayoutEditor>;
