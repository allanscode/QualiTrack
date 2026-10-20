# Notas internas no Zendesk sem monitoria no QWP — 16/10/2026

## Resposta direta

O comentário interno antigo de **chamado filho válido/inválido** não era uma monitoria salva. O fluxo anterior aceitava `ticket_id`, veredito e texto da macro, publicava a nota privada no Zendesk e aplicava a tag `qwp_filho_avaliado` sem exigir um registro em `public.monitorias`. Por isso o ticket aparenta ter sido avaliado no Zendesk, mas não entra nos indicadores de monitorias do QWP. A implementação atual de `publish_child_macro` exige o ID de uma ficha ativa, concluída e salva antes de publicar; os casos encontrados são históricos.

Conferi também a versão anterior ao commit `d1b402b`: o endpoint `publish_child_macro` validava `child_verdict` e `comment_text`, sem consultar `monitorias`. Na versão atual, a ação consulta a ficha pelo ID e rejeita o envio quando ela não está salva, ativa e concluída (`supabase/functions/helpdesk-queue/index.ts` e `child-publication.ts`).

## Recorte exato e evidências

Consulta direta ao Zendesk e ao Supabase de produção em **16/10/2026, 08h22–08h24, horário de São Paulo**. Mantive o intervalo solicitado: tickets criados de **01/10 00h00 até 17/10 00h00**, inclusive a parte já transcorrida de 16/10. Pesquisei apenas candidatos com o texto/tag do QWP e li os comentários de cada ticket para confirmar `public=false`; uma tag isolada não foi contada como nota. O [Zendesk define `public=false` como nota interna](https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_comments/). A busca pode levar alguns minutos para indexar atualizações, conforme a [Search API](https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/).

| Tickets com nota interna do QWP | No período | Todos os períodos |
|---|---:|---:|
| Nota privada confirmada no Zendesk | 537 | 569 |
| Com pelo menos uma monitoria salva no QWP | 405 | 407 |
| **Nota privada, mas nenhuma monitoria no QWP** | **132** | **162** |

Os **132 tickets do período** têm exatamente uma nota privada antiga cada, publicada entre 01 e 06/10: **74** começam com `Chamado filho VÁLIDO` e **58** com `Chamado filho INVÁLIDO`. Nenhuma dessas notas contém `Registro do Auditor da monitoria #UUID`, que identifica uma ficha formal. Em todos os 132, a nota foi publicada depois de um job antigo de IA de **três critérios**, e esse job foi preservado em `child_ai_legacy_jobs`. A distância entre a conclusão do job antigo e a nota foi de 6 a 202 segundos. A presença da nota, portanto, não prova que a ficha oficial foi preenchida ou salva.

## Por que continuam sem contar após a correção da PR #68

A PR #68 preservou o job antigo e recolocou os tickets de 01 a 06/10 na avaliação de **seis critérios**. Todos os 132 já entraram nessa recuperação; **nenhum está simplesmente aguardando na fila `pending`** no horário da consulta.

| Estado atual no QWP | Tickets | Motivo para não existir ficha |
|---|---:|---|
| `review_required` com novo job de seis critérios e rascunho salvo | 117 | Em 106, faltou evidência ou houve critério não aplicável; em 11, o parecer foi não conforme/inconclusivo. Exige decisão humana antes de salvar a ficha. |
| `blocked`, ainda com o job antigo de três critérios | 15 | Não foi possível identificar com segurança o agente ativo ou sua equipe de gestão. Não há rascunho novo. |

Entre os 117 em revisão, **61 têm nota calculada de 75% ou mais**, mas a nota numérica não supre a falta de evidência; a automação os deixou corretamente para revisão. O veredito da nota antiga também não substitui as respostas da ficha atual. Dos 132 tickets, **118 já estão fechados** e 14 estão `solved`. Em **106 dos 117 rascunhos**, o snapshot também está `closed`; a lista normal da Central de Filas filtra tickets fechados, então esses itens não aparecem ali para revisão. A busca manual pelo ID em **Nova Monitoria** oferece um caminho de recuperação, mas a fila precisa expor essas pendências de forma própria para que não se percam.

Os **30 casos anteriores a 01/10** completam o total global de 162: cinco já estão em revisão/bloqueio e **25 não têm nova fila**. A migração de recuperação limitou deliberadamente a seleção a jobs concluídos de 01 a 06/10; esses 25, criados em 23 ou 30/09, ficaram fora do recorte. Devem ser analisados antes de uma recuperação adicional, preservando o parecer original e evitando duplicação.

## Consequência prática e correção necessária

O Zendesk tem a **observação histórica**; o QWP só contabiliza uma monitoria quando existe uma linha válida em `monitorias`. A tag `qwp_filho_avaliado` indica saída da view do Zendesk e não é um comprovante de ficha salva. A correção do endpoint atual impede repetir esse descompasso nos novos envios, mas não transforma automaticamente as notas antigas em fichas, porque os três critérios antigos não preenchem os seis critérios oficiais.

Para encerrar os 132 casos do período com integridade: disponibilizar os 117 rascunhos para revisão mesmo quando o ticket está fechado, resolver o vínculo de agente/equipe dos 15 bloqueados e salvar a ficha oficial após conferência humana. Em tickets fechados, a ficha pode ser contabilizada no QWP, mas um novo comentário no ticket original pode não ser permitido; a [documentação do Zendesk](https://support.zendesk.com/hc/en-us/articles/7335734335258-Modifying-closed-tickets) restringe as alterações em tickets fechados. A publicação externa e a contabilização interna devem permanecer métricas separadas.

Os [IDs, notas e motivos por ticket](./2026-10-16-notas-internas-sem-monitoria-ids.json) estão disponíveis para triagem. Esta auditoria foi somente leitura; não criou fichas nem repetiu comentários no Zendesk.
