# Segurança e preparação para outro projeto Supabase

Atualização: 16/09/2026. Base: `origin/main` em `42eb708`.
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

## Novo destino: arquitetura sem dados de teste

**Decisão atual do usuário:** nunca houve produção; os registros são somente testes
da equipe de desenvolvimento. Portanto, o caminho escolhido é instalação limpa,
não backup/restauração de usuários e monitorias.

O pacote reproduzível está implementado em `supabase/bootstrap` e
`scripts/prepare-supabase.mjs`. O procedimento completo, com comandos para o
workdir isolado da CLI, está em [Instalação limpa](supabase-clean-install.md).
O histórico legado foi preservado; não executar toda a cadeia antiga no destino.
As duas migrations de segurança já estão incluídas na base nova.

Para o banco atual, continuam valendo somente as migrations incrementais revisadas
e o procedimento acima, depois de conferir o estado real. O instalador novo **não
é uma atualização do projeto free existente**.

## Complementos implementados nesta etapa

- Remoção da CSP conflitante do HTML; CAPTCHA permitido pelos headers. Remoção
  das referências de metadados ao domínio não pertencente ao usuário.
- Headers Permissions-Policy, COOP e CSP reforçada no deploy. Políticas de
  desenvolvimento separadas, sem forçar HTTPS no localhost.
- Pacote com 15 tabelas vazias, RLS, trigger Auth, Storage privado e Realtime.
  Guarda contra instalação em banco preenchido e primeiro admin sem senha fixa.
- SMTP Gmail com validação TLS e allowlist de destinatários. **Configurar
  EMAIL_ALLOWED_RECIPIENTS antes do deploy**, senão nossas funções bloqueiam envios.
  Limites desse bloqueio e configuração separada do Auth em [SMTP Gmail](smtp-gmail.md).
- Gestor de qualidade não pode alterar identidade de administrador pelas funções
  de convite/e-mail. Convites têm também limite persistente no banco.
- Identidades provisórias seguem o fluxo de convite/trigger, em vez de tentar
  recuperar senha de uma conta que ainda não existe no Auth.

## Pendências que impedem declarar liberação para produção

- Aplicação em Supabase real, configuração Auth/CAPTCHA/SMTP e deploy Vercel.
- Homologação de entrega de e-mail, runtime Edge, cron, Realtime e fluxos completos.
- Re-teste do relatório contra o ambiente configurado; a proteção do nosso endpoint
  não modifica o comportamento dos endpoints gerenciados do Supabase Auth.
- Revisão de anonimato do auditor em chamadas diretas à tabela/JSON de histórico,
  além da ocultação pela view na interface.
- Regras de transição/coluna para UPDATE de monitorias: a RLS herdada limita as
  linhas, mas não impõe sozinha todas as ações permitidas pela interface.
- Desativação controlada da conta indicada no reporte no ambiente de testes antigo,
  após confirmar acesso e identidade. Nenhuma conta foi removida nesta execução.

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
