import { useState, useEffect } from 'react';

export interface QualityLevel {
  label: string;
  minScore: number; // inclusive lower bound (0-100)
  maxScore: number; // inclusive upper bound (0-100)
  color: string;
  bgColor: string;
}

export interface QualityConfig {
  levels: QualityLevel[];
  targetScore: number; // The "meta" threshold, e.g. 75
}

const DEFAULT_CONFIG: QualityConfig = {
  targetScore: 75,
  levels: [
    { label: 'Excelente', minScore: 96, maxScore: 100, color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
    { label: 'Aceitável', minScore: 75, maxScore: 95,  color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
    { label: 'Ruim',      minScore: 0,  maxScore: 74,  color: 'text-red-700',     bgColor: 'bg-red-50' },
  ]
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

  const saveConfig = (newConfig: QualityConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
    setConfig(newConfig);
  };

  const getLevelForScore = (score: number): QualityLevel => {
    const sorted = [...config.levels].sort((a, b) => b.minScore - a.minScore);
    return sorted.find(l => score >= l.minScore && score <= l.maxScore) || config.levels[config.levels.length - 1];
  };

  const isAboveTarget = (score: number) => score >= config.targetScore;

  return { config, saveConfig, getLevelForScore, isAboveTarget };
}
