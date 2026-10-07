# SPEC: Módulo de Monitorias

## Arquivos Envolvidos
- `src/components/MonitoriaForm.tsx` — Formulário de criação/reavaliação (684 linhas)
- `src/components/MonitoriaList.tsx` — Lista com ações e filtros (1015 linhas)
- `src/components/ui/ActionDeadlineClock.tsx` — Widget de contagem regressiva
- `src/components/ui/CustomSelect.tsx` — Dropdown com portal + type-ahead
- `src/lib/businessHours.ts` — Cálculo de prazos de ação
- `src/lib/contestation.ts` — Funções unificadas de contestação
- `src/lib/useQualityConfig.tsx` — Context Provider + hook de configuração de prazos de ação e qualidade

## Modelo de Dados (`Monitoria`)

Na lista de monitorias, o selo **Ticket filho** e o filtro **Todos os tickets / Tickets filhos / Atendimentos** usam o mesmo identificador da ficha de ticket filho (`isChildTicketMonitoria`). Cada linha mostra a ação mais recente pelo horário do histórico, abaixo dos dados principais. As linhas virtualizadas têm altura suficiente para essa informação e os contadores de status usam fonte ampliada.

Nos detalhes da monitoria, a linha do tempo apresenta os eventos em sequência vertical, com ação, responsável e data em linhas legíveis. Observações longas mostram duas linhas inicialmente e podem ser expandidas sem perder o texto completo; anexos permanecem associados ao evento. A etapa atual aparece ao fim do histórico quando a monitoria ainda não foi concluída.

### Avaliação por IA de tickets filhos

Tickets que já possuem monitoria salva exibem essa informação e a ação **Ver monitoria existente** nos cards e no parecer da IA. Quando existe um parecer de IA concluído, também oferecem **Abrir nova ficha com IA**: abre uma nova avaliação preenchida para revisão, preservando a anterior. A nova monitoria só é persistida ao salvar. Nas filas distribuídas, `start_child_ticket_new_evaluation` exige o monitor responsável ou gestão autorizada e um parecer concluído, reutiliza o bloqueio de trabalho e reabre a atribuição quando necessário. Nenhuma monitoria anterior é excluída ou alterada.

As filas de filhos e filhos inválidos permitem avaliar em lote os tickets selecionados ou, sem seleção, os elegíveis da página. Tickets já avaliados, auditados ou com IA em execução são ignorados. A janela individual pode ser fechada e o progresso do lote pode ser minimizado sem cancelar a análise; os resultados continuam associados ao ticket e podem ser recuperados ao abrir o parecer.

Ao lançar a monitoria, o parecer preenche as respostas, justificativas por critério e observação geral da ficha própria, preservando respostas humanas já existentes. Novas análises retornam os cinco critérios identificados por `question_id`; evidência insuficiente é indicada explicitamente por `NA`. Pareceres antigos com três verificações preenchem somente os critérios correspondentes, deixando os demais para revisão. O preenchimento não salva nem publica a monitoria automaticamente.

### Fluxo de monitorias PJ

Quando `teams.requires_pj_review` está ativo e a nota é inferior a 75%, a sequência obrigatória é **Gestor PJ → Gestor da Qualidade**. O gestor encaminha aprovação ou contestação justificada por `act_on_monitoria_as_support_manager`; o status passa diretamente a `aguardando_gestor_qualidade`. `pj_review_kind` registra o tipo de parecer. A Qualidade toma a decisão final e resolve `contestation_result` quando houver contestação. Os campos e a função do antigo revisor PJ permanecem apenas para preservar o histórico; novas monitorias não entram em `aguardando_revisao_pj`.

O revisor, cujo papel no cadastro é `suporte`, lê apenas casos atribuídos a ele pela view `vw_monitorias_pj_reviewer`, que oculta a identidade do auditor. A view normal `vw_monitorias_suporte` continua limitada às monitorias do próprio atendente. A RLS e os triggers impedem mudanças diretas do parecer ou saltos entre etapas. `process_action_deadline_timeouts` ignora equipes PJ para não substituir as decisões humanas.

```typescript
interface Monitoria {
  id: string;
  form_id: string;
  evaluator_id: string;
  evaluated_id: string;
  ticket_id: string;
  channel: 'Chat' | 'Email' | 'Telefone' | 'WhatsApp';
  answers: Record<string, 'SIM' | 'NAO' | 'NA'>;
  score: number;
  status: MonitoriaStatus;
  action_deadline_at?: string;
  history: MonitoriaHistoryEntry[];
  resolution_type?: 'human' | 'automatic';
  contestation_result?: 'approved' | 'rejected' | 'pending';
  form_snapshot?: EvaluationForm;
  applied_config?: Record<string, unknown>;
  selected_critical_errors?: string[];
  dissatisfaction_answers?: Record<string, string[]>;
  team_id?: string;
  evaluator_name?: string;
  evaluated_name?: string;
  form_name?: string;
  team_name?: string;
  display_id?: number;
  started_at?: string;
  finished_at?: string;
  concluded_at?: string;
  active?: boolean;
  created_at: string;
  updated_at: string;
}
```

### `MonitoriaStatus`
```typescript
type MonitoriaStatus =
  | 'pendente_revisao'
  | 'em_contestacao'
  | 'aguardando_gestor_suporte'
  | 'aguardando_gestor_qualidade'
  | 'concluida'
  | 'contestacao_aceita'
  | 'contestacao_negada'
  | 'finalizada_alterada'
  | 'reavaliacao_solicitada';
```

### `MonitoriaHistoryEntry`
```typescript
interface MonitoriaHistoryEntry {
  action: string;     // "Monitoria Criada", "Contestada", etc.
  by_id: string;      // UUID do autor
  by_name: string;    // Nome do autor
  at: string;         // ISO timestamp
  note?: string;      // Justificativa/observação
}
```

## Status e Transições

```mermaid
stateDiagram-v2
    [*] --> pendente_revisao: Monitoria criada

    pendente_revisao --> concluida: Agente aceita
    pendente_revisao --> em_contestacao: Agente contesta

    em_contestacao --> pendente_revisao: Auditor reavalia
    em_contestacao --> contestacao_negada: Auditor nega

    contestacao_negada --> concluida: Agente aceita
    contestacao_negada --> aguardando_gestor_suporte: Agente escala

    aguardando_gestor_suporte --> concluida: Gestor aceita
    aguardando_gestor_suporte --> aguardando_gestor_qualidade: Gestor escala

    aguardando_gestor_qualidade --> concluida: Gestor qualidade finaliza

    note right of concluida: Terminal state
    note right of concluida: resolution_type: 'human' | 'automatic'
```

### Tabela de Transições

| Status Atual | Ação | Novo Status | Quem Faz |
|---|---|---|---|
| `pendente_revisao` | Aceitar | `concluida` | suporte |
| `pendente_revisao` | Contestar | `em_contestacao` | suporte |
| `em_contestacao` | Reavaliar | `pendente_revisao` | qualidade |
| `em_contestacao` | Negar | `contestacao_negada` | qualidade |
| `contestacao_negada` | Aceitar | `concluida` | suporte |
| `contestacao_negada` | Escalar p/ Gestor | `aguardando_gestor_suporte` | suporte |
| `aguardando_gestor_suporte` | Aceitar | `concluida` | gestor_suporte |
| `aguardando_gestor_suporte` | Escalar p/ Qualidade | `aguardando_gestor_qualidade` | gestor_suporte |
| `aguardando_gestor_qualidade` | Finalizar | `concluida` | gestor_qualidade |
| Qualquer (prazo vencido) | Auto-finalizar | `concluida` | sistema (cron) |

### Conclusão Automática (Prazo de Ação)
- Cron job `process_action_deadline_timeouts()` executa a cada 5 min via `pg_cron`
- **Qualidade perde prazo** → Score = 100%, status = `concluida`, `resolution_type = 'automatic'`
- **Suporte perde prazo** → Score mantido, status = `concluida`, `resolution_type = 'automatic'`
- Indicador visual: ícone `Clock` no `RecentAuditsTable` quando `resolution_type === 'automatic'`

## Formulário Multi-Step (MonitoriaForm)

### Step 1 — Dados Básicos
- Ticket ID, Agente (select), Equipe (select), Canal, Formulário
- **Lógica Agente↔Equipe** (vinculação protegida):
  - Selecionar Agente → filtra equipes vinculadas ao agente; equipe permanece "Selecione a equipe"
  - Selecionar Equipe → filtra agentes vinculados à equipe; agente permanece "Selecione o agente"
  - Com ambos selecionados, a lista do outro campo é filtrada pelo relacionamento
  - Tentar trocar Agente com Equipe incompatível selecionada → bloqueio + toast informativo
  - Tentar trocar Equipe com Agente incompatível selecionado → bloqueio + toast informativo
  - O usuário deve primeiro desselecionar (placeholder) para alterar o relacionamento
- **CustomSelect com type-ahead**: Ao abrir qualquer dropdown, o usuário pode digitar para filtrar opções em tempo real (case-insensitive), sem campo de busca visível

### Step 2 — Avaliação por Pilar
- Para cada pilar do formulário:
  - Título e peso do pilar
  - Lista de critérios (checkbox: Sim/Não/N.A.)
  - Erros críticos (toggle)
  - Score parcial exibido em tempo real

### Step 3 — Resumo
- Score calculado, resumo de respostas, campo de feedback textual
- Campos de insatisfação (dissatisfaction_fields) carregados dinamicamente

### Step 4 — Confirmação
- Revisão final antes de salvar
- O auditor pode gerar sob demanda um novo `Registro do Auditor` por IA; a geração usa somente as respostas, observações e erros críticos atuais da etapa 2 e substitui o texto apenas após uma resposta válida
- `form_snapshot` e `applied_config` salvos no momento da avaliação
- Os campos visíveis do formulário Zendesk são salvos em `form_snapshot.ticket_fields` e aparecem na identificação e no registro/log da ficha salva. Monitorias antigas sem esse snapshot consultam os campos atuais do ticket, identificados como atuais porque podem ter mudado desde a avaliação.

## Cálculo de Score

```
Para cada pilar:
  pontos_obtidos = count(criterios marcados como "sim")
  pontos_possiveis = count(criterios) - count(criterios N/A)

  se pontos_possiveis > 0:
    score_pilar = pontos_obtidos / pontos_possiveis
  senão:
    score_pilar = 1.0 (pilar ignorado)

Score Final = Σ(score_pilar × peso_pilar) / Σ(peso_pilar) × 100

Se qualquer erro_critico marcado → Score Final = 0
```

## Contestação e Reavaliação

1. Agente contesta com justificativa textual
2. Auditor original recebe a contestação
3. Auditor pode **reavaliar** (abre MonitoriaForm em modo reavaliação):
   - Formulário pré-preenchido com respostas anteriores
   - Pode alterar critérios e recalcular score
   - Histórico mostra score anterior vs. novo
4. Ou auditor pode **negar** a contestação
5. Se negada, agente pode **escalar** para gestor de suporte
6. Gestor pode aceitar ou **escalar** para gestor de qualidade

### Contestação (History-based) — `contestation.ts`
- Widgets escaneiam `history[]` por palavras-chave
- **Aceitas**: "aceita", "procedente", "alterada"
- **Rejeitadas**: "negada", "recusada", "mantida", "improcedente"
- Usa **última resolução** apenas para evitar contagem dupla

## Prazo de Ação / Deadlines

- Cada transição de status recalcula o deadline
- Prazo calculado com `addBusinessHours()` de `businessHours.ts`
- Configurável via `useQualityConfig` (horas por etapa)
- `ActionDeadlineClock` exibe contagem regressiva em tempo real (atualiza a cada 60 segundos)
- Cores do relógio: verde (>50% restante), amarelo (25-50%), vermelho (<25%)
- Expiração → cron job `process_action_deadline_timeouts()` finaliza automaticamente

## Anonimização

Somente `qualidade`, `gestor_qualidade` e `admin` podem iniciar auditorias de chamados ou criar monitorias. `gestor_suporte` consulta as filas e acompanha a etapa de gestão, mas não inicia avaliações manuais nem com IA. A policy de INSERT em `monitorias` aplica a mesma restrição no banco.

Agentes (`role=suporte`) e gestores de suporte (`role=gestor_suporte`) veem:
- `evaluator_name` → "Analise da Qualidade" (nome real ocultado)
- Garantido no frontend via renderização condicional no `RecentAuditsTable`
