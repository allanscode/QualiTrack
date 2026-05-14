# Fluxo: SLA e Prazos

## Conceito

O SLA (Service Level Agreement) define prazos máximos para cada etapa do fluxo de monitoria. Os prazos são calculados em **horas úteis**, respeitando horário comercial e feriados.

## Configuração (via Quality Config)

| Etapa | Campo | Default |
|---|---|---|
| Revisão do agente | `sla.review` | 48h úteis |
| Contestação (auditor) | `sla.contestation` | 24h úteis |
| Decisão do gestor suporte | `sla.manager_review` | 24h úteis |
| Decisão do gestor qualidade | `sla.quality_review` | 24h úteis |

## Cálculo de Deadline

Implementado em `src/lib/businessHours.ts`:

### `addBusinessHours(startDate, hours, config)`
1. Recebe data inicial, quantidade de horas e config (horário comercial + feriados)
2. Itera hora a hora a partir da data inicial
3. Pula: fins de semana (sáb/dom), feriados configurados, horas fora do horário comercial
4. Retorna a data/hora final do deadline

### Exemplo
- Início: Sexta 17:00, SLA: 4h, Horário: 08:00-18:00
- Sexta 17:00 → 18:00 = 1h (fecha)
- Sábado e Domingo = pula
- Segunda 08:00 → 11:00 = 3h
- **Deadline: Segunda 11:00** (4h úteis depois)

## Quando o Deadline é Calculado

| Evento | SLA Aplicado |
|---|---|
| Monitoria criada | `sla.review` |
| Contestação aberta | `sla.contestation` |
| Reavaliação feita | `sla.review` |
| Contestação negada | `sla.review` |
| Escalado p/ gestor suporte | `sla.manager_review` |
| Escalado p/ gestor qualidade | `sla.quality_review` |

## Exibição — SLAClock Widget

O componente `SLAClock` exibe:
- Tempo restante em formato legível (ex: "1d 4h 30m")
- Barra de progresso visual
- Cores dinâmicas:
  - 🟢 Verde: > 50% do tempo restante
  - 🟡 Amarelo: 25-50% restante
  - 🔴 Vermelho: < 25% restante
- Atualiza a cada 60 segundos

## Auto-Finalização (Cron Job)

### Função: `process_sla_timeouts()`
- Executada a cada 5 minutos via `pg_cron`
- Busca monitorias com `deadline_at < now()` e status ativo

### Regras

| Posse Atual | Resultado |
|---|---|
| Qualidade (em_contestacao, aguardando_gestor_qualidade, reavaliacao_solicitada) | Score → **100%**, status → `concluida` |
| Suporte (pendente_revisao, aguardando_gestor_suporte, contestacao_negada) | Score mantido, status → `concluida` |

### Lógica
> Se a equipe de qualidade não agiu no prazo, o agente é beneficiado (nota 100%).
> Se o agente não agiu no prazo, a nota original é mantida.

## Recálculo em Massa

Quando o admin altera configurações de SLA:
1. `useQualityConfig.saveConfig()` detecta mudança nos valores de SLA
2. Exibe confirmação ao admin
3. Se confirmado, chama `recalculateActiveDeadlines()`
4. Busca todas as monitorias com status ativo
5. Recalcula `deadline_at` para cada uma com os novos valores
6. Atualiza em batch no banco
