import React, { useState } from 'react';
import { User } from '../../types';
import AIGuidelinesManagement from './AIGuidelinesManagement';
import AILogsManagement from './AILogsManagement';
import AIPipelineView from './AIPipelineView';
import { Brain, FileText, Activity, Sparkles, ChevronDown } from 'lucide-react';

interface AIHubManagementProps {
  currentUser: User | null;
}

export default function AIHubManagement({ currentUser }: AIHubManagementProps) {
  const [activePanel, setActivePanel] = useState<'guidelines' | 'logs' | 'pipeline'>('guidelines');

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Barra Superior Unificada com Dropdown / Seletor de Painel */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-surface-subtle/50 border border-surface-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-brand-highlight/15 text-brand-highlight flex items-center justify-center flex-shrink-0">
            <Brain className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-brand-primary">Central de Inteligência Artificial</h3>
            <p className="text-[11px] text-brand-muted">
              Gerencie manuais normativos, audite prompts/respostas e entenda o pipeline de IA.
            </p>
          </div>
        </div>

        {/* Seletor Suspenso / Abas Rápidas */}
        <div className="flex items-center gap-1.5 p-1 bg-surface-card rounded-xl border border-surface-border self-start sm:self-auto">
          <button
            onClick={() => setActivePanel('guidelines')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePanel === 'guidelines'
                ? 'bg-brand-highlight text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Manuais & Padrões</span>
          </button>

          <button
            onClick={() => setActivePanel('logs')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePanel === 'logs'
                ? 'bg-brand-highlight text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Logs & Auditoria</span>
          </button>

          <button
            onClick={() => setActivePanel('pipeline')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activePanel === 'pipeline'
                ? 'bg-brand-highlight text-white shadow-sm'
                : 'text-brand-muted hover:text-brand-primary hover:bg-surface-subtle'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Pipeline & Sanitizador</span>
          </button>
        </div>
      </div>

      {/* Conteúdo Dinâmico do Painel Selecionado */}
      {activePanel === 'guidelines' && (
        <AIGuidelinesManagement currentUser={currentUser} />
      )}

      {activePanel === 'logs' && (
        <AILogsManagement currentUser={currentUser} />
      )}

      {activePanel === 'pipeline' && (
        <AIPipelineView />
      )}
    </div>
  );
}
