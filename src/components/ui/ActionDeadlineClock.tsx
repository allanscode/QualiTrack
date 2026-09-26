import React, { useState, useEffect } from 'react';
import { getRemainingBusinessSeconds, isWithinBusinessHours } from '../../lib/businessHours';
import { Clock, PauseCircle } from 'lucide-react';
import { useQualityConfig } from '../../lib/useQualityConfig';

interface ActionDeadlineClockProps {
  actionDeadlineAt?: string;
  status: string;
}

export default function ActionDeadlineClock({ actionDeadlineAt, status }: ActionDeadlineClockProps) {
  const { config: qualityConfig } = useQualityConfig();
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [isLate, setIsLate] = useState(false);
  const [isWarning, setIsWarning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const isFinalStatus = [
    'concluida',
    'finalizada_alterada'
  ].includes(status);

  useEffect(() => {
    if (!actionDeadlineAt || isFinalStatus) return;

    const updateClock = () => {
      try {
        const now = new Date();
        const deadline = new Date(actionDeadlineAt);

        const diffMs = deadline.getTime() - now.getTime();
        const businessSeconds = getRemainingBusinessSeconds(now, deadline, qualityConfig.businessHours);

        if (diffMs <= 0 || businessSeconds <= 0) {
          setIsLate(true);
          setIsWarning(false);
          setIsPaused(false);
          setTimeLeft('');
        } else {
          setIsLate(false);
          const inBusinessHours = isWithinBusinessHours(now, qualityConfig.businessHours);
          setIsPaused(!inBusinessHours);
          setIsWarning(businessSeconds < 24 * 3600);

          const hours = Math.floor(businessSeconds / 3600);
          const minutes = Math.floor((businessSeconds % 3600) / 60);
          const seconds = businessSeconds % 60;
          setTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`);
        }
      } catch (e) {
        console.error('Error updating Action Deadline Clock:', e);
      }
    };

    updateClock();
    const timer = setInterval(updateClock, 1000);

    return () => clearInterval(timer);
  }, [actionDeadlineAt, isFinalStatus, qualityConfig.businessHours]);

  if (isFinalStatus || !actionDeadlineAt) return null;

  const tooltipText = actionDeadlineAt
    ? `Prazo Limite: ${new Date(actionDeadlineAt).toLocaleString('pt-BR')}${isLate ? ' (Expirado)' : isPaused ? ` (Pausado fora do expediente: ${qualityConfig.businessHours?.start || '08:00'} às ${qualityConfig.businessHours?.end || '17:00'})` : ''}`
    : undefined;

  return (
    <div
      title={tooltipText}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border font-mono text-[9px] font-bold tabular-nums transition-all shadow-xs leading-none ${
      isLate
        ? 'bg-functional-error/10 border-functional-error/30 text-functional-error'
        : isWarning
        ? 'bg-functional-warning/10 border-functional-warning/30 text-functional-warning'
        : 'bg-functional-success/10 border-functional-success/30 text-functional-success'
      }`}>
      {isLate ? (
        <Clock className="w-3 h-3 text-functional-error shrink-0" />
      ) : isPaused ? (
        <PauseCircle className="w-3 h-3 opacity-80 text-brand-muted shrink-0" />
      ) : (
        <Clock className={`w-3 h-3 shrink-0 ${isWarning ? 'text-functional-warning' : 'opacity-70 text-functional-success'}`} />
      )}
      <span>{isLate ? 'Prazo: Expirado' : `Prazo: ${timeLeft || '--:--:--'}${isPaused ? ' (Pausado)' : ''}`}</span>
    </div>
  );
}

