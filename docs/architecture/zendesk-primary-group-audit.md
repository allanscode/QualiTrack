# Grupo de atendimento e equipe principal

O dashboard filtra pelo grupo guardado na monitoria (`ticket_group_team_id`). O agente pode atender esse grupo sem pertencer a ele no Zendesk. Vínculos atuais, equipe gestora e grupo padrão do agente não substituem o grupo histórico do ticket. Filtro de equipe e permissões continuam cumulativos: para comparar coberturas entre equipes, o administrador deve selecionar somente o grupo.

Em Configurações > Equipes, a conferência Zendesk é somente leitura. Ela apresenta todos os grupos, o grupo principal e o campo de equipe do usuário. Usa `default: true` do vínculo **do agente**, conforme a [API Group Memberships](https://developer.zendesk.com/api-reference/ticketing/groups/group_memberships/); não usa o grupo padrão da conta.

Grupos secundários não geram sugestão de Escala. Sem um único grupo principal, o caso fica para revisão. Uma equipe já atribuída que diverge da sugestão também fica para revisão, permitindo verificar exceções antes de editar o cadastro. Identidades conflitantes nunca geram sugestão. Equipes PJ só aparecem como confirmadas quando o campo de equipe no Zendesk coincide com o cadastro; a conferência não move pessoas nem reescreve monitorias históricas.

O vínculo contratual PJ e a frente principal de atendimento são conceitos diferentes. Regra aprovada: preservar a equipe do agente e vincular cada equipe somente à união dos grupos principais de seus agentes ativos. O grupo de um ticket de escala não adiciona vínculo à equipe nem determina a lotação de um agente sem equipe cadastrada. Uma monitoria de PJ Trindade em Mais Pagamentos participa de ambos os filtros e conta uma única vez no geral.

## Reconciliação dos vínculos

`node scripts/reconcile-team-primary-groups.mjs --project-ref=<ref>` consulta a conferência completa e mostra o plano. `--apply` aplica os vínculos em transação com verificação de concorrência e cópia antes/depois no diretório temporário indicado. Não altera usuários, escopos de gestores ou monitorias. Grupos legados sem ID externo só recebem o ID Zendesk se houver correspondência exata e única do nome. Grupos ausentes/ambíguos e agentes sem vínculo principal impedem a alteração da equipe inteira; equipes sem agentes ativos também são preservadas para revisão, nunca esvaziadas por suposição.

O processo é manual, não um agendamento. A sincronização periódica pode reutilizar as mesmas proteções. Após mudança no elenco ou no grupo principal, executar novamente. Testes do plano: `node --test scripts/team-primary-group-plan.test.mjs`.
