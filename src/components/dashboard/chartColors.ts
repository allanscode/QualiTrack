export function getChartColor(varName: string): string {
  if (typeof window === 'undefined') return '#94a3b8';
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || '#94a3b8';
}

export function chartPalette() {
  return {
    excelente: getChartColor('--chart-excelente'),
    aceitavel: getChartColor('--chart-aceitavel'),
    atencao: getChartColor('--chart-atencao'),
    ruim: getChartColor('--chart-ruim'),
    indigo: getChartColor('--chart-excelente'),
    emerald: getChartColor('--chart-aceitavel'),
    amber: getChartColor('--chart-atencao'),
    red: getChartColor('--chart-ruim'),
    purple: '#a855f7',
    blue: '#3b82f6',
    pink: '#ec4899',
    teal: '#14b8a6',
  };
}

export function chartColorArray(): string[] {
  const p = chartPalette();
  return [p.indigo, p.emerald, p.amber, p.red, p.purple, p.blue, p.pink, p.teal];
}

export function chartColorMap(): Record<string, string> {
  const p = chartPalette();
  return {
    'text-indigo-700': p.indigo,
    'text-emerald-700': p.emerald,
    'text-amber-700': p.amber,
    'text-red-700': p.red,
    'text-purple-700': p.purple,
    'text-blue-700': p.blue,
    'text-level-excelente': p.indigo,
    'text-level-aceitavel': p.emerald,
    'text-level-ruim': p.red,
    'text-level-atencao': p.amber,
  };
}
