import React, { useState } from 'react';
import Card from '../../ui/Card';
import { m, AnimatePresence } from 'motion/react';
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
  isCustomizing?: boolean;
  profile?: string;
  activeEditingId?: string | null;
  setActiveEditingId?: (id: string | null) => void;
  valueColorClass?: string;
  onlineUsersOverride?: any[];
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

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  gestor_qualidade: 'Gestor de Qualidade',
  qualidade: 'Monitor de Qualidade',
  gestor_suporte: 'Gestor de Suporte',
  suporte: 'Agente de Atendimento',
};

function getIconBg(accent: string): string {
  if (BG_MAP[accent]) return BG_MAP[accent];
  if (accent.startsWith('text-level-')) {
    return accent.replace('text-level-', 'bg-level-');
  }
  return 'bg-slate-100 dark:bg-white/[0.04]';
}

export default function StatCard({ 
  title, 
  value, 
  sub, 
  icon, 
  accent, 
  onClick, 
  badge,
  isCustomizing = false,
  profile,
  activeEditingId,
  setActiveEditingId,
  valueColorClass,
  onlineUsersOverride
}: StatCardProps) {
  const { config, saveConfig } = useQualityConfig();
  
  let dashboardContext = null;
  try {
    dashboardContext = useDashboard();
  } catch (e) {
    // Fail-safe if used outside of DashboardProvider
  }
  const user = dashboardContext?.user;
  const onlineUsers = onlineUsersOverride || dashboardContext?.onlineUsers || [];

  const iconBg = getIconBg(accent);
  const [isHovered, setIsHovered] = useState(false);
  const [tempSub, setTempSub] = useState('');
  const [showOnlineModal, setShowOnlineModal] = useState(false);

  const isOnlineUsersCard = title === 'Usuários Online' || title === 'Usuários online';

  const displayedOnlineUsers = isCustomizing
    ? [
        { id: user?.id || 'mock-admin', name: user?.name || 'Marcos Freitas', role: user?.role || 'admin' },
        { id: 'mock-2', name: 'Ana Silva', role: 'gestor_qualidade' },
        { id: 'mock-3', name: 'Bruno Costa', role: 'suporte' },
        { id: 'mock-4', name: 'Clara Santos', role: 'qualidade' },
        { id: 'mock-5', name: 'Diego Oliveira', role: 'gestor_suporte' },
        { id: 'mock-6', name: 'Elena Souza', role: 'suporte' },
        { id: 'mock-7', name: 'Felipe Rocha', role: 'suporte' },
        { id: 'mock-8', name: 'Gabriela Lima', role: 'suporte' }
      ]
    : onlineUsers;
  const canEdit = isCustomizing && !isOnlineUsersCard;
  const isEditable = (typeof sub === 'string' || sub === undefined || sub === null) && !isOnlineUsersCard;
  
  const lookupKey = profile ? `${profile}_${title}` : (user?.role ? `${user.role}_${title}` : title);
  const customSub = (isEditable && config?.statCardExplanations?.[lookupKey] !== undefined && config.statCardExplanations[lookupKey] !== '')
    ? config.statCardExplanations[lookupKey]
    : (isEditable && config?.statCardExplanations?.[title] !== undefined && config.statCardExplanations[title] !== '')
      ? config.statCardExplanations[title]
      : sub;

  const tooltipText = isOnlineUsersCard ? "Pessoas conectadas agora" : customSub;

  const myUniqueId = `stat-card-${title}`;
  const isEditing = activeEditingId !== undefined
    ? activeEditingId === myUniqueId
    : dashboardContext?.activeEditingId === myUniqueId;

  const handleEditClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setTempSub(typeof customSub === 'string' ? customSub.slice(0, 35) : '');
    if (setActiveEditingId) {
      setActiveEditingId(myUniqueId);
    } else {
      dashboardContext?.setActiveEditingId(myUniqueId);
    }
    setIsHovered(false);
  };

  const handleSave = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updatedExplanations = {
        ...(config.statCardExplanations || {}),
        [lookupKey]: tempSub,
      };
      await saveConfig({
        ...config,
        statCardExplanations: updatedExplanations,
      });
      toast.success('Descrição atualizada com sucesso!');
      if (setActiveEditingId) {
        setActiveEditingId(null);
      } else {
        dashboardContext?.setActiveEditingId(null);
      }
    } catch (err) {
      toast.error('Erro ao salvar descrição.');
    }
  };

  const handleCancel = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (setActiveEditingId) {
      setActiveEditingId(null);
    } else {
      dashboardContext?.setActiveEditingId(null);
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
              onClick={handleCancel}
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
    <>
      <Card onClick={onClick} padding="none" className="px-5 py-4 flex flex-col justify-between min-h-[100px] relative z-10 hover:z-30 transition-all duration-200">
        <div className="flex items-center gap-3 mb-3 min-w-0">
          <div
            onClick={canEdit ? handleEditClick : undefined}
            className={`relative w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center flex-shrink-0 ${accent} ${
              canEdit 
                ? 'cursor-pointer hover:ring-2 hover:ring-brand-accent/50 transition-all' 
                : 'cursor-pointer'
            }`}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            title=""
          >
            {clonedIcon}
            <AnimatePresence>
              {isHovered && tooltipText && (
                <m.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.12, ease: 'easeOut' }}
                  className="absolute top-full left-0 mt-2 z-50 whitespace-nowrap bg-slate-900 text-white dark:bg-slate-50 dark:text-slate-900 text-[10px] font-semibold px-2.5 py-1.5 rounded-lg shadow-xl shadow-slate-900/10 border border-slate-800/10 dark:border-slate-200/10 pointer-events-none"
                >
                  {tooltipText}{canEdit ? " (Clique para editar)" : ""}
                  {/* Subtle upward pointing arrow */}
                  <div className="absolute -top-1 left-4 w-2 h-2 bg-slate-900 dark:bg-slate-50 rotate-45" />
                </m.div>
              )}
            </AnimatePresence>
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-normal leading-snug block" title="">
              {title}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-auto">
          <p 
            onClick={isOnlineUsersCard ? (e) => {
              e.stopPropagation();
              setShowOnlineModal(true);
            } : undefined}
            className={`text-3xl font-black leading-none ${valueColorClass || 'text-slate-900 dark:text-slate-50'} ${
              isOnlineUsersCard ? 'cursor-pointer hover:opacity-80' : ''
            }`}
          >
            {value}
          </p>
          {badge}
        </div>
      </Card>

      <AnimatePresence>
        {showOnlineModal && (
          <div className="fixed inset-0 flex items-center justify-center z-[999]" onClick={() => setShowOnlineModal(false)}>
            {/* Backdrop */}
            <m.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/65 backdrop-blur-md"
            />

            {/* Modal Box */}
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="relative w-full max-w-md mx-4 bg-surface-card border border-surface-border rounded-3xl shadow-2xl p-6 overflow-hidden z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-surface-border pb-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </div>
                  <h3 className="text-sm font-black text-brand-primary uppercase tracking-widest">
                    Usuários Conectados ({displayedOnlineUsers.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowOnlineModal(false)}
                  className="w-8 h-8 rounded-xl hover:bg-surface-subtle text-brand-muted hover:text-brand-primary transition-all duration-200 flex items-center justify-center font-bold text-sm cursor-pointer"
                  aria-label="Fechar"
                >
                  ✕
                </button>
              </div>

              {/* List */}
              <div className="max-h-80 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                {displayedOnlineUsers.length === 0 ? (
                  <div className="text-xs text-brand-muted py-6 text-center font-semibold">
                    Nenhum usuário ativo no momento
                  </div>
                ) : (
                  displayedOnlineUsers.map((u) => {
                    const label = ROLE_LABELS[u.role] || u.role?.replace('_', ' ') || 'Suporte';
                    return (
                      <div
                        key={u.id}
                        className="flex items-center gap-3.5 p-3 rounded-2xl hover:bg-surface-subtle/80 transition-all duration-200 group/item border border-transparent hover:border-surface-border/50"
                      >
                        <div className="w-9 h-9 rounded-xl bg-brand-accent/10 border border-brand-accent/20 flex items-center justify-center font-black text-xs text-brand-accent uppercase shrink-0 group-hover/item:scale-105 transition-transform duration-200">
                          {u.name ? u.name.substring(0, 2) : 'US'}
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="font-extrabold truncate text-xs text-brand-primary group-hover/item:text-brand-accent transition-colors">
                            {u.name} {user && u.id === user.id ? ' (Você)' : ''}
                          </span>
                          <span className="text-[10px] text-brand-muted font-bold uppercase tracking-widest mt-0.5">
                            {label}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </m.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
