# Alinhamento de erros críticos das fichas no develop — 19/10/2026

## Escopo e origem

O usuário confirmou que removeu todos os itens da lista **Erros Críticos** das fichas. A conferência somente leitura encontrou `critical_errors=[]` nas três fichas ativas da production (`vpytvgpsqdapgouyjowc`). No develop (`secfejmccojxsvdntljx`), a ficha de ticket filho já estava vazia; Cliente Final ainda tinha quatro itens e Revenda tinha dois. Os IDs e os hashes de `sections` das três fichas correspondiam entre os ambientes.

## Backups privados no develop

A primeira transação criou o esquema `qwp_test_backup_20261019_forms_critical_errors` e a tabela `forms_original`, com a linha completa original das fichas Cliente Final e Revenda, antes da atualização. O backup contém exatamente duas linhas, preservando quatro e dois itens em `critical_errors`, respectivamente. A segunda transação criou no mesmo esquema a tabela `child_original`, com a linha completa da ficha de ticket filho antes da remoção das marcas internas. Os hashes integrais confirmaram que as três linhas de backup são iguais às observadas antes das respectivas transações. O esquema e as tabelas não concedem acesso a `PUBLIC`, `anon`, `authenticated` ou `service_role`; as checagens de `USAGE` no esquema e de `SELECT` na tabela do filho para os três papéis de API retornaram `false`.

## SQL e guarda de estado

Os SQLs integrais executados no **develop** estão em [alinhamento de `critical_errors`](../operations/2026-10-19-align-form-critical-errors-develop.sql) e [remoção das marcas internas do filho](../operations/2026-10-19-remove-child-question-critical-flags-develop.sql). Ambos usam `BEGIN`/`COMMIT`, tempo limite de lock e execução, lock de `public.forms` e guarda do hash integral antes da alteração. O primeiro `UPDATE` altera somente `public.forms.critical_errors` das duas linhas identificadas, exige exatamente duas linhas atualizadas e verifica todas as demais colunas. O segundo `UPDATE` remove somente três propriedades `is_critical` presentes em `sections` da ficha de ticket filho, exige exatamente uma linha atualizada e compara o resultado esperado com o backup. Nenhum SQL de mutação foi enviado à production.

| Ficha | ID | Develop antes | Develop depois | Production conferida |
|---|---|---:|---:|---:|
| Cliente Final | `8f84cfd0-8a3c-4735-8921-2eef159f094c` | 4 | 0 | 0 |
| Revenda | `f1fc47e9-6d51-40a5-938e-8108e225195e` | 2 | 0 | 0 |
| Ticket filho | `6c7d1e88-841b-4da9-9a66-9f1464ce896f` | 0 | 0 | 0 |

A ficha de ticket filho tem **seis perguntas**, mas só **três** delas tinham `is_critical=true` nos dois ambientes antes da segunda transação; as outras três não tinham essa propriedade. As três marcas existentes foram removidas somente no develop. Portanto, nesta etapa o develop diverge intencionalmente da production nessa ficha, conforme a correção de escopo do usuário.

## Verificação posterior

- O backup contém duas linhas e os hashes completos originais das fichas Cliente Final (`d1038bc33b3e43f88c1a0c1dfd71a03f`) e Revenda (`d71831c45196899635d9f4bca5e356a5`).
- No develop, os hashes de todas as colunas exceto `critical_errors` permaneceram `1fdba9d4ad4a11cc6613c434fbb21c99` (Cliente Final) e `9a00c7c9c2055386574e32a7f16bc17e` (Revenda). Os hashes de `sections` dessas fichas continuaram `bf66494fb82eb3d3a073814b939dd173` e `ef7f12e4c195d44804264323f3b90a93`.
- O backup do filho tem hash integral `0e7d55fb1a8c803bd4962f0e484748df`. Após a segunda transação, seu hash integral passou a `c46c210ae4dbadbf946bd62e441e4074` e o hash de `sections` a `c2ad48e134ef10a58c2480b49fafc7af`. A consulta confirmou seis perguntas, zero propriedades `is_critical`, igualdade de todas as outras colunas com o backup e igualdade exata de `sections` com o backup após remover apenas as três propriedades.
- As outras duas fichas do develop mantiveram os hashes integrais entre a primeira e a segunda transação. As três fichas da production mantiveram seus hashes integrais após ambas. Não foram alteradas monitorias, Edge Functions, Zendesk, branch ou commits nesta tarefa.

## Validações locais

`npm.cmd run lint` passou. `npm.cmd test` terminou com 520 testes aprovados e sete falhas em `MonitoriaDetails.test.tsx`, `MonitoriaList.actions.test.tsx`, `useMonitoriaActions.test.tsx` e `useMonitoriaSave.test.tsx`; nenhuma alteração de código de aplicação ou teste foi feita nesta tarefa. A verificação direta do banco e dos backups descrita acima passou após as duas transações.
