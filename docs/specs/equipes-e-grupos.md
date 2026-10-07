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
| WebPosto | Gestões distribuídas pelas subequipes | Equipe principal CLT. Agentes ainda sem indicação operacional permanecem aqui até a atribuição no painel. |
| Cliente Final, subequipe da WebPosto | Ana Karolina e Ricardo Fadini | Gestão dos agentes CLT designados para Cliente Final. |
| Revenda, subequipe da WebPosto | Victor Ellyan Aguiar | Gestão dos agentes CLT designados para Revenda. |
| Escala, subequipe da WebPosto | Victor Ellyan Aguiar | Gestão dos agentes CLT vinculados aos dois tipos de ticket ou a grupos de Escala/TEF. |
| Fiscal, subequipe da WebPosto | Margareth | Acesso às monitorias dos próprios agentes. |
| Contábil, subequipe da WebPosto | Maria Cicera | Acesso às monitorias dos próprios agentes. |
| Mais Pagamentos, subequipe da WebPosto | Flaviany | Vincular quando a conta estiver cadastrada. |

Os nomes acima são uma referência de configuração. A permissão efetiva depende do vínculo com o ID da equipe no banco; nomes não são usados para conceder acesso automaticamente.

**Cliente Final** e **Revenda** também existem como grupos de tickets do Zendesk. Esses grupos são compartilhados pelas equipes CLT e PJ. O grupo do ticket não altera automaticamente a equipe principal do agente, o gestor responsável nem a visibilidade das monitorias. A migração inicial usa os vínculos reais do perfil e dos grupos Zendesk para registrar a equipe gestora; agentes sem indicação suficiente permanecem na WebPosto para atribuição em **Usuários → Equipe principal**.

O administrador pode usar **Conferir no Zendesk** na aba **Equipes** para comparar os vínculos reais de agentes com os grupos e o campo de perfil `vinculado_a_equipe`. O campo PJ prevalece sobre os grupos de tickets. Sem PJ, grupos dos dois lados indicam Escala; grupos de Cliente Final/Cliente Sul ou Revenda indicam a frente respectiva; grupos apenas de Escala/TEF indicam Escala. O relatório é somente leitura, usa o token guardado na Edge Function e mostra apenas usuários já cadastrados no QualiTrack. A equipe principal pode ser corrigida em **Usuários**.

### Levantamento Zendesk de 05/10/2026

A consulta de 553 vínculos em seis páginas, complementada pelos perfis de usuário, encontrou **18 atendentes para Cliente Final**, **20 para Revenda**, **5 para Escala**, **1 para Mais Pagamentos** e **2 para equipes PJ** que ainda constavam na raiz. A migração `20261005000001_webposto_management_divisions.sql` inclui esses 46 IDs como fotografia da consulta e só os move se ainda estiverem ativos, com papel `suporte` e equipe principal WebPosto. Os 11 atendentes já vinculados a equipes PJ permanecem nelas, independentemente dos grupos de tickets atendidos. Victor aparece nos dois conjuntos de grupos, mas vai para Revenda e acompanha Escala pela decisão explícita de gestão.

Somente **Jhonatan Valentim** (sem grupos retornados) e **Leonardo Luzolo** (apenas grupo Migração) permanecem na WebPosto sem gestor definido. Nenhum dos dois possui monitoria ativa no levantamento. O vínculo do grupo Migração ou a ausência de grupos não indica com segurança Cliente Final, Revenda ou Escala. A equipe raiz não concede automaticamente a seus gestores acesso às subequipes; a atribuição desses dois fica destacada no painel.

## Migração do cadastro legado importado

Na base publicada, 64 registros reais estavam classificados como `team`; outros dois (`Equipe Alpha` e `Equipe Beta`) são cadastros de teste inativos. A migração `20261002000003_split_imported_zendesk_groups.sql` aproveita o cadastro `Grupo WebPosto` como equipe principal, preserva os IDs dos outros 63 registros e muda seu tipo para `group`. Cria também as equipes gestoras PJ Bruno, PJ Duarte, PJ SumWise, PJ Trindade, Fiscal, Contábil e Mais Pagamentos. Fiscal, Contábil e Mais Pagamentos ficam como subequipes da WebPosto no painel. Os quatro PJs ficam como equipes principais separadas.

Os agentes e gestores de atendimento são transferidos para a equipe correspondente à antiga equipe principal. As monitorias passam a pertencer à nova equipe, mantendo o grupo original do ticket; os rascunhos de IA passam a apontar para a equipe do agente. Os formulários vinculados a Cliente Final e Revenda ficam disponíveis para WebPosto e as quatro equipes PJ. Grupos de Cliente Final e Revenda podem ser atendidos pelas cinco equipes; grupos fiscais, contábeis e de Mais Pagamentos ficam vinculados às respectivas equipes. Os 16 grupos sem vínculo de pessoas ou regra clara são vinculados à WebPosto, conforme orientação recebida.

Os IDs externos do Zendesk não constavam no cadastro legado. Depois de aplicar a migração, o administrador deve usar **Sincronizar grupos** para associar os IDs por nome. A sincronização procura apenas registros do tipo `group`, evitando confundir uma equipe gestora com um grupo de mesmo nome. O antigo marcador `Grupo WebPosto` é ignorado na sincronização porque agora representa a equipe principal, não um grupo de tickets.

A prévia da base identificou gestores para WebPosto (Ana Karolina e Ricardo Fadini), Fiscal (Margareth), Contábil (Maria Cicera), PJ Bruno (Bruno Araujo) e PJ Trindade (Arthur Santos, Bento Gomes e Júlio Cesar). PJ Duarte, PJ SumWise e Mais Pagamentos ainda não têm gestor de atendimento vinculado; Flaviany não consta como conta ativa na base consultada.

## Configuração no painel

### Revisão das equipes PJ

As equipes PJ Bruno, PJ Duarte, PJ SumWise e PJ Trindade usam `requires_pj_review = true`. Em **Configurações → Equipes**, o cartão **Fluxo das equipes PJ** resume a regra de encaminhamento direto à Qualidade. A antiga configuração de revisor permanece no banco apenas para preservar o histórico e não participa de novos encaminhamentos.

Uma nova monitoria de agente PJ com nota **igual ou superior a 75%** é concluída diretamente, como as demais monitorias positivas. Com nota **inferior a 75%**, ela começa em **Pendente de revisão**. O gestor da equipe PJ envia aprovação ou contestação com justificativa diretamente para o **Gestor da Qualidade**, responsável pela decisão final. O painel mostra as duas etapas e os pareceres na linha do tempo. O prazo vencido continua visível, mas o cron não conclui automaticamente uma monitoria PJ em revisão. A macro do Zendesk só pode ser oferecida após o veredito final.

Em **Configurações → Equipes**, use as abas internas **Equipes** e **Grupos do Zendesk**. Na primeira, abra o cartão de uma equipe para gerir seus gestores, agentes e grupos do Zendesk no mesmo painel. A aba **Grupos do Zendesk** permite sincronizar, converter cadastros antigos e editar o vínculo pelo lado do grupo. O vínculo grupo–equipe é muitos para muitos.

No painel da equipe, **Gestor das aprovações** permite designar um dos gestores ativos vinculados ou manter **Qualquer gestor vinculado**. A escolha limita quem pode aprovar ou contestar as monitorias daquela equipe; não muda as regras atuais sobre quais monitorias precisam de aprovação nem o acesso de leitura dos outros gestores. O servidor verifica essa regra na RPC, inclusive no fluxo PJ. Ao remover o gestor designado da equipe, a designação é limpa automaticamente.

1. Após a migração, revisar as oito equipes reais e a equipe principal de cada agente em **Usuários**. Vincular os gestores ainda ausentes quando as respectivas contas existirem.
2. Sincronizar os grupos do Zendesk para preencher os IDs externos dos grupos importados.
3. Usar o filtro **Sem equipe** em **Grupos do Zendesk** para encontrar eventuais grupos novos ainda não vinculados, e revisar os vínculos existentes quando a operação mudar.
4. Para cadastros legados adicionados posteriormente, corrigir primeiro as equipes principais e os vínculos de agentes e gestores. A conversão individual continua disponível quando o grupo tiver ID do Zendesk.

## Segurança e consistência

- `teams.kind = 'team'` aparece nos seletores de equipe. `teams.kind = 'group'` aparece na lista de grupos.
- Gestores de atendimento só leem suas equipes e os grupos ligados a elas. A relação de equipe superior organiza o painel e não concede acesso às subequipes. RLS de monitorias continua baseada em `monitorias.team_id`, nunca no grupo.
- A conversão usa `convert_team_to_group` em uma transação. Ela não transfere todos os membros para uma equipe única; exige que cada pessoa já tenha a equipe correta e preserva o grupo histórico do ticket.
- Apenas administradores sincronizam grupos com a API do Zendesk. Admin, gestor de qualidade e qualidade podem gerir vínculos no painel conforme as permissões existentes.
