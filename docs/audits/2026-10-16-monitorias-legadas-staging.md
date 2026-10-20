# Monitorias históricas de chamados filhos no staging — 16/10/2026

## Escopo e autorização

O usuário autorizou registrar o veredito antigo como **monitoria histórica concluída**, identificada como legado. A ficha antiga tinha três critérios; a ficha atual tem seis. O veredito da observação interna do Zendesk é a decisão histórica, e a nota numérica do job antigo é preservada como evidência, sem inferir respostas para os critérios novos.

O recorte auditado contém 132 tickets criados em outubro com observação interna `Chamado filho VÁLIDO/INVÁLIDO`, tag de avaliação e nenhuma monitoria no QWP antes da importação. São 74 vereditos válidos e 58 inválidos. A lista de recibos e notas está em [notas-internas-sem-monitoria-ids.json](./2026-10-16-notas-internas-sem-monitoria-ids.json).

## Base de teste

Projeto Supabase de teste: `secfejmccojxsvdntljx` (`Base Teste - Qualidade WP`). Antes do trabalho, ele estava em `20261008000008` e tinha 110 monitorias. Foi criada uma cópia das tabelas afetadas no esquema privado `qwp_test_backup_20261016`. Os cron jobs e as duas automações de IA foram desativados no staging.

O esquema do staging foi atualizado até `20261016000001`. Para a correção histórica, copiaram-se 132 entradas de catálogo, 132 jobs originais arquivados, 132 jobs correntes, 132 itens da fila de filhos e 117 rascunhos. Após identificar a diferença de contagem apontada pelo usuário, também foram sincronizados todos os 132 usuários e todas as 822 monitorias existentes na produção no momento da conferência, mantendo as 132 monitorias históricas exclusivas do staging. Antes dessa segunda cópia, criou-se o esquema privado `qwp_test_backup_20261016_before_monitoria_sync` com as monitorias, usuários, formulários e equipes do staging. O banco de teste ainda não é um clone integral: outras tabelas continuam com dados próprios ou com apenas o recorte necessário.

A migração [20261016000001_legacy_child_note_monitorias.sql](../../supabase/migrations/20261016000001_legacy_child_note_monitorias.sql) criou uma monitoria concluída por ticket, ligou cada uma ao comentário Zendesk e ao job original por IDs fixos, preservou os 117 rascunhos no histórico e marcou os itens da fila como completos. Não houve nova publicação no Zendesk.

## Resultado verificado no staging

| Verificação | Resultado |
|---|---:|
| Monitorias históricas concluídas | 132 |
| Válido / Inválido | 74 / 58 |
| Recibos ligados à monitoria | 132 |
| Itens da fila concluídos | 132 |
| Rascunhos copiados para o histórico | 117 |
| Rascunhos pendentes desses tickets | 0 |
| Agentes sem usuário correspondente no QWP | 5 |
| Publicações Zendesk novas | 0 |
| Cron jobs ativos no staging | 0 |
| Monitorias da produção sincronizadas no staging | 822 |
| Total de monitorias no staging após sincronização | 954 |
| Monitorias ativas no staging | 916 |
| IDs da produção ausentes no staging na conferência | 0 |

Há 27 divergências entre o veredito textual da nota interna e a classificação que uma nota numérica antiga de 75% sugeriria. Ambas as informações foram preservadas, sem reescrever o parecer. Dez usuários que hoje ocupam outra função foram vinculados às monitorias pelo ID guardado no ticket; cinco tickets continuam com a identidade do agente explicitamente marcada como não resolvida.

### Amostra para conferência

| Ticket Zendesk | Veredito da nota | Nota antiga | ID da monitoria no staging | Observação |
|---|---|---:|---|---|
| [176473](https://webposto.zendesk.com/agent/tickets/176473) | Válido | 85,00% | `2e153dbe-112d-412b-af0f-de83149b8b0b` | Agente vinculado; comentário `54124764984212` |
| [176598](https://webposto.zendesk.com/agent/tickets/176598) | Inválido | 66,70% | `8c5c0c2f-57a5-42bf-8d0b-efd397955b1e` | Agente sem usuário correspondente; comentário `54128054126868` |
| [178869](https://webposto.zendesk.com/agent/tickets/178869) | Válido | 60,00% | `e0eec524-7d34-48ce-876e-b313a6ae7fd6` | Exemplo de divergência entre veredito e nota; comentário `54286401674388` |

A produção foi atualizada após autorização do usuário. A pré conferência encontrou os 132 jobs e itens da fila, 117 rascunhos e nenhuma monitoria preexistente para os tickets alvo. Antes da migração, criou-se o esquema privado `qwp_prod_backup_20261016_legacy_child_note`, com 823 monitorias então existentes, as 132 entradas da fila, os 132 jobs originais, os 117 rascunhos e a definição anterior da função de revisão PJ. A migração transacional `20261016000001` foi aplicada e registrada. Na conferência posterior, a produção tinha 955 monitorias, sendo 132 históricas concluídas (74 válidas e 58 inválidas), 132 recibos vinculados, 132 itens da fila concluídos e nenhum rascunho pendente desses tickets. Nenhum comentário novo foi publicado no Zendesk.

Os três tickets da amostra também foram verificados na produção: `176473` → `e0fb125f-df42-4f61-8258-c86ccc2dd8ab`, `176598` → `c64897bf-cd09-4cc1-a77a-73222c44db` e `178869` → `cb964d06-1aeb-4c80-ac7e-43046eea8606`. Todos estão concluídos e vinculados ao respectivo recibo Zendesk. Os IDs das monitorias de produção diferem dos IDs do staging.

A aplicação de teste em `https://qualitrack-develop.vercel.app/` aponta para o projeto Supabase de staging `secfejmccojxsvdntljx`. A listagem de monitorias aplica filtros de atividade, status, perfil e período; o número visível na interface pode ser inferior ao total físico de 954 registros. A sincronização é um retrato pontual: monitorias criadas depois na produção não entram automaticamente no staging.

## Ajuste posterior de datas

A migra??o `20261016000002_legacy_child_note_dates.sql` ajustou `created_at` e o primeiro evento do hist?rico das 132 monitorias para a hora da observa??o interna Zendesk. Um segundo evento preserva a hora real da importa??o no QWP. Foi aplicada e conferida no staging e na produ??o: ambas as bases t?m 132 datas e linhas do tempo corretas. Antes da atualiza??o, as 132 linhas foram copiadas para `legacy_monitorias_before_date_fix` nos esquemas privados de backup.

A mudan?a de status das fichas com nota inferior a 75% aguarda consulta do status atual no Zendesk. O snapshot local registrava 58 `closed` e 17 `solved`, mas pode estar desatualizado.

## Conciliação dos status em 16/10/2026

A função temporária `legacy-zendesk-status-audit` consultou novamente os 75 tickets com nota histórica abaixo de 75% no Zendesk. A resposta atual tinha 71 `closed` e quatro `solved`: `179639`, `179794`, `179872` e `179950`. Os quatro foram reabertos na produção como `pendente_revisao`, com `concluded_at` vazio e prazo estimado de fechamento calculado a partir de `solved_at`, da agenda Zendesk `40928832528020`, dos feriados retornados pela API e da automação ativa `52771253837588` (56 horas úteis). Os horários estimados em Brasília foram, respectivamente, 10h19, 12h58, 13h45 e 14h34 de 16/10. A automação do Zendesk pode executar depois do instante estimado; o status real continua sendo a fonte de verdade.

A migração `20261016000003_legacy_zendesk_closure_guard.sql` impede que o cron de prazo do QWP finalize essas monitorias legadas antes de o Zendesk confirmar `closed`. A conferência posterior encontrou 128 monitorias legadas concluídas e quatro abertas; entre as 75 abaixo de 75%, 71 concluídas e quatro abertas. Uma cópia anterior à mudança foi guardada em `qwp_prod_backup_20261016_legacy_child_note.legacy_monitorias_before_status_fix`. A consulta e a atualização não publicaram comentários no Zendesk.

Após a conferência, a função temporária de leitura foi removida da produção. O prazo gravado é uma estimativa, e a proteção contra finalização por prazo mantém as fichas abertas até que o Zendesk confirme `closed`.

## Conciliação contínua com o Zendesk

A migração `20261016132741_reconcile_legacy_zendesk_closure.sql` criou uma transição idempotente, restrita à chave de serviço, para concluir somente uma monitoria histórica ativa, abaixo de 75%, ainda em `pendente_revisao` e marcada com status Zendesk `solved`. A Edge Function `legacy-zendesk-closure-sync` lê esses candidatos, consulta o status real no Zendesk e executa a transição apenas quando a resposta é `closed`. Ela não altera tickets nem publica comentários no Zendesk.

A migração e a função foram verificadas no staging. A monitoria do ticket `176598` foi temporariamente reaberta como amostra; a função leu `closed` no Zendesk, concluiu a ficha uma única vez e limpou o prazo estimado. Depois, a linha original foi restaurada a partir do backup privado. Nenhum cron foi ativado no staging.

Na produção, foi criada uma cópia prévia das quatro monitorias abertas em `qwp_prod_backup_20261016_legacy_child_note.legacy_monitorias_before_auto_sync`, aplicada a migração e publicada a função. A execução manual consultou os quatro tickets e encontrou todos ainda `solved`, portanto não concluiu nenhuma ficha. O job `qwp-legacy-zendesk-closure` está ativo com frequência de 15 minutos. O teste da chamada por `pg_net` retornou HTTP 200 com `checked: 4`, `closed: 0`. A produção permaneceu com 128 monitorias legadas concluídas e quatro abertas nessa conferência.
