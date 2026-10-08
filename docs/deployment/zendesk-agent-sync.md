# Agentes Zendesk e bloqueio de acesso no QWP

Em 08/10/2026, a importação consultou as APIs de usuários do Zendesk para `agent` e
`admin`: 112 registros, 111 com e-mail válido. Foram criados 30 perfis provisórios
sem convite ou senha e vinculados 13 perfis QWP já existentes ao ID Zendesk. Os
outros vínculos válidos foram preservados. Um cadastro histórico com ID Zendesk
atribuído à pessoa errada foi desvinculado, sem alterar suas monitorias. Quatro
perfis QWP já vinculados a usuários agora `end-user` no Zendesk foram desativados
após confirmação individual. Um registro sem e-mail foi ignorado.

Para repetir a importação com prévia, usar `scripts/import-zendesk-agents.ps1` com
`-ProjectRef`, `-ZendeskEnvPath` e `-ManagementEnvPath`. A ação só grava com `-Apply`.
O script não convida usuários, não muda papéis QWP existentes, não reativa contas
inativas e interrompe a importação se encontrar vínculos divergentes.

O webhook Zendesk `01M4EB2PX65AT30NQ8KHZHK6DP` assina eventos
`zen:event-type:user.role_changed` para a Edge Function `zendesk-agent-webhook`.
A função aceita somente a transição `agent`/`admin` → `end-user`, verifica HMAC
SHA-256 do corpo bruto e o carimbo de tempo, consulta o usuário novamente no
Zendesk e só então chama a RPC de desativação pelo ID externo único. A operação
registra o evento, marca `public.users.active=false`, revoga sessões Auth, encerra
presença e emite o comando Realtime de logout. Reenvios do mesmo evento são
idempotentes. O histórico de monitorias permanece intacto.

O segredo de assinatura está apenas nos Secrets da Edge Function com o nome
`ZENDESK_AGENT_WEBHOOK_SIGNING_SECRET`; nunca deve ir ao Git ou ao staging.
Se o webhook falhar, verificar as tentativas no Zendesk e os logs da função.
Falhas de usuário QWP não vinculado retornam erro transitório, para que a entrega
possa ser repetida após corrigir o vínculo. Alterações de e-mail e remoções do
usuário Zendesk não são tratadas por este webhook; devem ser reconciliadas na
importação periódica ou em uma extensão futura.
