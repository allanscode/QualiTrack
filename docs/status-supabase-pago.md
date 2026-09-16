# QualiTrack — andamento e preparação para Supabase pago

Atualização: 16/09/2026.

## Contexto

- O sistema está em desenvolvimento e testes; nunca entrou em produção.
- Não vamos transferir usuários, monitorias ou histórico do banco atual.
- A próxima etapa é provisionar um ambiente novo com a arquitetura da aplicação.

## Concluído no código e validado localmente

- Correções do reporte: restrições de acesso por usuário/equipe, proteção do envio de e-mail, CAPTCHA integrado, limites persistentes e retirada dos dados demonstrativos do pacote de produção.
- Correção da política de segurança que poderia bloquear o CAPTCHA e reforço dos headers do frontend.
- Proteção adicional contra alteração de contas administrativas por gestores de qualidade.
- Instalação limpa preparada: 15 tabelas vazias, relacionamentos, índices, permissões, funções, autenticação integrada, Storage privado e configuração Realtime.
- Proteção contra executar essa instalação em um projeto já preenchido; procedimento separado para o primeiro administrador, sem senha padrão.
- Gmail SMTP preparado como opção, com envios pelas nossas funções restritos a destinatários autorizados. Remetente e senha de app ainda não foram configurados.
- Validação: 105 testes da aplicação, 17 verificações de banco/configuração, TypeScript, compilação e checagem das seis funções aprovados. Build sem os marcadores conhecidos de dados demo/segredos.
- Trabalho mantido na branch `codex/security-supabase-migration`, separado da `main`.

## O que ainda não foi realizado

- Publicação das correções no Supabase/Vercel e integração da branch à main.
- Contratação ou criação do projeto pago.
- Configuração real de SMTP, CAPTCHA, URLs, variáveis e credenciais das integrações.
- Envio de e-mails ou alteração/remoção de usuários no banco atual.
- Homologação completa no Supabase hospedado; os testes locais não substituem essa etapa.

## Próximos passos

1. Restabelecer os acessos administrativos e confirmar o push/revisão da branch no GitHub.
2. Aprovar organização, região, responsáveis e custos do novo projeto Supabase.
3. Aplicar a instalação limpa no destino e configurar Auth, CAPTCHA, SMTP e funções.
4. Criar o primeiro administrador autorizado e cadastrar equipes, fichas, critérios, horários e manuais selecionados.
5. Configurar a Vercel para o novo banco e gerar um deploy de homologação.
6. Testar os perfis, permissões, monitorias, convites, recuperação, e-mails, arquivos, Realtime, cron e integrações.
7. Corrigir/validar os pontos restantes de autorização e aprovar a primeira entrada em produção.

## Pontos de atenção

- O acesso administrativo ao Supabase está sem token nesta estação; a autenticação do GitHub CLI também foi reportada como inválida. O envio remoto precisa ser confirmado separadamente.
- O e-mail de teste autorizado é `allan.amorim@webposto.com.br`; isso não define a conta remetente do Gmail. A senha de app não deve ser enviada no chat ou registrada no Git.
- A lista de destinatários das nossas funções não restringe globalmente os endpoints nativos do Supabase Auth.
- Antes da produção, revisar o anonimato do auditor contra acesso direto à API e as regras de alteração de campos/transições das monitorias. A RLS de linhas, sozinha, não resolve esses dois requisitos.
- O cron de aprovação automática só será ativado após conferência das regras de negócio.
- O ambiente atual permanece intacto. Não há necessidade de apagá-lo para preparar o novo.

## Resumo para gestão

A preparação técnica da instalação limpa foi implementada e passou na validação local, sem depender da contratação do plano pago. Agora precisamos de acessos, definição do destino e credenciais para implantar e homologar com os serviços reais. Não haverá migração dos dados de teste, e ainda não estamos declarando o sistema liberado para produção.

