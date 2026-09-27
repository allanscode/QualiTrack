# Novo ambiente Supabase — instalação limpa, sem migração de dados

Atualização: 16/09/2026. O sistema ainda não entrou em produção. Não copiar usuários,
senhas, monitorias, solicitações, arquivos ou histórico do banco de testes.

## O que está preparado

- `npm run prepare:supabase` gera `.supabase-fresh/supabase`, com o baseline existente,
  a cadeia incremental completa e ordenada, configuração e Edge Functions. Não acessa servidor.
- O baseline cria 15 tabelas da aplicação; incrementais posteriores adicionam as estruturas
  atuais, seus relacionamentos, índices, RLS e helpers privados. A cadeia final inclui feedbacks,
  fila/IA, presença, anexos e os limites de publicação atuais.
- Nenhum usuário, senha padrão, equipe, formulário ou monitoria é inserido.
  Horários comerciais, feriados e configurações funcionais também começam vazios.
- Cron e primeiro administrador têm procedimentos separados, de ativação explícita.
- A instalação usa uma transação e recusa projetos com tabelas/views/sequências da
  aplicação ou usuários Auth existentes. Não remove o ambiente antigo.
- `sources.json` registra os hashes do baseline. O timestamp `20260915010000` permanece
  estável para instalações que já o registraram. Incrementais de `supabase/migrations`
  desde `20260917000001` são descobertas automaticamente em ordem; arquivos homônimos em
  `supabase/fresh-migrations` são adaptações revisadas que substituem a cópia original,
  sem duplicar timestamps. Uma ponte de helpers anterior à fronteira cobre dependências
  ausentes do baseline. Extensões gerenciadas são provisionadas pelo Supabase.

## Validação antes de qualquer publicação

Na raiz do checkout correto, em PowerShell:

```powershell
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run test:database
npm.cmd run prepare:supabase
```

Os testes aplicam o baseline e todos os incrementais gerados em PostgreSQL/PGlite,
em ordem, com fixtures **apenas da plataforma Supabase**. Validam criação vazia,
recusa de reinstalação, RLS com dados sintéticos, anonimato na tabela/view,
trigger Auth, primeiro administrador, Storage e regras de prazo. PGlite não carrega
os binários gerenciados `pg_cron`/`pg_net`; somente seus comandos de provisionamento
são simulados, usando uma API `cron` de teste.
Não substituem um ensaio no Supabase hospedado: Auth HTTP, SMTP, runtime Edge,
PostgREST, entrega Realtime, pg_cron e navegador ainda precisam de homologação real.

## Provisionamento do destino — somente após aprovação

1. Definir organização, responsáveis, região e orçamento; criar o projeto pago vazio.
   Não usar o `project-ref` do banco free existente para este procedimento.
2. Registrar projeto, revisão Git e pacote gerado aprovados. Autenticar a CLI.
3. Usar **exclusivamente** o diretório gerado como workdir da cadeia nova:

```powershell
$targetProjectRef = 'SUBSTITUIR_PELO_NOVO_PROJECT_REF'
npx.cmd supabase login
npx.cmd supabase link --project-ref $targetProjectRef --workdir .supabase-fresh
npx.cmd supabase migration list --workdir .supabase-fresh
npx.cmd supabase db push --dry-run --workdir .supabase-fresh
# Conferir o projeto vinculado e o dry-run antes de autorizar a escrita:
npx.cmd supabase db push --workdir .supabase-fresh
```

O dry-run lista migrations; não prova que o SQL foi executado com sucesso.
O primeiro push deve conter `20260915010000_clean_install.sql` e todos os incrementais
posteriores listados pelo dry-run. Confira a ordem e a quantidade esperadas antes de escrever.
Não usar `--include-all`, `db reset`, `migration repair` para fingir histórico aplicado,
`apply_all_pending.sql` ou os seeds antigos. [Referência da CLI](https://supabase.com/docs/reference/cli/supabase-db-push).

Se o histórico não estiver vazio, parar e verificar o destino. Caso já existam Auth
users ou tabelas, criar/selecionar um projeto realmente vazio: **não apagar para forçar**.

## Configuração fora das migrations

- Auth: desabilitar signup público, manter confirmação de e-mail, habilitar Turnstile
  e limites; conferir também chamadas diretas aos endpoints gerenciados.
- Turnstile: cadastrar domínio real, site key pública na Vercel, secret no Auth e nas
  Edge Secrets (`TURNSTILE_SECRET_KEY`). Não usar chaves de teste no deploy operacional.
- URLs: Site URL e redirects exatos; `FRONTEND_URL` deve ser a origem HTTPS do frontend.
  A política atual aceita uma origem por ambiente; não liberar `*` para previews.
- E-mail: seguir [SMTP Gmail](smtp-gmail.md), incluindo a allowlist de destinatários.
- Integrações: recriar secrets Zendesk e IA necessárias, sem prefixo `VITE_`.
- Não copiar chaves reservadas do projeto antigo. As funções aceitam chaves públicas
  e secret keys novas fornecidas pelo runtime, com compatibilidade legada.

Publicar explicitamente as seis funções ativas (sem o placeholder admin-create-user):

```powershell
foreach ($functionName in @('public-access','send-email','admin-invite-user','admin-update-user-email','helpdesk-queue','helpdesk-publish-evaluation')) {
  npx.cmd supabase functions deploy $functionName --project-ref $targetProjectRef --workdir .supabase-fresh
  if ($LASTEXITCODE -ne 0) { throw "Falha no deploy: $functionName" }
}
```

`verify_jwt=false` nessas funções é deliberado: as funções autenticadas validam
`getUser(token)` e papel ativo internamente. `public-access` é público e usa CAPTCHA.
Não remover essas verificações nem publicar código antigo com essa configuração.

## Primeiro acesso e configuração funcional

1. Criar/convidar a identidade inicial autorizada pelo Dashboard Auth; concluir a
   confirmação de e-mail. A trigger cria um perfil suporte **inativo**, não um admin.
2. Em `supabase/bootstrap/first-admin.sql`, preencher somente as duas declarações
   `expected_id` e `expected_email` com a identidade confirmada. Executar pelo SQL
   Editor do projeto novo. Não substituir as constantes da guarda nem definir senha SQL.
3. O procedimento falha se já houver um admin ativo ou se a identidade não coincidir.
4. Entrar, definir a senha exigida e cadastrar equipes, fichas, critérios e regras de
   qualidade. Cadastrar os manuais selecionados novamente, sem copiar dados de tickets.
5. Conferir horários/feriados da função SQL e as regras de prazo da aplicação; o
   calendário SQL não é sincronizado automaticamente com o JSON de quality_configs.
6. Somente após validar a regra de aprovação automática, executar
   `supabase/bootstrap/activate-cron.sql` e verificar as execuções no painel Cron.
   A função existe na base, mas o job não é ativado pelo instalador.

## Vercel e homologação

Configurar `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (ou ANON legada) e
`VITE_TURNSTILE_SITE_KEY` para o destino. Fazer novo build: mudar variáveis sem
recompilar não troca o Supabase embutido no frontend. Não publicar o build fictício de CI.

Validar os cinco perfis, login/CAPTCHA, convite, recuperação, equipes, fichas,
monitorias, contestação, RLS por equipe, feedback da view, Storage, Realtime e cron.
Testar 401/403 e isolamento entre equipes com registros sintéticos. Somente o e-mail
autorizado recebe testes. Zendesk/IA exigem ensaio controlado sem comentar tickets reais.

Há limites a verificar antes de produção: a view oculta campos do auditor na UI, mas
a tabela base e o JSON de histórico ainda exigem revisão se o requisito for anonimato
contra chamadas diretas à API; as policies legadas de UPDATE de monitorias também
precisam de regras de transição/coluna para impor integralmente as ações de cada perfil.
Não confundir testes de isolamento de linhas com aprovação completa desses requisitos.

## Histórico futuro e retorno

Depois da primeira instalação, congelar a base na revisão de release. Novas migrations
de produto ficam em `supabase/migrations`; o preparador as inclui automaticamente quando
posteriores a `20260917000001`. Reserve `supabase/fresh-migrations` para adaptações
explícitas de instalação limpa, com o mesmo nome da migration substituída. Execute
novamente o preparador e use o mesmo workdir na CLI. Não reescrever migration aplicada.
A cadeia do banco free permanece separada até sua aposentadoria.

Manter o ambiente de desenvolvimento intacto. Antes do primeiro uso operacional,
é possível voltar o frontend à configuração anterior. Depois de existir informação
real no novo ambiente, qualquer retorno exige preservar/conciliar as novas escritas.
O upgrade de plano e a entrada em produção não foram realizados por este preparo.
