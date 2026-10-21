import Badge from './Badge';

interface MonitoriaIdBadgeProps {
  displayId?: string | number | null;
  id?: string | null;
  className?: string;
}

export default function MonitoriaIdBadge({ displayId, id, className = '' }: MonitoriaIdBadgeProps) {
  const number = displayId == null ? 'S/N' : String(displayId).padStart(6, '0');

  return (
    <Badge variant="info" size="xs" className={`shrink-0 whitespace-nowrap font-mono tabular-nums ${className}`}>
      Monitoria #{number}
    </Badge>
  );
}
