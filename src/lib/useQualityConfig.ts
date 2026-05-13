import { useState, useEffect } from 'react';
import { supabase, mockDb } from './supabase';

export interface QualityLevel {
  label: string;
  minScore: number;
  maxScore: number;
  color: string;
  bgColor: string;
}

export interface QualityConfig {
  levels: QualityLevel[];
  targetScore: number;
  sla: {
    agentReview: number;
    auditorReevaluation: number;
    managerSupport: number;
    managerQuality: number;
  };
  businessHours: {
    start: string;
    end: string;
    days: number[];
    holidays: string[]; // format "DD/MM"
  };
}

const DEFAULT_CONFIG: QualityConfig = {
  targetScore: 75,
  levels: [
    { label: 'Excelente', minScore: 96, maxScore: 100, color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
    { label: 'Aceitável', minScore: 75, maxScore: 95,  color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
    { label: 'Ruim',      minScore: 0,  maxScore: 74,  color: 'text-red-700',     bgColor: 'bg-red-50' },
  ],
  sla: {
    agentReview: 50,
    auditorReevaluation: 25,
    managerSupport: 25,
    managerQuality: 25,
  },
  businessHours: {
    start: '08:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5],
    holidays: ['01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '25/12']
  }
};

const STORAGE_KEY = 'qualitrack_quality_config';

export function useQualityConfig() {
  const [config, setConfig] = useState<QualityConfig>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw) as QualityConfig;
    } catch {}
    return DEFAULT_CONFIG;
  });

  useEffect(() => {
    const fetchConfig = async () => {
      if (supabase) {
        const { data } = await supabase.from('quality_configs').select('*').single();
        if (data) {
          setConfig(data.config);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data.config));
        }
      } else {
        const { data } = await mockDb.get('quality_configs');
        if (data && data.length > 0) {
          setConfig(data[0].config);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data[0].config));
        }
      }
    };
    fetchConfig();
  }, []);

  const saveConfig = async (newConfig: QualityConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    
    if (supabase) {
      const { data: existing } = await supabase.from('quality_configs').select('id').single();
      if (existing) {
        await supabase.from('quality_configs').update({ config: newConfig }).eq('id', existing.id);
      } else {
        await supabase.from('quality_configs').insert({ config: newConfig });
      }
    } else {
      const { data: existing } = await mockDb.get('quality_configs');
      if (existing && existing.length > 0) {
        await mockDb.update('quality_configs', existing[0].id, { config: newConfig });
      } else {
        await mockDb.insert('quality_configs', { config: newConfig });
      }
    }
  };

  const getLevelForScore = (score: number): QualityLevel => {
    const sorted = [...config.levels].sort((a, b) => b.minScore - a.minScore);
    return sorted.find(l => score >= l.minScore && score <= l.maxScore) || config.levels[config.levels.length - 1];
  };

  const isAboveTarget = (score: number) => score >= config.targetScore;

  return { config, saveConfig, getLevelForScore, isAboveTarget };
}
