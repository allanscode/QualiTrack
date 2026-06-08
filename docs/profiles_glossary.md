# Glossário Oficial de Perfis (RBAC) - QualiTrack

Este documento define e unifica a nomenclatura oficial de perfis, papéis e sinônimos operacionais adotados no ecossistema do **QualiTrack**. Seu objetivo é garantir a consistência de comunicação técnica e de negócios em toda a plataforma.

---

## 👥 Mapeamento de Perfis

### 1. Administrador (Admin)
* **Termo Técnico (DB/Enum):** `admin`
* **Sinônimos Aceitos:** Gestor do Sistema, TI, Suporte Técnico da Ferramenta.
* **Papel:** Controle total da aplicação, configurações globais, parametrizações de negócio, auditoria de logs e gerenciamento geral de acessos (usuários, perfis e permissões).

### 2. Gestor da Qualidade
* **Termo Técnico (DB/Enum):** `gestor_qualidade`
* **Sinônimos Aceitos:** Líder da Qualidade, Responsável da Qualidade, Coordenador de Qualidade.
* **Papel:** Responsável estratégico pela equipe de analistas que auditam. Parametriza as regras de negócio de qualidade (pesos, critérios, SLAs), calibra formulários e analisa os dashboards gerenciais macros de auditoria e calibragem.

### 3. Monitor de Qualidade
* **Termo Técnico (DB/Enum):** `qualidade`
* **Sinônimos Aceitos:** Auditor, Analista de Qualidade, Técnico de Qualidade, Agente da Qualidade.
* **Papel:** Executor operacional das monitorias. É o perfil que de fato realiza as avaliações estruturadas, preenche os formulários de monitoria, avalia os atendimentos (tickets) e responde/trata as contestações abertas pelo Suporte na sua fila de pendências.

### 4. Gestor de Suporte
* **Termo Técnico (DB/Enum):** `gestor_suporte`
* **Sinônimos Aceitos:** Líder de Suporte, Gerente de Suporte, Supervisor de Atendimento, Responsável pelo Suporte.
* **Papel:** Gestor da operação de atendimento ao cliente final. Visualiza a performance macro das suas equipes e squads, acompanha os rankings de seus liderados, acompanha planos de ação e gerencia os analistas que foram auditados (podendo intervir ou apoiar em contestações operacionais).

### 5. Agente de Suporte
* **Termo Técnico (DB/Enum):** `suporte`
* **Sinônimos Aceitos:** Analista de Suporte, Técnico de Suporte, Atendente, Operador.
* **Papel:** Ponta final do atendimento direto ao cliente. Recebe os resultados das monitorias de seus atendimentos para ciência, assina as avaliações concluídas e possui autonomia para abrir contestações estruturadas caso discorde da nota ou dos critérios aplicados na auditoria.

---

## ⚠️ Diretriz de Uso em Código (TypeScript / Supabase)
Para qualquer desenvolvimento futuro, as chaves internas (`admin`, `gestor_qualidade`, `qualidade`, `gestor_suporte`, `suporte`) devem ser utilizadas de forma estrita para validação de controle de acesso baseado em papéis (RBAC) no frontend e backend, enquanto os rótulos visuais amigáveis acima devem ser expostos na interface com o usuário final.
