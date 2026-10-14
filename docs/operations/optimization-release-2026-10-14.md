# Otimizações de leitura de monitorias e dashboard — 14/10/2026

**Situação:** código publicado em produção; validação funcional e medição após o deploy em [WQ-78](https://qualityautomacao.atlassian.net/browse/WQ-78), coluna **Fase de Teste**.

**Aplicação publicada:** alterações funcionais do commit `a724e967a358f3e511ee2e11ab3c0e707bd01dba`, inicialmente implantadas pela Vercel como `dpl_CQ4tHnSKYMfr66K9FWjx1uCf8iDg`. O endereço estável é [qwp.qualityautomacao.com.br](https://qwp.qualityautomacao.com.br), que respondeu HTTP 200 na verificação de 14/10/2026. Commits posteriores apenas de documentação podem gerar outro ID de deploy sem mudar o código da aplicação. Essa checagem não substitui o teste autenticado dos fluxos abaixo.

## O que mudou

| Entrega | Mudança | Efeito esperado |
|---|---|---|
| [PR #58](https://github.com/allanscode/QualiTrack/pull/58) | Lista paginada no servidor, 50 monitorias por página, projeção menor, ficha completa sob demanda, índice leve para notificações e tickets auditados, agregação de indicadores pela RPC `dashboard_aggregates` e índices de leitura. | Menos dados transferidos e menos cálculo de indicadores no navegador. O CSV da lista exporta a página atual. |
| [PR #59](https://github.com/allanscode/QualiTrack/pull/59) | Removeu `display_id` da consulta paginada, pois a coluna não existe no banco de produção. | Restabeleceu a compatibilidade da lista com o schema publicado. |
| [PR #60](https://github.com/allanscode/QualiTrack/pull/60) | Separou o histórico leve usado por tendências e pendências das fichas completas, buscadas apenas para o período selecionado. Os envios de helpdesk seguem esse período; o CSV do detalhamento busca campos extras ao exportar. | Evita carregar respostas, observações, histórico e `form_snapshot` de todos os anos a cada abertura do dashboard. |

O perfil `suporte` continua consultando `vw_monitorias_suporte`, preservando o anonimato do auditor. O gestor de suporte continua limitado às próprias equipes. A troca rápida de datas descarta respostas antigas antes de atualizar a tela. O PR #60 não exigiu migração de banco; as migrações do PR #58 foram aplicadas antes daquela publicação.

## Verificações feitas

- PR #58: lint, 509 testes de frontend, 98 testes de banco e build passaram.
- PR #59: consulta conferida contra o schema de produção; lint, testes da lista e build passaram.
- PR #60: lint, 511 testes em 107 arquivos, build e checks do GitHub passaram. O teste novo confere histórico leve, detalhes do período e uso da view anônima pelo suporte.
- O deploy Vercel de produção terminou em `Ready`; o domínio oficial respondeu HTTP 200.

## Validação funcional em WQ-78

1. Conferir paginação, busca, filtros e abertura de ficha na lista de monitorias. Confirmar que o CSV da lista contém apenas a página atual.
2. Comparar indicadores, rankings e tendências do dashboard com os mesmos filtros antes e depois de mudar mês, equipe, grupo e canal. Repetir com um período histórico e um período amplo.
3. Conferir pendências e prazos de ação que estejam fora do mês exibido. Verificar o alerta de chamados negativos dos últimos 90 dias.
4. Abrir o detalhamento e exportar CSV, conferindo ação corretiva, contestação e contexto do ticket. Verificar as respostas e o snapshot de uma ficha do período.
5. Testar com `suporte` e `gestor_suporte`: nenhum nome ou ID de auditor deve aparecer para `suporte`, e o gestor deve ver apenas equipes autorizadas.
6. Registrar no navegador os bytes HTTP e o tempo de carregamento do dashboard por perfil e período. Comparar com a referência em [medição das consultas](monitoria-query-plans.md), usando a mesma amostra e condições de cache.

Os números anteriores à publicação (~6,2 MB para todas as fichas, ~635 kB para uma página de 50 e ~74 kB para o índice de tickets) são referências de volume da leitura, **não** uma medição HTTP ou de latência após o deploy. Nenhum ganho percentual pós-deploy foi confirmado ainda. Períodos muito amplos ainda carregam as fichas completas correspondentes; se isso se tornar pesado, os widgets que dependem das respostas precisarão de agregações específicas no servidor.
