# Guia de Configuração e Deploy com Docker

Este guia descreve como executar o QualiTrack localmente via Docker Compose e como fazer deploy em cluster Docker Swarm com Traefik.

---

## 📋 Pré-requisitos

- **Docker** >= 24.0
- **Docker Compose** >= 2.20 (para compose v2)
- **Docker Swarm** (para deploy em cluster)
- **Node.js 20+** (apenas para desenvolvimento local sem Docker)

---

## 🚀 Execução Local (Docker Compose)

### 1. Configuração de Variáveis de Ambiente

Copie o arquivo de exemplo e configure suas credenciais:

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais:

```env
# Supabase (obrigatório para produção)
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-chave-anonima

# Opcional: Configurações de porta
PORT=8080
```

### 2. Build e Execução

```bash
# Build da imagem
docker compose build

# Subir containers em background
docker compose up -d

# Ver logs
docker compose logs -f app

# Parar containers
docker compose down
```

### 3. Acesso à Aplicação

| Serviço | URL | Descrição |
|---------|-----|-----------|
| **QualiTrack App** | http://localhost:8080 | Aplicação principal |
| **Traefik Dashboard** | http://localhost:8081 | Dashboard do Traefik (se habilitado) |
| **Health Check** | http://localhost:8080/health | Endpoint de saúde |

### 4. Variáveis de Ambiente Disponíveis

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `PORT` | `8080` | Porta de escuta do Nginx |
| `NODE_ENV` | `production` | Ambiente de execução |
| `VITE_SUPABASE_URL` | - | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | - | Chave anônima do Supabase |

> ⚠️ **Nota sobre `envsubst` no Dockerfile**: O comando `envsubst` no entrypoint usa `'${PORT}'` (aspas simples) para evitar que o shell interprete `$PORT` antes do `envsubst`. Não altere para `"$PORT"` ou `$PORT`.

### 5. Health Check

O container do Nginx expõe `/health` retornando 200. O `docker-compose.yml` inclui healthcheck com intervalo de 30s, timeout 10s, 3 retentativas e período inicial de 20s.

---

## 🏗️ Deploy no Docker Swarm

### 1. Inicializar o Swarm (apenas uma vez)

```bash
# No node manager
docker swarm init --advertise-addr <IP_DO_MANAGER>

# Nos workers (execute o comando retornado pelo init)
docker swarm join --token SWMTKN-... <IP_DO_MANAGER>:2377
```

### 2. Criar Rede Overlay (apenas uma vez)

```bash
docker network create --driver overlay --attachable qualitrack-network
```

### 3. Criar Secrets para Produção

```bash
# Secrets para variáveis sensíveis
echo "sua-url-supabase" | docker secret create supabase_url -
echo "sua-chave-anonima" | docker secret create supabase_anon_key -
echo "seu-email-acme" | docker secret create acme_email -
```

### 4. Deploy da Stack

```bash
# Deploy da stack
docker stack deploy -c docker-compose.swarm.yml qualitrack

# Verificar status
docker stack services qualitrack
docker stack ps qualitrack

# Ver logs
docker service logs -f qualitrack_app

# Atualizar serviço (após novo build/push da imagem)
docker service update --image ghcr.io/marcospaulofreitas/qualitrack:v2.0.1 qualitrack_app
```

### 3. Remover Stack

```bash
docker stack rm qualitrack
docker network rm qualitrack-network
```

---

## 🔧 Configuração do Traefik (Roteamento HTTP/HTTPS)

### Labels Necessários no Serviço `app`

Os labels abaixo já estão configurados no `docker-compose.swarm.yml`:

```yaml
labels:
  - "traefik.enable=true"
  - "traefik.docker.network=qualitrack-network"
  - "traefik.http.routers.qualitrack.rule=Host(`qualitrack.seudominio.com`)"
  - "traefik.http.routers.qualitrack.entrypoints=websecure"
  - "traefik.http.routers.qualitrack.tls.certresolver=myresolver"
  - "traefik.http.services.qualitrack.loadbalancer.server.port=8080"
```

### Configuração do Traefik (docker-compose.swarm.yml)

```yaml
traefik:
  image: traefik:v3.0
  command:
    - "--api.dashboard=true"
    - "--api.insecure=true"
    - "--providers.docker=true"
    - "--providers.docker.exposedbydefault=false"
    - "--providers.docker.swarmMode=true"
    - "--entrypoints.web.address=:80"
    - "--entrypoints.websecure.address=:443"
    - "--certificatesresolvers.myresolver.acme.tlschallenge=true"
    - "--certificatesresolvers.myresolver.acme.email=seu-email@dominio.com"
    - "--certificatesresolvers.myresolver.acme.storage=/letsencrypt/acme.json"
  ports:
    - target: 80
      published: 80
      mode: host
    - target: 443
      published: 443
      mode: host
    - target: 8080
      published: 8080
      mode: host
  volumes:
    - "/var/run/docker.sock:/var/run/docker.sock:ro"
    - "traefik-letsencrypt:/letsencrypt"
  networks:
    - qualitrack-network
  deploy:
    placement:
      constraints:
        - node.role == manager
```

### Configuração DNS

Configure no seu provedor DNS:

| Tipo | Nome | Valor |
|------|------|-------|
| A | qualitrack | IP_DO_MANAGER |
| A | traefik | IP_DO_MANAGER |

### Certificados SSL (Let's Encrypt)

O Traefik gerencia automaticamente certificados Let's Encrypt via ACME TLS Challenge:

1. Configure `--certificatesresolvers.myresolver.acme.email=seu-email@dominio.com`
2. O desafio TLS-ALPN-01 usa a porta 443
3. Certificados salvos em `/letsencrypt/acme.json` (volume `traefik-letsencrypt`)

---

## 🔍 Verificação e Monitoramento

### Health Checks

```bash
# Verificar health do container
docker exec qualitrack-app curl -f http://localhost:8080/health

# Via Docker Compose
docker compose ps

# No Swarm
docker service ps qualitrack_app
```

### Logs

```bash
# Docker Compose
docker compose logs -f app --tail=100

# Swarm
docker service logs -f qualitrack_app --tail=100
```

### Métricas e Dashboard Traefik

Acesse o dashboard do Traefik em `http://traefik.seudominio.com:8080` (ou porta 8081 local) para:
- Ver rotas ativas
- Monitorar latência e taxa de erro
- Ver certificados SSL ativos
- Verificar middlewares e routers

---

## 🛠️ Comandos Úteis

### Desenvolvimento Local

```bash
# Rebuild apenas o app
docker compose build app
docker compose up -d app

# Limpar cache de build
docker compose build --no-cache app

# Acessar shell do container
docker compose exec app sh
```

### Produção (Swarm)

```bash
# Atualizar imagem
docker service update --image ghcr.io/marcospaulofreitas/qualitrack:v2.1.0 qualitrack_app

# Rollback
docker service rollback qualitrack_app

# Escalar réplicas
docker service scale qualitrack_app=5

# Ver uso de recursos
docker stats $(docker ps -q --filter "name=qualitrack")
```

---

## 🔐 Segurança e Boas Práticas

### Secrets no Swarm

```bash
# Criar secrets
echo "sua-url" | docker secret create supabase_url -
echo "sua-chave" | docker secret create supabase_anon_key -

# Usar no compose
secrets:
  supabase_url:
    external: true
  supabase_anon_key:
    external: true
```

### Rede Isolada

A rede `qualitrack-network` é do tipo `overlay` (Swarm) ou `bridge` (Compose), isolando o tráfego interno.

### Usuário Não-Root

O container roda como usuário `appuser` (UID 1001), não como root.

### Health Checks

- **Intervalo**: 30s
- **Timeout**: 10s
- **Retentativas**: 3
- **Período inicial**: 20s

---

## 📚 Referências

- [Docker Compose Spec](https://docs.docker.com/compose/compose-file/)
- [Docker Swarm Docs](https://docs.docker.com/engine/swarm/)
- [Traefik Docker Provider](https://doc.traefik.io/traefik/providers/docker/)
- [Let's Encrypt with Traefik](https://doc.traefik.io/traefik/https/acme/)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)

---

## 🆘 Troubleshooting

| Problema | Solução |
|----------|---------|
| Container não inicia | Verifique `docker logs <container>` |
| Health check falha | Verifique se `/health` responde 200 |
| Traefik não roteia | Verifique labels `traefik.enable=true` e network |
| SSL não funciona | Verifique DNS, porta 443 aberta, email ACME válido |
| Build falha | `docker compose build --no-cache` |

---

*Documentação mantida pela equipe QualiTrack. Última atualização: 2026-06-12*