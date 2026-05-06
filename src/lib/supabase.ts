import { createClient } from '@supabase/supabase-js';

// These will be filled later by the user or from .env
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('placeholder')) 
  ? createClient(supabaseUrl, supabaseAnonKey)
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
    }
  ],
  forms: [],
  teams: [],
  monitorias: [],
  access_requests: []
};

// Initialize localStorage if empty or ensure admin exists
if (typeof window !== 'undefined') {
  Object.keys(INITIAL_DATA).forEach(key => {
    const existing = localStorage.getItem(`${DB_PREFIX}${key}`);
    if (!existing) {
      localStorage.setItem(`${DB_PREFIX}${key}`, JSON.stringify(INITIAL_DATA[key]));
    } else if (key === 'users') {
      // Especial: Garantir que o admin padrão sempre exista e tenha senha
      const users = JSON.parse(existing);
      const adminExists = users.some((u: any) => u.email === 'marcospaulo@webposto.com.br');
      if (!adminExists) {
        users.push(INITIAL_DATA.users[0]);
        localStorage.setItem(`${DB_PREFIX}users`, JSON.stringify(users));
      } else {
        // Atualizar senha se necessário
        const updatedUsers = users.map((u: any) => 
          u.email === 'marcospaulo@webposto.com.br' ? { ...u, password: 'admin', role: 'admin', active: true } : u
        );
        localStorage.setItem(`${DB_PREFIX}users`, JSON.stringify(updatedUsers));
      }
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
