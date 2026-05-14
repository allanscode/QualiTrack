# Fluxo: Onboarding de Usuários

## Métodos de Criação de Usuário

### 1. Convite Administrativo (Recomendado)
1. Admin acessa AdminPanel → tab Usuários
2. Clica "Adicionar Usuário"
3. Preenche: Nome, Email, Perfil, Equipes
4. Sistema chama Edge Function `admin-invite-user`
5. Supabase Auth envia email de convite
6. Usuário clica no link e define sua senha

### 2. Solicitação de Acesso (Self-Service)
1. Usuário acessa a tela de login
2. Clica "Solicitar Acesso"
3. Preenche formulário (nome, email, justificativa)
4. Solicitação fica pendente na tab "Solicitações"
5. Admin aprova (define role + equipes) ou rejeita
6. Se aprovado: cria via Edge Function + email de boas-vindas
7. Se rejeitado: envia email com motivo

### 3. Script SQL (Setup Inicial)
- `auth_migration.sql` cria o admin padrão diretamente no banco
- Usado apenas no setup inicial do sistema
- Credenciais padrão: `qualidade@webposto.com.br` / `Admin123!`
