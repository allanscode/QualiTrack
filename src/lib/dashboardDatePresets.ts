/**
 * Gerenciador de Presets Rápidos de Data (Dia | Mês | Ano) (WQ-21)
 * Compatível com o fuso America/Sao_Paulo e sem conflito com seleção customizada.
 */

export function getPresetDateRange(
  preset: 'dia' | 'mes' | 'ano',
  refDate: Date = new Date()
): { startDate: string; endDate: string } {
  const spDate = refDate.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // 'YYYY-MM-DD'
  const [year, month] = spDate.split('-');

  if (preset === 'dia') {
    return { startDate: spDate, endDate: spDate };
  }

  if (preset === 'mes') {
    const lastDay = new Date(Number(year), Number(month), 0).getDate();
    return {
      startDate: `${year}-${month}-01`,
      endDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
    };
  }

  if (preset === 'ano') {
    return {
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
    };
  }

  return { startDate: spDate, endDate: spDate };
}

export function detectActivePreset(
  startDate?: string,
  endDate?: string,
  refDate: Date = new Date()
): 'dia' | 'mes' | 'ano' | null {
  if (!startDate || !endDate) return null;

  const diaRange = getPresetDateRange('dia', refDate);
  if (startDate === diaRange.startDate && endDate === diaRange.endDate) return 'dia';

  const mesRange = getPresetDateRange('mes', refDate);
  if (startDate === mesRange.startDate && endDate === mesRange.endDate) return 'mes';

  const anoRange = getPresetDateRange('ano', refDate);
  if (startDate === anoRange.startDate && endDate === anoRange.endDate) return 'ano';

  return null;
}
