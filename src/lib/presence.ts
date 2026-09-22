import { isMockMode, supabase } from './supabase';
import { User } from '../types';

export const PRESENCE_HEARTBEAT_MS = 20_000;
export const PRESENCE_TIMEOUT_SECONDS = 90;

type OnlineUserRow = Pick<User, 'id' | 'name' | 'email' | 'role' | 'active' | 'created_at'>;

function normalizeOnlineUsers(rows: OnlineUserRow[] | null): User[] {
  const unique = new Map<string, User>();
  (rows || []).forEach(row => unique.set(row.id, row as User));
  return Array.from(unique.values());
}

/**
 * Registra/renova a sessão Auth atual e devolve a visão global de usuários
 * online. A deduplicação é feita no banco por usuário, não no navegador.
 */
export async function heartbeatPresence(currentUser: User): Promise<User[]> {
  if (isMockMode || !supabase) return [currentUser];
  const { data, error } = await supabase.rpc('heartbeat_user_presence');
  if (error) throw new Error(error.message || 'Falha ao atualizar presença.');
  return normalizeOnlineUsers((data || []) as OnlineUserRow[]);
}

/** Encerra somente a sessão Auth deste dispositivo/navegador. */
export async function endCurrentPresenceSession(): Promise<void> {
  if (isMockMode || !supabase) return;
  const { error } = await supabase.rpc('end_current_presence_session');
  if (error) throw new Error(error.message || 'Falha ao encerrar presença.');
}
