# Revisão de segurança e preparação de release — 27/09/2026

## Escopo e resultado

Comparação de todas as branches remotas com `origin/main` (`ab2c207`): somente
`allanscode/design-improvements-test` tinha um commit exclusivo (`68c263b`).
Nenhum PR estava aberto. A árvore de trabalho estava limpa antes desta revisão.

O release inclui busca de tickets Zendesk, filtros reativos do dashboard e envio
manual de relatórios. Foram corrigidos os pontos abaixo antes da integração.
Os relatórios de 26/09 descrevem versões anteriores; não representam o estado
atual do banco ou desta revisão.

## Correções

- **Busca Zendesk:** termos do navegador não podem introduzir operadores para
  ampliar as filas. Resultados de busca são revalidados por CSAT/tag, e a busca
  não recebe tickets sem relação vindos do cache de distribuição. A autorização
  por papel e responsável continua aplicada. Erros de provedor não viram uma
  resposta falsa de “nenhum resultado”.
- **Paginação:** Search API usa `per_page` e `next_page`; o cursor permanece preso
  ao host, caminho, consulta e limite de 25 itens. Referências:
  [Search API](https://developer.zendesk.com/api-reference/ticketing/ticket-management/search/)
  e [sintaxe de busca](https://developer.zendesk.com/documentation/api-basics/working-with-data/searching-with-the-zendesk-api/).
- **E-mail:** validação de números finitos e faixas, tamanho de payload limitado,
  remoção de caracteres de controle do assunto e ausência de detalhes SMTP nos
  logs de erro. Mantidos usuário ativo, papéis admin/gestor de qualidade,
  allowlist de destinatários, escaping HTML e rate limit no servidor.
- **Configuração de e-mail:** agendamento e Reply-To ainda não são implementados.
  Os controles ficam indisponíveis, com texto explícito; salvar não ativa uma
  automação inexistente. O envio manual existente permanece disponível.
- **Banco:** removida execução por navegador de funções de trigger e de
  manutenção; fixado `search_path` nas funções antigas. Os RPCs de negócio
  continuam disponíveis com seus controles de autorização.

## Produção Supabase

Projeto confirmado pelas variáveis de produção da Vercel:
`vpytvgpsqdapgouyjowc` (QualidadeWP). Signup público desabilitado, CAPTCHA
Turnstile habilitado e Site URL `https://qualitrack.vercel.app`.
Build usa chave pública e CAPTCHA real, sem bypass de teste.

Havia seis migrations não aplicadas, inclusive a criação do PDI e as proteções
de ciência/conclusão e publicação no helpdesk. Nesta entrega foram aplicadas:

- `20260925000001`, `20260925000002`: anexos e ações do gestor, com autorização.
- `20260926000001`, `20260926000002`, `20260927000001`: Feedbacks/PDI e proteção
  efetiva por equipe, papel, usuário ativo e RPCs de ciência/conclusão.
- `20260927000002`: exclusão mútua de publicação no helpdesk.
- `20260927000003`: restrição das funções de manutenção e triggers.
- `20260927000004`: processamento de prazos a cada cinco minutos. Não havia
  monitorias elegíveis vencidas na consulta anterior à ativação.

Atualizadas as Edge Functions `send-email`, `helpdesk-queue` e
`helpdesk-publish-evaluation`. Consulta direta após as migrations confirmou
negação de leitura anônima de PDI, UPDATE direto de PDI e execução do scheduler
pelos papéis `anon` e `authenticated`.

Snapshot local de aproximadamente 2 MB salvo em
`backups/pre-release-20260927-snapshot.json` (ignorado pelo Git), contendo
monitorias, publicações, configuração, definições de funções/views/policies,
grants, colunas, triggers, buckets e histórico de migrations. **É uma cópia
parcial para recuperação desta mudança, não um backup integral restaurável**:
não contém Auth, todos os dados da aplicação ou objetos de Storage. O comando
`db dump` não pôde rodar sem Docker/pg_dump; a API não listou backups físicos
disponíveis nem PITR ativo. As migrations são aditivas/restritivas, sem remoção
de registros. Em falha, corrigir para frente; não restaurar policies vulneráveis.
Frontend pode ser revertido ao deployment anterior da Vercel sem desfazer RLS.

## Validação

- `npm.cmd run lint`: passou.
- `npm.cmd test`: 233 testes, 36 arquivos, passaram.
- `npm.cmd run test:database`: 50 testes passaram; instalação limpa reexecutada
  após a última migration, com sucesso (inclui negação de acesso às triggers).
- Playwright: 20 testes de filas, filtros, navegação e monitoria passaram,
  incluindo layouts mobile/desktop e temas claro/escuro.
- Deno: verificação de tipos das três Edge Functions passou.
- Build com variáveis reais de produção e `npm.cmd run check:bundle`: passaram;
  permanece o aviso de chunk maior que 500 kB.
- `npm.cmd audit --json`: zero vulnerabilidades conhecidas reportadas.

Não foram enviados e-mails, publicadas mensagens no Zendesk ou executadas
avaliações pagas de IA para testar. Os testes de autorização completos usam
identidades sintéticas no PostgreSQL/PGlite; não equivalem a um pentest do
ambiente hospedado ou a uma homologação autenticada completa de cada perfil.

## Pendências não bloqueantes e decisões explícitas

1. Implementar agendamento de relatórios, destinatários automáticos e Reply-To
   antes de habilitar os respectivos controles. Envio manual depende da
   configuração SMTP/allowlist já existente; entrega real não foi homologada.
2. Definir política e operação de backup integral externo, retenção e ensaio de
   restauração; habilitar PITR conforme o plano contratado. Não contratar ou
   alterar plano automaticamente.
3. Habilitar proteção contra senhas vazadas no Supabase Auth quando disponível
   no plano. O advisor continua apontando essa configuração desabilitada.
4. Os alertas de view `SECURITY DEFINER` e RPCs autenticados são intencionais:
   `vw_monitorias_suporte` tem filtro explícito por titular ativo e mascara
   auditor/histórico enquanto o acesso direto à tabela fica fechado. Alterá-la
   para invoker sem redesenhar os grants quebraria essa fronteira. RPCs exigem
   revisão contínua e testes negativos, não revogação indiscriminada.
5. Fixar GitHub Actions por SHA, ampliar minimização/retenção de telemetria e IA,
   paginar/agregar dashboards no servidor e tratar idempotência/entrega parcial
   de relatórios SMTP em uma próxima entrega. Os relatórios aceitam indicadores
   enviados por gestores autorizados; não são documentos assinados pelo servidor.

O advisor remoto após a atualização não reportou mais `search_path` mutável nem
funções `SECURITY DEFINER` executáveis por anônimos. As categorias restantes são
as três descritas acima (view, RPCs autenticados e senhas vazadas).
