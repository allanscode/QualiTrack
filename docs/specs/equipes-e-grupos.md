# Equipes e grupos de tickets

## Regra de domínio

- **Equipe** é a unidade de gestão. Agentes e gestores são vinculados por `user_teams`; cada agente tem uma `primary_team_id`. A equipe principal determina quem vê e trata suas monitorias, contestações e feedbacks.
- **Grupo** é a origem operacional do ticket no Zendesk. Ele tem `zendesk_group_id` estável. O nome pode mudar no Zendesk sem criar uma nova identidade.
- Uma equipe pode atender vários grupos e um grupo pode ser atendido por várias equipes (`team_groups`). O grupo **Cliente Final** pode, por exemplo, receber tickets atendidos por agentes PJ e CLT/WebPosto.
- A monitoria preserva o grupo do ticket em `ticket_group_team_id` e registra a equipe gestora em `team_id`. Um gestor vinculado à equipe A não passa a ver monitorias da equipe B só porque ambas atendem o mesmo grupo.
- A associação entre grupo e equipe serve para organizar o atendimento e a configuração. Ela não atribui automaticamente um agente existente a uma equipe. Quando o grupo serve a várias equipes, um agente novo precisa ter sua equipe principal definida no cadastro antes que a monitoria tenha dono.

## Estrutura operacional informada

| Equipe de pessoas | Gestores informados | Observação |
|---|---|---|
| PJ 1, PJ 2, PJ 3 e PJ 4 | Gestores de atendimento já cadastrados | Uma equipe gestora para cada grupo de profissionais PJ; os nomes exatos das equipes devem ser definidos no painel. |
| CLT/WebPosto que atende Cliente Final | Ana Karolina e Ricardo Fadini | Cliente Final é um grupo de tickets compartilhado, não uma equipe exclusiva. |
| Fiscal | Margareth | Vincular a conta existente à equipe real. |
| Contábil | Maria Cicera | Vincular a conta existente à equipe real. |
| Mais Pagamentos | Flaviany | Vincular quando a conta estiver cadastrada. |

Os nomes acima são uma referência de configuração. A permissão efetiva depende do vínculo com o ID da equipe no banco; nomes não são usados para conceder acesso automaticamente.

## Configuração no painel

Em **Configurações → Equipes**, use as abas internas **Equipes** e **Grupos do Zendesk**. Na primeira, crie equipes e vincule gestores; na segunda, sincronize o Zendesk, converta cadastros antigos e indique quais equipes atendem cada grupo.

1. Criar ou revisar as equipes reais e definir a equipe principal de cada agente em **Usuários**. Vincular cada gestor às equipes sob sua responsabilidade.
2. Sincronizar os grupos do Zendesk. A sincronização usa o ID externo; um cadastro antigo com o mesmo nome fica marcado para conversão explícita.
3. Para cada cadastro antigo que represente um grupo, corrigir primeiro as equipes principais e os vínculos de agentes e gestores. A conversão é bloqueada enquanto alguém depender do cadastro antigo como equipe.
4. Converter o cadastro antigo em grupo escolhendo a primeira equipe que o atende. O banco distribui monitorias históricas pela equipe principal do agente avaliado. Depois, adicionar todas as demais equipes que também atendem o grupo.
5. Grupos sem equipe vinculada ficam visíveis como pendência de configuração. Um grupo compartilhado nunca determina sozinho a equipe de um agente.

## Segurança e consistência

- `teams.kind = 'team'` aparece nos seletores de equipe. `teams.kind = 'group'` aparece na lista de grupos.
- Gestores de atendimento só leem suas equipes e os grupos ligados a elas. RLS de monitorias continua baseada em `monitorias.team_id`, nunca no grupo.
- A conversão usa `convert_team_to_group` em uma transação. Ela não transfere todos os membros para uma equipe única; exige que cada pessoa já tenha a equipe correta e preserva o grupo histórico do ticket.
- Apenas administradores sincronizam grupos com a API do Zendesk. Admin, gestor de qualidade e qualidade podem gerir vínculos no painel conforme as permissões existentes.
