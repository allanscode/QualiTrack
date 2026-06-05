import React, { useState } from 'react';
import Card from '../../ui/Card';
import { motion, AnimatePresence } from 'motion/react';
import { Pencil } from 'lucide-react';
import { useDashboard } from '../DashboardContext';
import { useQualityConfig } from '../../../lib/useQualityConfig';
import { toast } from 'sonner';

interface StatCardProps {
  title: string;
  value: string | number;
  sub: React.ReactNode;
  good: boolean;
  icon: React.ReactNode;
  accent: string;
  onClick?: () => void;
  badge?: React.ReactNode;
}

const BG_MAP: Record<string, string> = {
  'text-functional-error': 'bg-functional-error',
  'text-functional-warning': 'bg-functional-warning',
  'text-functional-success': 'bg-functional-success',
  'text-brand-accent': 'bg-icon-accent',
  'text-brand-highlight': 'bg-icon-highlight',
  'text-brand-muted': 'bg-slate-100 dark:bg-white/[0.04]',
  'text-brand-primary': 'bg-icon-primary',
  'text-info': 'bg-slate-100 dark:bg-white/[0.04]',
  'text-warning': 'bg-functional-warning',
  'text-success': 'bg-functional-success',
  'text-slate-400': 'bg-slate-100 dark:bg-white/[0.04]',
  'text-slate-500': 'bg-slate-100 dark:bg-white/[0.04]',
};

function getIconBg(accent: string): string {
  if (BG_MAP[accent]) return BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    return accent.replace('text-level-', 'bg-level-');
  }
  return 'bg-slate-100 dark:bg-white/[0.04]';
}

export default function StatCard({ title, value, sub, icon, accent, onClick, badge }: StatCardProps) {
  const { config, saveConfig } = useQualityConfig();
  
  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {
    // Fail-safe if used outside of DashboardProvider
  }
  const user = dashboardContext?.user;

  const iconBg = getIconBg(accent);
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const isAdmin = dashboardContext?.loggedInUser?.role === 'admin' || user?.role === 'admin';
  const isEditable = typeof sub === 'string' || sub === undefined || sub === null;
  const customSub = (isEditable && config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
    ? config.statCardExplanations[title]
    : sub;

  const myUniqueId = `stat-card-${title}`;
  const isEditing = dashboardContext?.activeEditingId === myUniqueId;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    dashboardContext?.setActiveEditingId(myUniqueId);
    setIsHovered(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        [title]: tempSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição updated successfully!');
      dashboardContext?.setActiveEditingId(null);
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  if (isEditing) {
    return (
      <Card padding="none" className="px-5 py-4 flex flex-col justify-between min-h-[135px] border-brand-accent/50 bg-surface-card shadow-lg animate-fade-in relative z-50">
        <div className="flex flex-col h-full gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Editar Descrição: {title}
          </span>
          <textarea
            value={tempSub}
            onChange={(e) => setTempSub(e.target.value.slice(0, 35))}
            maxLength={35}
            className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none h-12"
            placeholder="Digite a descrição da métrica (máx. 35 caracteres)..."
            autoFocus
          />
          <div className="text-[10px] text-brand-muted text-right -mt-1">
            {tempSub.length}/35
          </div>
          <div className="flex justify-end gap-1.5 mt-auto">
            <button
              type="button"
              onClick={() => dashboardContext?.setActiveEditingId(null)}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md text-brand-muted hover:bg-surface-subtle transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-md bg-brand-accent text-white hover:bg-brand-accent/90 transition-colors cursor-pointer"
            >
              Salvar
            </button>
          </div>
        </div>
      </Card>
    );
  }

  const clonedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon as React.ReactElement<any>, {
        className: 'w-5 h-5 fill-current fill-opacity-15',
        strokeWidth: 2,
        fill: 'currentColor',
        fillOpacity: 0.15,
      })
    : icon;

  return (
    <Card onClick={onClick} padding="none" className="px-5 py-4 flex flex-col justify-between min-h-[100px] relative z-10 hover:z-30 transition-all duration-200">
      <div className="flex items-center gap-3 mb-3 min-w-0">
        <div
          onClick={isAdmin && isEditable ? handleEditClick : undefined}
          className={`relative w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 ${accent} ${
            isAdmin && isEditable 
              ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' 
              : 'cursor-help'
          }`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          title=""
        >
          {clonedIcon}
          <AnimatePresence>
            {isHovered && customSub && (
              <motion.div
                initial={{ opacity: 0, y: -8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -8, scale: 0.95 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
              >
                {customSub}{isAdmin && isEditable ? " (Clique para editar)" : ""}
                {/* Subtle upward pointing arrow */}
                <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <div className="min-w-0 flex-1">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate block" title="">
            {title}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 mt-auto">
        <p className="text-3xl font-black leading-none text-slate-900 dark:text-slate-50">
          {value}
        </p>
        {badge}
      </div>
    </Card>
  );
}
