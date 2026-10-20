import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RefreshCw } from 'lucide-react';
import Card from '../ui/Card';
import Button from '../ui/Button';
import { mockDb, requireAccessToken, supabase } from '../../lib/supabase';
import { buildDeliveryDashboard, type CompletedMonitoria, type DeliveryDashboard as DashboardData, type DeliveryEvidence } from '../../../supabase/functions/helpdesk-queue/delivery-dashboard';

function isDashboardData(value: unknown): value is DashboardData {
  if (!value || typeof value !== 'object') return false;
  const data = value as Partial<DashboardData>;
  return typeof data.total === 'number' && typeof data.confirmed === 'number'
    && typeof data.unconfirmed === 'number' && Array.isArray(data.months);
}

export default function DeliveryDashboard() {
  const [report, setReport] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (supabase) {
        await requireAccessToken();
        const { data, error: requestError } = await supabase.functions.invoke('helpdesk-queue', {
          body: { action: 'fetch_delivery_dashboard' },
        });
        if (requestError || !isDashboardData(data)) throw new Error('Não foi possível carregar o relatório de entregas.');
        setReport(data);
      } else {
        const [monitorias, submissions, positives, children] = await Promise.all([
          mockDb.get('monitorias'), mockDb.get('helpdesk_submissions'),
          mockDb.get('positive_auto_publications'), mockDb.get('child_auto_publications'),
        ]);
        const completed = ((monitorias.data || []) as Array<CompletedMonitoria & { status: string; active: boolean }> )
          .filter(row => row.active && ['concluida', 'contestacao_aceita', 'contestacao_negada', 'finalizada_alterada'].includes(row.status));
        setReport(buildDeliveryDashboard(completed,
          (submissions.data || []) as DeliveryEvidence[],
          (positives.data || []) as DeliveryEvidence[],
          (children.data || []) as DeliveryEvidence[]));
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar entregas.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-xl font-bold text-brand-primary">Entregas ao Zendesk</h2>
        <p className="mt-1 text-sm text-brand-muted">Monitorias ativas concluídas e evidências registradas de envio.</p>
      </div>
      <Button type="button" variant="outline" onClick={() => void load()} loading={loading} icon={<RefreshCw className="h-4 w-4" />}>Atualizar</Button>
    </div>

    {error && <Card><p role="alert" className="text-sm text-error">{error}</p></Card>}
    {loading && <p role="status" className="text-sm text-brand-muted">Carregando relatório...</p>}
    {!loading && report && <>
      <div className="grid gap-3 sm:grid-cols-3">
        {([
          ['Monitorias concluídas', report.total],
          ['Envios confirmados', report.confirmed],
          ['Sem confirmação', report.unconfirmed],
        ] as const).map(([label, count]) => <Card key={label}>
          <p className="text-sm text-brand-muted">{label}</p>
          <p className="mt-1 text-3xl font-bold text-brand-primary">{count.toLocaleString('pt-BR')}</p>
        </Card>)}
      </div>

      <Card>
        <h3 className="font-semibold text-brand-primary">Concluídas × envios confirmados por mês</h3>
        <p className="mt-1 text-xs text-brand-muted">Mês da conclusão da monitoria; “Sem data” reúne registros antigos sem data de conclusão.</p>
        {report.months.length ? <div className="mt-4 h-72" role="img" aria-label="Gráfico mensal de monitorias concluídas, envios confirmados e sem confirmação">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={report.months} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend />
              <Bar dataKey="completed" name="Concluídas" fill="#64748b" />
              <Bar dataKey="confirmed" name="Confirmadas" fill="#16a34a" />
              <Bar dataKey="unconfirmed" name="Sem confirmação" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </div> : <p className="mt-4 text-sm text-brand-muted">Nenhuma monitoria concluída encontrada.</p>}
      </Card>

      <Card>
        <h3 className="font-semibold text-brand-primary">Situação das entregas sem confirmação</h3>
        <div className="mt-3 grid gap-2 text-sm text-brand-muted sm:grid-cols-2 lg:grid-cols-4">
          <p>Sem recibo estruturado: <strong>{report.no_receipt}</strong></p>
          <p>Pendente ou processando: <strong>{report.pending}</strong></p>
          <p>Resultado incerto: <strong>{report.uncertain}</strong></p>
          <p>Tentativa falhou: <strong>{report.failed}</strong></p>
          <p>Automação ignorada: <strong>{report.skipped}</strong></p>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-brand-muted">Confirmado significa recibo de envio ao Zendesk com estado “sent” em uma das três fontes. A falta de recibo não prova falha: envios manuais de chamados filhos podem não ter registro estruturado. “Tentativa falhou” indica uma tentativa registrada sem confirmação posterior; não comprova ausência de entrega por outro caminho. O gráfico conta monitorias distintas pelo mês de conclusão, não pelo mês do envio.</p>
      </Card>
    </>}
  </div>;
}
