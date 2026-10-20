# Reavaliação por IA de monitorias aguardando gestores — develop

Consulta inicial ao projeto `secfejmccojxsvdntljx` em 19/10/2026. **Nenhum candidato foi gerado, nenhuma monitoria foi alterada e nenhum ticket foi publicado.** A atualização do estado deste lote aparece ao final deste documento.

| Ticket | Monitoria | Status | Nota atual | Prévia |
|---|---|---|---:|---|
| 180753 | `c315a981-c56f-4efd-8081-90981015edb5` | aguardando_gestor_qualidade | 100% | Chamado filho; publicação usa fluxo próprio |
| 185623 | `d7dd7163-ebdd-45a8-b6c7-82e3df4608c0` | aguardando_gestor_qualidade | 0% | Ficha vigente ativa; apta a gerar candidato isolado |
| 185553 | `fb1beb2d-13b7-482c-a827-b7ff2c3f7385` | aguardando_gestor_qualidade | 0% | Ficha vigente ativa; apta a gerar candidato isolado |

**Contagem:** 3 ativas nos dois status solicitados; 2 usam o fluxo normal de Revenda e 1 é chamado filho, que exige avaliação e publicação próprias. A consulta à produção encontrou apenas o chamado filho `180753` aguardando gestor; os dois tickets de Revenda pendentes são exclusivos do develop neste momento. Nenhuma das três monitorias foi reavaliada neste lote.

Após essa prévia inicial, as listas de Erros Críticos de Revenda e Cliente Final foram esvaziadas no develop e as três marcas internas `is_critical` da ficha de Ticket Filho foram removidas, conforme [registro da sincronização](2026-10-19-form-critical-errors-develop-alignment.md). As seis perguntas da ficha de Ticket Filho foram preservadas. A configuração anterior está em backup privado. A produção não foi alterada; nela as listas de Erros Críticos já estão vazias, mas as três marcas internas do Ticket Filho ainda existem.

## Caminho de lote preparado

`node scripts/active-monitoria-reevaluation.mjs` faz a prévia somente leitura, com `SUPABASE_ACCESS_TOKEN` ou `SUPABASE_TOKEN_FILE` no ambiente. `--execute` exige também `SUPABASE_ADMIN_JWT` e `SUPABASE_ANON_KEY` e só inicia depois de confirmar a versão `active-monitoria-reevaluation-v1` da função implantada no **develop**. A execução gera candidatos, sequencialmente, com espera de 32 segundos entre chamadas de IA e relatório JSON por monitoria; não aplica candidatos e não chama a função de publicação. O `request_id` deriva da monitoria e do `updated_at`, para que uma repetição do lote recupere o mesmo candidato.

**Estado na primeira tentativa:** a nova Edge Function e as migrações de candidatos não estavam implantadas no develop; `public.active_monitoria_ai_candidates` não existia. Portanto, `--execute` não foi usado e o lote de IA não foi executado. Esse CLI também exclui o Ticket Filho. A tentativa foi interrompida pelo limite de créditos dos workers Orca; nenhum candidato foi criado.

A escolha de um candidato positivo exige chamada admin `select_active_reevaluation` com `candidate_id` e `selection_note` de pelo menos 15 caracteres. O CLI `node scripts/select-active-reevaluation.mjs <candidate-uuid> <arquivo-da-justificativa>` executa essa chamada somente no develop, com `SUPABASE_ADMIN_JWT` e `SUPABASE_ANON_KEY`. A prévia mostra `requires_human_review` e as razões para que o administrador confira as evidências antes de escolher. A RPC confere a ficha vigente, recalcula a nota com erros críticos zeroantes, recusa nota inferior a 75%, exige monitoria ativa no mesmo estado e sem publicação anterior, conclui com histórico da nota/respostas anteriores e marca o candidato como escolhido na mesma transação. A publicação posterior continua no fluxo oficial; o projeto develop bloqueia envio real ao Zendesk mesmo quando chamado sem `dry_run`.

## Validação local

- `npm.cmd run lint`: passou.
- `node --test scripts/fresh-database.test.mjs`: 15 testes passaram; migrações aplicadas em instalação limpa.
- `node --test scripts/active-monitoria-reevaluation.test.mjs`: passou; cobre recálculo, erro crítico e resposta ausente.
- `npm.cmd test`: 519 passaram, 7 falharam em testes de telas e hooks já alterados no workspace (`MonitoriaDetails`, `MonitoriaList`, `useMonitoriaActions`, `useMonitoriaSave`). Esses testes não exercitam o novo fluxo de candidatos.

## Retomada local após o reset de créditos — 19/10/2026

Foi criado `scripts/local-active-reevaluation.mjs`, restrito por IDs às três monitorias do develop. Ele lê os manuais e fichas vigentes, usa o diálogo já guardado em `form_snapshot.ai_evaluation.dialogue` para os dois atendimentos Revenda e faz somente GET no Zendesk para os comentários, ticket e histórico de abertura do chamado filho. O cálculo da nota usa as respostas da ficha atual; cada pergunta recebe resposta e justificativa resumida. O processo não grava chaves nem diálogos em arquivo ou no candidato. As chamadas de IA são sequenciais, com espera de 32 segundos, até duas tentativas por modelo e troca limitada de modelo. O `request_id` deriva do estado e dos hashes de entrada; a gravação do candidato confere status, `updated_at`, ficha, manuais, diálogo guardado e ausência de publicação, com unicidade no banco. Não foi feito deploy da Edge Function.

Somente a migração `20261019000003_active_monitoria_ai_candidates.sql` foi aplicada ao **develop**. A tabela isolada agora existe, com RLS e `generated_by='local_openrouter'`/`created_by=NULL` para registrar honestamente uma execução técnica sem administrador humano. A migração de seleção `20261019000004` não foi aplicada; ela rejeita chamados filhos e a validação administrativa exige revisão do parecer antes de concluir a monitoria. O filho deverá seguir a macro própria em `helpdesk-queue/publish_child_macro`; os dois atendimentos Revenda seguem o fluxo oficial de publicação de avaliação, após validação. Nenhum fluxo de publicação foi chamado.

O pré voo confirmou três fichas ativas com `critical_errors=[]`: 6 perguntas no filho e 15 em cada Revenda. As fontes têm 2 comentários no Zendesk para o filho e 34/26 mensagens guardadas para 185553/185623. A chave OpenRouter única no arquivo indicado respondeu **HTTP 401, `User not found`** tanto em `/api/v1/auth/key` quanto na primeira chamada de modelo. A execução parou no primeiro ticket antes de produzir parecer. Após isso, consulta direta ao develop confirmou **zero linhas** em `active_monitoria_ai_candidates`, **zero publicações enviadas** para as três monitorias e os três status/notas/`updated_at` originais intactos. Não houve consulta de escrita à production, alteração no Zendesk, commit, mudança de branch nem deploy.

| Ticket | Nota oficial | Nota candidata | Elegível a validação ≥75 | Publicação correta |
|---|---:|---:|---|---|
| 180753 | 100% | indisponível: IA não executou | indeterminada | Macro própria do chamado filho, após revisão e seleção compatível |
| 185553 | 0% | indisponível: IA não executou | indeterminada | Avaliação pelo fluxo oficial, após revisão e seleção |
| 185623 | 0% | indisponível: IA não executou | indeterminada | Avaliação pelo fluxo oficial, após revisão e seleção |

**Retomada:** atualizar a chave OpenRouter no arquivo local indicado; executar `node scripts/local-active-reevaluation.mjs --key-check`, `--preflight` e `--execute` nessa ordem. Não repetir `--migrate`: a tabela já existe. O executor produz no console apenas IDs, notas, estados e respostas resumidas, sem diálogos. Nenhum candidato pode ser aplicado ou publicado automaticamente por este lote; a revisão humana e a seleção transacional compatível com o tipo do ticket ainda precisam ser concluídas.

**Conferência do secret de produção:** em 19/10/2026, a API de gerenciamento do projeto de produção confirmou `OPENROUTER_API_KEY`, mas retornou somente seu digest SHA-256, sem a chave em texto. O digest difere do calculado para a chave local inválida. Logo, a produção possui outra chave cadastrada, mas ela não pode ser recuperada por essa API para executar o lote local no develop. Não houve alteração no secret nem chamada de escrita à produção.

Validações direcionadas nesta retomada: `node --check scripts/local-active-reevaluation.mjs`, `node scripts/local-active-reevaluation.mjs --preflight`, `npm.cmd run lint` e `node --test scripts/active-monitoria-reevaluation.test.mjs` passaram. A suite geral não foi repetida porque as sete falhas anteriores são preexistentes e não cobrem este caminho local.

## Execução com chave válida — 19/10/2026

Foi executado uma única vez `node scripts/local-active-reevaluation.mjs --execute` contra o projeto **develop** `secfejmccojxsvdntljx`. O comando gravou dois candidatos isolados e terminou com código 1 ao avaliar a terceira monitoria: **OpenRouter HTTP 403**, antes de gravar seu candidato. Não houve nova tentativa nem uso de caminho alternativo após esse erro. Os dois resultados já gravados foram preservados.

| Ticket | Candidato | Modelo | Nota candidata | Limiar ≥75 | Nota oficial | Status oficial | Publicações enviadas |
|---|---|---|---:|---|---:|---|---:|
| 180753 | `2730ec56-2faf-419e-ba15-239e941714b2` | `google/gemma-4-31b-it` | 100% | Sim | 100% | `aguardando_gestor_qualidade` | 0 |
| 185553 | `f9b058fd-381e-45f8-852a-2413f4af0430` | `google/gemma-4-31b-it` | 100% | Sim | 0% | `aguardando_gestor_qualidade` | 0 |
| 185623 | nenhum | — | indisponível | indeterminado | 0% | `aguardando_gestor_qualidade` | 0 |

Consulta direta de leitura à tabela `public.active_monitoria_ai_candidates` no develop confirmou contagens **1, 1 e 0** para os tickets acima. Os dois candidatos estão em `completed`, com `generated_by='local_openrouter'`; seus snapshots oficiais coincidem com status, nota, `updated_at`, ficha, respostas, observações, erros críticos e registro de auditor atuais. As três monitorias continuam ativas com as notas e os status originais. Nenhum candidato foi aplicado, nenhum fluxo de publicação foi chamado e não houve escrita em produção ou no Zendesk.

**Pendente:** a terceira monitoria, 185623, não tem candidato por causa do HTTP 403 do OpenRouter. Os dois candidatos existentes ainda exigem revisão e eventual decisão administrativa separada; esta execução não alterou notas ou status oficiais.
