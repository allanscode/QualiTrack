import { useState, useEffect, createContext, useContext, useCallback, useRef, type ReactNode } from 'react';
import { supabase, mockDb } from './supabase';
import { getRemainingBusinessSeconds, addBusinessHours } from './businessHours';

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
  action_deadline: {
    agent_review: number;
    auditor_reevaluation: number;
    manager_support: number;
    manager_quality: number;
  };
  businessHours: {
    start: string;
    end: string;
    days: number[];
    holidays: string[];
  };
}

const DEFAULT_CONFIG: QualityConfig = {
  targetScore: 75,
  levels: [
    { label: 'Excelente', minScore: 96, maxScore: 100, color: 'text-level-excelente', bgColor: 'bg-level-excelente' },
    { label: 'Aceitável', minScore: 75, maxScore: 95, color: 'text-level-aceitavel', bgColor: 'bg-level-aceitavel' },
    { label: 'Ruim', minScore: 0, maxScore: 74, color: 'text-level-ruim', bgColor: 'bg-level-ruim' },
  ],
  action_deadline: {
    agent_review: 50,
    auditor_reevaluation: 25,
    manager_support: 25,
    manager_quality: 25,
  },
  businessHours: {
    start: '08:00',
    end: '17:00',
    days: [1, 2, 3, 4, 5],
    holidays: ['01/01', '21/04', '01/05', '07/09', '12/10', '02/11', '15/11', '25/12']
  }
};

const STORAGE_KEY = 'qualitrack_quality_config';

function migrateSlaToActionDeadline(cfg: any): any {
  if (cfg.sla && !cfg.action_deadline) {
    cfg.action_deadline = {
      agent_review: cfg.sla.agentReview,
      auditor_reevaluation: cfg.sla.auditorReevaluation,
      manager_support: cfg.sla.managerSupport,
      manager_quality: cfg.sla.managerQuality,
    };
    delete cfg.sla;
  }
  return cfg;
}

const LEGACY_COLOR_MAP: Record<string, { color: string; bgColor: string }> = {
  'text-indigo-700': { color: 'text-level-excelente', bgColor: 'bg-level-excelente' },
  'text-emerald-700': { color: 'text-level-aceitavel', bgColor: 'bg-level-aceitavel' },
  'text-amber-700': { color: 'text-level-atencao', bgColor: 'bg-level-atencao' },
  'text-red-700': { color: 'text-level-ruim', bgColor: 'bg-level-ruim' },
};

function migrateLegacyLevelColors(cfg: any): any {
  if (cfg.levels && Array.isArray(cfg.levels)) {
    cfg.levels = cfg.levels.map((l: any) => {
      const mapped = LEGACY_COLOR_MAP[l.color];
      if (mapped) {
        return { ...l, color: mapped.color, bgColor: mapped.bgColor };
      }
      return l;
    });
  }
  return cfg;
}

function loadFromStorage(): QualityConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      migrateSlaToActionDeadline(parsed);
      migrateLegacyLevelColors(parsed);
      return parsed as QualityConfig;
    }
  } catch {}
  return DEFAULT_CONFIG;
}

interface QualityConfigContextValue {
  config: QualityConfig;
  oldConfig: QualityConfig;
  saveConfig: (newConfig: QualityConfig) => Promise<void>;
  getLevelForScore: (score: number) => QualityLevel;
  isAboveTarget: (score: number) => boolean;
  recalculateActiveActionDeadlines: (previousConfig: QualityConfig, newConfig: QualityConfig) => Promise<void>;
}

const QualityConfigContext = createContext<QualityConfigContextValue | null>(null);

export function QualityConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<QualityConfig>(loadFromStorage);
  const [oldConfig, setOldConfig] = useState<QualityConfig>(config);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    const fetchConfig = async () => {
      if (supabase) {
        const { data } = await supabase.from('quality_configs').select('*').single();
        if (data) {
          const cfg = migrateSlaToActionDeadline(data.config) as QualityConfig;
          setConfig(cfg);
          setOldConfig(cfg);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        }
      } else {
        const { data } = await mockDb.get('quality_configs');
        if (data && data.length > 0) {
          const cfg = migrateSlaToActionDeadline(data[0].config) as QualityConfig;
          setConfig(cfg);
          setOldConfig(cfg);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
        }
      }
    };
    fetchConfig();
  }, []);

  const saveConfig = useCallback(async (newConfig: QualityConfig) => {
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
    setOldConfig(newConfig);
  }, []);

  const getLevelForScore = useCallback((score: number): QualityLevel => {
    const sorted = [...config.levels].sort((a, b) => b.minScore - a.minScore);
    return sorted.find(l => score >= l.minScore && score <= l.maxScore) || config.levels[config.levels.length - 1];
  }, [config.levels]);

  const isAboveTarget = useCallback((score: number) => score >= config.targetScore, [config.targetScore]);

  const recalculateActiveActionDeadlines = useCallback(async (previousConfig: QualityConfig, newConfig: QualityConfig) => {
    try {
      let activeDocs: any[] = [];
      if (supabase) {
        const { data } = await supabase.from('monitorias')
          .select('id, updated_at, action_deadline_at')
          .eq('active', true)
          .not('action_deadline_at', 'is', null)
          .not('status', 'in', '(concluida,finalizada_alterada)');
        activeDocs = data || [];
      } else {
        const { data } = await mockDb.get('monitorias');
        activeDocs = (data || []).filter((m: any) => m.active !== false && m.status !== 'concluida' && m.status !== 'finalizada_alterada' && m.action_deadline_at);
      }

      if (activeDocs.length === 0) return;

      const updates = activeDocs.map(m => {
        if (!m.action_deadline_at || !m.updated_at) return null;

        const remainingSeconds = getRemainingBusinessSeconds(new Date(m.updated_at), new Date(m.action_deadline_at), previousConfig.businessHours);
        const newDeadline = addBusinessHours(new Date(m.updated_at), remainingSeconds / 3600, newConfig.businessHours).toISOString();

        return { id: m.id, action_deadline_at: newDeadline };
      }).filter(Boolean);

      if (supabase) {
        for (const update of updates) {
          if(update) await supabase.from('monitorias').update({ action_deadline_at: update.action_deadline_at }).eq('id', update.id);
        }
      } else {
        for (const update of updates) {
          if(update) await mockDb.update('monitorias', update.id, { action_deadline_at: update.action_deadline_at });
        }
      }
    } catch (e) {
      console.error('Failed to recalculate action deadlines', e);
    }
  }, []);

  return (
    <QualityConfigContext.Provider value={{ config, oldConfig, saveConfig, getLevelForScore, isAboveTarget, recalculateActiveActionDeadlines }}>
      {children}
    </QualityConfigContext.Provider>
  );
}

export function useQualityConfig() {
  const ctx = useContext(QualityConfigContext);
  if (!ctx) throw new Error('useQualityConfig must be used within QualityConfigProvider');
  return ctx;
}
