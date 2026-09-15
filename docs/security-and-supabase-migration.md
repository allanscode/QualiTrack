# Segurança e preparação para outro projeto Supabase

Data: 15/09/2026. Base: `origin/main` em `42eb708`.
Branch: `codex/security-supabase-migration`.

## Entrega e limites

Estas mudanças estão no Git. Aplicar código/migrations não configura automaticamente
o Dashboard, as credenciais de e-mail, os domínios do CAPTCHA ou o projeto Vercel.
O banco atual não foi alterado por esta entrega. Não houve envio de e-mails nem remoção de contas reais.

| Achado do reporte | Tratamento |
| --- | --- |
| Leitura transversal de `user_teams` | RLS restritiva: suporte vê os próprios vínculos; gestor de suporte vê sua equipe; qualidade/admin ativos preservam acesso operacional. Só admin ativo escreve vínculos diretamente. |
| Usuários fora da equipe / contas inativas | Nova restrição de leitura em `users`; inativo só lê o próprio perfil para receber a mensagem de conta desativada. |
| `send-email` sem autenticação | JWT validado com `getUser(token)` e perfil ativo admin/gestor de qualidade. Envia apenas recusa de solicitação persistida, com HTML escapado e limites por usuário/solicitação. |
| Erro SMTP exposto | Resposta pública genérica; configurar/testar credenciais reais ainda é necessário. Não há como corrigir uma senha SMTP pelo código. |
| Recuperação revela contas | `public-access` responde uniformemente; erros do Auth não vão para o navegador. CAPTCHA é validado pelo próprio Supabase Auth, uma única vez. |
| Signup / força bruta | Widget Turnstile integrado ao login; desabilitar signup público e habilitar CAPTCHA + limites no Supabase Auth. A trava local continua sendo apenas UX. |
| Solicitação anônima de acesso | INSERT direto revogado; Edge Function valida CAPTCHA/hostname, campos, limite global e por e-mail usando contador atômico no PostgreSQL. |
| CORS | Origem explícita `FRONTEND_URL` nas funções ativas, com rejeição de origens diferentes e métodos indevidos. CORS não substitui JWT/RLS. |
| Mock no bundle | Implementações/seeds separados, carregados somente pelo servidor de desenvolvimento/testes. Build rejeita ambiente incompleto ou chave privilegiada. |
| Metadados `forms`/`form_teams`/critérios | Leitura mantida para perfis ativos para renderizar fichas/monitorias históricas. Não foram tratados como secretos; qualquer restrição adicional precisa considerar os snapshots e o fluxo de revisão. |
| Escalonamento por e-mail fixo na trigger | Removido. Contas novas nascem suporte/inativas e a aprovação administrativa concede acesso. A migração de identidade provisória mantém as referências antes de remover o registro substituído. |
| Conta do teste ofensivo | Localizar pelo e-mail no reporte, verificar com o responsável e desativar/banir no Auth e em `public.users`. Não excluir automaticamente dados/histórico. |
| Re-teste IDOR | Testes PostgreSQL com papéis e dados sintéticos. Repetir no ambiente de homologação com as policies reais restauradas. |

## Ativação no projeto atual (janela de manutenção)

1. Registrar backup e commit de rollback. Confirmar que as migrations até
   `20260826000001` estão representadas no banco. Algumas antigas foram aplicadas por
   SQL Editor e o histórico da CLI pode divergir; não marcar versões como aplicadas sem comparar o schema.
2. Configurar no Dashboard Supabase Auth: signup público desabilitado, confirmação
   de e-mail habilitada, CAPTCHA Turnstile habilitado e limites de autenticação.
   Cadastros do produto usam solicitação + convite administrativo, não `signUp`.
   O controle deve valer também para chamadas diretas a `/auth/v1/token`, `/signup` e `/recover`.
   A resposta genérica do nosso endpoint não altera a resposta dos endpoints gerenciados do Auth.
   Um limite em localStorage não protege esses endpoints.
3. Criar um widget Turnstile permitindo o domínio exato do frontend. Colocar a mesma
   secret no Auth CAPTCHA e em `TURNSTILE_SECRET_KEY` das Edge Functions. A site key
   pública vai em `VITE_TURNSTILE_SITE_KEY`. Nunca usar a secret em variável `VITE_*`.
4. Configurar `FRONTEND_URL`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_HOSTNAME` e
   `SMTP_PORT` em Edge Secrets. O SMTP do Supabase Auth é configuração separada;
   configurar domínio/remetente verificado no provedor e testar convite e recuperação.
5. Aplicar SOMENTE as duas migrations novas, na ordem, primeiro em homologação:
   `20260915000001_security_report_hardening.sql` e
   `20260915000002_safe_auth_onboarding.sql`. Usar transações/stop-on-error.
6. Publicar as funções e o frontend da mesma branch. O formato da chamada de
   `send-email` mudou para `{ type: 'rejection', request_id }`; clientes antigos não
   devem ficar em uso durante a troca. As funções novas usam `verify_jwt=false`
   explicitamente: `send-email` verifica o token internamente; `public-access` é público
   por desenho e valida CAPTCHA. Não aplicar `--no-verify-jwt` indiscriminadamente.
7. Testar login de cada papel, recuperação, convite, rejeição, criação/edição de equipe,
   ficha e monitoria, fila Zendesk e avaliação por IA. Conferir RLS e notificações
   com um usuário real de homologação e verificar 401/403 para chamadas indevidas.

No PowerShell, abrir o terminal na pasta deste checkout e usar `npx.cmd` (não
`npx.ps1`, evitando a restrição de execução de scripts):

```powershell
# Substituir pelo projeto alvo correto; estes comandos publicam funções.
$targetProjectRef = 'REF_DO_PROJETO_ALVO'
npx.cmd supabase functions deploy send-email --project-ref $targetProjectRef
npx.cmd supabase functions deploy public-access --project-ref $targetProjectRef
npx.cmd supabase functions deploy admin-invite-user --project-ref $targetProjectRef
npx.cmd supabase functions deploy admin-update-user-email --project-ref $targetProjectRef
npx.cmd supabase functions deploy helpdesk-queue --project-ref $targetProjectRef
npx.cmd supabase functions deploy helpdesk-publish-evaluation --project-ref $targetProjectRef
```

Todas as funções autenticadas ativas validam explicitamente `getUser(token)` e
o papel ativo, com `verify_jwt=false` para compatibilidade entre projetos com
chaves novas e legadas. O código aceita os mapas de keys `default` fornecidos pelo
runtime e tem fallback para as variáveis legadas. Não remover a validação interna.
O placeholder `admin-create-user` continua sem implementação e não faz parte deste deploy.
Referência: [migração de API keys](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).

## Migração futura: ambiente e dados

O código não depende da referência do projeto antigo. O cliente aceita
`VITE_SUPABASE_PUBLISHABLE_KEY` ou a chave anon legada. Um novo destino exige novo
build na Vercel, pois variáveis `VITE_*` são embutidas no bundle. Sessões do projeto
antigo não autenticam no novo: planejar novo login após o corte.

O workflow GitHub usa configuração fictícia apenas para compilar/testar e não
publica esse bundle. A Vercel compila com suas próprias variáveis. O job Docker
recompila com as quatro variáveis públicas do repositório (`vars.VITE_*`); configurá-las
antes de um merge na `main`, caso a publicação da imagem seja utilizada.

| Camada | O que conferir no destino |
| --- | --- |
| Frontend | URL Supabase, chave pública, site key CAPTCHA; variáveis separadas para Preview/Production e rebuild. |
| Banco | Dados, UUIDs, sequências, constraints, índices, funções, RLS, schema `_private` e histórico `supabase_migrations`. |
| Auth | Usuários/senhas preservados por restauração suportada, configurações, Site URL, redirects exatos, templates, SMTP, CAPTCHA e limites. |
| Edge | Publicar a mesma revisão Git; recriar secrets SMTP, Turnstile, Zendesk, Gemini/OpenRouter. Chaves reservadas Supabase vêm do novo projeto. |
| Storage | Buckets, arquivos de manuais IA, políticas e caminhos; URLs absolutas persistidas precisam apontar ao destino. |
| Agendamentos | Extensões, cron de prazo de ação, webhooks e publicações Realtime. Executar os jobs em apenas um ambiente durante o corte. |
| Integrações | Credenciais de helpdesk/IA e prevenção de envio duplicado ao Zendesk. |

### Caminho escolhido para preservar o sistema atual

Restaurar um backup do schema/dados atuais em um projeto de homologação e depois no
destino. Não reconstruir o banco por seed. Não recriar usuários com novos UUIDs:
monitorias, vínculos e histórico dependem desses identificadores.

O histórico antigo NÃO é uma sequência validada de bootstrap vazio: por exemplo,
`foundation` referencia `users.team_id` que a base inicial não cria, e migrations
antigas recriam tabelas já existentes. `apply_all_pending.sql` é um consolidado
manual, não um passo seguro de migração. Esta entrega neutraliza o seed destrutivo
`20260521000001`, mantendo seu número, mas não reescreve todo o histórico.
Por isso, não executar `db reset`, `db push --include-all` nem o consolidado no destino.
Exportar o estado real e preservar o histórico aplicado é necessário antes de usar
`db push` para versões futuras.

1. Inventariar origem e destino com `supabase/verification/migration-preflight.sql`.
   Guardar as contagens e nomes das policies em local privado. Comparar com a branch.
2. Fazer ensaio de backup/restauração em projeto descartável usando o
   [procedimento oficial de backup e restauração](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
   Esse procedimento inclui schema/dados/roles, histórico da CLI e restauração
   separada das customizações de `auth`/`storage`; arquivos Storage precisam de cópia
   própria. Não versionar dumps com usuários ou dados reais. `backups/` está ignorado.
3. Garantir que `on_auth_user_created` aponta para a função desta branch no destino.
   Não deixar a trigger rodar durante a restauração de usuários Auth; seguir o modo de
   restauração indicado na documentação para não recriar/perder identidades.
4. Conferir os schemas privados, as extensões e eventual Vault/criptografia de colunas
   antes de restaurar; seguir os passos específicos do provedor se usados.
5. Comparar contagens de tabelas, UUIDs, relacionamentos, arquivos e histórico. Verificar
   especialmente `users`, `user_teams`, `monitorias`, `helpdesk_submissions`,
   `ai_evaluation_guidelines` e `ai_evaluation_drafts`.
6. Configurar e validar as camadas da tabela acima. Aplicar as duas novas migrations
   apenas se não estiverem no snapshot/histórico restaurado.
7. Para o corte final, suspender novas escritas, parar cron/integrações da origem,
   capturar backup final, restaurar, validar e publicar a Vercel com as variáveis novas.
8. Manter origem e backup até a validação operacional. Rollback antes de novas escritas
   no destino = voltar o deploy/configuração e reativar a origem. Se houver escritas no
   destino, conciliá-las antes: voltar cegamente perderia os dados novos.

Para upgrade mantendo o mesmo projeto, avaliar a opção de alterar o plano sem trocar
o banco. Para mudança entre projetos, ver
[migração dentro do Supabase](https://supabase.com/docs/guides/platform/migrating-within-supabase).

## Validação reproduzível

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:database
# Configurar as variáveis públicas reais em .env.local antes do build de deploy.
npm.cmd run build
npm.cmd run check:bundle
```

Os testes de banco usam PostgreSQL em memória (PGlite) e uma fixture com roles/RLS,
sem rede nem credenciais de produção. Testam as migrations novas, não toda a cadeia
histórica nem os endpoints do Supabase hospedado. O check do bundle procura marcadores
conhecidos do reporte; não é um scanner universal de segredos.

Nunca commitar `.env`, dumps, service-role keys ou senhas SMTP. A saída de testes
e o commit desta entrega são a referência para a revisão; antes de merge/deploy,
concluir o ensaio com a configuração real de Auth/CAPTCHA/SMTP.
