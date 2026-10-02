# Equipes e grupos de tickets

## Regra de domínio

- **Equipe** é a unidade de gestão. Agentes e gestores são vinculados por `user_teams`; cada agente tem uma `primary_team_id`. A equipe principal do agente determina quem vê e trata suas monitorias, contestações e feedbacks. Uma equipe pode ter uma `parent_team_id` para formar a hierarquia visual, sem herdar acesso a pessoas ou monitorias.
- **Grupo** é a origem operacional do ticket no Zendesk. Ele tem `zendesk_group_id` estável. O nome pode mudar no Zendesk sem criar uma nova identidade.
- Uma equipe pode atender vários grupos e um grupo pode ser atendido por várias equipes (`team_groups`). O grupo **Cliente Final** pode, por exemplo, receber tickets atendidos por agentes PJ e CLT/WebPosto.
- A monitoria preserva o grupo do ticket em `ticket_group_team_id` e registra a equipe gestora em `team_id`. Um gestor vinculado à equipe A não passa a ver monitorias da equipe B só porque ambas atendem o mesmo grupo.
- A associação entre grupo e equipe serve para organizar o atendimento e a configuração. Ela não atribui automaticamente um agente existente a uma equipe. Quando o grupo serve a várias equipes, um agente novo precisa ter sua equipe principal definida no cadastro antes que a monitoria tenha dono.

## Estrutura operacional informada

| Equipe de pessoas | Gestores informados | Observação |
|---|---|---|
| PJ Bruno, PJ Duarte, PJ SumWise e PJ Trindade | Gestores PJ cadastrados | Uma equipe gestora principal para cada operação PJ. |
| WebPosto | Ana Karolina e Ricardo Fadini | Equipe principal CLT. Cliente Final é um grupo de tickets compartilhado com os PJs. |
| Fiscal, subequipe da WebPosto | Margareth | Acesso às monitorias dos próprios agentes. |
| Contábil, subequipe da WebPosto | Maria Cicera | Acesso às monitorias dos próprios agentes. |
| Mais Pagamentos, subequipe da WebPosto | Flaviany | Vincular quando a conta estiver cadastrada. |

Os nomes acima são uma referência de configuração. A permissão efetiva depende do vínculo com o ID da equipe no banco; nomes não são usados para conceder acesso automaticamente.

## Migração do cadastro legado importado

Na base publicada, 64 registros reais estavam classificados como `team`; outros dois (`Equipe Alpha` e `Equipe Beta`) são cadastros de teste inativos. A migração `20261002000003_split_imported_zendesk_groups.sql` aproveita o cadastro `Grupo WebPosto` como equipe principal, preserva os IDs dos outros 63 registros e muda seu tipo para `group`. Cria também as equipes gestoras PJ Bruno, PJ Duarte, PJ SumWise, PJ Trindade, Fiscal, Contábil e Mais Pagamentos. Fiscal, Contábil e Mais Pagamentos ficam como subequipes da WebPosto no painel. Os quatro PJs ficam como equipes principais separadas.

Os agentes e gestores de atendimento são transferidos para a equipe correspondente à antiga equipe principal. As monitorias passam a pertencer à nova equipe, mantendo o grupo original do ticket; os rascunhos de IA passam a apontar para a equipe do agente. Os formulários vinculados a Cliente Final e Revenda ficam disponíveis para WebPosto e as quatro equipes PJ. Grupos de Cliente Final e Revenda podem ser atendidos pelas cinco equipes; grupos fiscais, contábeis e de Mais Pagamentos ficam vinculados às respectivas equipes. Os 16 grupos sem vínculo de pessoas ou regra clara são vinculados à WebPosto, conforme orientação recebida.

Os IDs externos do Zendesk não constavam no cadastro legado. Depois de aplicar a migração, o administrador deve usar **Sincronizar grupos** para associar os IDs por nome. A sincronização procura apenas registros do tipo `group`, evitando confundir uma equipe gestora com um grupo de mesmo nome. O antigo marcador `Grupo WebPosto` é ignorado na sincronização porque agora representa a equipe principal, não um grupo de tickets.

A prévia da base identificou gestores para WebPosto (Ana Karolina e Ricardo Fadini), Fiscal (Margareth), Contábil (Maria Cicera), PJ Bruno (Bruno Araujo) e PJ Trindade (Arthur Santos, Bento Gomes e Júlio Cesar). PJ Duarte, PJ SumWise e Mais Pagamentos ainda não têm gestor de atendimento vinculado; Flaviany não consta como conta ativa na base consultada.

## Configuração no painel

Em **Configurações → Equipes**, use as abas internas **Equipes** e **Grupos do Zendesk**. Na primeira, crie equipes e vincule gestores; na segunda, sincronize o Zendesk, converta cadastros antigos e indique quais equipes atendem cada grupo.

1. Após a migração, revisar as oito equipes reais e a equipe principal de cada agente em **Usuários**. Vincular os gestores ainda ausentes quando as respectivas contas existirem.
2. Sincronizar os grupos do Zendesk para preencher os IDs externos dos grupos importados.
3. Usar o filtro **Sem equipe** em **Grupos do Zendesk** para encontrar eventuais grupos novos ainda não vinculados, e revisar os vínculos existentes quando a operação mudar.
4. Para cadastros legados adicionados posteriormente, corrigir primeiro as equipes principais e os vínculos de agentes e gestores. A conversão individual continua disponível quando o grupo tiver ID do Zendesk.

## Segurança e consistência

- `teams.kind = 'team'` aparece nos seletores de equipe. `teams.kind = 'group'` aparece na lista de grupos.
- Gestores de atendimento só leem suas equipes e os grupos ligados a elas. A relação de equipe superior organiza o painel e não concede acesso às subequipes. RLS de monitorias continua baseada em `monitorias.team_id`, nunca no grupo.
- A conversão usa `convert_team_to_group` em uma transação. Ela não transfere todos os membros para uma equipe única; exige que cada pessoa já tenha a equipe correta e preserva o grupo histórico do ticket.
- Apenas administradores sincronizam grupos com a API do Zendesk. Admin, gestor de qualidade e qualidade podem gerir vínculos no painel conforme as permissões existentes.
