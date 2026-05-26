import React, { useState, useEffect } from 'react';
import { getRemainingBusinessSeconds } from '../../lib/businessHours';
import { Clock } from 'lucide-react';
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

        if (diffMs <= 0) {
          setIsLate(true);
          setIsWarning(true);
          setTimeLeft('00:00:00');
        } else {
          setIsLate(false);
          const businessSeconds = getRemainingBusinessSeconds(now, deadline, qualityConfig.businessHours);
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

  return (
    <div
      title={actionDeadlineAt ? `Prazo Limite: ${new Date(actionDeadlineAt).toLocaleString('pt-BR')}` : undefined}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border-2 font-mono text-[10px] font-black tabular-nums transition-all shadow-sm ${
      isLate
        ? 'bg-red-100 border-red-500 text-red-700 animate-pulse'
        : isWarning
        ? 'bg-red-50 border-red-300 text-red-600'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
      }`}>
      <div className={`w-1.5 h-1.5 rounded-full ${
      isLate
        ? 'bg-red-600 animate-ping'
        : isWarning
        ? 'bg-red-500'
        : 'bg-emerald-500'
      }`} />
      <Clock className="w-3.5 h-3.5 opacity-70" />
      <span>Prazo: {timeLeft || '--:--:--'}</span>
    </div>
  );
}
