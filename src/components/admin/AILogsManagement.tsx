import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { AIEvaluationLog, User } from '../../types';
import {
  RefreshCw,
  Search,
  Filter,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  FileText,
  Copy,
  Check,
  ExternalLink,
  ChevronRight,
  Eye,
  AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';
import Card from '../ui/Card';
import Button from '../ui/Button';
import Badge from '../ui/Badge';

interface AILogsManagementProps {
  currentUser: User | null;
}

export default function AILogsManagement({ currentUser }: AILogsManagementProps) {
  const [logs, setLogs] = useState<AIEvaluationLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'success' | 'error'>('all');
  const [filterType, setFilterType] = useState<'all' | 'atendimento' | 'chamado_filho'>('all');
  const [selectedLog, setSelectedLog] = useState<AIEvaluationLog | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'prompt' | 'dialogue' | 'response' | 'metrics'>('response');
  const [copiedSection, setCopiedSection] = useState<string | null>(null);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: !!selectedLog } }));
    return () => {
      if (selectedLog) {
        window.dispatchEvent(new CustomEvent('qualitrack:modal', { detail: { open: false } }));
      }
    };
  }, [selectedLog]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      if (!supabase) {
        setLogs([]);
        return;
      }

      let query = supabase
        .from('ai_evaluation_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (filterStatus !== 'all') {
        query = query.eq('status', filterStatus);
      }
      if (filterType !== 'all') {
        query = query.eq('evaluation_type', filterType);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs((data as AIEvaluationLog[]) || []);
    } catch (err: any) {
      console.error('Erro ao carregar logs da IA:', err);
      toast.error('Falha ao carregar registros de auditoria da IA.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filterStatus, filterType]);

  const filteredLogs = logs.filter(log => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      log.ticket_id.toLowerCase().includes(term) ||
      (log.ticket_subject && log.ticket_subject.toLowerCase().includes(term)) ||
      log.model.toLowerCase().includes(term)
    );
  });

  const handleCopy = (text: string, section: string) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast.success('Copiado para a área de transferência!');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header com Filtros */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-brand-primary">Registros & Auditoria de Execuções da IA</h3>
          <p className="text-xs text-brand-muted">
            Rastreabilidade completa de prompts, diálogos sanitizados, latência e respostas retornadas pelos modelos.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchLogs}
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar Logs</span>
          </Button>
        </div>
      </div>

      {/* Barra de Busca e Filtros */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-2xl bg-surface-subtle/50 border border-surface-border">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-brand-muted absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Buscar por Ticket # ou assunto..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-surface-card border border-surface-border text-brand-primary focus:outline-none focus:border-brand-highlight"
          />
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-brand-muted font-bold text-[11px]">Status:</span>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-surface-border text-brand-primary text-xs font-medium cursor-pointer"
          >
            <option value="all">Todos os Status</option>
            <option value="success">Sucesso</option>
            <option value="error">Erro</option>
          </select>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-brand-muted font-bold text-[11px]">Tipo:</span>
          <select
            value={filterType}
            onChange={e => setFilterType(e.target.value as any)}
            className="px-2.5 py-1.5 rounded-xl bg-surface-card border border-surface-border text-brand-primary text-xs font-medium cursor-pointer"
          >
            <option value="all">Todos os Tipos</option>
            <option value="atendimento">Atendimento (Ficha)</option>
            <option value="chamado_filho">Chamado Filho</option>
          </select>
        </div>
      </div>

      {/* Lista de Logs */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-brand-muted space-y-3">
          <RefreshCw className="w-6 h-6 animate-spin text-brand-primary" />
          <p className="text-xs">Carregando auditoria da IA...</p>
        </div>
      ) : filteredLogs.length === 0 ? (
        <Card className="p-8 text-center space-y-2">
          <Cpu className="w-8 h-8 text-brand-muted mx-auto opacity-50" />
          <p className="text-sm font-bold text-brand-primary">Nenhum registro de IA encontrado</p>
          <p className="text-xs text-brand-muted">
            As avaliações com IA realizadas pelos monitores serão registradas automaticamente aqui.
          </p>
        </Card>
      ) : (
        <div className="border border-surface-border rounded-2xl overflow-hidden bg-surface-card">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-subtle/80 border-b border-surface-border text-brand-muted font-bold text-[11px]">
                  <th className="py-3 px-4">Ticket</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">Provedor / Modelo</th>
                  <th className="py-3 px-4">Latência</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Data/Hora</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border/50">
                {filteredLogs.map(log => (
                  <tr key={log.id} className="hover:bg-surface-subtle/40 transition-colors">
                    <td className="py-3 px-4 font-mono font-bold text-brand-primary">
                      #{log.ticket_id}
                      {log.ticket_subject && (
                        <span className="block text-[11px] font-sans font-normal text-brand-muted truncate max-w-[200px]">
                          {log.ticket_subject}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <Badge
                        variant={log.evaluation_type === 'chamado_filho' ? 'warning' : 'primary'}
                        size="xs"
                        className="capitalize"
                      >
                        {log.evaluation_type === 'chamado_filho' ? 'Chamado Filho' : 'Atendimento'}
                      </Badge>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 font-mono text-[11px]">
                        <span className="font-bold text-brand-primary uppercase">{log.provider}</span>
                        <span className="text-brand-muted">({log.model})</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-brand-muted">
                      {log.duration_ms ? `${(log.duration_ms / 1000).toFixed(2)}s` : '--'}
                    </td>
                    <td className="py-3 px-4">
                      {log.status === 'success' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-functional-success">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sucesso
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-functional-error" title={log.error_message}>
                          <XCircle className="w-3.5 h-3.5" />
                          Falha
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-brand-muted text-[11px]">
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedLog(log)}
                        className="text-[11px] h-7 px-2.5 flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3 h-3" />
                        <span>Inspecionar</span>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de Inspeção Detalhada com createPortal e z-[9999] */}
      {selectedLog && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/75 backdrop-blur-xs animate-fade-in">
          <div className="bg-surface-card border border-surface-border rounded-2xl w-full max-w-4xl h-[92vh] max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header Modal */}
            <div className="p-4 border-b border-surface-border flex items-center justify-between bg-surface-subtle/50">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-brand-highlight/15 text-brand-highlight flex items-center justify-center font-black">
                  #{selectedLog.ticket_id}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-brand-primary">
                    Auditoria de IA — Chamado #{selectedLog.ticket_id}
                  </h4>
                  <p className="text-[11px] text-brand-muted font-mono">
                    {selectedLog.provider.toUpperCase()} • {selectedLog.model} • {selectedLog.duration_ms ? `${(selectedLog.duration_ms / 1000).toFixed(2)}s` : '--'} • {new Date(selectedLog.created_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedLog(null)}
                className="p-1.5 rounded-lg text-brand-muted hover:text-brand-primary hover:bg-surface-subtle transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Abas do Inspetor */}
            <div className="flex border-b border-surface-border px-4 bg-surface-card gap-2">
              <button
                onClick={() => setInspectorTab('response')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  inspectorTab === 'response'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                🤖 Resposta da IA (JSON)
              </button>
              <button
                onClick={() => setInspectorTab('prompt')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  inspectorTab === 'prompt'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                📋 Prompt Enviado
              </button>
              <button
                onClick={() => setInspectorTab('dialogue')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  inspectorTab === 'dialogue'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                💬 Diálogo Sanitizado
              </button>
              <button
                onClick={() => setInspectorTab('metrics')}
                className={`py-2.5 px-3 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  inspectorTab === 'metrics'
                    ? 'border-brand-highlight text-brand-highlight'
                    : 'border-transparent text-brand-muted hover:text-brand-primary'
                }`}
              >
                ⏱️ Métricas & Status
              </button>
            </div>

            {/* Conteúdo da Aba */}
            <div className="p-4 flex-1 overflow-y-auto font-mono text-xs">
              {inspectorTab === 'response' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-sans font-bold text-brand-muted">
                      JSON Estruturado retornado pelo modelo:
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(JSON.stringify(selectedLog.response_json, null, 2), 'response')}
                      className="text-[11px] h-7 px-2 flex items-center gap-1"
                    >
                      {copiedSection === 'response' ? <Check className="w-3 h-3 text-functional-success" /> : <Copy className="w-3 h-3" />}
                      <span>Copiar JSON</span>
                    </Button>
                  </div>
                  <pre className="p-4 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary overflow-x-auto whitespace-pre-wrap leading-relaxed text-[11px]">
                    {selectedLog.response_json
                      ? JSON.stringify(selectedLog.response_json, null, 2)
                      : '(Nenhum JSON retornado)'}
                  </pre>
                </div>
              )}

              {inspectorTab === 'prompt' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-sans font-bold text-brand-muted">
                      Prompt completo com regras, critérios e transcrição montados na Edge Function:
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(selectedLog.prompt_text || '', 'prompt')}
                      className="text-[11px] h-7 px-2 flex items-center gap-1"
                    >
                      {copiedSection === 'prompt' ? <Check className="w-3 h-3 text-functional-success" /> : <Copy className="w-3 h-3" />}
                      <span>Copiar Prompt</span>
                    </Button>
                  </div>
                  <pre className="p-4 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary overflow-x-auto whitespace-pre-wrap leading-relaxed text-[11px]">
                    {selectedLog.prompt_text || '(Prompt não registrado)'}
                  </pre>
                </div>
              )}

              {inspectorTab === 'dialogue' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-sans font-bold text-brand-muted">
                      Transcrição após o filtro sanitizador (ruídos, assinaturas e avisos legais removidos):
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleCopy(selectedLog.sanitized_dialogue || '', 'dialogue')}
                      className="text-[11px] h-7 px-2 flex items-center gap-1"
                    >
                      {copiedSection === 'dialogue' ? <Check className="w-3 h-3 text-functional-success" /> : <Copy className="w-3 h-3" />}
                      <span>Copiar Diálogo</span>
                    </Button>
                  </div>
                  <pre className="p-4 rounded-xl bg-surface-subtle border border-surface-border text-brand-primary overflow-x-auto whitespace-pre-wrap leading-relaxed text-[11px]">
                    {selectedLog.sanitized_dialogue || '(Diálogo não registrado)'}
                  </pre>
                </div>
              )}

              {inspectorTab === 'metrics' && (
                <div className="space-y-4 font-sans text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <Card className="p-3 space-y-1">
                      <span className="text-[11px] text-brand-muted font-bold">Provedor & Modelo</span>
                      <p className="font-mono font-bold text-brand-primary">{selectedLog.provider.toUpperCase()} ({selectedLog.model})</p>
                    </Card>
                    <Card className="p-3 space-y-1">
                      <span className="text-[11px] text-brand-muted font-bold">Tempo de Execução</span>
                      <p className="font-mono font-bold text-brand-primary">
                        {selectedLog.duration_ms ? `${selectedLog.duration_ms} ms (${(selectedLog.duration_ms / 1000).toFixed(2)}s)` : '--'}
                      </p>
                    </Card>
                    <Card className="p-3 space-y-1">
                      <span className="text-[11px] text-brand-muted font-bold">Tipo de Avaliação</span>
                      <p className="font-bold text-brand-primary uppercase">{selectedLog.evaluation_type}</p>
                    </Card>
                    <Card className="p-3 space-y-1">
                      <span className="text-[11px] text-brand-muted font-bold">Status do Retorno</span>
                      <p className={`font-bold ${selectedLog.status === 'success' ? 'text-functional-success' : 'text-functional-error'}`}>
                        {selectedLog.status === 'success' ? 'Sucesso (Schema Válido)' : 'Falha na Execução'}
                      </p>
                    </Card>
                  </div>

                  {selectedLog.error_message && (
                    <div className="p-3 rounded-xl bg-functional-error/10 border border-functional-error/30 text-functional-error space-y-1">
                      <span className="font-bold text-[11px] flex items-center gap-1">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Detalhes do Erro:
                      </span>
                      <p className="font-mono text-[11px]">{selectedLog.error_message}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Rodapé Modal */}
            <div className="p-3 border-t border-surface-border flex justify-end bg-surface-subtle/50 flex-shrink-0">
              <Button size="sm" variant="primary" onClick={() => setSelectedLog(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
