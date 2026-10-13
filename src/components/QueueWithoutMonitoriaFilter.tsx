import { Check } from 'lucide-react';
import Button from './ui/Button';

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function QueueWithoutMonitoriaFilter({ checked, onChange }: Props) {
  return (
    <div className="mt-1 border-t border-surface-border pt-1">
      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-brand-muted">Monitoria</div>
      <Button role="menuitemcheckbox" aria-checked={checked} variant="ghost" size="sm"
        onClick={() => onChange(!checked)}
        className="w-full justify-between gap-2 text-left normal-case tracking-normal"
        title="Oculta tickets com monitoria salva, inclusive em revisão. Rascunhos da IA continuam visíveis.">
        <span>Somente tickets sem monitoria</span>
        {checked && <Check className="h-3.5 w-3.5 shrink-0 text-brand-highlight" />}
      </Button>
    </div>
  );
}
