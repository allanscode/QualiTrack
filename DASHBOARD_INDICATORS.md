# Dicionário de Indicadores — QualiTrack

Este guia explica o que significa cada número e gráfico que aparece no Dashboard, como eles são calculados e quem eles representam.

> **Nota técnica**: Cores de nível usam classes `text-level-*`/`bg-level-*` com `.dark` overrides (pastel). Chart colors via `chartColors.ts` (runtime CSS vars). Ícones por categoria semântica (ver `docs/specs/dashboard.md`).

---

## Perfil: Agente de Atendimento (`suporte`)
*Foco: Resultados individuais e comparação com a média do time.*

### Performance e Benchmarks
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Minha Média** | Σ scores / nº monitorias do agente | `Target` | Derivada do nível (level-*) |
| **Média Equipe** | Σ scores de agentes das mesmas equipes / nº monitorias | `Users` | `text-brand-muted` |
| **Média Global** | Σ scores de todas monitorias / total | `Users` | `text-brand-muted` |
| **Tendência** | Média 2ª metade do período − média 1ª metade | `TrendingUp` | `text-brand-highlight` |

### Volumetria e Contestações
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Monitorias** | Contagem de monitorias do agente no período | `ClipboardCheck` | `text-brand-accent` |
| **Total Pendentes** | Monitorias aguardando ação do agente | `AlertTriangle` | `text-functional-warning` |
| **Solicitadas** | Monitorias contestadas pelo agente (contagem única) | `ClipboardList` | `text-brand-muted` |
| **Aprovadas** | Contestações com nota alterada (Procedente) | `CheckCircle2` | `text-functional-success` |
| **Recusadas** | Contestações com nota mantida (Improcedente) | `XCircle` | `text-functional-error` |
| **Taxa de Reversão** | Aprovadas / Solicitadas × 100 | `Target` | Derivada do nível |

### Gráficos
- **Evolução Comparativa**: `TrendChart` — linha diária do agente vs média da equipe
- **Meus Ofensores**: `TopOffendersChart` — critérios onde mais perdeu pontos

---

## Perfil: Monitor de Qualidade (`qualidade`)
*Foco: Produtividade diária e assertividade nas avaliações.*

### Performance de Auditoria
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Meu Volume** | Total de monitorias criadas pelo monitor | `ClipboardCheck` | `text-brand-accent` |
| **Nota Média** | Σ scores aplicados / nº monitorias | `Target` | Derivada do nível |
| **Pendente Ação** | Contestações recebidas sem resposta | `AlertTriangle` | `text-functional-warning` |

### Assertividade (Qualidade do Monitor)
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Reav. Aceitas** | Contestações onde nota foi alterada (history-based) | `CheckCircle2` | `text-functional-success` |
| **Reav. Recusadas** | Contestações onde nota foi mantida (history-based) | `XCircle` | `text-functional-error` |
| **Total de Reav. Recebidas** | Volume total de contestações recebidas | `ClipboardList` | `text-brand-muted` |

> **Lógica history-based**: usa `isApprovalAction()`/`isRejectionAction()` de `src/lib/contestation.ts`. Última resolução apenas (evita contagem dupla).

### Gráficos
- **Volumetria Diária**: `TrendChart` — monitorias/dia vs média dos colegas
- **Precisão da Qualidade**: `PrecisionChart` — estáveis (sem contestação) vs reavaliadas

---

## Perfil: Supervisor de Atendimento (`gestor_suporte`)
*Foco: Gestão de pessoas e equipes sob sua responsabilidade.*

### Performance e Benchmarks
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Média Equipe** | Σ scores das suas equipes / nº monitorias | `Target` | Derivada do nível |
| **Média Global** | Σ scores de toda a empresa / total | `Users` | `text-brand-muted` |
| **Tendência** | Média 2ª metade − 1ª metade | `TrendingUp` | `text-brand-highlight` |
| **Monitorias** | Volume total das suas equipes | `ClipboardCheck` | `text-brand-accent` |

### Gestão e Pendências
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Pendentes Agentes** | Monitorias aguardando agente das suas equipes | `AlertTriangle` | `text-functional-warning` |
| **Minhas Ações** | Contestações aguardando sua decisão | `AlertTriangle` | `text-functional-error` |

### Reavaliações (Exclusivo das Suas Equipes)
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Taxa de Reversão** | Aprovadas / Solicitadas × 100 | `Target` | Derivada do nível |
| **Reav. Solicitadas** | Contestações das suas equipes (únicas) | `ClipboardList` | `text-brand-muted` |
| **Reav. Aceitas** | Nota alterada (history-based) | `CheckCircle2` | `text-functional-success` |
| **Reav. Recusadas** | Nota mantida (history-based) | `XCircle` | `text-functional-error` |

### Rankings e Tabelas
- **Top Melhores Notas**: `RankingWidget` — top 5 agentes com maiores médias
- **Oportunidades de Melhoria**: `RankingWidget` — top 5 agentes com menores notas
- **Top Reav. Aceitas**: `RankingWidget` — top 5 agentes com mais contestações aprovadas
- **Top Reav. Recusadas**: `RankingWidget` — top 5 agentes com mais contestações negadas
- **Aguardando Minha Ação**: `PendingActionsTable` — monitorias que precisam de decisão

---

## Perfil: Supervisor de Qualidade (`gestor_qualidade`)
*Foco: Visão estratégica, calibração e saúde geral da operação.*

### Visão Macro (Empresa Toda)
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Média Geral** | Σ scores de todas monitorias / total | `Target` | Derivada do nível |
| **Minhas Ações** | Monitorias aguardando decisão do gestor qualidade | `AlertTriangle` | `text-functional-error` |
| **Monitorias** | Volume total da empresa | `ClipboardCheck` | `text-brand-accent` |
| **Tendência** | Média 2ª metade − 1ª metade | `TrendingUp` | `text-brand-highlight` |

### Calibração e Precisão
| Indicador | Cálculo | Ícone | Accent |
|---|---|---|---|
| **Total Pendentes** | Todas ações abertas no sistema | `AlertTriangle` | `text-functional-warning` |
| **Taxa de Reversão Global** | Aprovadas / Solicitadas × 100 (empresa) | `Target` | Derivada do nível |

### Gráficos
- **Precisão da Qualidade**: `PrecisionChart` — estáveis vs reavaliadas
- **Curva de Qualidade**: `DistributionChart` — notas por faixa (Crítico, Regular, Excelente)

### Rankings
- **Ranking de Qualidade**: `RankingWidget` — produtividade dos monitores (quem auditou mais)
- **Melhores/Oportunidades Suporte**: `RankingWidget` — top/bottom agentes global
- **Top Reav. Aceitas (Geral)**: `RankingWidget` — top 5 global
- **Top Reav. Recusadas (Geral)**: `RankingWidget` — top 5 global

---

## Perfil: Administrador (`admin`)
*Foco: Mesmo dashboard do Supervisor de Qualidade — visão estratégica completa.*

Todos os indicadores do perfil `gestor_qualidade` aplicam-se ao `admin`, com acesso total a todos os dados sem filtro de equipe.

---

## Convenções Visuais

| Elemento | Padrão |
|---|---|
| Ícones | `w-5 h-5`, categoria semântica (ver tabela acima) |
| Cor de fundo do ícone | `getIconBg(accent)` — mapeia `text-*` → `bg-*` automaticamente |
| Labels | `uppercase tracking-widest text-[10px] font-black` |
| Cards | `rounded-2xl` ou `rounded-3xl`, `shadow-premium` |
| Cores de nível | `text-level-excelente`, `text-level-aceitavel`, `text-level-atencao`, `text-level-ruim`, `text-level-roxo` |
| Dark mode | Cores pastel (ex: ruim = `#FCA5A5` em vez de vermelho saturado) |
| Auto-conclusão | Ícone `Clock` + label no `RecentAuditsTable` quando `resolution_type === 'automatic'` |

---

*Este documento reflete as fórmulas e convenções programadas no sistema QualiTrack.*
