import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../../src/index.css';
import { DashboardTile, DashboardTileLayout } from '../../../src/components/dashboard/DashboardTileLayout';
import { useDashboardLayoutEditor } from '../../../src/hooks/useDashboardLayoutEditor';
import { QualityConfigProvider } from '../../../src/lib/useQualityConfig';

const cards = [
  'Média Geral', 'Índice de Excelência', 'Total', 'Total Pendentes',
  'Usuários Online', 'Tendência', 'Total Reavaliações', 'Reav. Aprovadas',
  'Reav. Recusadas', 'Taxa de Reversão',
];

function Fixture() {
  const editor = useDashboardLayoutEditor('admin');
  const preview = new URLSearchParams(location.search).has('preview');

  return (
    <main className="mx-auto w-[min(1080px,calc(100vw-40px))] py-6">
      <DashboardTileLayout role="admin" editor={preview ? editor : undefined}>
        {cards.map(title => (
          <DashboardTile key={title} type="StatCard" title={title}>
            <div className="h-full rounded-2xl border border-surface-border bg-surface-card p-4">{title}</div>
          </DashboardTile>
        ))}
        {['Distribuição por Equipe', 'Curva de Qualidade'].map(title => (
          <DashboardTile key={title} type="CustomChart" title={title}>
            <div className="h-[380px] rounded-2xl border border-surface-border bg-surface-card p-4">{title}</div>
          </DashboardTile>
        ))}
      </DashboardTileLayout>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <QualityConfigProvider><Fixture /></QualityConfigProvider>,
);
