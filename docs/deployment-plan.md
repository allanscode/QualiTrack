# Plano de Deploy — QualiTrack

## ✅ Já concluído (Local)

### Código
- [x] Docker `envsubst` corrigido (aspas simples em `'${PORT}'`)
- [x] CSP/HSTS configurados (nginx.conf + index.html)
- [x] Auth hash race corrigido (`initialUrlHash` em `supabase.ts`)
- [x] `INITIAL_SESSION` guard (não sobrescreve change-password)
- [x] Dashboard query storm corrigido (filters removido de dependências)
- [x] SLA auto-finalize removido do frontend (só pg_cron)
- [x] OfensoresChart sem dados mockados
- [x] Duplicate heartbeat removido
- [x] N+1 em useQualityConfig convertido para Promise.all
- [x] vw_monitorias_suporte criada (anonimato do auditor)
- [x] Realtime publication idempotente
- [x] `.maybeSingle()` em vez de `.single()` (evita erro 406)
- [x] CSP `ws://localhost:*` para dev
- [x] Mock mode production guard (`main.tsx`)
- [x] Testes: 80/80 passando
- [x] Build: produção compila sem erros
- [x] TypeScript: `tsc --noEmit` sem erros

### Banco (Supabase Cloud)
- [x] Migration `20260520000000_initial_schema.sql` aplicada
- [x] Migration `20260616000001_realtime_publication.sql` aplicada
- [x] Migration `20260617000001_anonymized_monitoria_view.sql` aplicada
- [x] Migration `20260617000002_fix_view_security_invoker.sql` aplicada
- [x] Migration `20260617000003_fix_function_search_path.sql` aplicada
- [x] Migration `20260617000004_security_batch_fix.sql` aplicada
- [x] Migration `20260617000005_fix_users_rls_recursion.sql` aplicada
- [x] Migration `20260617000006_cleanup_users_table.sql` aplicada
- [x] Migration `20260617000007_cleanup_orphan_tables_columns.sql` aplicada
- [x] Migration `20260617000008_drop_monitorias_satisfaction.sql` aplicada

### Documentação
- [x] `docs/` atualizada (auth flow, frontend, backend, schema, agents context)
- [x] README.md atualizado (porta 3001, comando test)
- [x] dev-setup.md atualizado
- [x] docker-setup.md atualizado (envsubst, health check)
- [x] Email templates HTML criados em `docs/supabase-email-templates.md`

---

## 🔧 Passos para Deploy (Servidor)

### 1. Configurar DNS e Domínio

```bash
# No seu provedor DNS, crie um registro A:
#   qualitrack.seudominio.com → IP_DO_SERVIDOR
```

### 2. Configurar Supabase Dashboard

#### 2.1 URL de Redirecionamento
- **Supabase Dashboard → Authentication → URL Configuration**
- Adicione: `https://qualitrack.seudominio.com`
- Adicione (se aplicável): `https://qualitrack.seudominio.com/**`

#### 2.2 Site URL
- **Supabase Dashboard → Authentication → Settings**
- `Site URL`: `https://qualitrack.seudominio.com`

#### 2.3 Email Templates
- **Supabase Dashboard → Authentication → Email Templates**
- Cole os templates de `docs/supabase-email-templates.md` para:
  - Confirmação (Signup)
  - Convite (Invite)
  - Recuperação de Senha (Change Password)

#### 2.4 SMTP (opcional, recomendado)
- Configure SMTP nas configurações de Authentication para usar seu próprio servidor de email (evita limite de 2 emails/dia do Supabase na camada gratuita)

### 3. Configurar Secrets do Supabase (Edge Functions)

```bash
# Login no Supabase CLI
npx supabase login

# Link ao projeto
npx supabase link --project-ref <seu-project-ref>

# Configurar secrets
npx supabase secrets set FRONTEND_URL=https://qualitrack.seudominio.com
npx supabase secrets set SMTP_USERNAME=seu-email@gmail.com
npx supabase secrets set SMTP_PASSWORD=sua-senha-de-app
```

### 4. Servidor: Pré-requisitos

```bash
# Instalar Docker e Docker Compose (Ubuntu/Debian)
sudo apt update
sudo apt install docker.io docker-compose-v2
sudo systemctl enable docker
sudo systemctl start docker

# Criar diretório da aplicação
mkdir -p /opt/qualitrack
cd /opt/qualitrack
```

### 5. Deploy via Docker Compose

```bash
# Clonar ou copiar os arquivos
git clone <seu-repo> .
# ou copiar manualmente: Dockerfile, docker-compose.yml, nginx.conf, .env

# Criar .env com variáveis de produção (Docker Compose lê automaticamente)
cat > .env << 'EOF'
VITE_SUPABASE_URL=https://<seu-project-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<sua-chave-anon>
PORT=8080
EOF

# Build e iniciar
docker compose build
docker compose up -d

# Verificar
docker compose ps
curl -f http://localhost:8080/health
```

### 6. Proxy Reverso (opcional, para produção com SSL)

**Opção A — Usar Traefik (já configurado no docker-compose):**
- Ajuste `docker-compose.swarm.yml` com seu domínio
- Configure DNS e porta 80/443 liberadas

**Opção B — Usar Nginx diretamente no host:**
```nginx
server {
    listen 80;
    server_name qualitrack.seudominio.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name qualitrack.seudominio.com;

    ssl_certificate /etc/letsencrypt/live/qualitrack.seudominio.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/qualitrack.seudominio.com/privkey.pem;

    location / {
        proxy_pass http://localhost:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://localhost:8080/health;
    }
}
```

```bash
# Certbot para SSL gratuito
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d qualitrack.seudominio.com
```

### 7. Configurar pg_cron (Prazo de Ação)

No Supabase SQL Editor, execute **uma única vez**:

```sql
-- Ativar pg_cron (se ainda não ativo)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agendar job a cada 5 minutos
SELECT cron.schedule(
  'process-action-deadline',
  '*/5 * * * *',
  'SELECT process_action_deadline_timeouts();'
);
```

> Verifique se a função `process_action_deadline_timeouts()` já existe (deve ter sido criada pela migration `initial_schema`).

### 8. Verificações Pós-Deploy

- [ ] `https://qualitrack.seudominio.com` carrega sem erros
- [ ] Login funciona normalmente
- [ ] Recuperação de senha envia email com link correto
- [ ] Convite de admin envia email com link correto
- [ ] Dashboard carrega dados (não está em mock mode)
- [ ] Health check: `https://qualitrack.seudominio.com/health` → 200
- [ ] F12 console: sem erros de CSP bloqueando conexões
- [ ] Testar com role `suporte` — `evaluator_name` deve aparecer como vazio

---

## 🚨 Rollback

Se algo der errado:

```bash
# Parar e remover containers
docker compose down

# Reverter para versão anterior (se tiver tag no Docker Hub/GHCR)
docker compose build app
docker compose up -d

# Ou restaurar backup do banco (se aplicável)
```
