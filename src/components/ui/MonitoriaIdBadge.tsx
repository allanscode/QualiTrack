import Badge from './Badge';

interface MonitoriaIdBadgeProps {
  displayId?: string | number | null;
  id?: string | null;
  className?: string;
}

export default function MonitoriaIdBadge({ displayId, id, className = '' }: MonitoriaIdBadgeProps) {
  const number = displayId || id?.slice(0, 8) || 'S/N';

  return (
    <Badge variant="info" size="xs" className={`shrink-0 whitespace-nowrap font-mono tabular-nums ${className}`}>
      Mon. #{number}
    </Badge>
  );
}
