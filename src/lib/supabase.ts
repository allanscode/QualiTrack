import { createClient } from '@supabase/supabase-js';

// These will be filled later by the user or from .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Custom fetch wrapper for debugging hanging requests and timeouts
const customFetch = async (url: RequestInfo | URL, options?: RequestInit): Promise<Response> => {
  const requestId = Math.random().toString(36).substring(7);
  const startTime = Date.now();
  console.log(`[Supabase Fetch ${requestId}] 🚀 START`, url, options?.method || 'GET');
  
  try {
    const response = await fetch(url, options);
    const duration = Date.now() - startTime;
    console.log(`[Supabase Fetch ${requestId}] ✅ END (${duration}ms) - Status: ${response.status}`);
    return response;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[Supabase Fetch ${requestId}] ❌ ERROR (${duration}ms) -`, error);
    throw error;
  }
};

export const supabase = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder')) 
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
        storage: typeof window !== 'undefined' ? window.localStorage : undefined,
        lock: async (name: string, acquireTimeout: number, fn: () => Promise<any>) => await fn(), // Correção da assinatura da trava (evita o TypeError)
      },
      realtime: {
        worker: true // Use worker to avoid background timer throttling
      },
      global: {
        fetch: customFetch
      }
    })
  : null;

// --- MOCK STORAGE LOGIC ---
// This allows the app to work locally using LocalStorage until the user connects Supabase
const DB_PREFIX = 'qualitrack_mock_';

const INITIAL_DATA: { [key: string]: any[] } = {
  users: [
    { 
      id: 'marcospaulo@webposto.com.br', 
      name: 'Marcos Paulo', 
      email: 'marcospaulo@webposto.com.br', 
      password: 'admin',
      role: 'admin', 
      active: true,
      createdAt: new Date().toISOString() 
    },
    { 
      id: 'suporte@teste.com', 
      name: 'João Suporte (Auditado)', 
      email: 'suporte@teste.com', 
      password: '123',
      role: 'suporte', 
      active: true,
      createdAt: new Date().toISOString() 
    },
    { 
      id: 'auditor@teste.com', 
      name: 'Maria Auditora', 
      email: 'auditor@teste.com', 
      password: '123',
      role: 'qualidade', 
      active: true,
      createdAt: new Date().toISOString() 
    },
    { 
      id: 'gestor.suporte@teste.com', 
      name: 'Carlos Gestor Suporte', 
      email: 'gestor.suporte@teste.com', 
      password: '123',
      role: 'gestor_suporte', 
      active: true,
      createdAt: new Date().toISOString() 
    },
    { 
      id: 'gestor.qualidade@teste.com', 
      name: 'Ana Gestora Qualidade', 
      email: 'gestor.qualidade@teste.com', 
      password: '123',
      role: 'gestor_qualidade', 
      active: true,
      createdAt: new Date().toISOString() 
    }
  ],
  forms: [],
  teams: [],
  monitorias: [],
  access_requests: [],
  quality_configs: [],
  dissatisfaction_fields: []
};

// Initialize localStorage if empty or ensure test users exist
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
    console.log(`[MockDB] Getting ${fullKey}:`, data ? 'Found' : 'Not Found');
    const parsed = data ? JSON.parse(data) : null;
    return Array.isArray(parsed) ? parsed : INITIAL_DATA[key] || [];
  } catch (e) {
    console.error(`[MockDB] Error parsing ${fullKey}:`, e);
    return INITIAL_DATA[key] || [];
  }
};

const setMockData = (key: string, data: any) => {
  const fullKey = `${DB_PREFIX}${key}`;
  console.log(`[MockDB] Setting ${fullKey}:`, data);
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
      id: item.id || Math.random().toString(36).substr(2, 9), 
      ...item, 
      createdAt: item.createdAt || new Date().toISOString() 
    };
    setMockData(table, [...data, newItem]);
    return { data: newItem, error: null };
  },
  update: async (table: string, id: string, updates: any) => {
    const data = getMockData(table);
    const newData = data.map((item: any) => item.id === id ? { ...item, ...updates } : item);
    setMockData(table, newData);
    return { data: updates, error: null };
  }
};
