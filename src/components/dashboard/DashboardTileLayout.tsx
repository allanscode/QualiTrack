import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ComponentType, ReactNode } from 'react';
import { ArrowDown, ArrowUp, EyeOff, GripVertical } from 'lucide-react';
import { DashboardStateContext } from './DashboardContext';
import { useQualityConfig } from '../../lib/useQualityConfig';
import { DASHBOARD_WIDGETS, orderedWidgets, widgetId } from '../../lib/dashboardLayout';
import type { DashboardRole, DashboardWidgetDefinition, DashboardWidgetType } from '../../lib/dashboardLayout';
import type { DashboardLayoutEditor } from '../../hooks/useDashboardLayoutEditor';

interface LayoutContextValue {
  role: DashboardRole;
  slots: Record<string, HTMLDivElement>;
  registerSlot: (id: string, node: HTMLDivElement | null) => void;
}

const LayoutContext = createContext<LayoutContextValue | null>(null);

function Slot({ item, index, count, registerSlot, editor }: {
  item: DashboardWidgetDefinition;
  index: number;
  count: number;
  registerSlot: LayoutContextValue['registerSlot'];
  editor?: DashboardLayoutEditor;
}) {
  const ref = useCallback((node: HTMLDivElement | null) => registerSlot(item.id, node), [item.id, registerSlot]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [dropTarget, setDropTarget] = useState(false);

  useEffect(() => {
    if (!editor || !rootRef.current) return;
    const node = rootRef.current;
    const onDragStart = (event: DragEvent) => {
      if (editor.saving || (event.target instanceof Element && event.target.closest('button, a, input, select, textarea, [contenteditable="true"]'))) {
        event.preventDefault();
        return;
      }
      event.dataTransfer?.setData('text/plain', item.id);
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
      editor.setDraggedId(item.id);
    };
    const onDragOver = (event: DragEvent) => {
      if (editor.saving || !editor.draggedId || editor.draggedId === item.id) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
      setDropTarget(true);
    };
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget instanceof Node && node.contains(event.relatedTarget)) return;
      setDropTarget(false);
    };
    const onDrop = (event: DragEvent) => {
      const sourceId = event.dataTransfer?.getData('text/plain') || editor.draggedId;
      if (sourceId && sourceId !== item.id) {
        event.preventDefault();
        editor.reorder(sourceId, item.id);
      }
      setDropTarget(false);
      editor.setDraggedId(null);
    };
    const onDragEnd = () => { setDropTarget(false); editor.setDraggedId(null); };
    node.addEventListener('dragstart', onDragStart);
    node.addEventListener('dragover', onDragOver);
    node.addEventListener('dragleave', onDragLeave);
    node.addEventListener('drop', onDrop);
    node.addEventListener('dragend', onDragEnd);
    return () => {
      node.removeEventListener('dragstart', onDragStart);
      node.removeEventListener('dragover', onDragOver);
      node.removeEventListener('dragleave', onDragLeave);
      node.removeEventListener('drop', onDrop);
      node.removeEventListener('dragend', onDragEnd);
    };
  }, [editor, item.id]);

  const autoHeight = item.type === 'RecentAuditsTable' || item.type === 'FeedbacksWidget'
    || item.type === 'QualityAchievementsWidget' || item.type === 'NegativeCallsTrainingAlert';
  const kind = item.type === 'StatCard' ? 'card' : autoHeight ? 'auto' : 'chart';
  const compactChart = item.type === 'DistributionChart'
    || (item.type === 'CustomChart' && ['Distribuição por Equipe', 'Curva de Qualidade'].includes(item.title));
  const wide = item.type === 'TrendChart' || item.type === 'OfensoresChart' || item.type === 'ComparativeBarChart'
    || autoHeight;
  return (
    <div
      ref={rootRef}
      data-dashboard-slot={item.id}
      data-dashboard-kind={kind}
      data-dashboard-wide={wide ? 'true' : undefined}
      data-dashboard-compact={compactChart ? 'true' : undefined}
      draggable={Boolean(editor && !editor.saving)}
      className={`min-w-0 flex flex-col ${editor ? 'rounded-2xl transition-shadow cursor-grab active:cursor-grabbing' : ''} ${dropTarget ? 'ring-2 ring-brand-accent ring-offset-2 ring-offset-surface-bg' : ''} ${editor?.draggedId === item.id ? 'opacity-45' : ''}`}
    >
      {editor && (
        <div className="mb-2 flex min-h-9 items-center gap-1 rounded-xl border border-surface-border bg-surface-card px-2 text-brand-muted shadow-sm">
          <GripVertical className="size-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-brand-primary" title={item.title}>{item.title}</span>
          <button type="button" disabled={editor.saving || index === 0} onClick={() => editor.move(item.id, -1)} aria-label={`Mover ${item.title} para cima na prévia`} title="Mover para cima" className="rounded-lg p-1.5 hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><ArrowUp className="size-4" /></button>
          <button type="button" disabled={editor.saving || index === count - 1} onClick={() => editor.move(item.id, 1)} aria-label={`Mover ${item.title} para baixo na prévia`} title="Mover para baixo" className="rounded-lg p-1.5 hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><ArrowDown className="size-4" /></button>
          <button type="button" disabled={editor.saving} onClick={() => editor.remove(item.id)} aria-label={`Remover ${item.title} da prévia`} title="Remover da visão deste cargo" className="rounded-lg p-1.5 text-functional-error hover:bg-functional-error/10 focus-visible:ring-2 focus-visible:ring-brand-accent disabled:opacity-30"><EyeOff className="size-4" /></button>
        </div>
      )}
      <div ref={ref} className="min-h-0 flex-1" />
    </div>
  );
}

export function DashboardTileLayout({ role, children, editor }: { role: DashboardRole; children: ReactNode; editor?: DashboardLayoutEditor }) {
  const { config } = useQualityConfig();
  const layout = config.dashboardLayouts?.[role];
  const [slots, setSlots] = useState<Record<string, HTMLDivElement>>({});
  const registerSlot = useCallback((id: string, node: HTMLDivElement | null) => {
    setSlots(current => {
      if (node === current[id]) return current;
      if (!node && !current[id]) return current;
      const next = { ...current };
      if (node) next[id] = node;
      else delete next[id];
      return next;
    });
  }, []);
  const context = useMemo(() => ({ role, slots, registerSlot }), [role, slots, registerSlot]);
  const visibleWidgets = editor?.visible || orderedWidgets(role, layout).filter(item => !layout?.hidden?.includes(item.id));

  return (
    <LayoutContext value={context}>
      <div className="dashboard-tile-container">
        <div className={`dashboard-tile-grid ${editor ? 'dashboard-tile-grid--editing' : ''}`} aria-label="Indicadores do dashboard">
          {visibleWidgets.map((item, index) => <Slot key={item.id} item={item} index={index} count={visibleWidgets.length} registerSlot={registerSlot} editor={editor} />)}
        </div>
      </div>
      <div className="dashboard-tile-source">{children}</div>
    </LayoutContext>
  );
}

interface TileProps {
  title?: string;
  profile?: string;
}

export function DashboardTile({ type, title, profile, children }: TileProps & { type: DashboardWidgetType; title: string; children: ReactNode }) {
    const layoutContext = useContext(LayoutContext);
    const dashboardState = useContext(DashboardStateContext);
    const { config } = useQualityConfig();
    const role = layoutContext?.role || (profile as DashboardRole | undefined) || dashboardState?.dashboardRole;
    const id = widgetId(type, title);
    if (role && config.dashboardLayouts?.[role]?.hidden?.includes(id)) return null;
    if (layoutContext && DASHBOARD_WIDGETS[layoutContext.role].some(item => item.id === id)) {
      const slot = layoutContext.slots[id];
      return slot ? createPortal(<div data-dashboard-tile-content className="h-full min-h-0">{children}</div>, slot) : null;
    }
    return children;
}

export function withDashboardTile<P extends TileProps>(Component: ComponentType<P>, type: DashboardWidgetType, defaultTitle?: string) {
  function DashboardTileComponent(props: P) {
    return (
      <DashboardTile type={type} title={props.title || defaultTitle || ''} profile={props.profile}>
        {createElement(Component, props)}
      </DashboardTile>
    );
  }
  DashboardTileComponent.displayName = `DashboardTile(${Component.displayName || Component.name})`;
  return DashboardTileComponent;
}
