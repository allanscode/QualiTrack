import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { 
  User, 
  UserTeam, 
  Team, 
  EvaluationForm, 
  Monitoria, 
  AccessRequest, 
  DissatisfactionField,
  UserPreferences 
} from '../types';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  console.log(`[Supabase Fetch ${requestId}] START`, url, options?.method || 'GET');

  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    console.log(`[Supabase Fetch ${requestId}] END (${duration}ms) - Status: ${response.status}`);
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Supabase Fetch ${requestId}] ERROR (${duration}ms) -`, error);
    throw error;
  }
};

export const supabase: SupabaseClient | null = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'))
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'implicit',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        lock: async (_name: string, _acquireTimeout: number, fn: () => Promise<any>) => await fn(),
      },
      realtime: {
        worker: true
      },
      global: {
        fetch: customFetch
      }
    })
  : null;

const DB_PREFIX = 'qualitrack_mock_';

const generateId = (): string => {
  try {
    return crypto.randomUUID();
  } catch {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
};

// IDs estáticos para manter relacionamentos íntegros entre as tabelas mockadas
const ADMIN_ID = 'user-admin-id';
const AGENT_ID = 'user-agent-id';
const EVALUATOR_ID = 'user-evaluator-id';
const SUPPORT_MANAGER_ID = 'user-support-manager-id';
const QUALITY_MANAGER_ID = 'user-quality-manager-id';

const FORM_ID = 'form-suporte-geral';

const INITIAL_DATA: {
  users: User[];
  user_teams: UserTeam[];
  forms: EvaluationForm[];
  teams: Team[];
  monitorias: Monitoria[];
  access_requests: AccessRequest[];
  quality_configs: any[];
  dissatisfaction_fields: DissatisfactionField[];
  business_hours: Array<{ id: string; day_of_week: number; is_open: boolean; open_time: string; close_time: string }>;
  holidays: Array<{ id: string; holiday_date: string; description: string }>;
  user_preferences: Array<{ user_id: string; preferences: UserPreferences; updated_at: string }>;
} = {
  users: [
    {
      id: ADMIN_ID,
      name: 'Administrador QualiTrack',
      email: 'qualidade@webposto.com.br',
      role: 'admin',
      team_ids: [],
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: AGENT_ID,
      name: 'João Suporte (Auditado)',
      email: 'suporte@teste.com',
      role: 'suporte',
      team_ids: ['team-alpha'],
      primary_team_id: 'team-alpha',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: EVALUATOR_ID,
      name: 'Maria Auditora',
      email: 'auditor@teste.com',
      role: 'qualidade',
      team_ids: [],
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: SUPPORT_MANAGER_ID,
      name: 'Carlos Gestor Suporte',
      email: 'gestor.suporte@teste.com',
      role: 'gestor_suporte',
      team_ids: ['team-alpha'],
      primary_team_id: 'team-alpha',
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: QUALITY_MANAGER_ID,
      name: 'Ana Gestora Qualidade',
      email: 'gestor.qualidade@teste.com',
      role: 'gestor_qualidade',
      team_ids: [],
      active: true,
      created_at: new Date().toISOString()
    }
  ],
  teams: [
    { id: 'team-alpha', name: 'Equipe Alpha', sigla: 'ALF', active: true, description: 'Equipe de atendimento Alpha' },
    { id: 'team-beta', name: 'Equipe Beta', sigla: 'BET', active: true, description: 'Equipe de atendimento Beta' },
  ],
  user_teams: [
    { id: 'ut-1', user_id: AGENT_ID, team_id: 'team-alpha', created_at: new Date().toISOString() },
    { id: 'ut-2', user_id: SUPPORT_MANAGER_ID, team_id: 'team-alpha', created_at: new Date().toISOString() }
  ],
  forms: [
    {
      id: FORM_ID,
      title: 'Ficha de Atendimento Geral - Suporte',
      description: 'Avaliação padrão de interações dos agentes de atendimento técnico.',
      team_id: 'team-alpha',
      active: true,
      createdBy: ADMIN_ID,
      created_at: new Date().toISOString(),
      sections: [
        {
          id: 'sec-postura',
          title: 'Postura e Empatia',
          weight: 30,
          questions: [
            { id: 'q-postura-1', text: 'Demonstrou empatia e escuta ativa durante o atendimento?', type: 'yes_no_na' },
            { id: 'q-postura-2', text: 'Utilizou linguagem adequada, evitando gírias ou termos informais excessivos?', type: 'yes_no_na' }
          ]
        },
        {
          id: 'sec-processo',
          title: 'Processo e Técnica',
          weight: 40,
          questions: [
            { id: 'q-processo-1', text: 'Confirmou os dados cadastrais do cliente conforme o protocolo de segurança?', type: 'yes_no_na', is_critical: true },
            { id: 'q-processo-2', text: 'Seguiu corretamente os procedimentos técnicos para diagnóstico do problema?', type: 'yes_no_na' }
          ]
        },
        {
          id: 'sec-resolucao',
          title: 'Resolução e Encerramento',
          weight: 30,
          questions: [
            { id: 'q-resolucao-1', text: 'O problema do cliente foi resolvido no primeiro contato (FCR)?', type: 'yes_no_na' },
            { id: 'q-resolucao-2', text: 'Realizou o encerramento do atendimento oferecendo suporte adicional?', type: 'yes_no_na' }
          ]
        }
      ],
      critical_errors: [
        { id: 'ce-seguranca', text: 'Vazamento de dados ou violação de políticas de segurança (LGPD).', type: 'yes_no_na', is_critical: true }
      ]
    }
  ],
  monitorias: [
    {
      id: 'mon-1',
      form_id: FORM_ID,
      evaluator_id: EVALUATOR_ID,
      evaluated_id: AGENT_ID,
      ticket_id: 'T-10023',
      channel: 'Chat',
      ticket_date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      analysis_date: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString().split('T')[0],
      satisfaction_result: 'Positiva',
      satisfaction_has_record: true,
      satisfaction_record_text: 'O atendimento foi muito rápido e atencioso. Parabéns!',
      answers: {
        'q-postura-1': 'SIM',
        'q-postura-2': 'SIM',
        'q-processo-1': 'SIM',
        'q-processo-2': 'SIM',
        'q-resolucao-1': 'SIM',
        'q-resolucao-2': 'SIM'
      },
      score: 100.0,
      status: 'concluida',
      team_id: 'team-alpha',
      evaluator_name: 'Maria Auditora',
      evaluated_name: 'João Suporte (Auditado)',
      form_name: 'Ficha de Atendimento Geral - Suporte',
      team_name: 'Equipe Alpha',
      history: [
        { action: 'Monitoria Criada', by_id: EVALUATOR_ID, by_name: 'Maria Auditora', at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString() }
      ],
      created_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString()
    },
    {
      id: 'mon-2',
      form_id: FORM_ID,
      evaluator_id: EVALUATOR_ID,
      evaluated_id: AGENT_ID,
      ticket_id: 'T-10245',
      channel: 'WhatsApp',
      ticket_date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
      analysis_date: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString().split('T')[0],
      satisfaction_result: 'Negativa',
      satisfaction_has_record: true,
      satisfaction_record_text: 'O atendente não entendeu o meu problema no início.',
      answers: {
        'q-postura-1': 'SIM',
        'q-postura-2': 'SIM',
        'q-processo-1': 'SIM',
        'q-processo-2': 'NAO',
        'q-resolucao-1': 'SIM',
        'q-resolucao-2': 'SIM'
      },
      score: 80.0,
      status: 'pendente_revisao',
      team_id: 'team-alpha',
      evaluator_name: 'Maria Auditora',
      evaluated_name: 'João Suporte (Auditado)',
      form_name: 'Ficha de Atendimento Geral - Suporte',
      team_name: 'Equipe Alpha',
      action_deadline_at: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      history: [
        { action: 'Monitoria Criada', by_id: EVALUATOR_ID, by_name: 'Maria Auditora', at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString() }
      ],
      created_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString()
    }
  ],
  access_requests: [],
  quality_configs: [],
  dissatisfaction_fields: [
    {
      id: 'df-1',
      title: 'Motivo de Insatisfação do Cliente',
      type: 'cliente',
      options: ['Demora no retorno', 'Instruções confusas', 'Problema técnico recorrente', 'Postura inadequada'],
      active: true,
      created_at: new Date().toISOString()
    },
    {
      id: 'df-2',
      title: 'Desvio de Qualidade Identificado',
      type: 'qualidade',
      options: ['Falta de empatia', 'Script incompleto', 'Não confirmação de dados', 'Erro de registro'],
      active: true,
      created_at: new Date().toISOString()
    }
  ],
  business_hours: [
    { id: 'bh-0', day_of_week: 0, is_open: false, open_time: '00:00', close_time: '00:00' },
    { id: 'bh-1', day_of_week: 1, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: 'bh-2', day_of_week: 2, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: 'bh-3', day_of_week: 3, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: 'bh-4', day_of_week: 4, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: 'bh-5', day_of_week: 5, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: 'bh-6', day_of_week: 6, is_open: false, open_time: '00:00', close_time: '00:00' }
  ],
  holidays: [
    { id: 'h-1', holiday_date: '2026-01-01', description: 'Confraternização Universal' },
    { id: 'h-2', holiday_date: '2026-04-21', description: 'Tiradentes' },
    { id: 'h-3', holiday_date: '2026-05-01', description: 'Dia do Trabalho' },
    { id: 'h-4', holiday_date: '2026-09-07', description: 'Independência do Brasil' },
    { id: 'h-5', holiday_date: '2026-10-12', description: 'Nossa Senhora Aparecida' },
    { id: 'h-6', holiday_date: '2026-11-02', description: 'Finados' },
    { id: 'h-7', holiday_date: '2026-11-15', description: 'Proclamação da República' },
    { id: 'h-8', holiday_date: '2026-12-25', description: 'Natal' }
  ],
  user_preferences: []
};

if (typeof window !== 'undefined') {
  Object.keys(INITIAL_DATA).forEach((k) => {
    const key = k as keyof typeof INITIAL_DATA;
    const existing = localStorage.getItem(`${DB_PREFIX}${key}`);
    if (!existing) {
      localStorage.setItem(`${DB_PREFIX}${key}`, JSON.stringify(INITIAL_DATA[key]));
    } else if (key === 'users') {
      const users = JSON.parse(existing) as User[];
      INITIAL_DATA.users.forEach((defaultUser) => {
        const exists = users.some((u) => u.email === defaultUser.email);
        if (!exists) {
          users.push(defaultUser);
        }
      });
      localStorage.setItem(`${DB_PREFIX}users`, JSON.stringify(users));
    }
  });

  // Timeout SLA Replication in Mock Mode
  try {
    const monitoriasStr = localStorage.getItem(`${DB_PREFIX}monitorias`);
    if (monitoriasStr) {
      let monitorias = JSON.parse(monitoriasStr) as Monitoria[];
      let changed = false;
      const nowStr = new Date().toISOString();
      monitorias = monitorias.map(m => {
        if (
          m.active !== false && 
          m.status !== 'concluida' && 
          m.action_deadline_at && 
          m.action_deadline_at < nowStr
        ) {
          changed = true;
          const isQualityPending = m.status === 'aguardando_gestor_qualidade';
          return { 
            ...m, 
            status: 'concluida', 
            resolution_type: 'automatic',
            score: isQualityPending ? 100 : m.score,
            updated_at: nowStr
          };
        }
        return m;
      });
      if (changed) {
        localStorage.setItem(`${DB_PREFIX}monitorias`, JSON.stringify(monitorias));
      }
    }
  } catch (e) {
    console.error('[MockDB] SLA Timeout Replication Error:', e);
  }
}

const getMockData = <T>(key: string): T[] => {
  const fullKey = `${DB_PREFIX}${key}`;
  try {
    const data = localStorage.getItem(fullKey);
    const parsed = data ? JSON.parse(data) : null;
    return Array.isArray(parsed) ? parsed : (INITIAL_DATA[key as keyof typeof INITIAL_DATA] as unknown as T[]) || [];
  } catch (e) {
    console.error(`[MockDB] Error parsing ${fullKey}:`, e);
    return (INITIAL_DATA[key as keyof typeof INITIAL_DATA] as unknown as T[]) || [];
  }
};

const setMockData = <T>(key: string, data: T[]): void => {
  const fullKey = `${DB_PREFIX}${key}`;
  localStorage.setItem(fullKey, JSON.stringify(data));
};

// Função para simular integridade referencial nas tabelas relacionais do LocalStorage
const validateMockRelations = (table: string, item: Record<string, unknown>): void => {
  if (table === 'user_teams') {
    const ut = item as unknown as UserTeam;
    const users = getMockData<User>('users');
    const teams = getMockData<Team>('teams');
    if (!users.some((u) => u.id === ut.user_id)) {
      throw new Error(`[MockDB Integridade Referencial] Usuário ID "${ut.user_id}" não encontrado na tabela "users".`);
    }
    if (!teams.some((t) => t.id === ut.team_id)) {
      throw new Error(`[MockDB Integridade Referencial] Equipe ID "${ut.team_id}" não encontrada na tabela "teams".`);
    }
  }

  if (table === 'monitorias') {
    const m = item as unknown as Monitoria;
    const users = getMockData<User>('users');
    const teams = getMockData<Team>('teams');
    const forms = getMockData<EvaluationForm>('forms');

    if (!forms.some((f) => f.id === m.form_id)) {
      throw new Error(`[MockDB Integridade Referencial] Ficha de Avaliação ID "${m.form_id}" não encontrada na tabela "forms".`);
    }
    if (!users.some((u) => u.id === m.evaluator_id)) {
      throw new Error(`[MockDB Integridade Referencial] Auditor ID "${m.evaluator_id}" não encontrado na tabela "users".`);
    }
    if (!users.some((u) => u.id === m.evaluated_id)) {
      throw new Error(`[MockDB Integridade Referencial] Agente ID "${m.evaluated_id}" não encontrado na tabela "users".`);
    }
    if (m.team_id && !teams.some((t) => t.id === m.team_id)) {
      throw new Error(`[MockDB Integridade Referencial] Equipe ID "${m.team_id}" não encontrada na tabela "teams".`);
    }
  }
};

export const mockDb = {
  get: async (table: string): Promise<{ data: any[] | null; error: Error | null }> => {
    await new Promise((resolve) => setTimeout(resolve, 150));
    return { data: getMockData<any>(table), error: null };
  },

  insert: async (
    table: string, 
    item: any
  ): Promise<{ data: any | null; error: Error | null }> => {
    try {
      validateMockRelations(table, item as Record<string, unknown>);
    } catch (err: unknown) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }

    const data = getMockData<any>(table);
    const newItem = {
      id: item.id || generateId(),
      ...item,
      created_at: item.created_at || new Date().toISOString()
    };

    setMockData(table, [...data, newItem]);
    return { data: newItem, error: null };
  },

  update: async (
    table: string, 
    id: string, 
    updates: any
  ): Promise<{ data: any | null; error: Error | null }> => {
    const data = getMockData<any>(table);
    const itemToUpdate = data.find((item) => item.id === id);
    if (itemToUpdate) {
      try {
        validateMockRelations(table, { ...itemToUpdate, ...updates } as Record<string, unknown>);
      } catch (err: unknown) {
        return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
      }
    }

    const newData = data.map((item) => 
      item.id === id 
        ? { ...item, ...updates, updated_at: new Date().toISOString() } 
        : item
    );
    setMockData(table, newData);
    return { data: updates, error: null };
  },

  upsert: async (
    table: string, 
    item: any, 
    matchKey: string = 'id'
  ): Promise<{ data: any | null; error: Error | null }> => {
    try {
      validateMockRelations(table, item as Record<string, unknown>);
    } catch (err: unknown) {
      return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
    }

    const data = getMockData<any>(table);
    const existingIndex = data.findIndex((row) => row[matchKey] === item[matchKey]);
    if (existingIndex >= 0) {
      const updated = { ...data[existingIndex], ...item, updated_at: new Date().toISOString() };
      data[existingIndex] = updated;
      setMockData(table, data);
      return { data: updated, error: null };
    }

    const newItem = { 
      id: item.id || generateId(), 
      ...item, 
      created_at: item.created_at || new Date().toISOString() 
    };
    setMockData(table, [...data, newItem]);
    return { data: newItem, error: null };
  },

  delete: async (table: string, id: string): Promise<{ data: null; error: Error | null }> => {
    if (table === 'users') {
      const monitorias = getMockData<Monitoria>('monitorias');
      if (monitorias.some((m) => m.evaluated_id === id || m.evaluator_id === id)) {
        return { 
          data: null, 
          error: new Error('[MockDB Integridade Referencial] Violação de chave estrangeira: O usuário possui monitorias vinculadas.') 
        };
      }
    }
    if (table === 'teams') {
      const userTeams = getMockData<UserTeam>('user_teams');
      if (userTeams.some((ut) => ut.team_id === id)) {
        return { 
          data: null, 
          error: new Error('[MockDB Integridade Referencial] Violação de chave estrangeira: A equipe possui usuários vinculados.') 
        };
      }
    }

    const data = getMockData<any>(table);
    const newData = data.filter((item) => item.id !== id);
    setMockData(table, newData);
    return { data: null, error: null };
  }
};

export function resolveMockUserEmail(email: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const users = getMockData<User>('users');
  const user = users.find((u) => u.email === email);
  return user?.id;
}

export function findMockUserById(id: string): User | undefined {
  if (typeof window === 'undefined') return undefined;
  const users = getMockData<User>('users');
  return users.find((u) => u.id === id);
}

export async function upsertUserPreferences(userId: string, partial: Record<string, unknown>): Promise<void> {
  if (!supabase) {
    const rows = getMockData<{ user_id: string; preferences: UserPreferences; updated_at: string }>('user_preferences');
    const existing = rows.find((r) => r.user_id === userId);
    if (existing) {
      existing.preferences = { ...(existing.preferences || {}), ...partial };
      existing.updated_at = new Date().toISOString();
      setMockData('user_preferences', rows);
    } else {
      rows.push({
        user_id: userId,
        preferences: { ...partial },
        updated_at: new Date().toISOString()
      });
      setMockData('user_preferences', rows);
    }
  } else {
    const { data: existing } = await supabase
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', userId)
      .single();
    const merged = { ...(existing?.preferences || {}), ...partial };
    await supabase
      .from('user_preferences')
      .upsert({ user_id: userId, preferences: merged }, { onConflict: 'user_id' });
  }
}
