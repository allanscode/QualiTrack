import React from 'react';
import Card from '../ui/Card';
import Badge from '../ui/Badge';
import {
  Sparkles,
  Filter,
  Layers,
  FileCheck,
  Cpu,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  FileText,
  Zap
} from 'lucide-react';

export default function AIPipelineView() {
  return (
    <div className="space-y-6 animate-fade-in text-xs">
      <div>
        <h3 className="text-base font-bold text-brand-primary">Entendimento do Fluxo & Pipeline da IA</h3>
        <p className="text-xs text-brand-muted">
          Visão explicativa de como o QualiTrack higieniza diálogos do Zendesk, injeta manuais normativos e obtém avaliações estruturadas.
        </p>
      </div>

      {/* Diagrama do Pipeline */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Card className="p-4 space-y-2 border-brand-highlight/30 bg-surface-card">
          <div className="w-8 h-8 rounded-lg bg-brand-highlight/15 text-brand-highlight flex items-center justify-center font-bold">
            1
          </div>
          <h4 className="font-bold text-brand-primary">Coleta do Zendesk</h4>
          <p className="text-brand-muted text-[11px] leading-relaxed">
            Obtém comentários, classificação de cliente (Cliente Final vs Revenda), tags e campos preenchidos no chamado.
          </p>
        </Card>

        <Card className="p-4 space-y-2 border-brand-highlight/30 bg-surface-card">
          <div className="w-8 h-8 rounded-lg bg-brand-highlight/15 text-brand-highlight flex items-center justify-center font-bold">
            2
          </div>
          <h4 className="font-bold text-brand-primary">Sanitizador Anti-Ruído</h4>
          <p className="text-brand-muted text-[11px] leading-relaxed">
            Elimina assinaturas repetitivas, avisos de confidencialidade e threads duplicadas. Economiza de 30% a 45% dos tokens.
          </p>
        </Card>

        <Card className="p-4 space-y-2 border-brand-highlight/30 bg-surface-card">
          <div className="w-8 h-8 rounded-lg bg-brand-highlight/15 text-brand-highlight flex items-center justify-center font-bold">
            3
          </div>
          <h4 className="font-bold text-brand-primary">Injeção Normativa & Ficha</h4>
          <p className="text-brand-muted text-[11px] leading-relaxed">
            Carrega o Manual da IA amarrado ao tipo de cliente e mapeia as perguntas/pesos e erros críticos da Ficha.
          </p>
        </Card>

        <Card className="p-4 space-y-2 border-brand-highlight/30 bg-surface-card">
          <div className="w-8 h-8 rounded-lg bg-brand-highlight/15 text-brand-highlight flex items-center justify-center font-bold">
            4
          </div>
          <h4 className="font-bold text-brand-primary">Execução & Validação</h4>
          <p className="text-brand-muted text-[11px] leading-relaxed">
            Executa o GLM 5.3 Flash pelo OpenRouter com JSON Schema estrito e failover entre providers do mesmo modelo.
          </p>
        </Card>
      </div>

      {/* Regras do Sanitizador */}
      <Card className="p-5 space-y-4 bg-surface-card">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-brand-highlight" />
          <h4 className="text-sm font-bold text-brand-primary">Regras Ativas do Sanitizador de Diálogos</h4>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
          <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border space-y-1">
            <span className="font-bold text-brand-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-functional-success" />
              Remoção de Assinaturas Corporativas
            </span>
            <p className="text-brand-muted">
              Identifica e remove saudações de encerramento como "Atenciosamente", "Cordialmente", cargos, e telefones corporativos.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border space-y-1">
            <span className="font-bold text-brand-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-functional-success" />
              Corte de Disclaimers e Avisos Legais
            </span>
            <p className="text-brand-muted">
              Filtra rodapés jurídicos ("Esta mensagem e seus anexos são confidenciais...", "This email is confidential...").
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border space-y-1">
            <span className="font-bold text-brand-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-functional-success" />
              Limpeza de E-mails Encadeados (&gt;)
            </span>
            <p className="text-brand-muted">
              Descarta citações repetitivas de mensagens antigas ("Em qui., 17 de set. às ... escreveu: &gt; ...") em tickets com múltiplos replies.
            </p>
          </div>

          <div className="p-3 rounded-xl bg-surface-subtle border border-surface-border space-y-1">
            <span className="font-bold text-brand-primary flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-functional-success" />
              Supressão de Artefatos Inline
            </span>
            <p className="text-brand-muted">
              Remove marcadores de imagens binárias ou embeds ([image: screenshot.png], [cid:...]) que inflariam a contagem de tokens.
            </p>
          </div>
        </div>
      </Card>

      {/* Modelo & Resiliência */}
      <Card className="p-5 space-y-4 bg-surface-card">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-amber-500" />
          <h4 className="text-sm font-bold text-brand-primary">Modelo de Avaliação & Tentativas</h4>
        </div>

        <div className="space-y-2 text-[11px] text-brand-muted">
          <p>
            • <strong>Modelo único:</strong> GLM 5.3 Flash (<code className="font-mono text-brand-primary font-bold">z-ai/glm-5.3-flash</code>) pelo OpenRouter, acessado exclusivamente pela Edge Function com chave armazenada em secret.
          </p>
          <p>
            • <strong>Resiliência:</strong> failover automático entre providers do mesmo modelo, até três novas tentativas com espera progressiva e reprocessamento posterior em falhas transitórias.
          </p>
        </div>
      </Card>
    </div>
  );
}
