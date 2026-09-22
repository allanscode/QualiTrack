import React, { useMemo } from 'react';
import { diffWordsWithSpace } from 'diff';

interface TextDiffProps {
  oldText: string;
  newText: string;
  /** Qual lado exibir: o texto antigo (com remoções riscadas) ou o novo (com adições destacadas). */
  side: 'old' | 'new';
  className?: string;
}

/**
 * Mostra um texto com o diff palavra-a-palavra em relação ao outro, no estilo
 * "sugestões" do Google Docs: remoções riscadas em vermelho no lado antigo,
 * adições destacadas em verde no lado novo. Texto puro (sem Markdown) — o
 * diff perde sentido em cima de HTML já renderizado.
 */
export default function TextDiff({ oldText, newText, side, className = '' }: TextDiffProps) {
  const parts = useMemo(() => diffWordsWithSpace(oldText || '', newText || ''), [oldText, newText]);

  return (
    <pre className={`whitespace-pre-wrap font-sans ${className}`}>
      {parts.map((part, i) => {
        if (side === 'old' && part.added) return null;
        if (side === 'new' && part.removed) return null;

        if (part.added) {
          return (
            <mark key={i} className="bg-emerald-500/25 text-emerald-800 dark:text-emerald-300 rounded-sm px-0.5 no-underline">
              {part.value}
            </mark>
          );
        }
        if (part.removed) {
          return (
            <mark key={i} className="bg-rose-500/20 text-rose-700 dark:text-rose-400 rounded-sm px-0.5 line-through decoration-rose-500/70">
              {part.value}
            </mark>
          );
        }
        return <React.Fragment key={i}>{part.value}</React.Fragment>;
      })}
    </pre>
  );
}
