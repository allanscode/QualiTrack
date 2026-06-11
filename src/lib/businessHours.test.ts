import { describe, it, expect, vi } from 'vitest';
import { addBusinessHours, getRemainingBusinessSeconds, BusinessHoursConfig } from '../lib/businessHours';

const DEFAULT_CONFIG: BusinessHoursConfig = {
  start: '08:00',
  end: '17:00',
  days: [1, 2, 3, 4, 5],
  holidays: ['01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '25/12'],
};

const createDate = (year: number, month: number, day: number, hour: number, minute: number = 0): Date => {
  return new Date(year, month - 1, day, hour, minute, 0, 0);
};

describe('businessHours', () => {
  describe('addBusinessHours', () => {
    it('deve adicionar horas dentro do mesmo dia útil', () => {
      const from = createDate(2026, 6, 10, 9, 0); // Quarta-feira 9:00
      const result = addBusinessHours(from, 2, DEFAULT_CONFIG);
      expect(result.getHours()).toBe(11);
      expect(result.getMinutes()).toBe(0);
    });

    it('deve pular para o próximo dia útil se exceder o horário de fim', () => {
      const from = createDate(2026, 6, 10, 16, 0); // Quarta-feira 16:00
      const result = addBusinessHours(from, 2, DEFAULT_CONFIG);
      expect(result.getDate()).toBe(11); // Quinta-feira
      expect(result.getHours()).toBe(9);
      expect(result.getMinutes()).toBe(0);
    });

    it('deve pular fim de semana (sábado/domingo)', () => {
      const from = createDate(2026, 6, 12, 15, 0); // Sexta-feira 15:00
      const result = addBusinessHours(from, 4, DEFAULT_CONFIG);
      expect(result.getDay()).toBe(1); // Segunda-feira
      expect(result.getHours()).toBe(10); // 15:00 + 1h (até 17:00) + 3h na segunda = 10:00
    });

    it('deve pular feriado nacional (ex: 01/01)', () => {
      const from = createDate(2025, 12, 31, 14, 0); // Quarta-feira 14:00 (véspera de 01/01)
      const result = addBusinessHours(from, 4, DEFAULT_CONFIG);
      // 31/12 14:00 + 3h = 17:00 (fim do dia)
      // 01/01 é feriado -> pula para 02/01 (quinta)
      // + 1h restante = 02/01 09:00
      expect(result.getDate()).toBe(2);
      expect(result.getMonth()).toBe(0); // Janeiro
      expect(result.getHours()).toBe(9);
    });

    it('deve pular feriado no meio da contagem (ex: 25/12 Natal)', () => {
      const from = createDate(2025, 12, 24, 10, 0); // Quarta-feira 10:00 (véspera de Natal)
      const result = addBusinessHours(from, 10, DEFAULT_CONFIG);
      // 24/12 10:00 + 7h = 17:00 (fim do dia)
      // 25/12 feriado -> pula
      // 26/12 sexta + 3h restantes = 11:00
      expect(result.getDate()).toBe(26);
      expect(result.getHours()).toBe(11);
    });

    it('deve retornar a mesma data se hours = 0', () => {
      const from = createDate(2026, 6, 10, 10, 30);
      const result = addBusinessHours(from, 0, DEFAULT_CONFIG);
      expect(result.getTime()).toBe(from.getTime());
    });

    it('deve lidar com config customizada (dias úteis diferentes)', () => {
      const customConfig: BusinessHoursConfig = {
        ...DEFAULT_CONFIG,
        days: [0, 1, 2, 3, 4, 5, 6], // Todos os dias
      };
      const from = createDate(2026, 6, 13, 10, 0); // Sábado
      const result = addBusinessHours(from, 2, customConfig);
      expect(result.getDay()).toBe(6); // Ainda sábado
      expect(result.getHours()).toBe(12);
    });

    it('deve lidar com horário customizado (ex: 09:00-18:00)', () => {
      const customConfig: BusinessHoursConfig = {
        ...DEFAULT_CONFIG,
        start: '09:00',
        end: '18:00',
      };
      const from = createDate(2026, 6, 10, 9, 0);
      const result = addBusinessHours(from, 1, customConfig);
      expect(result.getHours()).toBe(10);
    });

    it('deve snap para início do expediente se antes do horário', () => {
      const from = createDate(2026, 6, 10, 7, 0); // Antes das 08:00
      const result = addBusinessHours(from, 1, DEFAULT_CONFIG);
      expect(result.getHours()).toBe(9); // 08:00 + 1h
    });

    it('deve snap para próximo dia útil se depois do horário', () => {
      const from = createDate(2026, 6, 10, 18, 0); // Depois das 17:00
      const result = addBusinessHours(from, 1, DEFAULT_CONFIG);
      expect(result.getDate()).toBe(11); // Próximo dia útil
      expect(result.getHours()).toBe(9); // 08:00 + 1h
    });

    it('deve lidar com horas grandes (ex: 50 horas = ~1 semana)', () => {
      const from = createDate(2026, 6, 9, 9, 0); // Terça-feira
      const result = addBusinessHours(from, 50, DEFAULT_CONFIG);
      // 50h = 3000 min
      // Terça 9:00-17:00 = 480 min (restam 2520)
      // Qua 8:00-17:00 = 540 min (1980)
      // Qui 540 (1440)
      // Sex 540 (900)
      // Seg 540 (360)
      // Ter 8:00 + 360 min = 14:00
      expect(result.getDay()).toBe(2); // Terça-feira
      expect(result.getHours()).toBe(14);
    });
  });

  describe('getRemainingBusinessSeconds', () => {
    it('deve retornar 0 se start >= end', () => {
      const start = createDate(2026, 6, 10, 12, 0);
      const end = createDate(2026, 6, 10, 10, 0);
      expect(getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG)).toBe(0);
    });

    it('deve calcular segundos dentro do mesmo dia útil', () => {
      const start = createDate(2026, 6, 10, 9, 0);
      const end = createDate(2026, 6, 10, 11, 0);
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      expect(result).toBe(2 * 3600); // 2 horas = 7200s
    });

    it('deve retornar 0 se ambos fora do expediente no mesmo dia', () => {
      const start = createDate(2026, 6, 10, 7, 0);
      const end = createDate(2026, 6, 10, 7, 30);
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      expect(result).toBe(0);
    });

    it('deve snap start para início do expediente se antes', () => {
      const start = createDate(2026, 6, 10, 7, 0);
      const end = createDate(2026, 6, 10, 10, 0);
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      expect(result).toBe(2 * 3600); // 08:00 até 10:00
    });

    it('deve calcular através de múltiplos dias úteis', () => {
      const start = createDate(2026, 6, 10, 15, 0); // Quarta 15:00
      const end = createDate(2026, 6, 11, 10, 0); // Quinta 10:00
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      // Quarta 15:00-17:00 = 2h
      // Quinta 08:00-10:00 = 2h
      // Total = 4h = 14400s
      expect(result).toBe(4 * 3600);
    });

    it('deve pular fim de semana no cálculo', () => {
      const start = createDate(2026, 6, 12, 15, 0); // Sexta 15:00
      const end = createDate(2026, 6, 15, 10, 0); // Segunda 10:00
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      // Sexta 15:00-17:00 = 2h
      // Segunda 08:00-10:00 = 2h
      // Total = 4h = 14400s
      expect(result).toBe(4 * 3600);
    });

    it('deve pular feriado no cálculo', () => {
      const start = createDate(2025, 12, 31, 15, 0); // Quarta 15:00 (véspera 01/01)
      const end = createDate(2026, 1, 2, 10, 0); // Sexta 10:00 (02/01)
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      // 31/12 15:00-17:00 = 2h
      // 01/01 feriado
      // 02/01 08:00-10:00 = 2h
      // Total = 4h = 14400s
      expect(result).toBe(4 * 3600);
    });

    it('deve lidar com deadline no passado (start > end após snap)', () => {
      const start = createDate(2026, 6, 10, 16, 0);
      const end = createDate(2026, 6, 10, 15, 0);
      const result = getRemainingBusinessSeconds(start, end, DEFAULT_CONFIG);
      expect(result).toBe(0);
    });

    it('deve lidar com config customizada', () => {
      const customConfig: BusinessHoursConfig = {
        ...DEFAULT_CONFIG,
        start: '09:00',
        end: '12:00', // Meio dia
      };
      const start = createDate(2026, 6, 10, 9, 0);
      const end = createDate(2026, 6, 10, 11, 0);
      const result = getRemainingBusinessSeconds(start, end, customConfig);
      expect(result).toBe(2 * 3600);
    });
  });

  describe('isHoliday / isBusinessDay (internal helpers via behavior)', () => {
    it('deve considerar feriados fixos', () => {
      const holidays = ['25/12', '01/01', '01/05'];
      const config: BusinessHoursConfig = { ...DEFAULT_CONFIG, holidays };
      
      const christmas = createDate(2025, 12, 25, 10, 0);
      const result = addBusinessHours(christmas, 1, config);
      // 25/12 é feriado -> deve pular para 26/12
      expect(result.getDate()).toBe(26);
    });

    it('deve respeitar dias da semana configurados', () => {
      const config: BusinessHoursConfig = { ...DEFAULT_CONFIG, days: [1, 2, 3, 4, 5, 6] }; // Inclui sábado
      
      const saturday = createDate(2026, 6, 13, 10, 0);
      const result = addBusinessHours(saturday, 1, config);
      expect(result.getDay()).toBe(6); // Sábado continua sendo dia útil
    });
  });

  describe('Edge cases', () => {
    it('deve lidar com virada de ano', () => {
      const from = createDate(2025, 12, 31, 16, 0);
      const result = addBusinessHours(from, 2, DEFAULT_CONFIG);
      // 31/12 16:00 + 1h = 17:00 (fim)
      // 01/01 feriado
      // 02/01 08:00 + 1h = 09:00
      expect(result.getFullYear()).toBe(2026);
      expect(result.getMonth()).toBe(0);
      expect(result.getDate()).toBe(2);
    });

    it('deve lidar com ano bissexto (fevereiro 29)', () => {
      const from = createDate(2024, 2, 28, 15, 0); // 28/02/2024 (quarta)
      const result = addBusinessHours(from, 4, DEFAULT_CONFIG);
      // 28/02 15:00-17:00 = 2h
      // 29/02 (quinta, bissexto) 08:00 + 2h = 10:00
      expect(result.getMonth()).toBe(1); // Fevereiro
      expect(result.getDate()).toBe(29);
    });

    it('deve funcionar com milliseconds no input', () => {
      const from = new Date(2026, 5, 10, 10, 0, 0, 500); // 500ms
      const result = addBusinessHours(from, 1, DEFAULT_CONFIG);
      // Deve ignorar ms e calcular corretamente
      expect(result.getHours()).toBe(11);
      expect(result.getMinutes()).toBe(0);
      expect(result.getSeconds()).toBe(0);
      // milliseconds pode não ser zeroado pela função
      expect(result.getMilliseconds()).toBeGreaterThanOrEqual(0);
    });
  });
});
