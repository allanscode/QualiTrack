import { createClient } from '@supabase/supabase-js';

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

export const supabase = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder'))
? createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      flowType: 'implicit',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
      lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => await fn(),
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

const generateId = () => {
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

const INITIAL_DATA: { [key: string]: any[] } = {
  users: [
    {
    id: generateId(),
    name: 'Administrador',
    email: 'qualidade@webposto.com.br',
    password: '123456',
    role: 'admin',
    team_ids: [],
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: generateId(),
    name: 'João Suporte (Auditado)',
    email: 'suporte@teste.com',
    password: '123',
    role: 'suporte',
    team_ids: [],
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: generateId(),
    name: 'Maria Auditora',
    email: 'auditor@teste.com',
    password: '123',
    role: 'qualidade',
    team_ids: [],
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: generateId(),
    name: 'Carlos Gestor Suporte',
    email: 'gestor.suporte@teste.com',
    password: '123',
    role: 'gestor_suporte',
    team_ids: [],
    active: true,
    created_at: new Date().toISOString()
  },
  {
    id: generateId(),
    name: 'Ana Gestora Qualidade',
    email: 'gestor.qualidade@teste.com',
    password: '123',
    role: 'gestor_qualidade',
    team_ids: [],
    active: true,
    created_at: new Date().toISOString()
  }
  ],
  user_teams: [],
  forms: [],
  teams: [],
  monitorias: [],
  access_requests: [],
  quality_configs: [],
  dissatisfaction_fields: [],
  business_hours: [
    { id: generateId(), day_of_week: 0, is_open: false, open_time: '00:00', close_time: '00:00' },
    { id: generateId(), day_of_week: 1, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: generateId(), day_of_week: 2, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: generateId(), day_of_week: 3, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: generateId(), day_of_week: 4, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: generateId(), day_of_week: 5, is_open: true, open_time: '08:00', close_time: '17:00' },
    { id: generateId(), day_of_week: 6, is_open: false, open_time: '00:00', close_time: '00:00' }
  ],
  holidays: [
    { id: generateId(), holiday_date: '2026-01-01', description: 'Confraternização Universal' },
    { id: generateId(), holiday_date: '2026-04-21', description: 'Tiradentes' },
    { id: generateId(), holiday_date: '2026-05-01', description: 'Dia do Trabalho' },
    { id: generateId(), holiday_date: '2026-09-07', description: 'Independência do Brasil' },
    { id: generateId(), holiday_date: '2026-10-12', description: 'Nossa Senhora Aparecida' },
    { id: generateId(), holiday_date: '2026-11-02', description: 'Finados' },
    { id: generateId(), holiday_date: '2026-11-15', description: 'Proclamação da República' },
    { id: generateId(), holiday_date: '2026-12-25', description: 'Natal' }
  ]
};

if (typeof window !== 'undefined') {
  Object.keys(INITIAL_DATA).forEach(key => {
    const existing = localStorage.getItem(`${DB_PREFIX}${key}`);
    if (!existing) {
      localStorage.setItem(`${DB_PREFIX}${key}`, JSON.stringify(INITIAL_DATA[key]));
    } else if (key === 'users') {
      const users = JSON.parse(existing);
      INITIAL_DATA.users.forEach(defaultUser => {
        const exists = users.some((u: any) => u.email === defaultUser.email);
        if (!exists) {
          users.push(defaultUser);
        }
      });
      localStorage.setItem(`${DB_PREFIX}users`, JSON.stringify(users));
    }
  });
}

const getMockData = (key: string) => {
  const fullKey = `${DB_PREFIX}${key}`;
  try {
    const data = localStorage.getItem(fullKey);
    const parsed = data ? JSON.parse(data) : null;
    return Array.isArray(parsed) ? parsed : INITIAL_DATA[key] || [];
  } catch (e) {
    console.error(`[MockDB] Error parsing ${fullKey}:`, e);
    return INITIAL_DATA[key] || [];
  }
};

const setMockData = (key: string, data: any) => {
  const fullKey = `${DB_PREFIX}${key}`;
  localStorage.setItem(fullKey, JSON.stringify(data));
};

export const mockDb = {
  get: async (table: string) => {
    await new Promise(resolve => setTimeout(resolve, 300));
    return { data: getMockData(table), error: null };
  },
  insert: async (table: string, item: any) => {
    const data = getMockData(table);
    const newItem = {
      id: item.id || generateId(),
      ...item,
      created_at: item.created_at || new Date().toISOString()
    };
    setMockData(table, [...data, newItem]);
    return { data: newItem, error: null };
  },
  update: async (table: string, id: string, updates: any) => {
    const data = getMockData(table);
    const newData = data.map((item: any) => item.id === id ? { ...item, ...updates, updated_at: new Date().toISOString() } : item);
    setMockData(table, newData);
    return { data: updates, error: null };
  },
  upsert: async (table: string, item: any, matchKey: string = 'id') => {
    const data = getMockData(table);
    const existingIndex = data.findIndex((row: any) => row[matchKey] === item[matchKey]);
    if (existingIndex >= 0) {
      const updated = { ...data[existingIndex], ...item, updated_at: new Date().toISOString() };
      data[existingIndex] = updated;
      setMockData(table, data);
      return { data: updated, error: null };
    }
    const newItem = { id: item.id || generateId(), ...item, created_at: item.created_at || new Date().toISOString() };
    setMockData(table, [...data, newItem]);
    return { data: newItem, error: null };
  },
  delete: async (table: string, id: string) => {
    const data = getMockData(table);
    const newData = data.filter((item: any) => item.id !== id);
    setMockData(table, newData);
    return { data: null, error: null };
  }
};

export function resolveMockUserEmail(email: string): string | undefined {
  if (typeof window === 'undefined') return undefined;
  const users = getMockData('users');
  const user = users.find((u: any) => u.email === email);
  return user?.id;
}

export function findMockUserById(id: string): any | undefined {
  if (typeof window === 'undefined') return undefined;
  const users = getMockData('users');
  return users.find((u: any) => u.id === id);
}
