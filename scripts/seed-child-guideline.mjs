import { createClient } from '@supabase/supabase-js';

// Usamos a chave do Supabase para inserir a guideline de Chamados Filhos
const supabaseUrl = 'https://vpytvgpsqdapgouyjowc.supabase.co';
// Usamos o token de service do projeto ou tentamos inserir via API
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN é obrigatório.');

const guidelineContent = `# Manual Operacional de Chamados Filhos — POP v1.1 (Projeto DB-361)

## 1. Visão Geral e Objetivo
Este manual normatiza a criação e governança de chamados filhos (Side Conversations) abertos a partir de tickets do Zendesk na operação WebPosto. A conformidade de abertura é auditada automaticamente pelo QualiTrack através de 4 critérios mandatórios.

## 2. Os 4 Tipos de Chamados Filhos (Macros Homologadas)
1. **Nova Demanda (Geral / Mais Pagamentos):**
   - Utilizado para reportar bugs, novas funcionalidades ou solicitações de melhoria para a fábrica de software.
   - Direcionamento: O campo "Para" deve ser atribuído a **si mesmo** (ao próprio analista solicitante) para acompanhamento da resolução.
   - Tags obrigatórias: \`existe_ticket_filho\`, \`existe_nova_demanda\` (ou \`maispag_nova_demanda\`).

2. **Enviar para Análise Técnica (N2 / Fábrica):**
   - Utilizado para escalonamento técnico em segundo nível (Cliente Final, Revenda, Fiscal, Contábil, Correções, Desenvolvimento).
   - Direcionamento: O campo "Para" deve ser direcionado ao **Grupo Especialista correspondente** (ex: "Análise Técnica Fiscal", "Análise Técnica Revenda", etc.).
   - Regra estrita: **NUNCA** pode ser atribuído a uma pessoa física/analista específico.
   - Tags obrigatórias: \`transferencia_analise\` ou variantes por setor (\`transferencia_analise_fiscal\`, etc.).

3. **Apoio Análise Técnica:**
   - Utilizado quando é solicitada consultoria ou apoio pontual de um especialista técnico N2 sem transferir a titularidade do chamado.
   - Direcionamento: O campo "Para" deve ser atribuído **nominalmente ao Analista Técnico N2** que prestou a consultoria.

4. **Produtividade:**
   - Utilizado para registro de atividades internas, homologações ou tarefas complementares de suporte.
   - Tags: \`filho_produtividade\`, \`produtividade\`.

## 3. As 4 Regras de Ouro da Auditoria de Qualidade
- **Regra 1: Preservação do Assunto (Inalterabilidade):**
  O assunto gerado pela macro não pode ser descaracterizado. O prefixo "Ticket " e o número do ticket pai (ex: "Nova Demanda do #169238" ou "Ticket Nova Demanda do #169238") são totalmente válidos e conformes. Apenas reprova se houver texto livre desconexo da macro.
- **Regra 2: Preservação do Texto da Macro com Enriquecimento:**
  O texto-base da macro deve ser mantido e enriquecido obrigatoriamente com dados técnicos (versão, logs, AnyDesk, descrição da falha e testes já realizados).
- **Regra 3: Direcionamento Correto ("Para"):**
  Conformidade entre o tipo de macro e o destino (Grupo técnico para Análise Técnica; Próprio Analista para Nova Demanda; Analista N2 para Apoio Técnico).
- **Regra 4: Governança de Tags:**
  Preservação das tags injetadas pela automação para correto funcionamento dos relatórios e gatilhos do Zendesk.
`;

console.log('Manual de chamados filhos pronto para gravação.');
