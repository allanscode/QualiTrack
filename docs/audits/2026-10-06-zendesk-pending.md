# Conferência de publicação Zendesk — 06/10/2026

Consulta somente leitura ao Supabase de produção, projeto `vpytvgpsqdapgouyjowc`, para os seis IDs mostrados na view de CSAT Negativas. A tabela `helpdesk_submissions` não tem envio registrado para nenhum deles.

| Ticket | Estado no QualiTrack | Nota | Resultado do registro | Próxima ação |
|---|---|---:|---|---|
| 178984 | Monitoria ativa, `pendente_revisao` | 47,06% | Invalidado; o auditor apontou falhas na solução e tabulação | Concluir revisão e confirmar a macro |
| 178786 | Monitoria ativa, `pendente_revisao` | 60,00% | Invalidado; o auditor apontou falhas no fluxo de inatividade e na tabulação | Concluir revisão e confirmar a macro |
| 178943 | Monitoria ativa, `pendente_revisao` | 35,83% | Invalidado; o auditor apontou erros críticos de encerramento, análise e tabulação | Concluir revisão e confirmar a macro |
| 179150 | Somente rascunho de IA; nenhuma monitoria | 36,25% no rascunho | IA sugeriu invalidação | Conferir rascunho, criar monitoria e concluir revisão |
| 178677 | Somente rascunho de IA; nenhuma monitoria | 23,75% no rascunho | IA sugeriu invalidação | Conferir rascunho, criar monitoria e concluir revisão |
| 179086 | Somente rascunho de IA; nenhuma monitoria | 77,92% no rascunho | IA apontou não conformidade crítica apesar da nota; veredito final indefinido | Conferir critérios, criar monitoria e concluir revisão |

A classificação de publicação usa a **nota final da monitoria**: pelo menos 75% = ticket válido; abaixo de 75% = invalidado. Um rascunho de IA não define o veredito final. O texto da macro é preparado a partir do registro do auditor e do retorno do cliente, com revisão e confirmação humana antes do envio.

## Chamados filhos

O catálogo de filas contém 95 registros de filhos verificados desde 05/10/2026; 89 já tinham a tag `qwp_filho_avaliado` no retrato salvo e seis não tinham. Nenhum desses seis tinha monitoria ou job de IA de chamado filho. O catálogo é um retrato, não substitui uma leitura do ticket no Zendesk na hora do envio. A macro de filho mantém fluxo próprio de revisão, envio e marcação de saída da view.

## Correção no código

- Negativas com monitoria e sem recibo `sent` continuam visíveis para revisão; a fila impede iniciar outra monitoria por engano.
- Filhos não saem da fila somente porque existe uma monitoria; a saída depende da macro e de sua tag.
- O servidor recusa publicar monitorias sem veredito final ou nota válida.
- Após publicar, os campos da macro são conferidos. Se o Zendesk não os gravar, a correção tenta apenas os campos, sem repetir o comentário.
