import React, { useState } from 'react';
import { TicketCommentMessage } from '../types';
import { Terminal, Copy, Check, Quote, User, Headphones, Lock, Bot, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';

interface TicketMessageBubbleProps {
  msg: TicketCommentMessage;
  msgId: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onCite?: (commentText: string, authorName: string) => void;
  hasTargetCriterion?: boolean;
}

export default function TicketMessageBubble({
  msg,
  isExpanded,
  onToggleExpand,
  onCite,
  hasTargetCriterion = false,
}: TicketMessageBubbleProps) {
  const [copied, setCopied] = useState(false);
  const [copiedLog, setCopiedLog] = useState(false);

  const isEndUser = msg.author_role === 'end_user';
  const isAgent = msg.author_role === 'agent' || msg.author_role === 'admin';
  const isInternal = !msg.is_public;
  const isSystemBot = msg.author_role === 'system' && msg.is_public;
  const body = msg.body || '';

  const hasLogSnippet = /(?:\[FireDAC\]|ERROR:|Script nao executado:|relation ".*?" already exists|Exception:|Traceback|ALTER TABLE|CREATE TABLE|SELECT\s+|UPDATE\s+|INSERT\s+INTO\s+)/i.test(body);
  const isLong = body.length > 320 || body.split('\n').length > 5;

  const handleCopyText = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(body);
    setCopied(true);
    toast.success('Trecho copiado para a área de transferência!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyLog = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(body);
    setCopiedLog(true);
    toast.success('Log copiado com sucesso!');
    setTimeout(() => setCopiedLog(false), 2000);
  };

  // Cores e layout assimétricos
  let containerStyles = 'p-3.5 rounded-2xl border text-xs space-y-2 select-text transition-all ';
  let badgeStyles = 'text-[9px] font-black uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ';
  let avatarBg = 'bg-surface-subtle text-brand-muted';
  let roleLabel = 'Mensagem';

  if (isEndUser) {
    containerStyles += 'bg-sky-500/5 dark:bg-sky-500/10 border-sky-500/20 rounded-tl-sm mr-2 sm:mr-8 shadow-sm';
    badgeStyles += 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30';
    avatarBg = 'bg-sky-500/20 text-sky-600 dark:text-sky-400';
    roleLabel = 'Cliente';
  } else if (isInternal) {
    containerStyles += 'bg-amber-500/5 dark:bg-amber-500/10 border-amber-500/25 mx-1 shadow-sm';
    badgeStyles += 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30';
    avatarBg = 'bg-amber-500/20 text-amber-600 dark:text-amber-400';
    roleLabel = 'Nota Interna';
  } else if (isSystemBot) {
    containerStyles += 'bg-purple-500/5 dark:bg-purple-500/10 border-purple-500/20 mx-1 shadow-sm';
    badgeStyles += 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30';
    avatarBg = 'bg-purple-500/20 text-purple-600 dark:text-purple-400';
    roleLabel = 'Bot / Sistema';
  } else {
    // Atendente
    containerStyles += 'bg-emerald-500/5 dark:bg-emerald-500/10 border-emerald-500/20 rounded-tr-sm ml-2 sm:ml-8 shadow-sm';
    badgeStyles += 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30';
    avatarBg = 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400';
    roleLabel = 'Atendente';
  }

  return (
    <div className={containerStyles}>
      {/* Header com Avatar, Autor, Badge e Timestamp */}
      <div className="flex items-center justify-between gap-2 flex-wrap pb-1.5 border-b border-surface-border/40">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${avatarBg}`}>
            {isEndUser ? (
              <User className="w-3.5 h-3.5" />
            ) : isInternal ? (
              <Lock className="w-3 h-3" />
            ) : isSystemBot ? (
              <Bot className="w-3.5 h-3.5" />
            ) : (
              <Headphones className="w-3.5 h-3.5" />
            )}
          </div>
          <span className="font-bold text-brand-primary truncate max-w-[200px] sm:max-w-[320px]">
            {msg.author_name}
          </span>
          <span className={badgeStyles}>
            {roleLabel}
          </span>
        </div>
        <span className="text-[10px] font-mono text-brand-muted tabular-nums">
          {msg.created_at ? new Date(msg.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''}
        </span>
      </div>

      {/* Conteúdo da Mensagem */}
      <div className="space-y-2">
        {hasLogSnippet ? (
          /* Terminal Window Mockup */
          <div className="rounded-xl overflow-hidden border border-slate-700/80 bg-slate-950 shadow-md my-2">
            {/* Barra superior do Terminal */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-900 border-b border-slate-800">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-[#ff5f56]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="w-2.5 h-2.5 rounded-full bg-[#27c93f]" />
                <div className="flex items-center gap-1 ml-2 text-[10px] font-mono font-bold text-slate-400">
                  <Terminal className="w-3 h-3 text-emerald-400" />
                  <span>Log / Trace do Sistema</span>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCopyLog}
                className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
                title="Copiar log completo"
              >
                {copiedLog ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span className="text-emerald-400">Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3" />
                    <span>Copiar log</span>
                  </>
                )}
              </button>
            </div>
            {/* Área de código monospace */}
            <div
              className={`p-3 font-mono text-[11px] leading-relaxed text-emerald-300 dark:text-emerald-400 whitespace-pre-wrap select-all overflow-x-auto ${
                !isExpanded && isLong ? 'max-h-36 overflow-hidden relative' : ''
              }`}
            >
              {body}
              {!isExpanded && isLong && (
                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
              )}
            </div>
          </div>
        ) : (
          /* Mensagem comum de texto */
          <div
            className={`leading-relaxed whitespace-pre-wrap text-xs select-text font-sans text-brand-primary ${
              !isExpanded && isLong ? 'max-h-28 overflow-hidden relative' : ''
            }`}
          >
            {body}
            {!isExpanded && isLong && (
              <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-surface-card to-transparent pointer-events-none" />
            )}
          </div>
        )}

        {/* Botão de Expandir/Recolher texto longo */}
        {isLong && (
          <button
            type="button"
            onClick={onToggleExpand}
            className="text-[10px] font-bold text-brand-accent hover:underline flex items-center gap-1 cursor-pointer pt-0.5"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3 h-3" />
                <span>Recolher trecho</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3 h-3" />
                <span>Ver texto completo...</span>
              </>
            )}
          </button>
        )}
      </div>

      {/* Ações de Rodapé (Copiar / Citar em Observação) */}
      <div className="flex items-center justify-end gap-3 pt-1 border-t border-surface-border/40 text-[10px]">
        <button
          type="button"
          onClick={handleCopyText}
          className="flex items-center gap-1 font-bold text-brand-muted hover:text-brand-primary transition-colors cursor-pointer"
          title="Copiar mensagem"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-500" />
              <span className="text-emerald-500">Copiado!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copiar</span>
            </>
          )}
        </button>

        {onCite && (
          <button
            type="button"
            onClick={() => onCite(body, msg.author_name)}
            className="flex items-center gap-1 font-bold text-brand-muted hover:text-brand-accent transition-colors cursor-pointer"
            title={hasTargetCriterion ? 'Inserir citação na observação do critério selecionado' : 'Copiar citação formatada'}
          >
            <Quote className="w-3 h-3 text-brand-accent" />
            <span>{hasTargetCriterion ? 'Citar no Critério' : 'Citar Trecho'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
