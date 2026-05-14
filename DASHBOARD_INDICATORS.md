# 📊 Dicionário de Indicadores do Dashboard - QualiTrack

Este documento detalha o funcionamento, cálculo e visibilidade de cada indicador presente nos dashboards do sistema, separados por perfil de acesso.

---

## 🛠️ Notas Gerais
- **Filtros Globais:** Todos os indicadores respeitam os filtros de **Data (Início/Fim)**, **Canal**, **Status** e **Formulário** selecionados na barra superior, a menos que indicado o contrário.
- **Base de Dados:** Os cálculos são realizados em tempo real com base na tabela `monitorias` e `users`.

---

## 1. Agente de Atendimento (`suporte`)
Focado na performance individual e benchmarks.

| Indicador | Descrição | Regra de Cálculo | Envolvidos / Visibilidade |
| :--- | :--- | :--- | :--- |
| **Minha Média** | Nota média pessoal do agente | `Soma das Notas / Total de Monitorias` | Somente dados do próprio agente logado. |
| **Média das Minhas Equipes** | Performance média das equipes do agente | `Média dos Scores de todos os membros das equipes do agente` | Colegas de equipe do agente. |
| **Média Global** | Benchmark da empresa | `Média de todos os Scores do sistema no período` | Toda a operação (Empresa). |
| **Monitorias** | Volume pessoal | `Contagem total de monitorias do agente` | Somente dados do agente. |
| **Solicitadas (Reav.)** | Volume de contestações | `Total de monitorias onde o agente abriu contestação` | Somente dados do agente. |
| **Taxa de Reversão** | Eficácia da contestação | `(Contestações Aceitas / Total de Contestações) * 100` | Percentual de vitórias do agente. |
| **Evolução Comparativa** | Gráfico de tendência | `Média diária do Agente vs Média diária das suas Equipes` | Agente vs Time. |
| **Meus Ofensores** | Pontos de atenção | `Ranking de critérios com maior frequência de erro` | Somente dados do agente. |

---

## 2. Monitor de Qualidade (`qualidade`)
Focado na produtividade, assertividade e gestão da qualidade.

| Indicador | Descrição | Regra de Cálculo | Envolvidos / Visibilidade |
| :--- | :--- | :--- | :--- |
| **Meu Volume** | Produtividade do auditor | `Contagem de monitorias onde o usuário logado foi o avaliador` | Somente monitorias feitas por ele. |
| **Nota Média** | Nível de rigor | `Média das notas aplicadas por este monitor` | Reflete o perfil de avaliação dele. |
| **Pendente Ação** | Gargalo de resposta | `Monitorias em status 'Em Contestação' aguardando resposta` | Apenas o que ele auditou. |
| **Reav. Aceitas** | Falhas na auditoria | `Monitorias onde a contestação foi aceita (nota alterada)` | Erros de interpretação/aplicação. |
| **Reav. Recusadas** | Assertividade técnica | `Monitorias onde a nota foi mantida após contestação` | Domínio do processo. |
| **Volumetria Diária** | Benchmark de produção | `Volume diário do monitor vs Média diária da equipe de monitores` | Monitor vs Colegas de Qualidade. |
| **Precisão da Qualidade** | Nível de estabilidade | `Monitorias sem alteração vs Monitorias alteradas após reanálise` | Qualidade da entrega do monitor. |
| **Maiores Ofensores** | Visão da operação | `Ranking global de itens despontuados em todas as monitorias` | Visão macro de problemas da operação. |

---

## 3. Supervisor de Atendimento (`gestor_suporte`)
Focado na gestão de times, SLAs e desenvolvimento de pessoas.

| Indicador | Descrição | Regra de Cálculo | Envolvidos / Visibilidade |
| :--- | :--- | :--- | :--- |
| **Média Equipe** | Performance do time | `Média das notas de todos os agentes vinculados às equipes do gestor` | **Restrito** às equipes dele. |
| **Pendentes Suporte** | Engajamento/Ciência | `Monitorias concluídas onde o agente ainda não deu o 'Ciente'` | Somente agentes das suas equipes. |
| **Minhas Ações** | Pendências do gestor | `Monitorias aguardando decisão/aprovação do Supervisor` | Apenas o que depende dele. |
| **Taxa de Reversão** | Defesa do time | `% de contestações do time que resultaram em mudança de nota` | Eficácia da defesa do time. |
| **Ranking Agentes** | Meritocracia | `Top 5 Maiores Médias e Top 5 Oportunidades (Abaixo da Meta)` | **Restrito** às equipes dele. |
| **Aguardando Minha Ação**| SLA de Gestão | `Lista de monitorias paradas no status de aprovação do supervisor` | Foco em fluidez do processo. |

---

## 4. Supervisor de Qualidade (`gestor_qualidade`)
Focado em controle macro, tendências e calibração.

| Indicador | Descrição | Regra de Cálculo | Envolvidos / Visibilidade |
| :--- | :--- | :--- | :--- |
| **Média Geral** | KPI Principal | `Média consolidada de todas as notas do sistema` | Visão Global da Empresa. |
| **Pendentes** | Visão de Processo | `Total de ações abertas em todos os perfis do sistema` | Visão de eficiência do fluxo. |
| **Monitorias** | Volume Macro | `Total de avaliações realizadas na empresa no período` | Volume total consolidado. |
| **Tendência** | Evolução temporal | `Comparação da média da 2ª metade do período vs a 1ª metade` | Direção da qualidade (sobe/desce). |
| **Ranking Qualidade** | Gestão da Qualidade | `Ranking de monitores por volume de auditorias realizadas` | Produtividade da equipe de qualidade. |
| **Curva de Qualidade** | Saúde da operação | `% de monitorias em cada faixa (Crítico, Regular, Bom, Excelente)` | Distribuição estatística de notas. |
| **Melhores/Oportunidades**| Talentos/Críticos | `Ranking global dos melhores e piores agentes da operação` | Visão Top/Bottom Global. |

---
*Este documento é atualizado automaticamente conforme as regras de negócio implementadas no código-fonte.*
