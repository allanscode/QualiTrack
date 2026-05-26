# SPEC: Quality Config

## Arquivos
- `src/components/QualityConfigManagement.tsx` (~350 linhas)
- `src/lib/useQualityConfig.tsx` (~200 linhas)
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
  action_deadlines: {
    review: number; // Horas úteis para revisão
    contestation: number; // Horas úteis para contestação
    manager_review: number; // Horas úteis para gestor
    quality_review: number; // Horas úteis para gestor qualidade
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
  action_deadlines: {
    review: 48,
    contestation: 24,
    manager_review: 24,
    quality_review: 24,
  },
  businessHours: { start: '08:00', end: '18:00' },
  holidays: [],
};
```

## Context Provider + Hook `useQualityConfig()`

> **Arquitetura**: `useQualityConfig` agora é um **Context singleton**. O componente `QualityConfigProvider` (em `useQualityConfig.tsx`) envolve `MainApp` em `App.tsx` e faz **1 único fetch** a `quality_configs`. Todos os consumidores usam `useQualityConfig()` para ler do Context — não há mais múltiplos fetches independentes.

### `QualityConfigProvider`
- Deve envolver a árvore de componentes que precisa da config (atualmente em `App.tsx` envolvendo `<MainApp>`)
- Faz fetch único de `quality_configs` no Supabase (ou mockDb) no mount
- Retorna `config`, `oldConfig`, `saveConfig`, `getLevelForScore`, `isAboveTarget`, `recalculateActiveActionDeadlines`

### `useQualityConfig()` (consumer hook)
- Deve ser chamado dentro de um `<QualityConfigProvider>`
- Retorna:
  - `config` — Configuração atual
  - `oldConfig` — Configuração anterior (para comparação no recálculo)
  - `saveConfig(newConfig)` — Salva no Supabase ou localStorage
  - `getLevelForScore(score)` — Retorna `{ label, color, bgColor }` baseado no score
  - `isAboveTarget(score)` — Verifica se score >= target
  - `recalculateActiveActionDeadlines(prev, next)` — Recalcula deadlines de todas as monitorias ativas

### Recálculo de Deadlines
Quando o admin altera as horas de prazo de ação, o sistema:
1. Busca todas as monitorias com status ativo (não `concluida`)
2. Recalcula o `action_deadline_at` baseado no `updated_at` + novas horas de prazo de ação
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
3. **Prazo de Ação por Etapa** — Inputs de horas úteis para cada fase
4. **Horário Comercial** — Inputs de hora início/fim
5. **Feriados** — Lista com data e nome, add/remove

### Comportamento ao Salvar
- Salva config no banco
- Exibe confirmação se prazo de ação mudou
- Se confirmado → `recalculateActiveDeadlines()`
