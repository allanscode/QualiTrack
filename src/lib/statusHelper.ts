import { 
  Clock, 
  AlertTriangle, 
  Shield, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  LucideIcon 
} from 'lucide-react';
import { MonitoriaStatus } from '../types';

export interface StatusConfig {
  label: string;
  shortLabel: string;
  variant: 'warning' | 'error' | 'info' | 'success' | 'neutral';
  icon: LucideIcon;
}

export const STATUS_CONFIGS: Record<MonitoriaStatus | 'expiradas_prazo', StatusConfig> = {
  pendente_revisao: {
    label: 'Aguardando Suporte',
    shortLabel: 'Revisão',
    variant: 'warning',
    icon: Clock
  },
  em_contestacao: {
    label: 'Em Reanálise',
    shortLabel: 'Reanálise',
    variant: 'error',
    icon: AlertTriangle
  },
  aguardando_gestor_suporte: {
    label: 'Aguardando Gestor',
    shortLabel: 'Gestão Sup.',
    variant: 'info',
    icon: Shield
  },
  aguardando_gestor_qualidade: {
    label: 'Aguardando Qualidade',
    shortLabel: 'Gestão Qual.',
    variant: 'info',
    icon: Shield
  },
  concluida: {
    label: 'Concluída',
    shortLabel: 'Concluída',
    variant: 'success',
    icon: CheckCircle2
  },
  contestacao_aceita: {
    label: 'Contestação Aceita',
    shortLabel: 'Aceita',
    variant: 'success',
    icon: CheckCircle2
  },
  contestacao_negada: {
    label: 'Contestação Negada',
    shortLabel: 'Negada',
    variant: 'error',
    icon: XCircle
  },
  finalizada_alterada: {
    label: 'Concluída Alterada',
    shortLabel: 'Alterada',
    variant: 'success',
    icon: CheckCircle2
  },
  reavaliacao_solicitada: {
    label: 'Reavaliação Solicitada',
    shortLabel: 'Reavaliação',
    variant: 'error',
    icon: AlertTriangle
  },
  expiradas_prazo: {
    label: 'Prazo Expirado',
    shortLabel: 'Prazo Expirado',
    variant: 'error',
    icon: Clock
  }
};

/**
 * Cor e ícone de cada evento da linha do tempo.
 *
 * O texto do evento vem de actionDescriptions (useMonitoriaActions) e de
 * useMonitoriaSave, além de registros antigos com outras redações. Casar
 * por string exata quebraria a cada texto novo, então classificamos por
 * palavra-chave — a ordem importa: "Contestação Aceita" contém tanto
 * "contesta" quanto "aceita", e deve sair como aceite.
 */
export function getHistoryEventConfig(action: string): { variant: StatusConfig['variant']; icon: LucideIcon } {
  const a = (action || '').toLowerCase();

  if (/negad|removid|recusad|improcedente/.test(a)) {
    return { variant: 'error', icon: XCircle };
  }
  if (/aceit|aprovad|procedente|conclu/.test(a)) {
    return { variant: 'success', icon: CheckCircle2 };
  }
  if (/contesta|escalad|devolvid|solicitad|mantid|reabert|reavalia/.test(a)) {
    return { variant: 'warning', icon: AlertTriangle };
  }
  return { variant: 'info', icon: Clock };
}

/** Classe de cor de texto por variant. Centralizado para a linha do tempo. */
export const VARIANT_TEXT_CLASS: Record<StatusConfig['variant'], string> = {
  warning: 'text-warning',
  error: 'text-error',
  info: 'text-info',
  success: 'text-success',
  neutral: 'text-brand-muted'
};

/** Estilo de container (fundo, texto e borda) por variant para badges de status */
export const VARIANT_ICON_CONTAINER: Record<StatusConfig['variant'], string> = {
  warning: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/25',
  error: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/25',
  info: 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/25',
  success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25',
  neutral: 'bg-surface-subtle text-brand-muted border border-surface-border/60'
};

export function getStatusConfig(status: MonitoriaStatus | 'expiradas_prazo' | string): StatusConfig {
  const config = STATUS_CONFIGS[status as MonitoriaStatus | 'expiradas_prazo'];
  if (config) return config;
  
  return {
    label: status,
    shortLabel: status,
    variant: 'neutral',
    icon: AlertCircle
  };
}
