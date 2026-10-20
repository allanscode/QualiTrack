# Relatório QWP — origem dos tickets e resultado da monitoria

## Resumo para o Alan

**Recorte:** QWP de produção, extraído em **16/10/2026 às 10h44 (Brasília)**. São **853 tickets únicos com monitoria ativa e concluída**: **763 validados** e **90 invalidados**. Outros **74 tickets ainda têm monitoria aberta** e não entram nos resultados finais.

**Principais conversões:** das pesquisas negativas concluídas, **37 viraram positivas**; das positivas concluídas, **3 viraram negativas**. Os tickets filhos tiveram **59 invalidados e 484 validados**; os proativos sem pesquisa tiveram **4 invalidados e 31 validados**.

[Baixar a lista completa em CSV](./2026-10-16-qwp-comparativo-monitorias.csv) — um registro por ticket, com ID do ticket, ID da monitoria, origem, nota, parecer e datas.

## Resultado por origem

| Origem no QWP | Resultado invalidado | Resultado validado | Total concluído |
|---|---:|---:|---:|
| Pesquisa negativa recebida | 24 (39,3%) | 37 (60,7%) | 61 |
| Pesquisa positiva recebida | 3 (1,4%) | 211 (98,6%) | 214 |
| Ticket filho | 59 (10,9%) | 484 (89,1%) | 543 |
| Ticket proativo, sem pesquisa | 4 (11,4%) | 31 (88,6%) | 35 |
| **Total** | **90** | **763** | **853** |

## Como os números foram definidos

- Apenas a monitoria **ativa** e em status `concluida` entra no comparativo. Há 927 monitorias ativas para 927 tickets únicos; 74 ainda não concluídas foram excluídas: 16 de pesquisas negativas, 35 de positivas, 11 filhos e 12 proativos. As 38 monitorias inativas também não entram.
- A origem é atribuída nesta ordem: ficha/tipo de **ticket filho**; `satisfaction_result` **Positiva** ou **Negativa** da monitoria; **proativo sem pesquisa** identificado na fila de origem. Essa precedência impede que um ticket presente em duas filas seja contado duas vezes.
- Para fichas comuns, nota final `>= 75%` é **validado** e `< 75%` é **invalidado**, conforme a regra de domínio do QWP. Para as monitorias históricas de filhos importadas da nota interna do Zendesk, vale o campo `legacy_verdict`, que preserva o parecer antigo mesmo quando diverge da faixa da nota numérica.
- O CSV registra o **parecer salvo no QWP**. Este levantamento não confirma, ticket a ticket, se o resultado foi publicado no Zendesk. Os números podem mudar após esta extração quando monitorias pendentes forem concluídas ou fichas forem corrigidas.
