# Acompanhamento — monitoria do ticket 180219

## Evidência recebida

- Ticket: `180219`.
- Identificador exibido da monitoria: `11146c7f`.
- A tela mostra a etapa atual como `Contestação Negada` e o evento `Contestação negada pela Qualidade` em 19/10/2026 às 08:04.
- O registro do auditor informa que a monitoria foi invalidada por erro crítico ligado à descrição da solução no sistema.
- A tela mostra a ação `Reabrir monitoria`; isso, isoladamente, não confirma o status persistido.

## Questão para retomar

Consulta somente leitura ao banco de produção em 19/10/2026: `status = contestacao_negada`, `active = true`, `concluded_at = null` e prazo de ação em 26/10/2026 08:15 (horário de Brasília). Portanto, a contestação foi negada, mas a monitoria ainda não está concluída/fechada.

Ao retomar, conferir qual ação cabe à equipe de Suporte dentro do prazo e se o fluxo/SLA atual está correto para este caso.

## Por que não aparece nas filas dos gestores

- Consulta somente leitura confirmou que a ficha tem equipe atribuída, o agente está ativo e vinculado a essa equipe; há um gestor de suporte ativo associado à equipe. Há também gestores de qualidade ativos. A política SELECT de produção permite leitura a `gestor_qualidade` e a `gestor_suporte` associado à equipe.
- No código atual, a fila “Ações Expirando” do Gestor de Suporte inclui `pendente_revisao`, `em_contestacao` e `aguardando_gestor_suporte`, mas não `contestacao_negada` (`src/components/dashboard/roles/SupportManagerDashboard.tsx`). A lista de ações pendentes do Gestor de Qualidade inclui `pendente_revisao`, `em_contestacao`, `aguardando_gestor_suporte` e `aguardando_gestor_qualidade`, mas também não `contestacao_negada` (`src/components/dashboard/roles/QualityManagerDashboard.tsx`).
- Portanto, a ausência nas filas de decisão dos dois gestores é compatível com os filtros atuais: `contestacao_negada` não é uma etapa de decisão de nenhum dos gestores. Isso não impede a ficha de aparecer na lista geral de monitorias, que usa outros filtros (inclusive período/equipe/aba).
- Na página geral, as abas rápidas de status também não oferecem `contestacao_negada`; ela deve aparecer em `Todas` ou pela busca. A data de criação é 16/10/2026, dentro do período padrão de 30 dias.
