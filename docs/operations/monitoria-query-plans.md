# Medição das leituras de monitorias e dashboard

As consultas novas usam `active = true`. Por isso, o índice parcial existente
`idx_monitorias_created_at` volta a ser elegível para a lista geral. A migração
`20261014000003_monitoria_read_indexes.sql` acrescenta índices compostos para
as listas por equipe, agente avaliado, grupo do ticket e revisor PJ. Não remove
os índices antigos sem dados de uso que comprovem a substituição. O procedimento
segue a [orientação do Supabase sobre filtros, ordenação, índices parciais e
EXPLAIN](https://supabase.com/docs/guides/database/query-optimization).

## Procedimento

1. Use uma cópia de staging com distribuição e quantidade de registros próximas
   da produção. Aplique as migrações do dashboard e dos índices. Execute
   `ANALYZE public.monitorias;` após carregar os dados.
2. Rode [monitoria-read-plans.sql](../../supabase/verification/monitoria-read-plans.sql)
   como administrador do banco, substituindo os UUIDs por IDs **reais de
   staging**. Faça uma rodada por perfil ativo. Mantenha `SET LOCAL ROLE
   authenticated` e o JWT simulado dentro da transação para incluir RLS na
   medição. Execute só as consultas permitidas para o perfil escolhido.
3. Repita cada caso com página inicial e uma página mais profunda, datas com
   alta e baixa cardinalidade e filtros usados de fato. Para a busca textual
   por ticket, meça separadamente a consulta exata e a busca parcial.
4. Registre `Execution Time`, `actual rows`, `Rows Removed by Filter`, blocos
   lidos do disco e do cache, nós `Sort` e o nome do índice escolhido. Compare
   os mesmos casos antes e depois dos índices; uma única execução fria pode
   distorcer o resultado.
5. Meça também a latência do RPC `dashboard_aggregates` para todos os perfis.
   `EXPLAIN` sobre a chamada mostra o tempo total, mas não abre os planos das
   consultas internas da função. Para investigá-las, use `pg_stat_statements`
   ou `auto_explain` em staging, conforme as extensões disponíveis no projeto.

Um `Seq Scan` em tabela pequena não é necessariamente ruim. Índices adicionais
devem ser mantidos apenas se reduzirem leitura/tempo em casos representativos:
eles ocupam espaço e aumentam o custo de gravação. O filtro de grupo ausente
(`ticket_group_team_id IS NULL`) e a tela de fichas removidas (`active = false`)
não usam os novos índices parciais e precisam de medição própria antes de
receber outro índice.

Os primeiros números de produção estão na seção abaixo. Com o volume atual,
eles não comprovam ganho de latência pelos índices; colete novas medições antes
de remover índices existentes.

## Medição em produção (14/10/2026)

Não há projeto de staging. A medição foi feita em produção, apenas com
`SELECT`/`EXPLAIN ANALYZE` somente leitura, antes de aplicar os novos índices.

- Volume: 534 monitorias (496 ativas), 7,7 MB na tabela.
- Lista por equipe (50 itens): `Bitmap Index Scan` em
  `idx_monitorias_team_id_active` + `top-N heapsort`, **0,5 ms** de execução.
  Nesse volume, os índices novos não trazem ganho mensurável de latência.
- Volume trafegado:
  - carga antiga (todas as fichas, todas as colunas): **~6,2 MB**;
  - página nova (50 fichas, todas as colunas): **~635 kB**;
  - índice de tickets auditados (colunas mínimas): **~74 kB**.
- `form_snapshot` responde por ~3,5 MB do total. Selecionar colunas na lista,
  sem o snapshot, é a próxima redução relevante de volume.

Os índices foram mantidos para quando a tabela crescer. Repita as medições
quando ela passar de ~10 mil linhas e remova os índices que não forem usados
(`pg_stat_user_indexes.idx_scan`).
