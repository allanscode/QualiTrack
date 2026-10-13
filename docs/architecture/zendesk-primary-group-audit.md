# Grupo de atendimento e equipe principal

O dashboard filtra pelo grupo guardado na monitoria (`ticket_group_team_id`). O agente pode atender esse grupo sem pertencer a ele no Zendesk. Vínculos atuais, equipe gestora e grupo padrão do agente não substituem o grupo histórico do ticket. Filtro de equipe e permissões continuam cumulativos: para comparar coberturas entre equipes, o administrador deve selecionar somente o grupo.

Em Configurações > Equipes, a conferência Zendesk é somente leitura. Ela apresenta todos os grupos, o grupo principal e o campo de equipe do usuário. Usa `default: true` do vínculo **do agente**, conforme a [API Group Memberships](https://developer.zendesk.com/api-reference/ticketing/groups/group_memberships/); não usa o grupo padrão da conta.

Grupos secundários não geram sugestão de Escala. Sem um único grupo principal, o caso fica para revisão. Uma equipe já atribuída que diverge da sugestão também fica para revisão, permitindo verificar exceções antes de editar o cadastro. Identidades conflitantes nunca geram sugestão. Equipes PJ só aparecem como confirmadas quando o campo de equipe no Zendesk coincide com o cadastro; a conferência não move pessoas nem reescreve monitorias históricas.

O vínculo contratual PJ e a frente principal de atendimento são conceitos diferentes. A definição de substituir um pelo outro exige uma regra de negócio explícita. Os vínculos N:N entre equipes e grupos não são prova da lotação principal de cada agente.
