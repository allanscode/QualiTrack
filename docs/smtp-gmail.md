# SMTP Gmail — configuração e testes controlados

Status: preparado no código; nenhuma credencial configurada e nenhum e-mail enviado nesta entrega.

## Conta remetente

O destinatário de teste é `allan.amorim@webposto.com.br`. Isso **não define o remetente**
nem confirma que esse endereço utiliza Google Workspace. É necessário escolher uma
conta Gmail/Workspace autorizada pela empresa para enviar as mensagens.

A conta precisa permitir senha de app e ter verificação em duas etapas. A política
do administrador pode impedir essa opção. Não usar a senha normal e não enviar
a senha de app pelo chat, Git ou relatório. [Orientação do Google](https://support.google.com/accounts/answer/185833).

## Dois lugares diferentes de configuração

| Configuração | Supabase Auth (convites e recuperação) | Edge `send-email` (recusa de acesso) |
| --- | --- | --- |
| Host | `smtp.gmail.com` | `SMTP_HOSTNAME=smtp.gmail.com` |
| Porta | `465`, TLS | `SMTP_PORT=465`, TLS implícito |
| Usuário | Endereço completo da conta remetente | `SMTP_USERNAME` |
| Senha | Senha de app em Custom SMTP | `SMTP_PASSWORD` em Edge Secrets |
| Remetente | A mesma conta autorizada; nome QualidadeWP | A conta `SMTP_USERNAME` |

O cliente da Edge usa TLS implícito; não trocar a porta por 587 sem implementar
STARTTLS. [Portas SMTP do Gmail](https://developers.google.com/workspace/gmail/imap/imap-smtp).
Configurar secrets da Edge **não configura** o envio do Auth. O painel Custom SMTP
é separado. [SMTP personalizado no Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## Segurança durante os testes

- Configurar `EMAIL_ALLOWED_RECIPIENTS=allan.amorim@webposto.com.br` nas Edge Secrets.
- Sem essa variável, as funções bloqueiam envios. Para liberar destinatários
  operacionais no futuro, configurar `*` apenas após homologação/autorização.
- A restrição cobre chamadas pelas nossas funções de convite, recuperação e recusa.
  **Não é uma política global do Supabase Auth**: chamadas diretas ao Auth, ações no
  Dashboard e notificações nativas podem enviar fora dessa lista. No novo ambiente,
  manter somente a identidade de teste autorizada, signup público desativado,
  CAPTCHA e limites do Auth habilitados. Não testar outros endereços.
- Não redirecionar links de recuperação de terceiros para o e-mail do testador.
- Não enviar mensagem de teste ao Zendesk/IA sem autorização específica.

## Configuração pelo operador

1. Escolher o remetente e gerar a senha de app na conta autorizada.
2. Configurar Custom SMTP no Dashboard do **projeto de destino confirmado**.
3. Inserir as Edge Secrets pelo Dashboard ou arquivo `.env` local ignorado no Git.
   Não colocar a senha diretamente em comandos que ficam no histórico do terminal.
4. Configurar `FRONTEND_URL`, Site URL e Redirect URLs exatas do ambiente de teste.
5. Publicar as funções da mesma revisão Git do frontend.
6. Testar convite, abertura do link, definição de senha, recuperação e recusa de
   solicitação, exclusivamente com o endereço autorizado. Conferir caixa de entrada,
   spam e logs sem registrar links, tokens ou senhas.
7. Verificar que erros SMTP retornam mensagem genérica e que chamadas sem sessão
   não conseguem usar a função `send-email`.

Pendências: conta remetente, senha de app inserida com segurança, acesso ao Supabase,
domínio/CAPTCHA reais e homologação de entrega. Gmail é uma opção para o ensaio;
capacidade, limites e entregabilidade devem ser revisados antes do uso operacional.
