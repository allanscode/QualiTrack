import React, { useState } from 'react';
import { Paperclip, Download, Loader2, FileText, Image, FileAudio } from 'lucide-react';
import { toast } from 'sonner';
import { ActionAttachment } from '../types';
import { getAttachmentDownloadUrl } from '../lib/monitoriaAttachments';

interface ActionAttachmentsViewerProps {
  attachments: ActionAttachment[];
  compact?: boolean;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(mime: string) {
  if (mime.startsWith('image/')) return Image;
  if (mime.startsWith('audio/')) return FileAudio;
  return FileText;
}

export default function ActionAttachmentsViewer({
  attachments,
  compact = false,
}: ActionAttachmentsViewerProps) {
  const [downloadingPath, setDownloadingPath] = useState<string | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const handleDownload = async (att: ActionAttachment) => {
    if (att.url && att.url.startsWith('blob:')) {
      window.open(att.url, '_blank');
      return;
    }

    try {
      setDownloadingPath(att.path);
      const url = await getAttachmentDownloadUrl(att.path);
      if (url === '#demo-attachment') {
        toast.info(`Demonstração: anexo "${att.name}" simulado.`);
        return;
      }
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err: any) {
      toast.error(err.message || 'Não foi possível baixar o anexo.');
    } finally {
      setDownloadingPath(null);
    }
  };

  if (compact) {
    return (
      <div className="flex flex-col gap-1 w-full text-left">
        {attachments.map((att, i) => {
          const Icon = getFileIcon(att.mime_type);
          const isDownloading = downloadingPath === att.path;
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleDownload(att)}
              disabled={isDownloading}
              title={`Baixar ${att.name}`}
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-surface-subtle/80 hover:bg-surface-border/50 text-[10px] text-brand-primary border border-surface-border/40 transition-colors max-w-full truncate"
            >
              {isDownloading ? (
                <Loader2 className="w-3 h-3 animate-spin text-brand-highlight shrink-0" />
              ) : (
                <Icon className="w-3 h-3 text-brand-muted shrink-0" />
              )}
              <span className="truncate">{att.name}</span>
              <span className="text-[9px] text-brand-muted shrink-0">({formatFileSize(att.size)})</span>
              <Download className="w-2.5 h-2.5 ml-auto text-brand-muted shrink-0" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2 pt-1">
      {attachments.map((att, i) => {
        const Icon = getFileIcon(att.mime_type);
        const isDownloading = downloadingPath === att.path;
        return (
          <button
            key={i}
            type="button"
            onClick={() => handleDownload(att)}
            disabled={isDownloading}
            title={`Baixar anexo: ${att.name}`}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-surface-subtle/70 hover:bg-surface-border/60 text-xs font-semibold text-brand-primary border border-surface-border/50 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
          >
            {isDownloading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-highlight shrink-0" />
            ) : (
              <Icon className="w-3.5 h-3.5 text-brand-muted shrink-0" />
            )}
            <span className="max-w-[200px] truncate">{att.name}</span>
            <span className="text-[10px] text-brand-muted font-normal shrink-0">({formatFileSize(att.size)})</span>
            <Download className="w-3 h-3 text-brand-muted shrink-0 ml-1 hover:text-brand-primary" />
          </button>
        );
      })}
    </div>
  );
}
