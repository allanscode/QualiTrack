# Fluxo: Prazo de Ação

## Conceito

O Prazo de Ação (Action Deadline) define prazos máximos para cada etapa do fluxo de monitoria. Os prazos são calculados em **horas úteis**, respeitando horário comercial e feriados. O termo "SLA" não é usado na UI — sempre "prazo de ação".

## Configuração (via Quality Config)

| Etapa | Campo na Config | Default | Descrição |
|---|---|---|---|
| Revisão do agente | `action_deadlines.review` | 48h úteis | Tempo para agente aceitar ou contestar |
| Contestação (auditor) | `action_deadlines.contestation` | 24h úteis | Tempo para auditor reavaliar ou negar |
| Decisão do gestor suporte | `action_deadlines.manager_review` | 24h úteis | Tempo para gestor aceitar ou escalar |
| Decisão do gestor qualidade | `action_deadlines.quality_review` | 24h úteis | Tempo para gestor qualidade finalizar |

> Config acessível via `useQualityConfig()` (deve estar dentro de `<QualityConfigProvider>`).

## Cálculo de Deadline

Implementado em `src/lib/businessHours.ts`:

### `addBusinessHours(startDate, hours, config)`
1. Recebe data inicial, quantidade de horas e config (horário comercial + feriados)
2. Itera hora a hora a partir da data inicial
3. Pula: fins de semana (sáb/dom), feriados configurados, horas fora do horário comercial
4. Retorna a data/hora final do deadline

### Exemplo
- Início: Sexta 17:00, Prazo: 4h, Horário: 08:00-18:00
- Sexta 17:00 → 18:00 = 1h (fecha)
- Sábado e Domingo = pula
- Segunda 08:00 → 11:00 = 3h
- **Deadline: Segunda 11:00** (4h úteis depois)

## Quando o Deadline é Calculado

| Evento | Prazo Aplicado | Armazenado em |
|---|---|---|
| Monitoria criada | `action_deadlines.review` | `action_deadline_at` |
| Contestação aberta | `action_deadlines.contestation` | `action_deadline_at` |
| Reavaliação feita | `action_deadlines.review` | `action_deadline_at` |
| Contestação negada | `action_deadlines.review` | `action_deadline_at` |
| Escalado p/ gestor suporte | `action_deadlines.manager_review` | `action_deadline_at` |
| Escalado p/ gestor qualidade | `action_deadlines.quality_review` | `action_deadline_at` |

## Exibição — ActionDeadlineClock Widget

Componente `src/components/ui/ActionDeadlineClock.tsx`:
- Tempo restante em formato legível (ex: "1d 4h 30m")
- Barra de progresso visual
- Cores dinâmicas:
  - 🟢 Verde: > 50% do tempo restante
  - 🟡 Amarelo: 25-50% restante
  - 🔴 Vermelho: < 25% restante
- Atualiza a cada 60 segundos
- Exibido em `MonitoriaList` e `RecentAuditsTable`

## Auto-Finalização (Cron Job)

### Função: `process_action_deadline_timeouts()`
- Executada a cada 5 minutos via `pg_cron`
- Busca monitorias com `action_deadline_at < now()` e status ativo

### Regras de Resolução

| Posse Atual | Resultado | resolution_type |
|---|---|---|
| Qualidade (em_contestacao, aguardando_gestor_qualidade) | Score → **100%**, status → `concluida` | `automatic` |
| Suporte (pendente_revisao, aguardando_gestor_suporte, contestacao_negada) | Score mantido, status → `concluida` | `automatic` |

### Lógica
> Se a equipe de qualidade não agiu no prazo, o agente é beneficiado (nota 100%).
> Se o agente não agiu no prazo, a nota original é mantida.

### Indicador Visual
- Ícone `Clock` + label no `RecentAuditsTable` quando `resolution_type === 'automatic'`

## Recálculo em Massa

Quando o admin altera configurações de prazo de ação:

1. `useQualityConfig().saveConfig()` detecta mudança nos valores
2. Exibe confirmação ao admin
3. Se confirmado, chama `recalculateActiveDeadlines(prev, next)`
4. Busca todas as monitorias com status ativo (não `concluida`)
5. Recalcula `action_deadline_at` para cada uma com `addBusinessHours()` + novos valores
6. Atualiza em batch no banco

> `recalculateActiveDeadlines()` é **pesada** — dispare apenas no save da config.

## Tabelas Auxiliares

### `business_hours`
```sql
CREATE TABLE business_hours (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  day_of_week SMALLINT, -- 0=Dom, 1=Seg, ..., 6=Sáb
  start_time TIME,
  end_time TIME
);
```

### `holidays`
```sql
CREATE TABLE holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE,
  name TEXT
);
```

Ambas sincronizadas pelo `QualityConfigManagement` ao salvar config.
