import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { ThemeProvider } from '../../../src/providers/ThemeProvider';
import { SupportDrillDownContent } from '../../../src/components/dashboard/widgets/SupportDrillDownModal';
import { CHILD_TICKET_FORM_ID } from '../../../src/lib/childTicketForm';
import type { Monitoria } from '../../../src/types';

createRoot(document.getElementById('root')!).render(<ThemeProvider>
  <SupportDrillDownContent title="Melhores suportes · Davi Silva" subtitle="Monitorias no período selecionado"
    onClose={() => {}} monitorias={Array.from({ length: 8 }, (_, i) => ({
      id: `fixture-${i}`, ticket_id: String(181361 + i), evaluated_name: 'Davi Silva', team_name: 'PJ Trindade',
      form_id: i % 2 ? 'atendimento' : CHILD_TICKET_FORM_ID,
      ticket_subject: i === 0 ? 'Encaminhamento para análise técnica — divergência no fechamento do PDV e conferência do movimento financeiro'
        : 'Apoio ao atendimento e configuração do PDV',
      ticket_group_name: 'Cliente Final – PDV | PAY', score: 100, status: 'concluida',
      satisfaction_result: 'Positiva', created_at: '2026-10-13T10:00:00Z',
    } as Monitoria))} />
</ThemeProvider>);
