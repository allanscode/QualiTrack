import React, { useMemo } from 'react';
import {
  Flame,
  ShieldCheck,
  Award,
  Sparkles,
  TrendingUp,
  Star,
  CheckCircle,
  HelpCircle,
  ChevronRight,
} from 'lucide-react';
import { Monitoria, User } from '../../../types';
import Badge from '../../ui/Badge';

interface QualityAchievementsWidgetProps {
  monitorias: Monitoria[];
  currentUser: User | null;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  iconBg: string;
  unlocked: boolean;
  progressText: string;
  tag: string;
}

export default function QualityAchievementsWidget({
  monitorias,
  currentUser,
}: QualityAchievementsWidgetProps) {
  // Filtrar apenas as monitorias ativas do próprio atendente (fail-closed estrito)
  const myAudits = useMemo(() => {
    if (!currentUser?.id) return [];
    return monitorias
      .filter(m => m.active !== false && m.evaluated_id === currentUser.id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [monitorias, currentUser]);

  // Cálculo de Streak Nota 100
  const streak100 = useMemo(() => {
    let count = 0;
    for (const m of myAudits) {
      if (m.score === 100) {
        count += 1;
      } else {
        break;
      }
    }
    return count;
  }, [myAudits]);

  // Zero Erros Críticos nas últimas avaliações
  const zeroCriticals = useMemo(() => {
    const recent = myAudits.slice(0, 10);
    if (recent.length === 0) return false;
    return recent.every(
      m => (!m.selected_critical_errors || m.selected_critical_errors.length === 0) && m.score > 0
    );
  }, [myAudits]);

  // Média Geral e Evolução
  const { currentAvg, previousAvg, isImproving } = useMemo(() => {
    if (myAudits.length < 2) {
      return { currentAvg: myAudits[0]?.score || 0, previousAvg: 0, isImproving: false };
    }
    const mid = Math.ceil(myAudits.length / 2);
    const recentBatch = myAudits.slice(0, mid);
    const olderBatch = myAudits.slice(mid);

    const rAvg = Math.round(recentBatch.reduce((acc, m) => acc + (m.score || 0), 0) / recentBatch.length);
    const oAvg = olderBatch.length > 0
      ? Math.round(olderBatch.reduce((acc, m) => acc + (m.score || 0), 0) / olderBatch.length)
      : rAvg;

    return {
      currentAvg: rAvg,
      previousAvg: oAvg,
      isImproving: rAvg >= oAvg && rAvg >= 85,
    };
  }, [myAudits]);

  // XP e Nível
  const { xp, level, nextLevelXp, levelTitle } = useMemo(() => {
    let totalXp = 0;
    myAudits.forEach(m => {
      if (m.score === 100) totalXp += 100;
      else if (m.score >= 90) totalXp += 70;
      else if (m.score >= 80) totalXp += 40;
    });

    if (totalXp >= 1000) {
      return { xp: totalXp, level: 3, nextLevelXp: 1000, levelTitle: 'Mestre da Qualidade' };
    } else if (totalXp >= 400) {
      return { xp: totalXp, level: 2, nextLevelXp: 1000, levelTitle: 'Especialista em Atendimento' };
    } else {
      return { xp: totalXp, level: 1, nextLevelXp: 400, levelTitle: 'Analista em Ascensão' };
    }
  }, [myAudits]);

  const progressPercent = Math.min(100, Math.round((xp / nextLevelXp) * 100));

  // Lista de Badges / Conquistas
  const achievements: Achievement[] = useMemo(() => {
    return [
      {
        id: 'streak-100',
        title: streak100 >= 3 ? `Streak Imparável (${streak100}x Nota 100)` : 'Streak de Excelência',
        description: 'Sequência consecutiva de avaliações perfeitas com nota 100%.',
        icon: <Flame className="w-4 h-4" />,
        iconBg: streak100 > 0 ? 'bg-amber-500/10 text-amber-500' : 'bg-surface-subtle text-brand-muted',
        unlocked: streak100 >= 2,
        progressText: streak100 > 0 ? `${streak100} nota(s) 100 seguida(s)` : 'Aguardando próxima nota 100',
        tag: streak100 >= 2 ? 'Ativo' : 'Em progresso',
      },
      {
        id: 'zero-critical',
        title: 'Escudo de Conformidade',
        description: 'Zero erros críticos registrados nas últimas 10 auditorias.',
        icon: <ShieldCheck className="w-4 h-4" />,
        iconBg: zeroCriticals ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' : 'bg-surface-subtle text-brand-muted',
        unlocked: zeroCriticals,
        progressText: zeroCriticals ? '100% blindado' : 'Atenção a critérios eliminatórios',
        tag: zeroCriticals ? 'Conquistado' : 'Bloqueado',
      },
      {
        id: 'high-evolution',
        title: 'Trajetória Ascendente',
        description: 'Média de avaliações recente superior ao ciclo anterior com nota >= 85%.',
        icon: <TrendingUp className="w-4 h-4" />,
        iconBg: isImproving ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' : 'bg-surface-subtle text-brand-muted',
        unlocked: isImproving,
        progressText: isImproving ? `Média ${currentAvg}% (evolução constante)` : `Média atual: ${currentAvg}%`,
        tag: isImproving ? 'Conquistado' : 'Em busca',
      },
      {
        id: 'top-quality',
        title: 'Padrão Ouro',
        description: 'Possui 5 ou mais monitorias com nota máxima no histórico.',
        icon: <Star className="w-4 h-4" />,
        iconBg: myAudits.filter(m => m.score === 100).length >= 5 ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400' : 'bg-surface-subtle text-brand-muted',
        unlocked: myAudits.filter(m => m.score === 100).length >= 5,
        progressText: `${myAudits.filter(m => m.score === 100).length}/5 notas 100`,
        tag: myAudits.filter(m => m.score === 100).length >= 5 ? 'Ouro' : 'Progresso',
      },
    ];
  }, [streak100, zeroCriticals, isImproving, currentAvg, myAudits]);

  return (
    <div className="bg-surface-card border border-surface-border rounded-2xl p-5 shadow-premium space-y-4">
      
      {/* Header do Widget */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-surface-border/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center font-bold">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-brand-primary uppercase tracking-wider">
                Minhas Conquistas & Gamificação
              </h3>
              <Badge variant="warning" size="sm">Nível {level}</Badge>
            </div>
            <p className="text-xs text-brand-muted font-medium">
              {levelTitle} • {xp} XP acumulados
            </p>
          </div>
        </div>

        {/* Barra de Progresso de Nível */}
        <div className="sm:text-right min-w-[180px]">
          <div className="flex items-center justify-between sm:justify-end gap-2 text-[10px] font-bold text-brand-muted mb-1">
            <span>Progresso do Nível</span>
            <span className="text-brand-primary font-mono">{progressPercent}%</span>
          </div>
          <div className="w-full bg-surface-subtle rounded-full h-2 overflow-hidden border border-surface-border/50">
            <div
              className="bg-gradient-to-r from-amber-500 to-brand-accent h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Grid de Conquistas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {achievements.map(ach => (
          <div
            key={ach.id}
            className={`p-3.5 rounded-xl border transition-all flex flex-col justify-between gap-2.5 ${
              ach.unlocked
                ? 'bg-surface-card border-brand-accent/30 shadow-xs hover:border-brand-accent/60'
                : 'bg-surface-subtle/40 border-surface-border opacity-70 hover:opacity-90'
            }`}
          >
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${ach.iconBg}`}>
                  {ach.icon}
                </div>
                <Badge
                  variant={ach.unlocked ? 'success' : 'neutral'}
                  size="sm"
                >
                  {ach.tag}
                </Badge>
              </div>

              <h4 className="text-xs font-bold text-brand-primary leading-tight">
                {ach.title}
              </h4>
              <p className="text-[10px] text-brand-muted mt-1 leading-snug">
                {ach.description}
              </p>
            </div>

            <div className="pt-2 border-t border-surface-border/40 text-[10px] font-semibold text-brand-muted flex items-center justify-between">
              <span>{ach.progressText}</span>
              {ach.unlocked && <CheckCircle className="w-3 h-3 text-emerald-500" />}
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
