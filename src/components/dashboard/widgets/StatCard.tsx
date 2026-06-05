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
  'text-functional-error': 'bg-functional-error/10',
  'text-functional-warning': 'bg-functional-warning/10',
  'text-functional-success': 'bg-functional-success/10',
  'text-brand-accent': 'bg-icon-accent',
  'text-brand-highlight': 'bg-icon-highlight',
  'text-brand-muted': 'bg-surface-subtle',
  'text-brand-primary': 'bg-icon-primary',
  'text-info': 'bg-surface-subtle',
  'text-warning': 'bg-functional-warning/10',
  'text-success': 'bg-functional-success/10',
  'text-slate-400': 'bg-slate-100 dark:bg-slate-800/50',
  'text-slate-500': 'bg-slate-50 dark:bg-slate-800/30',
};

function getIconBg(accent: string): string {
  if (BG_MAP[accent]) return BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    const level = accent.replace('text-level-', 'bg-level-');
    return level;
  }
  return 'bg-surface-subtle';
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
  const [isEditing, setIsEditing] = useState(false);
  const [tempSub, setTempSub] = useState('');

  const isAdmin = user?.role === 'admin';
  const isEditable = typeof sub === 'string' || sub === undefined || sub === null;
  const customSub = (isEditable && config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
    ? config.statCardExplanations[title]
    : sub;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub : '');
    setIsEditing(true);
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
      toast.success('Descrição atualizada com sucesso!');
      setIsEditing(false);
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  if (isEditing) {
    return (
      <Card padding="none" className="px-5 py-4 flex flex-col justify-between min-h-[120px] border-brand-accent/50 bg-surface-card shadow-lg animate-fade-in relative z-50">
        <div className="flex flex-col h-full gap-2" onClick={(e) => e.stopPropagation()}>
          <span className="text-[10px] font-black uppercase tracking-widest text-brand-muted">
            Editar Descrição: {title}
          </span>
          <textarea
            value={tempSub}
            onChange={(e) => setTempSub(e.target.value)}
            className="w-full text-xs p-1.5 rounded-lg border border-surface-border bg-surface-bg text-brand-primary focus:outline-none focus:ring-1 focus:ring-brand-accent resize-none h-12"
            placeholder="Digite a descrição da métrica..."
            autoFocus
          />
          <div className="flex justify-end gap-1.5 mt-auto">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
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

  return (
    <Card onClick={onClick} padding="none" className="px-5 py-4 flex flex-col justify-between min-h-[100px] relative z-10 hover:z-30 transition-all duration-200">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider truncate">
            {title}
          </span>
          {isAdmin && isEditable && (
            <button
              onClick={handleEditClick}
              className="text-slate-400 hover:text-brand-accent p-0.5 rounded transition-all hover:scale-105 active:scale-95 cursor-pointer flex-shrink-0"
              title="Editar descrição"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <div
          className={`relative w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 ${accent} cursor-help`}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          {icon}
          <AnimatePresence>
            {isHovered && customSub && (
              <motion.div
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 8, scale: 0.95 }}
                transition={{ duration: 0.12, ease: 'easeOut' }}
                className="absolute bottom-full right-0 mb-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
              >
                {customSub}
                {/* Subtle downward pointing arrow */}
                <div className="absolute top-full right-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45 -translate-y-1" />
              </motion.div>
            )}
          </AnimatePresence>
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
