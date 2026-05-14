# SPEC: Quality Config

## Arquivos
- `src/components/QualityConfigManagement.tsx` (~350 linhas)
- `src/lib/useQualityConfig.ts` (160 linhas)
- `create_quality_configs.sql` — Schema da tabela

## Modelo de Dados

Armazenado como JSONB na tabela `quality_configs`:

```typescript
interface QualityConfig {
  levels: {
    excellent: { min: number; label: string; color: string };
    acceptable: { min: number; label: string; color: string };
    poor: { min: number; label: string; color: string };
  };
  target: number;              // Meta de desempenho (%)
  sla: {
    review: number;            // Horas úteis para revisão
    contestation: number;      // Horas úteis para contestação
    manager_review: number;    // Horas úteis para gestor
    quality_review: number;    // Horas úteis para gestor qualidade
  };
  businessHours: {
    start: string;             // "08:00"
    end: string;               // "18:00"
  };
  holidays: Array<{
    date: string;              // "2026-01-01"
    name: string;              // "Ano Novo"
  }>;
}
```

## Defaults

```typescript
const DEFAULT_CONFIG = {
  levels: {
    excellent: { min: 90, label: 'Excelente', color: '#10B981' },
    acceptable: { min: 70, label: 'Aceitável', color: '#F59E0B' },
    poor: { min: 0, label: 'Ruim', color: '#EF4444' },
  },
  target: 85,
  sla: {
    review: 48,
    contestation: 24,
    manager_review: 24,
    quality_review: 24,
  },
  businessHours: { start: '08:00', end: '18:00' },
  holidays: [],
};
```

## Hook `useQualityConfig()`

Retorna:
- `config` — Configuração atual
- `loading` — Estado de carregamento
- `saveConfig(newConfig)` — Salva no Supabase ou localStorage
- `getScoreLevel(score)` — Retorna `{ label, color }` baseado no score
- `recalculateActiveDeadlines()` — Recalcula deadlines de todas as monitorias ativas

### Recálculo de Deadlines
Quando o admin altera as horas de SLA, o sistema:
1. Busca todas as monitorias com status ativo (não `concluida`)
2. Recalcula o `deadline_at` baseado no `updated_at` + novas horas de SLA
3. Usa `addBusinessHours()` com novos horários comerciais e feriados
4. Atualiza em batch no banco

## Tabela SQL

```sql
CREATE TABLE quality_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### RLS
- SELECT: Todos autenticados
- ALL: Apenas `admin` e `gestor_qualidade`

## UI (QualityConfigManagement)

### Seções
1. **Faixas de Classificação** — Inputs numéricos para thresholds
2. **Meta de Desempenho** — Slider ou input numérico
3. **SLA por Etapa** — Inputs de horas úteis para cada fase
4. **Horário Comercial** — Inputs de hora início/fim
5. **Feriados** — Lista com data e nome, add/remove

### Comportamento ao Salvar
- Salva config no banco
- Exibe confirmação se SLA mudou
- Se confirmado → `recalculateActiveDeadlines()`
